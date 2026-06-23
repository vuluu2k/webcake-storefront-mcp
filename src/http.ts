// Remote MCP over Streamable-HTTP. Each client session carries its own credentials,
// supplied per-request via headers (x-webcake-jwt / x-webcake-site-id / x-webcake-api-url)
// or query params (?jwt=&site_id=&api_url=) for clients that can't set custom headers.
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";
import { makeApi } from "./config.js";

const MCP_PATH = "/mcp";

const QUERY_TO_HEADER: Record<string, string> = {
  jwt: "x-webcake-jwt",
  token: "x-webcake-jwt",
  site_id: "x-webcake-site-id",
  api_url: "x-webcake-api-url",
  session_id: "x-webcake-session-id",
  env: "x-webcake-env",
};

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Copy recognised query params onto request headers so downstream reads are uniform. */
function applyQueryAuth(req: IncomingMessage): void {
  const q = (req.url ?? "").indexOf("?");
  if (q === -1) return;
  const params = new URLSearchParams((req.url ?? "").slice(q + 1));
  for (const [param, head] of Object.entries(QUERY_TO_HEADER)) {
    const value = params.get(param);
    if (value && req.headers[head] == null) req.headers[head] = value;
  }
}

function apiFromRequest(req: IncomingMessage) {
  return makeApi({
    token: header(req, "x-webcake-jwt"),
    siteId: header(req, "x-webcake-site-id"),
    apiUrl: header(req, "x-webcake-api-url"),
    sessionId: header(req, "x-webcake-session-id"),
    env: header(req, "x-webcake-env"),
  });
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function rpcError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

export async function startHttpServer(port: number): Promise<void> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createHttpServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];

    if (path === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (path !== MCP_PATH) {
      return rpcError(res, 404, `Not found. Send MCP requests to ${MCP_PATH}.`);
    }

    applyQueryAuth(req);

    const sidHeader = header(req, "mcp-session-id");

    try {
      // Reuse an existing session.
      if (sidHeader && transports.has(sidHeader)) {
        const transport = transports.get(sidHeader)!;
        const body = req.method === "POST" ? await readBody(req) : undefined;
        await transport.handleRequest(req, res, body);
        return;
      }

      // New session: must be an initialize POST.
      if (req.method === "POST") {
        const body = await readBody(req);
        if (!sidHeader && isInitializeRequest(body)) {
          const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id: string) => {
              transports.set(id, transport);
            },
          });
          transport.onclose = () => {
            if (transport.sessionId) transports.delete(transport.sessionId);
          };
          const api = apiFromRequest(req);
          const server = createServer(api);
          await server.connect(transport);
          await transport.handleRequest(req, res, body);
          return;
        }
        return rpcError(res, 400, "Bad Request: send an initialize request first (no valid mcp-session-id).");
      }

      return rpcError(res, 400, "Bad Request: missing or unknown mcp-session-id.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!res.headersSent) rpcError(res, 500, msg);
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  console.error(`[webcake-storefront] Streamable-HTTP MCP ready on http://localhost:${port}${MCP_PATH}`);
}

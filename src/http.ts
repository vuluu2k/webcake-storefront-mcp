// Remote MCP over Streamable-HTTP. Each client session carries its own credentials,
// supplied per-request via headers (x-webcake-jwt / x-webcake-site-id / x-webcake-api-url)
// or query params (?jwt=&site_id=&api_url=) for clients that can't set custom headers.
//
// Also serves: a marketing landing page at /, /privacy, /terms, /favicon.ico,
// /favicon.svg, /health, and a full OAuth 2.1 flow so the claude.ai connector can
// authenticate. See src/auth/oauth-server.ts for the OAuth AS implementation.
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";
import { makeApi, resolveEnv, ENVIRONMENTS, DEFAULT_ENV } from "./config.js";
import { landingHtml, faviconSvg, ogImageSvg, normalizeLang } from "./web-guide.js";
import { privacyHtml, termsHtml } from "./legal.js";
import {
  registerClient,
  startAuthorize,
  completeAuthorize,
  exchangeToken,
  resolveAccessToken,
  revokeToken,
  authServerMetadata,
  protectedResourceMetadata,
  type TokenParams,
  type RegisterRequest,
} from "./auth/oauth-server.js";

const MCP_PATH = "/mcp";

// OAuth 2.1 endpoints.
const WELL_KNOWN_PR = "/.well-known/oauth-protected-resource";
const WELL_KNOWN_AS = "/.well-known/oauth-authorization-server";
const OAUTH_REGISTER = "/register";
const OAUTH_AUTHORIZE = "/authorize";
const OAUTH_CALLBACK = "/oauth/callback";
const OAUTH_TOKEN = "/token";
const OAUTH_REVOKE = "/revoke";

// OAuth enforcement is ON by default: a request with NO credential gets a
// 401 + WWW-Authenticate so Claude/ChatGPT kick off the OAuth flow.
// Opt out with WEBCAKE_OAUTH=0 (or false/no/off).
const OAUTH_ENFORCED = !/^(0|false|no|off)$/i.test(process.env.WEBCAKE_OAUTH ?? "");

// Social/search crawlers fetch the root with Accept: */* but should still get HTML.
const BOT_UA =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|slack-imgproxy|telegrambot|whatsapp|discordbot|pinterest|redditbot|googlebot|bingbot|applebot|yandexbot|baiduspider|embedly|quora link preview|outbrain|vkshare|w3c_validator|skypeuripreview|zalo/i;

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
    if (value && req.headers[head] == null) {
      req.headers[head] = value;
      req.rawHeaders.push(head, value);
    }
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

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

function parseBodyParams(raw: string, contentType: string): Record<string, string> {
  if (!raw) return {};
  if (contentType.includes("application/json")) {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === "object" ? (o as Record<string, string>) : {};
    } catch { return {}; }
  }
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function rpcError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

function oauthError(res: ServerResponse, status: number, error: string, description: string): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ error, error_description: description }));
}

function htmlError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto"><h2>WebCake Storefront MCP</h2><p>${message}</p></body>`);
}

/** The public origin of this server, honouring reverse-proxy headers. */
function publicBase(req: IncomingMessage): string {
  const fwdHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) || req.headers.host || "localhost";
  const fwdProto = req.headers["x-forwarded-proto"];
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)?.split(",")[0] || (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

/** The storefront consent page URL — /mcp-storefront on the builder app. */
function storefrontConsentUrl(): string {
  const preset = resolveEnv(process.env.WEBCAKE_ENV) ?? ENVIRONMENTS[DEFAULT_ENV];
  const appUrl = (process.env.WEBCAKE_APP_URL || preset.appUrl).replace(/\/$/, "");
  return `${appUrl}/mcp-storefront`;
}

/** Extract the Bearer token from the Authorization header, if any. */
function bearerFrom(req: IncomingMessage): string | undefined {
  const auth = req.headers["authorization"];
  const v = Array.isArray(auth) ? auth[0] : auth;
  if (!v || !/^Bearer\s+/i.test(v)) return undefined;
  return v.replace(/^Bearer\s+/i, "").trim() || undefined;
}

/**
 * Handle every OAuth 2.1 endpoint. Returns true when the request was handled.
 *
 * KEY ADAPTATION vs. landing-mcp: the credential is a PAIR { jwt, wsid }.
 * The /oauth/callback receives both `token` (jwt) and `wsid` from the consent
 * page redirect_uri. Both are stored and later injected as x-webcake-jwt AND
 * x-webcake-session-id headers onto /mcp requests.
 */
async function handleOAuth(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  const issuer = publicBase(req);

  // ---- Metadata ----
  if (req.method === "GET" && path === WELL_KNOWN_PR) {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(protectedResourceMetadata(`${issuer}${MCP_PATH}`, issuer)));
    return true;
  }
  if (req.method === "GET" && path === WELL_KNOWN_AS) {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(authServerMetadata(issuer)));
    return true;
  }

  // ---- Dynamic Client Registration ----
  if (path === OAUTH_REGISTER) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST,OPTIONS" });
      res.end();
      return true;
    }
    if (req.method !== "POST") { oauthError(res, 405, "invalid_request", "Use POST."); return true; }
    const raw = await readRawBody(req);
    const body = parseBodyParams(raw, String(req.headers["content-type"] ?? "")) as RegisterRequest;
    const result = await registerClient(body);
    if (!result.ok) { oauthError(res, 400, result.error, result.error_description); return true; }
    res.writeHead(201, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
    res.end(JSON.stringify({
      client_id: result.client.client_id,
      client_id_issued_at: Math.floor(result.client.created_at / 1000),
      redirect_uris: result.client.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }));
    return true;
  }

  // ---- Authorize: validate + redirect to storefront consent page ----
  if (req.method === "GET" && path === OAUTH_AUTHORIZE) {
    const sp = new URL(req.url ?? "/", "http://x").searchParams;
    const result = await startAuthorize({
      client_id: sp.get("client_id"),
      redirect_uri: sp.get("redirect_uri"),
      response_type: sp.get("response_type"),
      code_challenge: sp.get("code_challenge"),
      code_challenge_method: sp.get("code_challenge_method"),
      state: sp.get("state"),
      scope: sp.get("scope"),
    });
    if (!result.ok) {
      if (result.redirectable) {
        const r = new URL(sp.get("redirect_uri")!);
        r.searchParams.set("error", result.error);
        r.searchParams.set("error_description", result.error_description);
        const st = sp.get("state");
        if (st) r.searchParams.set("state", st);
        res.writeHead(302, { location: r.toString() });
        res.end();
        return true;
      }
      htmlError(res, 400, result.error_description);
      return true;
    }
    // Build the consent URL: /mcp-storefront?redirect_uri=<callback>&state=<internalState>
    // The SPA will redirect back to callback with ?token=<jwt>&wsid=<wsid>&state=<internalState>
    const callback = `${issuer}${OAUTH_CALLBACK}`;
    const consentBase = storefrontConsentUrl();
    const loginUrl = `${consentBase}?redirect_uri=${encodeURIComponent(callback)}&state=${encodeURIComponent(result.internalState)}`;
    res.writeHead(302, { location: loginUrl });
    res.end();
    return true;
  }

  // ---- Callback: SPA sent back token (jwt) + wsid + state ----
  if (req.method === "GET" && path === OAUTH_CALLBACK) {
    const sp = new URL(req.url ?? "/", "http://x").searchParams;
    // Accept both 'token' and 'jwt' from the SPA (login.ts uses both aliases).
    const jwt = sp.get("token") || sp.get("jwt");
    const wsid = sp.get("wsid") || sp.get("session_id") || "";
    const done = await completeAuthorize(sp.get("state"), jwt, wsid);
    if (!done.ok) { htmlError(res, 400, done.error_description); return true; }
    const r = new URL(done.redirectUri);
    r.searchParams.set("code", done.code);
    if (done.state) r.searchParams.set("state", done.state);
    res.writeHead(302, { location: r.toString() });
    res.end();
    return true;
  }

  // ---- Token ----
  if (path === OAUTH_TOKEN) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST,OPTIONS" });
      res.end();
      return true;
    }
    if (req.method !== "POST") { oauthError(res, 405, "invalid_request", "Use POST."); return true; }
    const raw = await readRawBody(req);
    const body = parseBodyParams(raw, String(req.headers["content-type"] ?? "")) as TokenParams;
    const result = await exchangeToken(body);
    if (!result.ok) { oauthError(res, result.status, result.error, result.error_description); return true; }
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
    res.end(JSON.stringify(result.body));
    return true;
  }

  // ---- Revoke ----
  if (path === OAUTH_REVOKE) {
    if (req.method !== "POST") { oauthError(res, 405, "invalid_request", "Use POST."); return true; }
    const raw = await readRawBody(req);
    const body = parseBodyParams(raw, String(req.headers["content-type"] ?? ""));
    revokeToken(body.token);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end("{}");
    return true;
  }

  return false;
}

export async function startHttpServer(port: number): Promise<void> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createHttpServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];

    // ---- Favicon / brand icon ----
    if (req.method === "GET" && (path === "/favicon.ico" || path === "/favicon.svg")) {
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" });
      res.end(faviconSvg());
      return;
    }

    // ---- OG social card ----
    if (req.method === "GET" && path === "/og.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" });
      res.end(ogImageSvg());
      return;
    }

    // ---- Legal pages ----
    if (req.method === "GET" && (path === "/privacy" || path === "/privacy-policy")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" });
      res.end(privacyHtml());
      return;
    }
    if (req.method === "GET" && (path === "/terms" || path === "/tos")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" });
      res.end(termsHtml());
      return;
    }

    // ---- Health + landing page ----
    if (req.method === "GET" && (path === "/" || path === "/health")) {
      if (path === "/" ) {
        const accept = String(req.headers["accept"] ?? "");
        const ua = String(req.headers["user-agent"] ?? "");
        if (accept.includes("text/html") || BOT_UA.test(ua)) {
          const lang = normalizeLang(new URL(req.url ?? "/", "http://x").searchParams.get("lang"));
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(landingHtml(publicBase(req), lang));
          return;
        }
      }
      sendJson(res, 200, { ok: true, server: "webcake-storefront", transport: "streamable-http", endpoint: MCP_PATH });
      return;
    }

    // ---- OAuth 2.1 endpoints (always served) ----
    if (await handleOAuth(req, res, path)) return;

    // ---- 404 for anything other than /mcp ----
    if (path !== MCP_PATH) {
      rpcError(res, 404, `Not found. Send MCP requests to ${MCP_PATH}.`);
      return;
    }

    // ---- /mcp handling ----

    // Accept credentials via query params for clients that can't set headers.
    applyQueryAuth(req);

    // Resolve an OAuth Bearer access token to { jwt, wsid } and inject both headers
    // so apiFromRequest picks them up — existing header/query paths remain untouched.
    const bearer = bearerFrom(req);
    const oauthCred = await resolveAccessToken(bearer);
    if (oauthCred) {
      if (req.headers["x-webcake-jwt"] == null) {
        req.headers["x-webcake-jwt"] = oauthCred.jwt;
        req.rawHeaders.push("x-webcake-jwt", oauthCred.jwt);
      }
      if (oauthCred.wsid && req.headers["x-webcake-session-id"] == null) {
        req.headers["x-webcake-session-id"] = oauthCred.wsid;
        req.rawHeaders.push("x-webcake-session-id", oauthCred.wsid);
      }
    }

    // Enforce OAuth when enabled: a request with no recognised credential gets 401.
    if (OAUTH_ENFORCED && !oauthCred && req.headers["x-webcake-jwt"] == null) {
      res.writeHead(401, {
        "www-authenticate": `Bearer resource_metadata="${publicBase(req)}${WELL_KNOWN_PR}"`,
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ error: "invalid_token", error_description: "Authentication required — connect via OAuth." }));
      return;
    }

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
        rpcError(res, 400, "Bad Request: send an initialize request first (no valid mcp-session-id).");
        return;
      }

      rpcError(res, 400, "Bad Request: missing or unknown mcp-session-id.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!res.headersSent) rpcError(res, 500, msg);
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  console.error(`[webcake-storefront] Streamable-HTTP MCP ready on http://localhost:${port}${MCP_PATH}`);
}

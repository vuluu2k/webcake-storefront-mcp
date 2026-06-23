// Browser login: spins up a loopback server, opens the builder app's /mcp-connect
// page, and receives the user's token back on the local callback — then saves it to
// the local config db so the stdio server picks it up automatically.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolveSettings } from "../config.js";
import { setConfig } from "../db.js";

interface LoginOpts {
  port?: number;
  open: boolean;
  apiUrl?: string;
  appUrl?: string;
  siteId?: string;
}

function parseArgs(argv: string[]): LoginOpts {
  const opts: LoginOpts = { open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-open") opts.open = false;
    else if (a === "--port") opts.port = Number(argv[++i]);
    else if (a === "--api-base" || a === "--api-url") opts.apiUrl = argv[++i];
    else if (a === "--app-base" || a === "--app-url") opts.appUrl = argv[++i];
    else if (a === "--site" || a === "--site-id") opts.siteId = argv[++i];
  }
  return opts;
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
  } catch {
    /* user can open the URL manually */
  }
}

const SUCCESS_HTML =
  "<!doctype html><meta charset=utf-8><title>Connected</title><body style='font:16px system-ui;padding:3rem;text-align:center'><h2>✓ Connected to WebCake</h2><p>You can close this tab and return to your terminal.</p></body>";

function readQuery(url: string | undefined): URLSearchParams {
  const q = (url ?? "").indexOf("?");
  return new URLSearchParams(q === -1 ? "" : (url ?? "").slice(q + 1));
}

export async function runLogin(argv: string[]): Promise<void> {
  const opts = parseArgs(argv);
  const settings = resolveSettings({ apiUrl: opts.apiUrl, appUrl: opts.appUrl });
  const appUrl = settings.appUrl.replace(/\/$/, "");
  const apiUrl = settings.apiUrl.replace(/\/$/, "");
  const state = randomBytes(16).toString("hex");

  await new Promise<void>((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const params = readQuery(req.url);
      const token = params.get("token") || params.get("jwt");
      const returnedState = params.get("state");

      if (!token) {
        res.writeHead(400, { "content-type": "text/html" }).end("<p>Missing token.</p>");
        return;
      }
      if (returnedState && returnedState !== state) {
        res.writeHead(400, { "content-type": "text/html" }).end("<p>State mismatch.</p>");
        return;
      }

      setConfig("token", token);
      if (apiUrl) setConfig("api_url", apiUrl);
      if (opts.siteId) setConfig("site_id", opts.siteId);

      res.writeHead(200, { "content-type": "text/html" }).end(SUCCESS_HTML);
      console.error(`\n✓ Connected. Token saved to local config (api ${apiUrl || "<unset>"}).`);
      server.close();
      resolve();
    });

    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const full = `${appUrl}/mcp-connect?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      console.error("Opening your browser to connect (log in to WebCake there if prompted):");
      console.error("  " + full + "\n");
      if (opts.open) openBrowser(full);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("login timed out after 180s."));
    }, 180_000).unref();
  });
}

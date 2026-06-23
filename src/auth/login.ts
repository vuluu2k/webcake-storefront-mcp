// Browser login: spins up a loopback server, opens the builder app's /mcp-storefront
// page, and receives the user's token back on the local callback — then saves it to
// the local config db so the stdio server picks it up automatically.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn, execFile } from "node:child_process";
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
  const platform = process.platform;
  try {
    if (platform === "win32") {
      // `cmd /c start` parses an unquoted `&` as a command separator, which would cut
      // the connect URL right before `&state=...`. Pass args verbatim with the URL
      // double-quoted; the first quoted arg ("") is `start`'s window title.
      spawn("cmd", ["/c", "start", '""', `"${url}"`], {
        stdio: "ignore",
        detached: true,
        windowsVerbatimArguments: true,
      }).unref();
      return;
    }
    const cmd = platform === "darwin" ? "open" : "xdg-open";
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* user can open the URL manually */
  }
}

// Chrome won't let a page close a tab it didn't open (window.close() is blocked),
// so instead we bring the user's terminal back to the foreground from Node. We
// snapshot whatever app is frontmost just before opening the browser (that's the
// terminal/IDE that ran the command) and re-activate it once the token arrives.
// macOS only (AppleScript); a no-op elsewhere — the success page still shows.
function captureFrontmostApp(): Promise<string | undefined> {
  if (process.platform !== "darwin") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | undefined) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const child = execFile(
      "osascript",
      ["-e", 'tell application "System Events" to get name of first application process whose frontmost is true'],
      (err, stdout) => finish(err ? undefined : stdout.trim() || undefined),
    );
    // Never let login stall: the first run may hang on the macOS Automation
    // permission prompt. Give up after 2s (re-focus is just a nicety).
    setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      finish(undefined);
    }, 2000).unref();
  });
}

function activateApp(name: string | undefined): void {
  if (!name || process.platform !== "darwin") return;
  // Re-focus by process name via System Events (works for terminals whose app
  // name differs from the process, e.g. iTerm/Terminal/Warp/VS Code).
  execFile(
    "osascript",
    ["-e", `tell application "System Events" to set frontmost of (first application process whose name is "${name.replace(/"/g, '\\"')}") to true`],
    () => {},
  );
}

const SUCCESS_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Connected to WebCake</title>
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    background:linear-gradient(135deg,#e7f6f0 0%,#eafaf4 100%);color:#0f2e23}
  @media(prefers-color-scheme:dark){body{background:linear-gradient(135deg,#0b1f18 0%,#06140f 100%);color:#dcf2e8}}
  .card{background:#fff;border-radius:20px;padding:48px 40px;max-width:430px;width:calc(100% - 32px);
    text-align:center;box-shadow:0 20px 60px rgba(16,139,103,.20);animation:rise .5s cubic-bezier(.2,.8,.2,1)}
  @media(prefers-color-scheme:dark){.card{background:#10241c;box-shadow:0 20px 60px rgba(0,0,0,.5)}}
  @keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
  .badge{width:84px;height:84px;margin:0 auto 24px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#13a87b,#108B67);box-shadow:0 8px 24px rgba(16,139,103,.42);animation:pop .45s .15s both cubic-bezier(.2,1.4,.4,1)}
  @keyframes pop{from{transform:scale(0)}to{transform:scale(1)}}
  .badge svg{width:44px;height:44px;stroke:#fff;stroke-width:3.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
  .badge path{stroke-dasharray:32;stroke-dashoffset:32;animation:draw .4s .4s forwards ease-out}
  @keyframes draw{to{stroke-dashoffset:0}}
  h1{margin:0 0 10px;font-size:1.55rem;font-weight:700}
  p{margin:0;font-size:1rem;line-height:1.6;color:#4b6a5f}
  @media(prefers-color-scheme:dark){p{color:#9cc7b8}}
  .hint{margin-top:24px;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;
    background:#f0f7f4;font-size:.9rem;color:#3d5b50}
  @media(prefers-color-scheme:dark){.hint{background:#0b1f18;color:#9cc7b8}}
  .hint code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600;color:#108B67}
  @media(prefers-color-scheme:dark){.hint code{color:#5fd3ac}}
</style></head>
<body>
  <main class="card">
    <div class="badge"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <h1>Connected to WebCake</h1>
    <p>Your storefront account is linked. You can close this tab now.</p>
    <div class="hint">👉 Return to your <code>terminal</code> to continue</div>
  </main>
  <script>
    // The terminal is re-focused from the CLI side. Still try window.close() for
    // browsers that allow it (no-op in Chrome for tabs it didn't open) — no alert,
    // which would only steal focus back from the terminal.
    setTimeout(function(){ try { window.close(); } catch (e) {} }, 800);
  </script>
</body></html>`;

function readQuery(url: string | undefined): URLSearchParams {
  const q = (url ?? "").indexOf("?");
  return new URLSearchParams(q === -1 ? "" : (url ?? "").slice(q + 1));
}

function pathOf(url: string | undefined): string {
  const u = url ?? "/";
  const q = u.indexOf("?");
  return q === -1 ? u : u.slice(0, q);
}

export async function runLogin(argv: string[]): Promise<void> {
  const opts = parseArgs(argv);
  const settings = resolveSettings({ apiUrl: opts.apiUrl, appUrl: opts.appUrl });
  const appUrl = settings.appUrl.replace(/\/$/, "");
  const apiUrl = settings.apiUrl.replace(/\/$/, "");
  const state = randomBytes(16).toString("hex");
  // Remember the terminal that's frontmost now, so we can re-focus it once the
  // browser hands the token back (Chrome can't auto-close its own tab).
  const terminalApp = await captureFrontmostApp();

  await new Promise<void>((resolve, reject) => {
    // `close()` only stops NEW connections; a browser keep-alive socket would keep
    // the event loop (and the CLI) alive, so drop the live ones too.
    const shutdown = () => {
      server.close();
      server.closeAllConnections?.();
    };

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Ignore stray requests (favicon, etc.) so they don't trip the token check.
      if (pathOf(req.url) !== "/callback") {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
        return;
      }

      const params = readQuery(req.url);
      const token = params.get("token") || params.get("jwt");
      const wsid = params.get("wsid") || params.get("session_id") || "";
      const returnedState = params.get("state");

      if (!token) {
        res.writeHead(400, { "content-type": "text/html" }).end("<p>Missing token — re-run the command.</p>");
        return; // keep listening — the user can retry until the timeout
      }
      if (returnedState && returnedState !== state) {
        res.writeHead(400, { "content-type": "text/html" }).end("<p>State mismatch (login link truncated or expired) — re-run the command.</p>");
        return;
      }

      setConfig("token", token);
      if (wsid) setConfig("session_id", wsid);
      if (apiUrl) setConfig("api_url", apiUrl);
      if (opts.siteId) setConfig("site_id", opts.siteId);

      res.writeHead(200, { "content-type": "text/html" }).end(SUCCESS_HTML);
      console.error(`\n✓ Connected. Token${wsid ? " + session" : ""} saved to local config (api ${apiUrl || "<unset>"}).`);
      // Pull the terminal/IDE back to the front (best-effort; no-op off macOS).
      activateApp(terminalApp);
      shutdown();
      resolve();
    });

    server.on("error", reject);

    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const full = `${appUrl}/mcp-storefront?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      console.error("Opening your browser to connect (log in to WebCake there if prompted):");
      console.error("  " + full + "\n");
      if (opts.open) openBrowser(full);
    });

    setTimeout(() => {
      shutdown();
      reject(new Error("login timed out after 180s."));
    }, 180_000).unref();
  });
}

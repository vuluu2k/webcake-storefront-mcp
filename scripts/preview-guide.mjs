/**
 * Dev preview server for the hosted pages (src/web-guide.ts landing page +
 * src/legal.ts privacy/terms) with hot-reload — NOT a production path (that's
 * `serve` in src/http.ts).
 *
 *   npm run dev:guide        # → http://localhost:8788
 *
 * What it does:
 *  1. Builds once (so dist/web-guide.js + dist/legal.js exist), then runs
 *     `tsc --watch` so every save to src/ recompiles into dist/.
 *  2. Serves the pages by re-importing the freshly built modules with a
 *     cache-busting query, so edits show on refresh without restarting.
 *  3. Injects a tiny SSE client that reloads the browser the moment the built
 *     modules change — true hot-reload, no manual F5.
 *
 * Self-contained: no extra deps.
 */
import { createServer } from "node:http";
import { spawn, execSync } from "node:child_process";
import { watch, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_GUIDE = resolve(ROOT, "dist/web-guide.js");
const DIST_LEGAL = resolve(ROOT, "dist/legal.js");
const PORT = Number(process.argv[2] || process.env.PORT || 8788);

// 1) Build once so the dist modules exist, then keep tsc watching.
console.error("[preview] initial build…");
execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
const tsc = spawn("npx", ["tsc", "--watch", "--preserveWatchOutput"], {
  cwd: ROOT,
  stdio: ["ignore", "inherit", "inherit"],
});
process.on("exit", () => tsc.kill());
process.on("SIGINT", () => process.exit(0));

// 2) SSE clients to push reloads to.
const clients = new Set();
function broadcastReload() {
  for (const res of clients) res.write("data: reload\n\n");
}
// fs.watch can fire twice per save — debounce.
let t;
const onChange = () => {
  clearTimeout(t);
  t = setTimeout(broadcastReload, 80);
};
for (const f of [DIST_GUIDE, DIST_LEGAL]) {
  try {
    watch(f, onChange);
  } catch {
    /* file appears after the first build tick */
  }
}

const LIVERELOAD = `<script>(function(){var s=new EventSource('/__livereload');s.onmessage=function(e){if(e.data==='reload')location.reload();};})();</script>`;

async function freshImport(file) {
  const v = statSync(file).mtimeMs;
  return import(pathToFileURL(file).href + `?v=${v}`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/__livereload") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write("retry: 500\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  try {
    const guide = await freshImport(DIST_GUIDE);

    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico" || url.pathname === "/icon.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      return res.end(guide.faviconSvg());
    }

    let html;
    if (url.pathname === "/privacy" || url.pathname === "/privacy-policy") {
      html = (await freshImport(DIST_LEGAL)).privacyHtml();
    } else if (url.pathname === "/terms" || url.pathname === "/tos") {
      html = (await freshImport(DIST_LEGAL)).termsHtml();
    } else {
      html = guide.landingHtml(`http://localhost:${PORT}`);
    }

    html = html.replace("</body>", `${LIVERELOAD}</body>`);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Preview error (still compiling?):\n" + (err?.stack || err));
  }
});

server.listen(PORT, () => {
  console.error(
    `\n[preview] pages → http://localhost:${PORT}  (/, /privacy, /terms — edit src/web-guide.ts or src/legal.ts → auto reload)\n`
  );
});

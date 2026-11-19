#!/usr/bin/env node
// Clone fidelity scoreboard (dev machine only). For every target: capture it (clone.ts), convert,
// write the source into a scratch HOMEPAGE of a LOCAL builderx_api running in Docker, rebuild its
// CSS like the site /save does, then compare source vs clone at 1440 / 768 / 390 px:
//   text   — share of the source's text blocks found in the clone
//   x / w  — median left-edge / width error of matched blocks (fraction of the viewport)
//   order  — share of neighbouring matched blocks whose top-to-bottom order survived
//   pixels — share of differing pixels (480px wide, blurred, tolerance 40) over the shared height
//   height — clone page height / source page height
// The page's original source is backed up first and restored at the end.
//
//   FIDELITY_SITE=<site id> FIDELITY_PAGE=<its homepage id> npm run fidelity [-- --save] [urls…]
// Env: FIDELITY_CONTAINER (default builderx_api), FIDELITY_NODE (builderx_api@builderx_api),
//      FIDELITY_COOKIE (mycookie), FIDELITY_RENDER (http://demo.localhost:24679/<site>).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { capturePage, snapshotToSource } from "../dist/builder/clone.js";
import { finalizeForRender } from "../dist/builder/page.js";

const SITE = process.env.FIDELITY_SITE;
const PAGE = process.env.FIDELITY_PAGE;
if (!SITE || !PAGE) {
  console.error("Set FIDELITY_SITE and FIDELITY_PAGE (a scratch homepage on your LOCAL builderx_api). Nothing else is touched.");
  process.exit(2);
}
const CONTAINER = process.env.FIDELITY_CONTAINER || "builderx_api";
const NODE = process.env.FIDELITY_NODE || "builderx_api@builderx_api";
const COOKIE = process.env.FIDELITY_COOKIE || "mycookie";
const RENDER = process.env.FIDELITY_RENDER || `http://demo.localhost:24679/${SITE}`;
const WIDTHS = [1440, 768, 390];
const DIR = path.resolve("test/fidelity");
const OUT = path.join(DIR, "out");
const BASELINE = path.join(DIR, "baseline.json");
const args = process.argv.slice(2);
const save = args.includes("--save");
const urls = args.filter((a) => !a.startsWith("--"));
const targets = urls.length
  ? urls.map((u) => ({ name: u.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_").slice(0, 40), url: u }))
  : fs.readdirSync(path.join(DIR, "fixtures")).filter((f) => f.endsWith(".html")).sort()
      .map((f) => ({ name: f.replace(/\.html$/, ""), url: pathToFileURL(path.join(DIR, "fixtures", f)).href }));

// ── Local backend writes (rpc into the running node) ──────────────────────────────────────
const rpc = (expr, input = "") =>
  execFileSync("docker", ["exec", "-i", CONTAINER, "elixir", "--sname", `fid${process.pid}${Date.now() % 1000}`, "--cookie", COOKIE, "-e", expr], { input, encoding: "utf8", maxBuffer: 1 << 26 });
const evalOnNode = (code) => rpc(`code = IO.read(:all); {v, _} = :rpc.call(:"${NODE}", Code, :eval_string, [code]); IO.puts("=> #{inspect(v)}")`, code).split("\n").filter((l) => l.startsWith("=> ")).pop();
const BUILD_CSS = `
site = BuilderxApi.Citus.get(BuilderxApi.Sites.Site, "${SITE}")
theme = BuilderxApi.SiteStyles.SiteStyles.get_theme(site.id)
{:ok, ps} = BuilderxApi.Pages.get_page_source_by_page_id("${PAGE}", "${SITE}")
app_css = %Qwik{site_id: site.id, page_id: "${PAGE}", source: Jason.decode!(ps.source), settings: Jason.decode!(site.settings), colors: theme[:colors], typographies: BuilderxApi.BuildService.build_typographies(theme), source_cart: BuilderxApi.GlobalSources.GlobalSources.get_source_cart(site.id), popups: BuilderxApi.GlobalSources.GlobalSources.get_global_sources(site.id, "popup"), custom_fonts: BuilderxApi.Fonts.Fonts.load_font_groups(site.id)} |> Qwik.build(only_css: true) |> Statics.build_css()
{:ok, _} = BuilderxApi.Pages.update_page_source(ps, %{app_css: app_css})
byte_size(app_css)`;
const writeSource = (json) => {
  fs.writeFileSync(path.join(OUT, ".source.json"), json);
  // base64: no quoting or #{} interpolation to worry about inside the Elixir code.
  return evalOnNode(`json = Base.decode64!("${Buffer.from(json).toString("base64")}")
{:ok, ps} = BuilderxApi.Pages.get_page_source_by_page_id("${PAGE}", "${SITE}")
{:ok, _} = BuilderxApi.Pages.update_page_source(ps, %{source: json})
${BUILD_CSS}`);
};
// The node's debug logs share our stdout: the payload travels base64 between markers.
const readSource = () => {
  const out = rpc(`{:ok, ps} = :rpc.call(:"${NODE}", BuilderxApi.Pages, :get_page_source_by_page_id, ["${PAGE}", "${SITE}"]); IO.puts("<<<" <> Base.encode64(ps.source) <> ">>>")`);
  const m = /<<<([A-Za-z0-9+/=]+)>>>/.exec(out);
  return m ? Buffer.from(m[1], "base64").toString("utf8") : "";
};

// ── In-page probes ────────────────────────────────────────────────────────────────────────
const textBlocks = () => {
  const out = [];
  const walk = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    const r = el.getBoundingClientRect();
    if (own && r.width > 0 && r.height > 0) out.push({ t: own, x: r.left + scrollX, y: r.top + scrollY, w: r.width });
    for (const c of el.children) walk(c);
  };
  walk(document.body);
  return { blocks: out, height: document.documentElement.scrollHeight };
};

async function shoot(browser, url, width, file) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => undefined);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
  const probe = await page.evaluate(textBlocks);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return probe;
}

async function pixelDiff(a, b) {
  const load = async (f) => sharp(f).resize({ width: 480 }).blur(2).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [A, B] = await Promise.all([load(a), load(b)]);
  const h = Math.min(A.info.height, B.info.height);
  const row = 480 * 3;
  let diff = 0;
  for (let i = 0; i < h * row; i += 3) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > 40) diff++;
  }
  return diff / (h * 480);
}

const median = (xs) => (xs.length ? [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)] : 1);
function compare(src, clone, width) {
  const pool = [...clone.blocks];
  const pairs = [];
  for (const s of src.blocks) {
    const i = pool.findIndex((c) => c.t === s.t);
    if (i >= 0) pairs.push([s, pool.splice(i, 1)[0]]);
  }
  let kept = 0;
  for (let i = 1; i < pairs.length; i++) if (Math.sign(pairs[i][0].y - pairs[i - 1][0].y) === Math.sign(pairs[i][1].y - pairs[i - 1][1].y) || Math.abs(pairs[i][0].y - pairs[i - 1][0].y) < 4) kept++;
  return {
    text: src.blocks.length ? pairs.length / src.blocks.length : 1,
    x: median(pairs.map(([s, c]) => Math.abs(s.x - c.x) / width)),
    w: median(pairs.map(([s, c]) => Math.abs(s.w - c.w) / width)),
    order: pairs.length > 1 ? kept / (pairs.length - 1) : 1,
    height: clone.height / Math.max(1, src.height),
  };
}
// One number to watch: content first, then placement, then the picture.
const score = (m) => Math.round(100 * (0.35 * m.text + 0.15 * Math.max(0, 1 - m.x * 5) + 0.1 * Math.max(0, 1 - m.w * 5) + 0.15 * m.order + 0.1 * Math.max(0, 1 - Math.abs(1 - m.height)) + 0.15 * (1 - m.pixels)));

const { chromium } = await import("playwright-core");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
const backup = readSource();
if (!backup.startsWith("{")) throw new Error("Could not read the scratch page's source — check FIDELITY_* settings.");
fs.writeFileSync(path.join(OUT, ".backup.json"), backup);
const results = {};
try {
  for (const t of targets) {
    const cap = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await cap.goto(t.url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => undefined);
    const snap = await capturePage(cap);
    await cap.close();
    const out = snapshotToSource(snap);
    finalizeForRender(out.source);
    writeSource(JSON.stringify(out.source));
    results[t.name] = { sections: out.stats.sections, coverage: out.stats.text_coverage_pct };
    for (const w of WIDTHS) {
      const src = await shoot(browser, t.url, w, path.join(OUT, `${t.name}-${w}-src.png`));
      const clone = await shoot(browser, RENDER, w, path.join(OUT, `${t.name}-${w}-clone.png`));
      const m = compare(src, clone, w);
      m.pixels = await pixelDiff(path.join(OUT, `${t.name}-${w}-src.png`), path.join(OUT, `${t.name}-${w}-clone.png`));
      results[t.name][w] = { ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(3)])), score: score(m) };
    }
  }
} finally {
  await browser.close();
  console.log("restore:", writeSource(backup));
}

const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};
const fmt = (v, b) => (b === undefined ? `${v}` : `${v} (${v - b >= 0 ? "+" : ""}${v - b})`);
console.log(`\n${"target".padEnd(22)} ${WIDTHS.map((w) => `${w}`.padEnd(16)).join("")} text/x/order @1440`);
for (const [name, r] of Object.entries(results)) {
  const row = WIDTHS.map((w) => fmt(r[w].score, base[name]?.[w]?.score).padEnd(16)).join("");
  console.log(`${name.padEnd(22)} ${row} ${r[1440].text}/${r[1440].x}/${r[1440].order}`);
}
const avg = (rs, w) => Math.round(Object.values(rs).reduce((n, r) => n + (r[w]?.score || 0), 0) / Math.max(1, Object.keys(rs).length));
console.log(`${"AVERAGE".padEnd(22)} ${WIDTHS.map((w) => fmt(avg(results, w), Object.keys(base).length ? avg(Object.fromEntries(Object.keys(results).map((k) => [k, base[k] || {}])), w) : undefined).padEnd(16)).join("")}`);
fs.writeFileSync(path.join(OUT, "last.json"), JSON.stringify(results, null, 1));
if (save) {
  fs.writeFileSync(BASELINE, JSON.stringify({ ...base, ...results }, null, 1) + "\n");
  console.log(`baseline saved → ${path.relative(process.cwd(), BASELINE)}`);
}

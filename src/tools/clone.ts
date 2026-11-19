// clone_page / get_clone_script: a rendered web page → native BuilderX sections (builder/clone.ts).
// The converted source is parked in the result cache and handed to build_page by reference
// (`source: "cache:clone-N"`), so every build_page guard (validation, slug, breakpoints) applies
// and a 300 KB source never has to travel through the agent's context.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { CLONE_SCRIPT, capturePage, snapshotToSource } from "../builder/clone.js";
import { validatePage, walk } from "../builder/page.js";
import { codeOf } from "../builder/element-schema.js";
import { cachePut } from "./result-cache.js";
import { cdnUpload } from "./builder-extras.js";

const RUN_HINT =
  "Open the page in your browser tool at ~1440px wide, let it load, run `script` there (chrome-devtools evaluate_script / claude-in-chrome javascript_tool / playwright evaluate — it is an async expression returning JSON), then call clone_page({ snapshot: <the result> }).";

/** Headless capture with a local Chrome via playwright-core (optional dependency). */
async function captureWithChrome(url: string, width: number): Promise<any> {
  const mod = "playwright-core";
  let chromium: any;
  try {
    ({ chromium } = await import(mod));
  } catch {
    throw new Error("NO_BROWSER: playwright-core is not installed here.");
  }
  let browser: any;
  try {
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: "chrome", headless: true });
  } catch (e: any) {
    throw new Error(`NO_BROWSER: no local Chrome (${String(e?.message || e).split("\n")[0]}). Set CHROME_PATH or use get_clone_script.`);
  }
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => undefined);
    return await capturePage(page, width);
  } finally {
    await browser.close();
  }
}

/** One line per section: what it holds, so the agent can judge the clone without the source. */
function outline(sections: any[], roles: string[]) {
  const label = (n: any, d: number): string => {
    const kids = n.children || [];
    const row = n.runtime?.config?.__row;
    const txt = n.specials?.text ? ` "${String(n.specials.text).replace(/<[^>]+>/g, "").slice(0, 28)}"` : "";
    const head = `${n.type}${txt}`;
    if (!kids.length || d > 2) return head;
    return `${head}${row ? " row" : ""}[${kids.slice(0, 6).map((k: any) => label(k, d + 1)).join(", ")}${kids.length > 6 ? `, …+${kids.length - 6}` : ""}]`;
  };
  return sections.map((s, i) => `#${i + 1} ${roles[i]}: ${(s.children || []).map((k: any) => label(k, 1)).join(" | ")}`.slice(0, 400));
}

async function rehost(api: WebcakeCmsApi, source: any, images: string[]) {
  const map = new Map<string, string>();
  const failed: string[] = [];
  const queue = [...new Set(images)];
  const worker = async () => {
    for (let src = queue.shift(); src; src = queue.shift()) {
      try {
        map.set(src, await cdnUpload(api, src));
      } catch (e: any) {
        failed.push(`${src.slice(0, 80)}: ${String(e?.message || e).slice(0, 80)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  walk(source, (n: any) => {
    const cfg = n.runtime?.config;
    if (cfg?.src && map.has(cfg.src)) cfg.src = map.get(cfg.src);
    if (n.specials?.src && map.has(n.specials.src)) n.specials.src = map.get(n.specials.src);
    const bg = n.runtime?.style?.background;
    if (typeof bg === "string")
      n.runtime.style.background = bg.replace(/url\(([^)]+)\)/g, (m: string, u: string) => (map.has(u) ? `url(${map.get(u)})` : m));
    return n;
  });
  return { hosted: map.size, failed };
}

export function registerCloneTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "get_clone_script",
    "Get the capture script for clone_page: run it inside the source page with YOUR browser tool when clone_page can't open the page itself (remote server, no local Chrome, a page behind login).",
    {},
    () => handle(async () => ({ script: CLONE_SCRIPT, run: RUN_HINT }))
  );

  server.tool(
    "clone_page",
    `Clone a web page into NATIVE sections (text/image/button/form/video/container rows — no embed, no custom code). Pass url (captured with a local Chrome when available) or snapshot (from get_clone_script run in your browser). Layout comes from the real boxes: side-by-side → a row with measured column widths (collapses on tablet/mobile), stacked → a column. Returns an outline, text coverage, fonts, notes on everything approximated or skipped, the validation result and source_ref. Then: build_page({ name, slug, source: source_ref, dry_run:true }) → dry_run:false. rehost_images:true uploads every image to the WebCake CDN first (the storefront shows CDN images only) — do it for a page you will keep. Clone only pages the user owns or may copy; rewrite copy/branding to theirs.`,
    {
      url: z.string().url().optional().describe("Page to clone (public URL)"),
      snapshot: z.any().optional().describe("Result of the get_clone_script script (object or JSON string), instead of url"),
      width: z.number().int().min(320).max(1920).optional().describe("Capture width in px (default 1440)"),
      skip_chrome: z.boolean().optional().describe("Leave out the source's header/footer/nav (use the site's global ones). Default false"),
      rehost_images: z.boolean().optional().describe("Upload images (and svg icons as PNG) to the WebCake CDN (default false)"),
    },
    ({ url, snapshot, width, skip_chrome, rehost_images }) =>
      handle(async () => {
        let snap = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
        if (!snap) {
          if (!url) throw new Error("Pass url or snapshot.");
          try {
            snap = await captureWithChrome(url, width || 1440);
          } catch (e: any) {
            if (!String(e?.message).startsWith("NO_BROWSER")) throw e;
            return { needs_browser: true, reason: e.message, next: `Call get_clone_script, then: ${RUN_HINT}` };
          }
        }
        if (!snap || !Array.isArray(snap.sections)) throw new Error("snapshot has no sections — run the get_clone_script script on the page.");
        const out = snapshotToSource(snap, { skipChrome: !!skip_chrome });
        const images = rehost_images ? await rehost(api, out.source, out.images) : undefined;
        const v: any = validatePage(out.source);
        const byCode: Record<string, number> = {};
        for (const w of v.warnings || []) byCode[codeOf(w)] = (byCode[codeOf(w)] || 0) + 1;
        const ref = cachePut(`clone ${snap.url || url || ""}`, JSON.stringify(out.source));
        return {
          url: snap.url || url,
          title: snap.title,
          stats: out.stats,
          outline: outline(out.source.sections, out.roles),
          fonts: out.fonts,
          ...(out.notes.length ? { notes: out.notes } : {}),
          ...(images ? { images: { hosted: images.hosted, ...(images.failed.length ? { failed: images.failed.slice(0, 10) } : {}) } } : { images: { external: out.images.length, note: out.images.length ? "Not on the CDN yet — the storefront won't show them. Re-run with rehost_images:true for a page you keep." : undefined } }),
          validation: { valid: v.valid, errors: (v.errors || []).slice(0, 8), warnings_by_code: byCode },
          source_ref: `cache:${ref}`,
          next: `${(v.errors || []).some((e: string) => e.startsWith("[IMAGE_HOST]")) ? "Images are not on the WebCake CDN yet (IMAGE_HOST blocks the save): run clone_page again with rehost_images:true. Then " : ""}build_page({ name, slug, source: "cache:${ref}", dry_run: true }) then dry_run:false. Set the site fonts to ${out.fonts.slice(0, 2).join(" / ") || "the source's"} if they differ; rewrite the copy for the user's brand. The ref expires in 10 min (read it with read_cached_result).`,
        };
      })
  );
}

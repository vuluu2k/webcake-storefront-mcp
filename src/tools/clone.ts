// clone_page / get_clone_script: a rendered web page → native BuilderX sections (builder/clone.ts).
// The converted source is parked in the result cache and handed to build_page by reference
// (`source: "cache:clone-N"`), so every build_page guard (validation, slug, breakpoints) applies
// and a 300 KB source never has to travel through the agent's context.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { CLONE_SCRIPT, capturePage, snapshotToSource, imageRefs, rewriteImages } from "../builder/clone.js";
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Re-host every picture of a cloned source with `upload` (cdnUpload in the tool; a fake in tests).
 *  Each image: the url, then the same url without its query (an on-the-fly resize/format param the
 *  CDN may refuse), each tried `tries` times with backoff unless the answer is a hard 4xx. What still
 *  fails is taken out of the page (a picture the storefront can't show would only block the save
 *  with IMAGE_HOST) and listed with the elements that held it, so build_page takes the ref as is. */
export async function rehost(source: any, upload: (src: string) => Promise<string>, opts: { tries?: number; delayMs?: number; workers?: number } = {}) {
  const { tries = 3, delayMs = 500, workers = 4 } = opts;
  const map = new Map<string, string>();
  const errors = new Map<string, string>();
  const queue = imageRefs(source);
  const one = async (src: string) => {
    const bare = /^https?:/.test(src) && src.includes("?") ? src.slice(0, src.indexOf("?")) : "";
    let last = "";
    for (const cand of bare ? [src, bare] : [src])
      for (let i = 0; i < tries; i++) {
        if (i) await sleep(delayMs * 2 ** (i - 1));
        try {
          return map.set(src, await upload(cand));
        } catch (e: any) {
          last = String(e?.message || e).slice(0, 160);
          // 404/403/400…: this url won't change its answer (408/429 and 5xx/network are retried).
          if (/\((4\d\d)\)/.test(last) && !/\((408|429)\)/.test(last)) break;
        }
      }
    errors.set(src, last);
  };
  await Promise.all(Array.from({ length: workers }, async () => {
    for (let src = queue.shift(); src; src = queue.shift()) await one(src);
  }));
  rewriteImages(source, map);
  const failed = errors.size ? dropImages(source, errors) : [];
  return { hosted: map.size, failed };
}

/** Take failed pictures out: an image element goes, a background keeps its colour/gradient. */
function dropImages(source: any, errors: Map<string, string>) {
  const where = new Map<string, Set<string>>();
  const hit = (src: string, n: any) => where.set(src, (where.get(src) || new Set()).add(n.id));
  walk(source, (n: any) => {
    if (!Array.isArray(n.children)) return n;
    n.children = n.children.filter((k: any) => {
      const src = k.runtime?.config?.src ?? k.specials?.src;
      return !(k.type === "image" && errors.has(src) && (hit(src, k), true));
    });
    return n;
  });
  rewriteImages(source, new Map([...errors.keys()].map((u) => [u, ""])), hit);
  return [...errors].map(([src, error]) => ({ src, error, elements: [...(where.get(src) || [])] }));
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
        const referer = snap.url || url;
        const images = rehost_images ? await rehost(out.source, (src) => cdnUpload(api, src, referer)) : undefined;
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
          ...(images ? { images: { hosted: images.hosted, ...(images.failed.length ? { failed: images.failed.slice(0, 20), failed_count: images.failed.length, note: "These could not be uploaded, so they were taken out of the page (an image element removed, a background left with its colour); the page builds as is. To restore one: upload_images([src]) after fixing it, then update_page_element on the listed element ids (the parent of a removed image)." } : {}) } } : { images: { external: out.images.length, note: out.images.length ? "Not on the CDN yet — the storefront won't show them. Re-run with rehost_images:true for a page you keep." : undefined } }),
          validation: { valid: v.valid, errors: (v.errors || []).slice(0, 8), warnings_by_code: byCode },
          source_ref: `cache:${ref}`,
          next: `${(v.errors || []).some((e: string) => e.startsWith("[IMAGE_HOST]")) ? "Images are not on the WebCake CDN yet (IMAGE_HOST blocks the save): run clone_page again with rehost_images:true. Then " : ""}build_page({ name, slug, source: "cache:${ref}", dry_run: true }) then dry_run:false. Set the site fonts to ${out.fonts.slice(0, 2).join(" / ") || "the source's"} if they differ; rewrite the copy for the user's brand. The ref expires in 10 min (read it with read_cached_result).`,
        };
      })
  );
}

// Custom code of ONE page — page.settings.custom_code, the same four slots as the site's code.
// builderx_api (PageUtils.get_page_custom_code) renders it after the site's code on that page
// only: CSS/head code in <head>, body code after <body>, JS in its own <script> at the end, so a
// broken page script can't take the site script down with it. Settings are copied to the
// published page on publish_site; the preview reads them straight away.
import { Script } from "node:vm";
import { SITE_CODE_FIELDS } from "./native-first.js";

export const PAGE_CODE_FIELDS = SITE_CODE_FIELDS;
export type PageCodeField = (typeof PAGE_CODE_FIELDS)[number];
export type PageCode = Partial<Record<PageCodeField, string>>;

/** Per page, in chars. Above `soft` a write must name its native gap; past `hard` it is refused. */
export const PAGE_CODE_BUDGET = {
  script: { soft: 15_000, hard: 50_000 },
  css: { soft: 10_000, hard: 30_000 },
};

export const PAGE_CODE_GUIDE = `## Per-page custom code (last resort — NATIVE FIRST still applies)
Use it when the element schema can't express what the user asked for ON THIS PAGE ONLY (a landing
page's one-off animation, a calculator that writes into native elements, a tracking event for this
page). Anything every page needs belongs in the site code (update_site_custom_code); anything an
element setting can do belongs in that setting.
Slots (rendered on this page only, after the site's code):
- code_custom_css — CSS, wrapped in <style> for you. Target #ELEMENT-ID (ids from targets) or a
  specials.custom_class you set on a native element. Media queries: match the site breakpoints.
- code_custom_javascript — plain JS, NO <script> tag (it gets its own). Runs at the end of <body>,
  after the page's HTML exists; content loaded later (product grids, carts) needs a
  MutationObserver or a retry. Wrap in an IIFE; never document.write.
- code_before_head — <script src>/<link>/<meta> for this page (e.g. a library only this page uses).
- code_before_body — markup after the page's content, before its scripts (same spot as the
  site's code_before_body): a noscript pixel, a mount point for a widget.
Rules: write into native elements (textContent, classList) instead of building UI in JS; data comes
from a collection / HTTP function (webcake-fn), never hard-coded lists. Syntax is checked before
saving; #ids that aren't on the page are flagged. Preview right away; publish_site to go live.`;

/** The page's custom code from its settings (object or JSON string), only known slots, only strings. */
export function readPageCode(settings: any): PageCode {
  let s = settings;
  if (typeof s === "string") {
    try {
      s = JSON.parse(s);
    } catch {
      s = null;
    }
  }
  const code = s && typeof s === "object" ? s.custom_code : null;
  const out: PageCode = {};
  if (code && typeof code === "object")
    for (const f of PAGE_CODE_FIELDS) if (typeof code[f] === "string" && code[f].trim()) out[f] = code[f];
  return out;
}

/** Merge an edit into the current code. `append` adds after what is there; "" clears a slot.
 *  A <script> wrapper around code_custom_javascript is removed (the renderer adds its own). */
export function mergePageCode(before: PageCode, input: PageCode, mode: "replace" | "append" = "replace") {
  const after: PageCode = { ...before };
  const notes: string[] = [];
  for (const f of PAGE_CODE_FIELDS) {
    let v = input[f];
    if (v === undefined) continue;
    if (f === "code_custom_javascript") {
      const m = /^\s*<script\b[^>]*>([\s\S]*)<\/script>\s*$/i.exec(v);
      if (m && !/<script\b/i.test(m[1])) {
        v = m[1].trim();
        notes.push("code_custom_javascript: removed the <script> wrapper — the page renders its own tag.");
      }
    }
    const next = mode === "append" && before[f] && v ? `${before[f]}\n${v}` : v;
    if (next.trim()) after[f] = next;
    else delete after[f];
  }
  return { after, notes };
}

const ELEMENT_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[A-Za-z0-9]{6,}$/;

/** Syntax and target checks. errors block the save (a syntax error kills the page's script);
 *  warnings point at selectors that match nothing on the page. */
export function lintPageCode(code: PageCode, pageIds: Set<string>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const compile = (src: string, where: string) => {
    try {
      new Script(src, { filename: where });
    } catch (e: any) {
      const line = /:(\d+)/.exec(String(e?.stack || ""))?.[1];
      errors.push(`${where}: ${e?.name || "SyntaxError"}: ${e?.message}${line ? ` (line ${line})` : ""} — the whole script would fail to run.`);
    }
  };
  if (code.code_custom_javascript) compile(code.code_custom_javascript, "code_custom_javascript");
  for (const f of ["code_before_head", "code_before_body"] as const) {
    const html = code[f];
    if (!html) continue;
    let i = 0;
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      i++;
      if (/\bsrc\s*=/.test(m[1]) || /type\s*=\s*["']?(?!text\/javascript|module|application\/javascript)[^"'\s>]+/i.test(m[1])) continue;
      if (m[2].trim()) compile(m[2], `${f} <script> #${i}`);
    }
  }
  const css = code.code_custom_css;
  if (css) {
    const body = css.replace(/^\s*<style[^>]*>|<\/style>\s*$/gi, "").replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    for (const ch of body) {
      if (ch === "{") depth++;
      else if (ch === "}" && --depth < 0) break;
    }
    if (depth !== 0) errors.push(`code_custom_css: unbalanced braces (${depth > 0 ? "missing }" : "extra }"}) — every rule after it would be dropped.`);
  }
  // Element ids used as selectors / getElementById that aren't on this page.
  const used = new Set<string>();
  const all = PAGE_CODE_FIELDS.map((f) => code[f] || "").join("\n");
  for (const m of all.matchAll(/#([A-Za-z][\w-]*)|getElementById\(\s*["'`]([\w-]+)["'`]\s*\)/g)) {
    const id = m[1] || m[2];
    if (ELEMENT_ID.test(id)) used.add(id);
  }
  const missing = [...used].filter((id) => !pageIds.has(id));
  if (missing.length) warnings.push(`No element with id ${missing.slice(0, 8).map((x) => `#${x}`).join(", ")} on this page — the rule/script will match nothing. Pick ids from targets.`);
  return { errors, warnings };
}

/** What code can aim at on this page: every node's id, type, custom_class (compact, capped). */
export function codeTargets(source: any, limit = 300) {
  const out: string[] = [];
  const ids = new Set<string>();
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (n.id) {
      ids.add(n.id);
      if (out.length < limit) {
        const cls = n.specials?.custom_class ? ` .${String(n.specials.custom_class).trim().split(/\s+/).join(".")}` : "";
        out.push(`#${n.id} ${n.type || "?"}${cls}`);
      }
    }
    for (const c of Array.isArray(n.children) ? n.children : []) walk(c);
  };
  for (const s of Array.isArray(source?.sections) ? source.sections : []) walk(s);
  return { targets: out, ids, total: ids.size, truncated: ids.size > out.length };
}

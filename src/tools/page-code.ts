// get_page_custom_code / update_page_custom_code: custom code for ONE page (page.settings.custom_code).
// writePageCode is the single writer — update_page_source.custom_code and build_page go through it.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { checkSiteCode, codeGuard } from "../builder/native-first.js";
import {
  PAGE_CODE_BUDGET, PAGE_CODE_FIELDS, PAGE_CODE_GUIDE, codeTargets, lintPageCode, mergePageCode, readPageCode,
  type PageCode,
} from "../builder/page-code.js";
import { getConfirmMode } from "./context.js";

const parse = (v: any) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

/** The page (fresh from the backend), its settings object and parsed source. */
async function loadPage(api: WebcakeCmsApi, pageId: string) {
  const res: any = await api.listPages();
  const list = res?.data || res?.pages || res;
  const page = (Array.isArray(list) ? list : []).find((p: any) => p.id === pageId);
  if (!page) throw new Error(`Page "${pageId}" not found on this site (list_pages).`);
  const settings = parse(page.settings);
  const source = parse(page.source?.source) || { sections: [] };
  return { page, settings: settings && typeof settings === "object" ? settings : {}, source };
}

const sizes = (c: PageCode) => Object.fromEntries(PAGE_CODE_FIELDS.map((f) => [f, (c[f] || "").length]));
const usage = (c: PageCode) => {
  const script = ["code_before_head", "code_before_body", "code_custom_javascript"].reduce((n, f) => n + (c[f as keyof PageCode] || "").length, 0);
  const css = (c.code_custom_css || "").length;
  return { script: { used: script, budget: PAGE_CODE_BUDGET.script.soft }, css: { used: css, budget: PAGE_CODE_BUDGET.css.soft } };
};

export interface WriteOpts {
  mode?: "replace" | "append";
  native_gap?: string;
  allow_shrink?: boolean;
  dry_run?: boolean;
}

/** Validate and save a page's custom code. Returns the result object a tool hands back. */
export async function writePageCode(api: WebcakeCmsApi, pageId: string, input: PageCode, opts: WriteOpts = {}) {
  const { settings, source } = await loadPage(api, pageId);
  const before = readPageCode(settings);
  const { after, notes } = mergePageCode(before, input, opts.mode ?? "replace");
  const { ids } = codeTargets(source);
  const lint = lintPageCode(after, ids);
  if (lint.errors.length) return { error: "BLOCKED: the code has errors — not saved.", errors: lint.errors, ...(lint.warnings.length ? { warnings: lint.warnings } : {}) };

  const blocked = codeGuard(checkSiteCode(before, after, { label: "Page", budget: PAGE_CODE_BUDGET }), opts.native_gap);
  if (blocked) return blocked;

  if (!opts.allow_shrink)
    for (const f of PAGE_CODE_FIELDS) {
      const was = (before[f] || "").length;
      const now = (after[f] || "").length;
      if (was > 200 && now < was * 0.5)
        return {
          error: `BLOCKED: ${f} would shrink from ${was} to ${now} chars — that looks like lost code. Read it with get_page_custom_code and merge (or mode:"append"); pass allow_shrink:true if the removal is deliberate.`,
        };
    }

  const changed = PAGE_CODE_FIELDS.filter((f) => (before[f] || "") !== (after[f] || ""));
  const report = {
    page_id: pageId,
    changed,
    before: sizes(before),
    after: sizes(after),
    usage: usage(after),
    ...(notes.length ? { notes } : {}),
    ...(lint.warnings.length ? { warnings: lint.warnings } : {}),
  };
  if (!changed.length) return { ...report, saved: false, note: "Nothing changed." };
  if (opts.dry_run) return { ...report, dry_run: true, would_save: after, next: "Show the user the code; on their OK call again with dry_run:false." };

  // Top-level settings keys replace: the whole custom_code object goes in, every other key stays.
  const next = { ...settings, custom_code: after };
  if (!Object.keys(after).length) delete next.custom_code;
  await api.updatePage(pageId, { settings: next });
  return { ...report, saved: true, next: "Check it with preview_page, then publish_site to take it live (settings are copied on publish)." };
}

const codeArgs = {
  code_custom_css: z.string().optional().describe("CSS for this page (no <style> needed). Target #ELEMENT-ID or .custom_class. \"\" clears."),
  code_custom_javascript: z.string().optional().describe("Plain JS for this page, NO <script> tag; runs at the end of <body>. \"\" clears."),
  code_before_head: z.string().optional().describe("HTML for <head> on this page only (<script src>, <link>, <meta>). \"\" clears."),
  code_before_body: z.string().optional().describe("HTML after this page's content, before its scripts (noscript pixel, widget mount point). \"\" clears."),
};
export const PAGE_CODE_ARG = z.object(codeArgs).optional()
  .describe("Per-page custom code saved with the page (same slots as update_page_custom_code). Last resort — native first.");

export function registerPageCodeTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "get_page_custom_code",
    "Read the custom code of ONE page (CSS / JS / head / body slots in page.settings.custom_code), its budget usage, the element ids and custom classes the code can target on that page, and the rules for per-page code. Read this before update_page_custom_code.",
    { page_id: z.string().describe("Page ID (list_pages)") },
    ({ page_id }) =>
      handle(async () => {
        const { page, settings, source } = await loadPage(api, page_id);
        const code = readPageCode(settings);
        const t = codeTargets(source);
        return {
          page: { id: page.id, name: page.name, slug: page.slug ?? null },
          custom_code: code,
          usage: usage(code),
          targets: t.targets,
          ...(t.truncated ? { targets_note: `${t.total} elements; first ${t.targets.length} listed — search_page_elements for the rest.` } : {}),
          guide: PAGE_CODE_GUIDE,
        };
      })
  );

  server.tool(
    "update_page_custom_code",
    `Save custom code for ONE page — only when the element schema can't do what the user asked (NATIVE FIRST: element → its settings/events/bindings → an app → code). Slots: code_custom_css, code_custom_javascript (plain JS, own <script>), code_before_head, code_before_body; rendered on that page only, after the site's code. mode "replace" (default) sets the slots you pass, "append" adds to them; "" clears a slot. JS syntax and CSS braces are checked before saving, #ids not on the page are flagged, oversized or UI-building code is refused unless native_gap names the gap, and a large shrink needs allow_shrink. Read get_page_custom_code first; dry_run shows what would be saved.`,
    {
      page_id: z.string().describe("Page ID (list_pages)"),
      ...codeArgs,
      mode: z.enum(["replace", "append"]).optional().describe("replace (default): set the given slots; append: add after the current code"),
      native_gap: z.string().min(30).optional().describe("Only when refused and no native way exists: the need, the elements/apps you checked, what each lacks. Tell the user first."),
      allow_shrink: z.boolean().optional().describe("Allow a slot to lose more than half its code (deliberate removal)"),
      dry_run: z.boolean().optional().describe("Validate and show what would be saved, without saving (default: on in confirm mode)"),
    },
    ({ page_id, mode, native_gap, allow_shrink, dry_run, ...code }) =>
      handle(async () => {
        const input = Object.fromEntries(Object.entries(code).filter(([, v]) => v !== undefined)) as PageCode;
        if (!Object.keys(input).length) throw new Error("Pass at least one slot: code_custom_css, code_custom_javascript, code_before_head or code_before_body.");
        return writePageCode(api, page_id, input, {
          mode, native_gap, allow_shrink,
          dry_run: dry_run !== undefined ? dry_run : getConfirmMode() === "always_confirm",
        });
      })
  );
}

import { z } from "zod";
import { CUSTOM_CODE_GUIDE } from "../guides.js";
import { getConfirmMode } from "./context.js";
import { addedErrors, applyNodeUpdates, computeNodeDiff, checkContentPlaceholders, checkElementPatch, finalizeForRender } from "../builder/page.js";
import { SITE_CODE_FIELDS, checkSiteCode, codeGuard, codeUsage } from "../builder/native-first.js";
import { PAGE_TYPE_NUM, PAGE_KINDS, applyPageMeta, normalizeSlug, checkPageCreateConflict } from "./builder.js";

const pageSeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keyword: z.string().optional(),
  favicon: z.string().optional(),
  thumbnail: z.string().optional().describe("Share image; also og:image"),
  og_title: z.string().optional().describe("Defaults to title"),
  og_description: z.string().optional().describe("Defaults to description"),
  // ── Advanced ("SEO nâng cao") ──
  thumbnail_alt: z.string().optional(),
  author: z.string().optional(),
  canonical: z.string().optional().describe("Canonical URL"),
  og_site_name: z.string().optional(),
  og_type: z.string().optional(),
  og_url: z.string().optional(),
  robots: z.string().optional().describe('Robots meta, e.g. "noindex, nofollow" or "max-snippet:-1, max-image-preview:large"'),
  markups: z
    .array(z.object({ name: z.string(), code: z.string().describe("JSON-LD as a string, without <script>") }))
    .optional()
    .describe("Structured data markups (JSON-LD). REPLACES the page's list; [] removes them."),
  site_name_markup: z.boolean().optional().describe("Emit the site-name markup (default on)"),
  hidden_meta_tags: z.array(z.string()).optional().describe("Meta tag keys to hide, e.g. ['og:url']"),
});
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

/**
 * Page source utilities.
 *
 * Source structure (from builder):
 *   { sections: [{ id, type, style, config, specials, children: [...] }] }
 *
 * Rendered HTML uses:
 *   - Sections: <section id="SECTION-1" class="x-section {custom_class}">
 *   - Elements: <div id="TEXT-1" class="x-element {custom_class}">
 *   - custom_class comes from specials.custom_class (comma-separated)
 *   - custom_css comes from specials.custom_css (element-scoped CSS)
 *   - style object generates scoped CSS via #ELEMENT-ID { ... }
 */

function parseSource(sourceJson: any): any {
  try {
    return typeof sourceJson === "string" ? JSON.parse(sourceJson) : sourceJson;
  } catch {
    return null;
  }
}

/** Walk all nodes in source tree, call fn(node). Return false from fn to stop early */
function walkSource(source: any, fn: (node: any) => any): void {
  if (!source || !source.sections) return;
  function walk(node: any): boolean {
    if (!node) return true;
    if (fn(node) === false) return false;
    const children = node.children || [];
    for (const child of children) {
      if (walk(child) === false) return false;
    }
    return true;
  }
  for (const section of source.sections) {
    if (walk(section) === false) return;
  }
}

/** Build overview: section count, element type counts, all custom_classes */
function buildOverview(source: any): any {
  const typeCounts: Record<string, number> = {};
  const customClasses = new Set<string>();
  let total = 0;

  walkSource(source, (node) => {
    total++;
    const type = node.type || "unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    const cc = node.specials && node.specials.custom_class;
    if (cc) cc.split(",").map((s: string) => s.trim()).filter(Boolean).forEach((c: any) => customClasses.add(c));
  });

  return {
    sections_count: (source.sections || []).length,
    total_elements: total,
    element_types: typeCounts,
    custom_classes: [...customClasses].sort(),
  };
}

/** Build full detail for a single node — all properties except children tree */
function nodeToDetail(node: any): any {
  const entry: any = { id: node.id || "", type: node.type || "unknown" };

  // Core properties
  if (node.style && Object.keys(node.style).length) entry.style = node.style;
  if (node.config && Object.keys(node.config).length) entry.config = node.config;
  if (node.specials && Object.keys(node.specials).length) entry.specials = node.specials;

  // Events (click, submit, mouseenter, etc.)
  if (node.events && node.events.length) entry.events = node.events;

  // Data bindings (product, category, blog, etc.)
  if (node.bindings && node.bindings.length) entry.bindings = node.bindings;

  // Responsive breakpoint data (bp1, bp2, bp3, ...)
  for (const key of Object.keys(node)) {
    if (/^bp\d+$/.test(key) && node[key] && typeof node[key] === "object") {
      if (!entry.responsive) entry.responsive = {};
      entry.responsive[key] = node[key];
    }
  }

  if (node.children && node.children.length) entry.children_count = node.children.length;

  return entry;
}

/** Find a node by ID in source tree, returns reference to the node */
function findNodeById(source: any, elementId: string): any {
  let found = null;
  walkSource(source, (node) => {
    if (node.id === elementId) { found = node; return false; }
  });
  return found;
}



/** Search/filter elements in source by criteria */
function searchElements(source: any, filters: any): any[] {
  const results: any[] = [];
  const limit = filters.limit || 50;

  walkSource(source, (node) => {
    if (results.length >= limit) return false;

    // Filter by type
    if (filters.type && node.type !== filters.type) return;

    // Filter by id (substring match)
    if (filters.id) {
      const nodeId = (node.id || "").toLowerCase();
      if (!nodeId.includes(filters.id.toLowerCase())) return;
    }

    // Filter by custom_class
    if (filters.custom_class) {
      const cc = (node.specials && node.specials.custom_class) || "";
      if (!cc.toLowerCase().includes(filters.custom_class.toLowerCase())) return;
    }

    // Filter by text content (substring match)
    if (filters.text) {
      const text = (node.specials && node.specials.text) || "";
      if (!text.toLowerCase().includes(filters.text.toLowerCase())) return;
    }

    // Filter: has_custom_class — only elements with custom class
    if (filters.has_custom_class) {
      const cc = node.specials && node.specials.custom_class;
      if (!cc) return;
    }

    // Filter: has_bind — only data-bound elements
    if (filters.has_bind) {
      if (!(node.bindings && node.bindings.length) && !(node.specials && node.specials.bind)) return;
    }

    // Filter: has_events — only elements with events
    if (filters.has_events) {
      if (!(node.events && node.events.length)) return;
    }

    results.push(nodeToDetail(node));
  });

  return results;
}

/** Cache listPages for 30s to avoid repeated API calls within a session */
let _pagesCache: any = null;
let _pagesCacheTime = 0;
const CACHE_TTL = 30000;

async function getCachedPages(api: WebcakeCmsApi): Promise<any> {
  const now = Date.now();
  if (_pagesCache && now - _pagesCacheTime < CACHE_TTL) return _pagesCache;
  const res = await api.listPages();
  _pagesCache = (res && res.data) || res || [];
  _pagesCacheTime = now;
  return _pagesCache;
}

function invalidatePageCache() {
  _pagesCache = null;
  _pagesCacheTime = 0;
}

async function getPageWithSource(api: WebcakeCmsApi, pageId: string): Promise<any> {
  const pages = await getCachedPages(api);
  if (!Array.isArray(pages)) return { error: "Failed to load pages" };
  const page = pages.find((p) => p.id === pageId);
  if (!page) return { error: "Page not found" };
  const source = parseSource(page.source && page.source.source);
  return { page, source };
}

async function readSiteCode(api: WebcakeCmsApi): Promise<Record<string, any>> {
  const values = await Promise.all(SITE_CODE_FIELDS.map((f) => api.getSiteSettingField(f)));
  return Object.fromEntries(SITE_CODE_FIELDS.map((f, i) => [f, values[i] || ""]));
}

export const STYLE_DESC = "Style to merge, camelCase like the editor (e.g. {color:'#fff', fontSize:'16px'}). Colours, fonts, borders… go to every breakpoint; size/position (width, height, top, left, fontSize…) to desktop (bp1) only. For tablet/mobile use responsive.";
export const CONFIG_DESC = "Config to merge (layout: widthUnit auto|px|%, constraintX/Y, columnStart…). Same breakpoint rule as style.";

const ALLOW_SHRINK = z.boolean().optional()
  .describe("Allow the source to shrink by more than half: set it when native elements replaced an oversized embed or custom_css and you have read it first.");

const NATIVE_GAP = z.string().min(30).optional()
  .describe("Only when the code was refused and no native way exists: the need, the elements/apps you checked, and what each one lacks. Tell the user first.");

export function registerPageTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool("list_pages", "List all pages of the site (metadata only, without source)", {}, () =>
    handle(async () => {
      const pages = await getCachedPages(api);
      if (!Array.isArray(pages)) return pages;
      return pages.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        type: p.type,
        is_homepage: p.is_homepage,
        is_build: p.is_build,
        updated_at: p.updated_at,
      }));
    })
  );

  server.tool(
    "get_page_source",
    "Get page source overview: section count, element type counts, and all custom CSS classes. Use this first, then use search_page_elements to find specific elements",
    {
      page_id: z.string().describe("Page ID"),
    },
    ({ page_id }) =>
      handle(async () => {
        const { page, source, error } = await getPageWithSource(api, page_id);
        if (error) return { error };

        const overview = source ? buildOverview(source) : null;
        return {
          page: { id: page.id, name: page.name, slug: page.slug, type: page.type },
          custom_code: (page.source && page.source.custom_code) || null,
          overview,
          hint: "Use search_page_elements to query specific elements by type, class, text, etc. Target via CSS: #ELEMENT-ID or .custom-class. Sections have class 'x-section', elements have 'x-element'.",
        };
      })
  );

  server.tool(
    "search_page_elements",
    `Search/filter elements within a page source. Returns matching elements with full detail (id, type, style, text, classes, etc.).
Examples:
- Find all buttons: type="button"
- Find elements with custom class: custom_class="hero"
- Find text containing "subscribe": text="subscribe"
- Find all data-bound elements: has_bind=true
- Find all elements with events: has_events=true
- Find all elements with custom CSS classes: has_custom_class=true`,
    {
      page_id: z.string().describe("Page ID"),
      type: z.string().optional().describe("Filter by element type (e.g. 'text', 'button', 'image', 'container', 'section', 'form', 'input')"),
      id: z.string().optional().describe("Filter by element ID substring (e.g. 'TEXT', 'BUTTON-3')"),
      custom_class: z.string().optional().describe("Filter by custom class substring"),
      text: z.string().optional().describe("Filter by text content substring"),
      has_custom_class: z.boolean().optional().describe("Only elements that have a custom class"),
      has_bind: z.boolean().optional().describe("Only elements with data bindings (product, category, blog)"),
      has_events: z.boolean().optional().describe("Only elements with events (click, submit, mouseenter, etc.)"),
      limit: z.number().default(50).describe("Max results (default 50)"),
    },
    ({ page_id, ...filters }) =>
      handle(async () => {
        const { source, error } = await getPageWithSource(api, page_id);
        if (error) return { error };
        if (!source) return { error: "Page has no source" };

        const results = searchElements(source, filters);
        return { page_id, matched: results.length, elements: results };
      })
  );

  server.tool(
    "create_page",
    "Create a new (empty) page. For a page with content use build_page instead. type is a KIND (main/store/member/blog/custom/error/maintain) mapped to the numeric backend type; pass seo so it doesn't publish with an empty title. ONE page per site for main (homepage) / error / maintain, and slugs are unique per site — a duplicate is refused with the existing page_id to edit instead; only 'custom' pages can be created over and over.",
    {
      name: z.string().describe("Page name"),
      slug: z.string().describe("URL slug WITHOUT a leading slash, e.g. 'about', 'collections', 'cart'. A leading '/' is stripped automatically (the storefront matches the bare path segment, so '/cart' would 404). Homepage needs no slug (pass is_homepage:true)."),
      type: z.enum(PAGE_KINDS).optional().describe("Page kind (main/store/member/blog/custom/error/maintain). store/member/blog need their data-source flag enabled — prefer build_page which auto-enables it. main/error/maintain are one-per-site; use 'custom' for extra pages."),
      is_homepage: z.boolean().default(false).describe("Set as homepage"),
      seo: pageSeoSchema
        .optional()
        .describe("SEO → settings.seo (title/description/keyword/favicon/thumbnail). Tokens {{name_page}}/{{name_site}} allowed."),
    },
    ({ name, slug, type, is_homepage, seo }) =>
      handle(async () => {
        const cleanSlug = normalizeSlug(slug);
        const typeNum = type ? PAGE_TYPE_NUM[type] : undefined;

        // Only 'custom' pages may be created repeatedly — singleton kinds (homepage/error/
        // maintain) and taken slugs must be edited in place instead of duplicated.
        const conflict = await checkPageCreateConflict(api, { kind: type, slug: cleanSlug, is_homepage });
        if (conflict) return { error: conflict.error, existing_page: conflict.existing_page };

        const created: any = await api.createPage({ name, ...(typeNum != null ? { type: typeNum } : {}) });
        invalidatePageCache();
        const pageId = (created && (created.id || created.data?.id || created.page?.id)) || null;
        const warning = pageId
          ? await applyPageMeta(api, pageId, { slug: cleanSlug, is_homepage, seo }).then(
              () => undefined,
              (e) => `Page created, but slug/homepage/SEO failed: ${e?.message ?? e}`,
            )
          : undefined;
        invalidatePageCache();
        return { success: true, page_id: pageId, name, slug: cleanSlug ?? null, type: type ?? null, raw: pageId ? undefined : created, ...(warning ? { warning } : {}) };
      })
  );

  server.tool(
    "update_page",
    `Update page properties: name, slug, homepage, SEO ("Cài đặt SEO") and settings.
seo / settings are MERGED into the page's current settings — fields you don't pass are kept.`,
    {
      page_id: z.string().describe("Page ID"),
      name: z.string().optional().describe("New name"),
      slug: z.string().optional().describe("New slug WITHOUT a leading slash (e.g. 'about', 'cart'). A leading '/' is stripped automatically — '/cart' would 404 on the storefront."),
      is_homepage: z.boolean().optional().describe("Set as homepage"),
      seo: pageSeoSchema.optional().describe("SEO → settings.seo (title/description/keyword/favicon/thumbnail/og_*). Merged; other SEO fields kept. Tokens {{name_page}}/{{name_site}} allowed."),
      settings: z.record(z.any()).optional().describe("Other page settings keys to merge (top-level keys replace)"),
    },
    ({ page_id, name, slug, is_homepage, seo, settings }) => handle(async () => {
      // Normalize slug (strip leading "/") so the storefront's bare-segment match resolves.
      const cleanSlug = slug !== undefined ? normalizeSlug(slug) : undefined;
      await applyPageMeta(api, page_id, { name, slug: cleanSlug, is_homepage, seo, settings });
      invalidatePageCache();
      return { success: true, page_id };
    })
  );

  server.tool(
    "get_site_custom_code",
    `Get custom code of the site (CSS/JS). Two modes:
- Default: returns ALL 4 code fields (full content)
- With field filter: returns only the specified field(s) — saves tokens when you only need CSS or JS
Add include_guide=true on first call to get the coding guide.
Custom code is the last resort: see get_build_guide → NATIVE FIRST before adding any. All-fields reads include _budget (usage vs limits).`,
    {
      fields: z.array(z.enum(["code_before_head", "code_before_body", "code_custom_css", "code_custom_javascript"]))
        .optional()
        .describe("Only return specific fields (e.g. ['code_custom_css']). Omit to get all 4 fields"),
      include_guide: z.boolean().default(false).describe("Include the custom code coding guide (only needed on first call)"),
    },
    ({ fields, include_guide }) =>
      handle(async () => {
        const allFields = ["code_before_head", "code_before_body", "code_custom_css", "code_custom_javascript"];
        const selected = fields && fields.length ? fields : allFields;
        const values = await Promise.all(selected.map((f) => api.getSiteSettingField(f)));
        const res: Record<string, any> = {};
        for (let i = 0; i < selected.length; i++) {
          res[selected[i]] = values[i] || "";
        }
        if (!fields || !fields.length) {
          res._sizes = {};
          for (const f of allFields) {
            res._sizes[f] = (res[f] || "").length;
          }
          res._budget = codeUsage(res);
        }
        if (include_guide) res.guide = CUSTOM_CODE_GUIDE;
        return res;
      })
  );

  server.tool(
    "update_site_custom_code",
    `Update custom code (CSS/JS) for the entire site. Only sends fields you specify — others remain unchanged.
LAST RESORT: use native elements, their settings or an app first; a special feature uses the CMS app (collection + HTTP function) with only a small glue script here. See get_build_guide → NATIVE FIRST. Oversized code or UI/data in code is refused unless native_gap explains why.
IMPORTANT: Before calling, you MUST read existing code with get_site_custom_code first, then show the user what will change and get explicit confirmation. NEVER update without user approval.
- code_before_head: HTML/script inserted before </head>
- code_before_body: HTML/script inserted before </body>
- code_custom_css: Custom CSS (auto-wrapped in <style>)
- code_custom_javascript: Custom JavaScript`,
    {
      code_before_head: z.string().optional().describe("HTML/script to insert in <head>"),
      code_before_body: z.string().optional().describe("HTML/script to insert before </body>"),
      code_custom_css: z.string().optional().describe("Custom CSS for the site"),
      code_custom_javascript: z.string().optional().describe("Custom JavaScript for the site"),
      native_gap: NATIVE_GAP,
      allow_shrink: z.boolean().optional().describe("Allow removing more than half of a field: set it when native elements or the CMS replaced that code and you have read it first."),
    },
    ({ native_gap, allow_shrink, ...codes }) => {
      const settings: Record<string, any> = {};
      for (const [k, v] of Object.entries(codes)) {
        if (v != null) settings[k] = v;
      }
      return handle(async () => {
        const fieldsToUpdate = Object.keys(settings);
        if (fieldsToUpdate.length === 0) return { error: "No fields specified" };

        // Safeguard: read existing values and compare before overwriting
        const current = await readSiteCode(api);
        const blocked = codeGuard(checkSiteCode(current, settings), native_gap);
        if (blocked) return blocked;

        const comparison: Record<string, any> = {};
        for (const field of fieldsToUpdate) {
          const existing = current[field] || "";
          const newVal = settings[field] || "";
          comparison[field] = { existing_length: existing.length, new_length: newVal.length };

          // Block if existing content is substantial and new content is much smaller (likely data loss)
          if (!allow_shrink && existing.length > 100 && newVal.length < existing.length * 0.5) {
            return {
              error: `BLOCKED: Field "${field}" would shrink from ${existing.length} to ${newVal.length} chars (${Math.round((newVal.length / existing.length) * 100)}% of original). This may indicate data loss. Read existing content with get_site_custom_code first, then merge your changes. If native elements or the CMS replaced this code, pass allow_shrink:true.`,
              existing_preview: existing.substring(0, 500),
              comparison,
            };
          }
        }

        await api.updateSiteSettings(settings);
        return { success: true, comparison };
      });
    }
  );

  server.tool(
    "append_site_custom_code",
    `Append or prepend code to a custom code field.
LAST RESORT: use native elements, their settings or an app first; a special feature uses the CMS app (collection + HTTP function) with only a small glue script here. See get_build_guide → NATIVE FIRST. Oversized code or UI/data in code is refused unless native_gap explains why.
For full rewrites, use update_site_custom_code instead.`,
    {
      field: z.enum(["code_before_head", "code_before_body", "code_custom_css", "code_custom_javascript"])
        .describe("Which code field to modify"),
      code: z.string().describe("Code to add"),
      position: z.enum(["append", "prepend"]).default("append").describe("Add to end (append) or beginning (prepend)"),
      native_gap: NATIVE_GAP,
    },
    ({ field, code, position, native_gap }) =>
      handle(async () => {
        const current = await readSiteCode(api);
        let content = current[field] || "";

        if (position === "prepend") {
          content = code.trimEnd() + "\n\n" + content.trimStart();
        } else {
          content = content.trimEnd() + "\n\n" + code.trimEnd() + "\n";
        }

        const blocked = codeGuard(checkSiteCode(current, { [field]: content }), native_gap);
        if (blocked) return blocked;

        await api.updateSiteSettings({ [field]: content });
        return { success: true, field, position, new_length: content.length };
      })
  );

  server.tool(
    "delete_page",
    "Delete a page",
    {
      page_id: z.string().describe("Page ID to delete"),
    },
    ({ page_id }) => handle(async () => {
      const res = await api.deletePage({ page_id });
      invalidatePageCache();
      // Like the editor: a deleted page leaves every global section's page list. The page is
      // already gone, so a failure here is a warning, not a failed delete (a retry would 404).
      try {
        const unlinked = await api.unlinkPageFromGlobalSections(page_id);
        return unlinked ? { ...res, global_sections_unlinked: unlinked } : res;
      } catch (e: any) {
        return { ...res, warning: `Page deleted, but removing it from global sections' page lists failed: ${e?.message || e}` };
      }
    })
  );

  server.tool(
    "get_page_versions",
    "View version history of a page",
    {
      page_id: z.string().describe("Page ID"),
    },
    ({ page_id }) => handle(() => api.getPageVersions(page_id))
  );

  server.tool(
    "list_page_contents",
    "List multi-language contents (translations) of the site's pages and global sections. Pass page_id + language_code to read one page's translation.",
    {
      page_id: z.string().optional().describe("Page ID — narrows the result to that page"),
      language_code: z.string().optional().describe("With page_id: return just that language's content map"),
    },
    ({ page_id, language_code }) =>
      handle(async () => {
        if (page_id && language_code) {
          const res: any = await api.getPageContent(page_id, language_code);
          return res?.data ?? res;
        }
        const res: any = await api.listPageContents(); // backend ignores page_id here, so filter client-side
        const data = res?.data ?? res;
        return page_id ? { pages: (data?.pages || []).filter((p: any) => p.id === page_id) } : data;
      })
  );

  server.tool(
    "update_page_content",
    `Create/update page content for a specific language.
IMPORTANT: Before calling, you MUST read existing content with list_page_contents first, then show the user what will change and get explicit confirmation. NEVER update without user approval.`,
    {
      page_id: z.string().describe("Page ID"),
      language_code: z.string().describe("Language code (e.g. 'en', 'vi')"),
      content: z
        .record(z.any())
        .describe('Translations keyed by element id → field, e.g. { "<elementId>": { "text": "Hello" } } (also "placeholder", or "options": [{ id, name }]). Replaces this language\'s whole map — merge into the existing one.'),
      meta_tags: z.array(z.record(z.any())).optional().describe("SEO meta tags"),
    },
    ({ page_id, language_code, content, meta_tags }) =>
      handle(async () => {
        // Safeguard: read existing content and block if new content is suspiciously smaller
        const existingRes: any = await api.getPageContent(page_id, language_code);
        const existing = existingRes?.data ?? existingRes;
        const placeholders = checkContentPlaceholders(content, existing?.content);
        if (placeholders.length) return { error: "BLOCKED: not saving.", errors: placeholders };
        if (existing && existing.content) {
          const existingStr = JSON.stringify(existing.content);
          const newStr = JSON.stringify(content);
          if (existingStr.length > 200 && newStr.length < existingStr.length * 0.5) {
            return {
              error: `BLOCKED: New content (${newStr.length} chars) is much smaller than existing (${existingStr.length} chars) — ${Math.round((newStr.length / existingStr.length) * 100)}% of original. This may indicate fabricated data or data loss. Read it with list_page_contents(page_id, language_code) first, then merge your changes.`,
              existing_length: existingStr.length,
              new_length: newStr.length,
            };
          }
        }

        return api.updatePageContent({ page_id, language_code, content, meta_tags });
      })
  );

  // list_global_sections (+ get/search/element drill-downs) live in tools/global-sections.ts
  // — they return SLIM summaries instead of the raw multi-MB tree this endpoint produces.

  // ── Element interaction tools ──

  server.tool(
    "get_page_element",
    "Get full detail of a single element by its ID (e.g. 'TEXT-3', 'BUTTON-1', 'SECTION-2'). Returns style, config, specials, events, bindings, responsive, and children IDs",
    {
      page_id: z.string().describe("Page ID"),
      element_id: z.string().describe("Element ID (e.g. 'TEXT-3', 'BUTTON-1')"),
    },
    ({ page_id, element_id }) =>
      handle(async () => {
        const { source, error } = await getPageWithSource(api, page_id);
        if (error) return { error };
        if (!source) return { error: "Page has no source" };

        const node = findNodeById(source, element_id);
        if (!node) return { error: `Element "${element_id}" not found` };

        const detail = nodeToDetail(node);
        if (node.children && node.children.length) {
          detail.children = node.children.map((c: any) => ({ id: c.id, type: c.type }));
        }
        return detail;
      })
  );

  server.tool(
    "update_page_element",
    `Update properties of a specific element in page source. Two-step process:
STEP 1: Call with dry_run=true (default) → returns diff of what will change.
STEP 2: Show the diff to the user and ask for confirmation. NEVER proceed without explicit user approval.
STEP 3: Only after user confirms, call again with dry_run=false to apply.
IMPORTANT: You MUST show the diff to the user and get explicit "yes/ok/confirm" before calling with dry_run=false. Skipping confirmation risks data loss.
Merge rules: style/config/specials = shallow merge, responsive = merge by bp key.
events/bindings = REPLACE the whole array — pass the COMPLETE list (read it first with get_page_element so you don't drop the others); entries are auto-normalized (id + eventName filled in, so you can pass just { action, ...fields } / { target }).`,
    {
      page_id: z.string().describe("Page ID"),
      element_id: z.string().describe("Element ID to update (e.g. 'TEXT-3', 'BUTTON-1')"),
      dry_run: z.boolean().optional().describe("Preview only (true) or apply changes (false). Defaults to confirm_mode setting. Use toggle_confirm_mode to change default."),
      style: z.record(z.any()).optional().describe(STYLE_DESC),
      config: z.record(z.any()).optional().describe(CONFIG_DESC),
      specials: z.record(z.any()).optional().describe("Specials to merge (text, custom_class, custom_css, etc.)"),
      events: z.array(z.record(z.any())).optional().describe("Complete events array (replaces existing)"),
      bindings: z.array(z.record(z.any())).optional().describe("Complete bindings array (replaces existing)"),
      responsive: z.record(z.any()).optional().describe("Responsive breakpoint overrides (e.g. {bp1: {style: {...}, config: {...}}})"),
      allow_shrink: ALLOW_SHRINK,
    },
    ({ page_id, element_id, dry_run: dryRunParam, allow_shrink, ...updates }) =>
      handle(async () => {
        const dry_run = dryRunParam !== undefined ? dryRunParam : getConfirmMode() === "always_confirm";
        invalidatePageCache();
        const { page, source, error } = await getPageWithSource(api, page_id);
        if (error) return { error };
        if (!source) return { error: "Page has no source" };
        const saved0 = structuredClone(source); // before any patch: source may be the cached object itself

        const node = findNodeById(source, element_id);
        if (!node) return { error: `Element "${element_id}" not found` };

        const beforeNode = JSON.parse(JSON.stringify(node));
        applyNodeUpdates(node, updates);
        const codeErrors = checkElementPatch(source, node, beforeNode, updates.specials);
        if (codeErrors.length) return { error: "BLOCKED: not saving.", element_id, errors: codeErrors };
        // A patch can break the renderer too (style value as an object, widthUnit "em"…).
        const shapeErrors = addedErrors(source, saved0);
        if (shapeErrors.length) return { error: "BLOCKED: not saving.", element_id, errors: shapeErrors };
        const diff = computeNodeDiff(beforeNode, node);

        if (!diff) return { info: "No changes detected", element_id };

        if (dry_run) {
          return {
            dry_run: true,
            element_id,
            diff,
            hint: "Review the changes above. Call again with dry_run=false to apply.",
          };
        }

        // Actual save — send source as OBJECT (not string) because backend does Jason.encode!
        const newLen = JSON.stringify(source).length;
        const existingLen = JSON.stringify(parseSource(page.source && page.source.source)).length;

        if (!allow_shrink && existingLen > 200 && newLen < existingLen * 0.5) {
          return {
            error: `BLOCKED: Page source would shrink from ${existingLen} to ${newLen} chars. This indicates data loss.`,
            existing_length: existingLen,
            new_length: newLen,
          };
        }

        const res = await api.updatePageSource(page_id, { source });
        invalidatePageCache();

        const saved = res && res.data;
        if (!saved) return { error: "Backend returned empty response — update may not have persisted", sent_length: newLen };

        return { success: true, element_id, diff, page_source_id: saved.id, source_length: newLen };
      })
  );

  server.tool(
    "update_page_elements",
    `Batch update multiple elements in one page. Two-step process:
STEP 1: Call with dry_run=true (default) → returns per-element diff.
STEP 2: Show all diffs to the user and ask for confirmation. NEVER proceed without explicit user approval.
STEP 3: Only after user confirms, call again with dry_run=false to apply.
IMPORTANT: You MUST show the diff to the user and get explicit "yes/ok/confirm" before calling with dry_run=false. Skipping confirmation risks data loss.
Same merge rules: style/config/specials = shallow merge, events/bindings = replace.`,
    {
      page_id: z.string().describe("Page ID"),
      dry_run: z.boolean().optional().describe("Preview only (true) or apply changes (false). Defaults to confirm_mode setting."),
      updates: z.array(z.object({
        element_id: z.string().describe("Element ID"),
        style: z.record(z.any()).optional().describe(STYLE_DESC),
        config: z.record(z.any()).optional().describe(CONFIG_DESC),
        specials: z.record(z.any()).optional(),
        events: z.array(z.record(z.any())).optional(),
        bindings: z.array(z.record(z.any())).optional(),
        responsive: z.record(z.any()).optional(),
      })).describe("Array of element updates"),
      allow_shrink: ALLOW_SHRINK,
    },
    ({ page_id, dry_run: dryRunParam, updates: elementUpdates, allow_shrink }) =>
      handle(async () => {
        const dry_run = dryRunParam !== undefined ? dryRunParam : getConfirmMode() === "always_confirm";
        invalidatePageCache();
        const { page, source, error } = await getPageWithSource(api, page_id);
        if (error) return { error };
        if (!source) return { error: "Page has no source" };
        const saved0 = structuredClone(source); // before any patch: source may be the cached object itself

        const results = [];
        for (const upd of elementUpdates) {
          const node = findNodeById(source, upd.element_id);
          if (!node) {
            results.push({ element_id: upd.element_id, error: "Not found" });
            continue;
          }
          const beforeNode = JSON.parse(JSON.stringify(node));
          const { element_id, ...updates } = upd;
          applyNodeUpdates(node, updates);
          const codeErrors = checkElementPatch(source, node, beforeNode, updates.specials);
          if (codeErrors.length) return { error: "BLOCKED: not saving any of this batch.", element_id, errors: codeErrors };
          const diff = computeNodeDiff(beforeNode, node);
          results.push({ element_id, diff: diff || "no changes" });
        }
        const shapeErrors = addedErrors(source, saved0);
        if (shapeErrors.length) return { error: "BLOCKED: not saving any of this batch.", errors: shapeErrors };

        if (dry_run) {
          return {
            dry_run: true,
            elements: results,
            hint: "Review the changes above. Call again with dry_run=false to apply.",
          };
        }

        // Actual save — send source as OBJECT (not string) because backend does Jason.encode!
        const newLen = JSON.stringify(source).length;
        const existingLen = JSON.stringify(parseSource(page.source && page.source.source)).length;

        if (!allow_shrink && existingLen > 200 && newLen < existingLen * 0.5) {
          return {
            error: `BLOCKED: Page source would shrink from ${existingLen} to ${newLen} chars. This indicates data loss.`,
            existing_length: existingLen,
            new_length: newLen,
          };
        }

        const res = await api.updatePageSource(page_id, { source });
        invalidatePageCache();

        const saved = res && res.data;
        if (!saved) return { error: "Backend returned empty response — update may not have persisted", sent_length: newLen };

        return { success: true, elements: results, page_source_id: saved.id, source_length: newLen };
      })
  );

  server.tool(
    "update_page_source",
    `Directly update the full page source JSON.
IMPORTANT: Before calling this tool, you MUST:
1. Read existing source with get_page_source first
2. Show the user what will change and get explicit confirmation
3. NEVER call without user approval — this replaces the ENTIRE page source
Safeguarded: blocks if new source is <50% of existing size.`,
    {
      page_id: z.string().describe("Page ID"),
      source: z.any().describe("Full page source object (sections tree) or JSON string"),
      custom_code: z.string().optional().describe("Custom code (CSS/JS) for this page. Last resort, same rules as update_site_custom_code."),
      native_gap: NATIVE_GAP,
      allow_shrink: ALLOW_SHRINK,
    },
    ({ page_id, source, custom_code, native_gap, allow_shrink }) =>
      handle(async () => {
        const body: Record<string, any> = {};
        if (source != null) {
          // Ensure source is an object — backend does Jason.encode! so we must send object, not string
          body.source = typeof source === "string" ? JSON.parse(source) : source;
          // Nodes still in builder shape (runtime, e.g. straight from new_element) get their
          // per-breakpoint keys like every other writer; nodes already in bp shape are untouched.
          finalizeForRender(body.source, await api.getSiteBreakpoints(), await api.getSiteDefaultGrid());
        }
        if (custom_code != null) {
          invalidatePageCache();
          const { page } = await getPageWithSource(api, page_id);
          const old = page?.source?.custom_code;
          const blocked = codeGuard(
            checkSiteCode({ code_custom_javascript: typeof old === "string" ? old : JSON.stringify(old ?? "") }, { code_custom_javascript: custom_code }),
            native_gap,
          );
          if (blocked) return blocked;
          body.custom_code = custom_code;
        }

        // Safeguard: force fresh read and block if new source is suspiciously smaller
        if (body.source) {
          invalidatePageCache();
          const { source: existingSource, error } = await getPageWithSource(api, page_id);
          // Full structural + renderer-crash check, refusing only what this save ADDS.
          const added = addedErrors(body.source, existingSource || undefined);
          if (added.length) return { error: "BLOCKED: not saving.", errors: added };

          if (!error && existingSource) {
            const existingLen = JSON.stringify(existingSource).length;
            const newLen = JSON.stringify(body.source).length;
            if (!allow_shrink && existingLen > 200 && newLen < existingLen * 0.5) {
              return {
                error: `BLOCKED: New source (${newLen} chars) is much smaller than existing (${existingLen} chars) — ${Math.round((newLen / existingLen) * 100)}% of original. This may indicate fabricated data or data loss. Read the page source with get_page_source/get_page_element first, then apply changes.`,
                existing_length: existingLen,
                new_length: newLen,
              };
            }
          }
        }

        const res = await api.updatePageSource(page_id, body);
        invalidatePageCache();

        const saved = res && res.data;
        if (!saved) return { error: "Backend returned empty response — update may not have persisted" };

        return {
          success: true,
          page_source_id: saved.id,
          page_id: saved.page_id,
          source_length: (saved.source || "").length,
        };
      })
  );

}

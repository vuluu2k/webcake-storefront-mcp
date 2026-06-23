import { z } from "zod";
import { CUSTOM_CODE_GUIDE } from "../guides.js";
import { getConfirmMode } from "./context.js";
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

/** Deep-diff two nodes — returns only changed fields with before/after */
function computeNodeDiff(beforeNode: any, afterNode: any): any {
  const diff: Record<string, any> = {};
  const objFields = ["style", "config", "specials"];
  const arrFields = ["events", "bindings"];

  for (const field of objFields) {
    const b = beforeNode[field] || {};
    const a = afterNode[field] || {};
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    const fieldDiff: Record<string, any> = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
        fieldDiff[k] = { before: b[k] ?? null, after: a[k] ?? null };
      }
    }
    if (Object.keys(fieldDiff).length) diff[field] = fieldDiff;
  }

  for (const field of arrFields) {
    if (JSON.stringify(beforeNode[field] || null) !== JSON.stringify(afterNode[field] || null)) {
      diff[field] = { before: beforeNode[field] || null, after: afterNode[field] || null };
    }
  }

  for (const key of new Set([...Object.keys(beforeNode), ...Object.keys(afterNode)])) {
    if (!/^bp\d+$/.test(key)) continue;
    if (JSON.stringify(beforeNode[key] || null) !== JSON.stringify(afterNode[key] || null)) {
      if (!diff.responsive) diff.responsive = {};
      diff.responsive[key] = { before: beforeNode[key] || null, after: afterNode[key] || null };
    }
  }

  return Object.keys(diff).length ? diff : null;
}

/** Apply updates to a node in-place (shallow merge for objects, replace for arrays) */
function applyNodeUpdates(node: any, updates: any): void {
  if (updates.style) node.style = { ...(node.style || {}), ...updates.style };
  if (updates.config) node.config = { ...(node.config || {}), ...updates.config };
  if (updates.specials) node.specials = { ...(node.specials || {}), ...updates.specials };
  if (updates.events !== undefined) node.events = updates.events;
  if (updates.bindings !== undefined) node.bindings = updates.bindings;
  // Responsive breakpoints (bp1, bp2, ...)
  if (updates.responsive) {
    for (const [bp, val] of Object.entries(updates.responsive) as [string, any][]) {
      if (/^bp\d+$/.test(bp)) {
        node[bp] = node[bp] ? { style: { ...node[bp].style, ...val.style }, config: { ...node[bp].config, ...val.config } } : val;
      }
    }
  }
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
    "Create a new page",
    {
      name: z.string().describe("Page name"),
      slug: z.string().describe("URL slug (e.g. '/about')"),
      type: z.string().optional().describe("Page type"),
      is_homepage: z.boolean().default(false).describe("Set as homepage"),
    },
    ({ name, slug, type, is_homepage }) =>
      handle(async () => {
        const res = await api.createPage({ name, slug, type, is_homepage });
        invalidatePageCache();
        return res;
      })
  );

  server.tool(
    "update_page",
    "Update page properties (name, slug, settings, custom code)",
    {
      page_id: z.string().describe("Page ID"),
      name: z.string().optional().describe("New name"),
      slug: z.string().optional().describe("New slug"),
      is_homepage: z.boolean().optional().describe("Set as homepage"),
      settings: z.record(z.any()).optional().describe("Page settings"),
    },
    ({ page_id, ...params }) => handle(async () => {
      const res = await api.updatePage(page_id, params);
      invalidatePageCache();
      return res;
    })
  );

  server.tool(
    "get_site_custom_code",
    `Get custom code of the site (CSS/JS). Two modes:
- Default: returns ALL 4 code fields (full content)
- With field filter: returns only the specified field(s) — saves tokens when you only need CSS or JS
Add include_guide=true on first call to get the coding guide`,
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
        }
        if (include_guide) res.guide = CUSTOM_CODE_GUIDE;
        return res;
      })
  );

  server.tool(
    "update_site_custom_code",
    `Update custom code (CSS/JS) for the entire site. Only sends fields you specify — others remain unchanged.
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
    },
    (codes) => {
      const settings: Record<string, any> = {};
      for (const [k, v] of Object.entries(codes)) {
        if (v != null) settings[k] = v;
      }
      return handle(async () => {
        const fieldsToUpdate = Object.keys(settings);
        if (fieldsToUpdate.length === 0) return { error: "No fields specified" };

        // Safeguard: read existing values and compare before overwriting
        const existingValues = await Promise.all(fieldsToUpdate.map((f) => api.getSiteSettingField(f)));
        const comparison: Record<string, any> = {};
        for (let i = 0; i < fieldsToUpdate.length; i++) {
          const field = fieldsToUpdate[i];
          const existing = existingValues[i] || "";
          const newVal = settings[field] || "";
          comparison[field] = { existing_length: existing.length, new_length: newVal.length };

          // Block if existing content is substantial and new content is much smaller (likely data loss)
          if (existing.length > 100 && newVal.length < existing.length * 0.5) {
            return {
              error: `BLOCKED: Field "${field}" would shrink from ${existing.length} to ${newVal.length} chars (${Math.round((newVal.length / existing.length) * 100)}% of original). This may indicate data loss. Read existing content with get_site_custom_code first, then merge your changes.`,
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
    `Append or prepend code to a custom code field WITHOUT reading the existing content first.
Use this when you need to ADD new CSS rules, JS code, or script tags — no need to read first.
For full rewrites, use update_site_custom_code instead.`,
    {
      field: z.enum(["code_before_head", "code_before_body", "code_custom_css", "code_custom_javascript"])
        .describe("Which code field to modify"),
      code: z.string().describe("Code to add"),
      position: z.enum(["append", "prepend"]).default("append").describe("Add to end (append) or beginning (prepend)"),
    },
    ({ field, code, position }) =>
      handle(async () => {
        const existing = await api.getSiteSettingField(field);
        let content = existing || "";

        if (position === "prepend") {
          content = code.trimEnd() + "\n\n" + content.trimStart();
        } else {
          content = content.trimEnd() + "\n\n" + code.trimEnd() + "\n";
        }

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
      return res;
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
    "List multi-language contents of a page",
    {
      page_id: z.string().optional().describe("Filter by Page ID"),
    },
    ({ page_id }) => handle(() => api.listPageContents({ page_id }))
  );

  server.tool(
    "update_page_content",
    `Create/update page content for a specific language.
IMPORTANT: Before calling, you MUST read existing content with list_page_contents first, then show the user what will change and get explicit confirmation. NEVER update without user approval.`,
    {
      page_id: z.string().describe("Page ID"),
      language_code: z.string().describe("Language code (e.g. 'en', 'vi')"),
      content: z.record(z.any()).describe("Page content"),
      meta_tags: z.array(z.record(z.any())).optional().describe("SEO meta tags"),
    },
    ({ page_id, language_code, content, meta_tags }) =>
      handle(async () => {
        // Safeguard: read existing content and block if new content is suspiciously smaller
        const existingRes = await api.listPageContents({ page_id });
        const existingContents = (existingRes && existingRes.data) || existingRes || [];
        if (Array.isArray(existingContents)) {
          const existing = existingContents.find((c) => c.language_code === language_code);
          if (existing && existing.content) {
            const existingStr = JSON.stringify(existing.content);
            const newStr = JSON.stringify(content);
            if (existingStr.length > 200 && newStr.length < existingStr.length * 0.5) {
              return {
                error: `BLOCKED: New content (${newStr.length} chars) is much smaller than existing (${existingStr.length} chars) — ${Math.round((newStr.length / existingStr.length) * 100)}% of original. This may indicate fabricated data or data loss. Read existing content with list_page_contents first, then merge your changes.`,
                existing_length: existingStr.length,
                new_length: newStr.length,
              };
            }
          }
        }

        return api.updatePageContent({ page_id, language_code, content, meta_tags });
      })
  );

  server.tool("list_global_sections", "List reusable global sections", {}, () =>
    handle(() => api.listGlobalSections())
  );

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
Merge rules: style/config/specials = shallow merge, events/bindings = replace array, responsive = merge by bp key.`,
    {
      page_id: z.string().describe("Page ID"),
      element_id: z.string().describe("Element ID to update (e.g. 'TEXT-3', 'BUTTON-1')"),
      dry_run: z.boolean().optional().describe("Preview only (true) or apply changes (false). Defaults to confirm_mode setting. Use toggle_confirm_mode to change default."),
      style: z.record(z.any()).optional().describe("CSS style properties to merge (e.g. {color: '#fff', 'font-size': '16px'})"),
      config: z.record(z.any()).optional().describe("Config properties to merge"),
      specials: z.record(z.any()).optional().describe("Specials to merge (text, custom_class, custom_css, etc.)"),
      events: z.array(z.record(z.any())).optional().describe("Complete events array (replaces existing)"),
      bindings: z.array(z.record(z.any())).optional().describe("Complete bindings array (replaces existing)"),
      responsive: z.record(z.any()).optional().describe("Responsive breakpoint overrides (e.g. {bp1: {style: {...}, config: {...}}})"),
    },
    ({ page_id, element_id, dry_run: dryRunParam, ...updates }) =>
      handle(async () => {
        const dry_run = dryRunParam !== undefined ? dryRunParam : getConfirmMode() === "always_confirm";
        invalidatePageCache();
        const { page, source, error } = await getPageWithSource(api, page_id);
        if (error) return { error };
        if (!source) return { error: "Page has no source" };

        const node = findNodeById(source, element_id);
        if (!node) return { error: `Element "${element_id}" not found` };

        const beforeNode = JSON.parse(JSON.stringify(node));
        applyNodeUpdates(node, updates);
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

        if (existingLen > 200 && newLen < existingLen * 0.5) {
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
        style: z.record(z.any()).optional(),
        config: z.record(z.any()).optional(),
        specials: z.record(z.any()).optional(),
        events: z.array(z.record(z.any())).optional(),
        bindings: z.array(z.record(z.any())).optional(),
        responsive: z.record(z.any()).optional(),
      })).describe("Array of element updates"),
    },
    ({ page_id, dry_run: dryRunParam, updates: elementUpdates }) =>
      handle(async () => {
        const dry_run = dryRunParam !== undefined ? dryRunParam : getConfirmMode() === "always_confirm";
        invalidatePageCache();
        const { page, source, error } = await getPageWithSource(api, page_id);
        if (error) return { error };
        if (!source) return { error: "Page has no source" };

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
          const diff = computeNodeDiff(beforeNode, node);
          results.push({ element_id, diff: diff || "no changes" });
        }

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

        if (existingLen > 200 && newLen < existingLen * 0.5) {
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
      custom_code: z.string().optional().describe("Custom code (CSS/JS) for this page"),
    },
    ({ page_id, source, custom_code }) =>
      handle(async () => {
        const body: Record<string, any> = {};
        if (source != null) {
          // Ensure source is an object — backend does Jason.encode! so we must send object, not string
          body.source = typeof source === "string" ? JSON.parse(source) : source;
        }
        if (custom_code != null) {
          body.custom_code = custom_code;
        }

        // Safeguard: force fresh read and block if new source is suspiciously smaller
        if (body.source) {
          invalidatePageCache();
          const { source: existingSource, error } = await getPageWithSource(api, page_id);
          if (!error && existingSource) {
            const existingLen = JSON.stringify(existingSource).length;
            const newLen = JSON.stringify(body.source).length;
            if (existingLen > 200 && newLen < existingLen * 0.5) {
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

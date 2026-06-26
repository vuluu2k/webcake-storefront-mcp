import { z } from "zod";
import { getConfirmMode } from "./context.js";
import { normalizeEvents } from "../builder/events.js";
import { normalizeBindings } from "../builder/bindings.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

/**
 * Global Sources tools — manage site-wide components: cart, popup, overview, etc.
 *
 * Source structure: same as page source — { sections: [{ id, type, style, config, specials, children }] }
 *
 * Improvements over page tools:
 * - 30s cache (fetch once, reuse across tools)
 * - No `component` needed for detail/search/element tools — auto-resolved from cache
 * - Compact tree text output (3-5x token savings vs JSON)
 * - Element-level update tools (shallow merge, same as pages)
 * - Safeguard on full source update (block if data shrinks >50%)
 */

// ── Source tree helpers ──

export function parseSource(sourceJson: any): any {
  try {
    return typeof sourceJson === "string" ? JSON.parse(sourceJson) : sourceJson;
  } catch {
    return null;
  }
}

/** Get root nodes from source — handles both formats:
 *  - Page format: { sections: [...] } → returns sections array
 *  - Global source format: { id, type, children: [...] } → returns [rootNode]
 */
export function getRoots(source: any): any[] {
  if (!source) return [];
  if (source.sections) return source.sections;
  if (source.id) return [source];
  return [];
}

/** Walk all nodes in source tree — handles both page and global source format */
function walkSource(source: any, fn: (node: any) => boolean | void): void {
  function walk(node: any): boolean {
    if (!node) return true;
    if (fn(node) === false) return false;
    for (const child of node.children || []) {
      if (walk(child) === false) return false;
    }
    return true;
  }
  for (const root of getRoots(source)) {
    if (walk(root) === false) return;
  }
}

export function buildOverview(source: any): { sections: number; elements: number; types: Record<string, number>; classes: string[] } {
  const typeCounts: Record<string, number> = {};
  const customClasses = new Set<string>();
  let total = 0;
  walkSource(source, (node) => {
    total++;
    const t = node.type || "unknown";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    const cc = node.specials && node.specials.custom_class;
    if (cc) cc.split(",").map((s: string) => s.trim()).filter(Boolean).forEach((c: string) => customClasses.add(c));
  });
  const roots = getRoots(source);
  return {
    sections: roots.length,
    elements: total,
    types: typeCounts,
    classes: [...customClasses].sort(),
  };
}

export function nodeToDetail(node: any): any {
  const entry: any = { id: node.id || "", type: node.type || "unknown" };
  if (node.style && Object.keys(node.style).length) entry.style = node.style;
  if (node.config && Object.keys(node.config).length) entry.config = node.config;
  if (node.specials && Object.keys(node.specials).length) entry.specials = node.specials;
  if (node.events && node.events.length) entry.events = node.events;
  if (node.bindings && node.bindings.length) entry.bindings = node.bindings;
  for (const key of Object.keys(node)) {
    if (/^bp\d+$/.test(key) && node[key] && typeof node[key] === "object") {
      if (!entry.responsive) entry.responsive = {};
      entry.responsive[key] = node[key];
    }
  }
  if (node.children && node.children.length) entry.children_count = node.children.length;
  return entry;
}

export function findNodeById(source: any, elementId: string): any {
  let found: any = null;
  walkSource(source, (node) => {
    if (node.id === elementId) { found = node; return false; }
  });
  return found;
}

/** Deep-diff two nodes — returns only changed fields with before/after.
 *  Objects (style, config, specials) are diffed at key-level.
 *  Arrays (events, bindings) show full before/after.
 *  Responsive breakpoints diffed individually.
 */
function computeNodeDiff(beforeNode: any, afterNode: any): any {
  const diff: any = {};
  const objFields = ["style", "config", "specials"];
  const arrFields = ["events", "bindings"];

  for (const field of objFields) {
    const b = beforeNode[field] || {};
    const a = afterNode[field] || {};
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    const fieldDiff: any = {};
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

function applyNodeUpdates(node: any, updates: any): void {
  if (updates.style) node.style = { ...(node.style || {}), ...updates.style };
  if (updates.config) node.config = { ...(node.config || {}), ...updates.config };
  if (updates.specials) node.specials = { ...(node.specials || {}), ...updates.specials };
  // Normalize so updated events/bindings get a valid id + eventName (renderer needs it).
  if (updates.events !== undefined) node.events = normalizeEvents(updates.events, node.type);
  if (updates.bindings !== undefined) node.bindings = normalizeBindings(updates.bindings);
  if (updates.responsive) {
    for (const [bp, val] of Object.entries(updates.responsive)) {
      if (/^bp\d+$/.test(bp)) {
        node[bp] = node[bp]
          ? { style: { ...node[bp].style, ...(val as any).style }, config: { ...node[bp].config, ...(val as any).config } }
          : val;
      }
    }
  }
}

export function searchElements(source: any, filters: any): any[] {
  const results: any[] = [];
  const limit = filters.limit || 50;
  walkSource(source, (node) => {
    if (results.length >= limit) return false;
    if (filters.type && node.type !== filters.type) return;
    if (filters.id && !(node.id || "").toLowerCase().includes(filters.id.toLowerCase())) return;
    if (filters.custom_class) {
      const cc = (node.specials && node.specials.custom_class) || "";
      if (!cc.toLowerCase().includes(filters.custom_class.toLowerCase())) return;
    }
    if (filters.text) {
      const text = (node.specials && node.specials.text) || "";
      if (!text.toLowerCase().includes(filters.text.toLowerCase())) return;
    }
    if (filters.has_custom_class && !(node.specials && node.specials.custom_class)) return;
    if (filters.has_bind && !(node.bindings && node.bindings.length) && !(node.specials && node.specials.bind)) return;
    if (filters.has_events && !(node.events && node.events.length)) return;
    results.push(nodeToDetail(node));
  });
  return results;
}

/**
 * Build compact tree text — 3-5x fewer tokens than JSON.
 *
 * Output example:
 *   SECTION-1 [section] (3)
 *   ├─ TEXT-1 [text] "Giỏ hàng" .cart-title
 *   ├─ CONTAINER-1 [container] .cart-items [bind] (2)
 *   │  ├─ IMAGE-1 [image] .product-img
 *   │  └─ TEXT-2 [text] "Product name"
 *   └─ BUTTON-1 [button] "Thanh toán" .checkout-btn [2ev]
 */
export function buildTreeText(source: any): string {
  const roots = getRoots(source);
  if (!roots.length) return "(empty)";
  const lines: string[] = [];

  function walk(node: any, prefix: string, isLast: boolean): void {
    const connector = prefix === "" ? "" : (isLast ? "└─ " : "├─ ");
    const nextPrefix = prefix === "" ? "" : prefix + (isLast ? "   " : "│  ");

    let line = `${prefix}${connector}${node.id || "?"} [${node.type || "?"}]`;

    // Compact annotations
    const tags: string[] = [];
    if (node.specials) {
      if (node.specials.text) {
        const t = node.specials.text.replace(/[\n\r]+/g, " ").substring(0, 50);
        tags.push(`"${t}"`);
      }
      if (node.specials.custom_class) tags.push(`.${node.specials.custom_class.split(",")[0].trim()}`);
      if (node.specials.custom_css) tags.push("{css}");
      if (node.specials.bind) tags.push(`[bind:${node.specials.bind}]`);
    }
    if (node.bindings && node.bindings.length) tags.push(`[${node.bindings.length}bind]`);
    if (node.events && node.events.length) tags.push(`[${node.events.length}ev]`);
    if (tags.length) line += " " + tags.join(" ");

    const children = node.children || [];
    if (children.length) line += ` (${children.length})`;

    lines.push(line);
    for (let i = 0; i < children.length; i++) {
      walk(children[i], nextPrefix, i === children.length - 1);
    }
  }

  for (let i = 0; i < roots.length; i++) {
    walk(roots[i], "", i === roots.length - 1);
  }
  return lines.join("\n");
}

// ── Incremental cache — populated as tools are used, keyed by ID ──
//
// Why not fetch-all-at-once: the API may require `component` filter to return
// certain types (e.g. popup). So we cache incrementally: list/get tools fetch
// from API with the correct filter and feed results into the cache. Subsequent
// detail/search/element tools can resolve by ID from cache without re-fetching.

const _gsById = new Map<string, { gs: any; time: number }>(); // id → { gs, time }
const CACHE_TTL = 30000;

/** Feed API results into cache */
function cacheItems(items: any[]): void {
  if (!Array.isArray(items)) return;
  const now = Date.now();
  for (const item of items) {
    if (item?.id) _gsById.set(String(item.id), { gs: item, time: now });
  }
}

function invalidateGsCache(): void {
  _gsById.clear();
}

/** Fetch global sources by component from API and cache results */
async function fetchByComponent(api: WebcakeCmsApi, component: string): Promise<any[]> {
  const res = component === "cart-droppable"
    ? await api.getSourceCart()
    : await api.getGlobalSources({ component });
  const items = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
  cacheItems(items);
  return items;
}

/** Fetch ALL global sources (general + cart) and cache */
async function fetchAll(api: WebcakeCmsApi): Promise<any[]> {
  const [gsRes, cartRes] = await Promise.all([
    api.getGlobalSources({}).catch(() => null),
    api.getSourceCart().catch(() => null),
  ]);
  const gsList = Array.isArray(gsRes?.data) ? gsRes.data : (Array.isArray(gsRes) ? gsRes : []);
  const cartList = Array.isArray(cartRes?.data) ? cartRes.data : (Array.isArray(cartRes) ? cartRes : []);
  const merged = [...gsList, ...cartList];
  cacheItems(merged);
  return merged;
}

/** Resolve global source by ID. Source is the original object — no wrapping. */
async function getGsWithSource(
  api: WebcakeCmsApi,
  globalSourceId: any,
  componentHint?: string
): Promise<{ gs?: any; source?: any; error?: string }> {
  const id = String(globalSourceId);

  // 1. Cache hit?
  const cached = _gsById.get(id);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return { gs: cached.gs, source: parseSource(cached.gs.source) };
  }

  // 2. Cache miss — fetch and retry
  if (componentHint) {
    await fetchByComponent(api, componentHint);
  } else {
    await fetchAll(api);
  }

  const entry = _gsById.get(id);
  if (!entry) return { error: `Global source "${globalSourceId}" not found. Provide component param or call list_global_sources first.` };
  return { gs: entry.gs, source: parseSource(entry.gs.source) };
}

// ── Zod schemas (reused across tools) ──

const elementUpdateShape = z.object({
  element_id: z.string().describe("Element ID"),
  style: z.record(z.any()).optional(),
  config: z.record(z.any()).optional(),
  specials: z.record(z.any()).optional(),
  events: z.array(z.record(z.any())).optional(),
  bindings: z.array(z.record(z.any())).optional(),
  responsive: z.record(z.any()).optional(),
});

// ── Tool registration ──

export function registerGlobalSourceTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {

  // ── List ──

  server.tool(
    "list_global_sources",
    `List global sources (cart, popup, etc.). Returns compact summary per source.
Always provide component to filter by type — the API may not return all types without a filter.`,
    {
      component: z.string().optional().describe('Filter by component type (e.g. "cart-droppable", "popup"). Recommended to always provide'),
    },
    ({ component }) =>
      handle(async () => {
        // Always call API with component filter — API may require it for certain types
        const items = component ? await fetchByComponent(api, component) : await fetchAll(api);
        if (!Array.isArray(items)) return items;

        return {
          count: items.length,
          global_sources: items.map((gs) => {
            const source = parseSource(gs.source);
            const ov = source ? buildOverview(source) : null;
            return { id: gs.id, component: gs.component, type: gs.type, elements: ov ? ov.elements : 0, sections: ov ? ov.sections : 0 };
          }),
          hint: "Use get_global_source_detail with global_source_id for full element tree.",
        };
      })
  );

  server.tool(
    "get_source_cart",
    `Get all cart global sources with compact tree view.
Shows full element hierarchy — no need to call get_global_source_detail separately.`,
    {},
    () =>
      handle(async () => {
        const items = await fetchByComponent(api, "cart-droppable");
        if (!Array.isArray(items)) return items;

        return {
          count: items.length,
          carts: items.map((gs) => {
            const source = parseSource(gs.source);
            return {
              id: gs.id,
              type: gs.type,
              overview: source ? buildOverview(source) : null,
              tree: source ? buildTreeText(source) : "(empty)",
            };
          }),
          hint: "Use get_global_source_element for full style/config. Use update_global_source_element to modify.",
        };
      })
  );

  // ── Detail ──

  server.tool(
    "get_global_source_detail",
    `Get full detail of a global source — compact tree view showing all elements.
Each line: ID [type] "text" .class [events] [bindings] (children_count).
Provide component for faster lookup; omit if you already called list_global_sources.`,
    {
      global_source_id: z.string().describe("Global source ID"),
      component: z.string().optional().describe('Component hint for faster lookup (e.g. "popup", "cart-droppable")'),
    },
    ({ global_source_id, component }) =>
      handle(async () => {
        const { gs, source, error } = await getGsWithSource(api, global_source_id, component);
        if (error) return { error };

        return {
          id: gs.id,
          component: gs.component,
          type: gs.type,
          overview: source ? buildOverview(source) : null,
          tree: source ? buildTreeText(source) : "(empty)",
          hint: "Use get_global_source_element for full style/config of a specific element. Use search_global_source_elements to filter.",
        };
      })
  );

  // ── Element search & detail ──

  server.tool(
    "search_global_source_elements",
    `Search/filter elements within a global source. No component param needed.
Examples:
- Find all buttons: type="button"
- Find by class: custom_class="hero"
- Find text: text="subscribe"
- Data-bound only: has_bind=true
- With events: has_events=true
- With custom class: has_custom_class=true`,
    {
      global_source_id: z.string().describe("Global source ID"),
      component: z.string().optional().describe('Component hint for faster lookup (e.g. "popup", "cart-droppable")'),
      type: z.string().optional().describe("Filter by element type (e.g. 'text', 'button', 'image', 'container', 'section')"),
      id: z.string().optional().describe("Filter by element ID substring (e.g. 'TEXT', 'BUTTON-3')"),
      custom_class: z.string().optional().describe("Filter by custom class substring"),
      text: z.string().optional().describe("Filter by text content substring"),
      has_custom_class: z.boolean().optional().describe("Only elements with custom class"),
      has_bind: z.boolean().optional().describe("Only elements with data bindings"),
      has_events: z.boolean().optional().describe("Only elements with events"),
      limit: z.number().default(50).describe("Max results (default 50)"),
    },
    ({ global_source_id, component, ...filters }) =>
      handle(async () => {
        const { source, error } = await getGsWithSource(api, global_source_id, component);
        if (error) return { error };
        if (!source) return { error: "Global source has no source data" };

        const results = searchElements(source, filters);
        return { global_source_id, matched: results.length, elements: results };
      })
  );

  server.tool(
    "get_global_source_element",
    "Get full detail of a single element (style, config, specials, events, bindings, responsive, children).",
    {
      global_source_id: z.string().describe("Global source ID"),
      element_id: z.string().describe("Element ID (e.g. 'TEXT-3', 'BUTTON-1')"),
      component: z.string().optional().describe('Component hint for faster lookup'),
    },
    ({ global_source_id, element_id, component }) =>
      handle(async () => {
        const { source, error } = await getGsWithSource(api, global_source_id, component);
        if (error) return { error };
        if (!source) return { error: "Global source has no source data" };

        const node = findNodeById(source, element_id);
        if (!node) return { error: `Element "${element_id}" not found` };

        const detail = nodeToDetail(node);
        if (node.children && node.children.length) {
          detail.children = node.children.map((c: any) => ({ id: c.id, type: c.type }));
        }
        return detail;
      })
  );

  // ── Element-level updates (shallow merge, same as page tools) ──

  server.tool(
    "update_global_source_element",
    `Update a single element within a global source. Two-step process:
STEP 1: Call with dry_run=true (default) → returns diff of what will change.
STEP 2: Show the diff to the user and ask for confirmation. NEVER proceed without explicit user approval.
STEP 3: Only after user confirms, call again with dry_run=false to apply.
IMPORTANT: You MUST show the diff to the user and get explicit "yes/ok/confirm" before calling with dry_run=false. Skipping confirmation risks data loss.
Merge rules: style/config/specials = shallow merge, responsive = merge by bp key.
events/bindings = REPLACE the whole array — pass the COMPLETE list (read it first); entries are auto-normalized (id + eventName filled in).`,
    {
      global_source_id: z.string().describe("Global source ID"),
      element_id: z.string().describe("Element ID to update (e.g. 'TEXT-3', 'BUTTON-1')"),
      component: z.string().optional().describe('Component hint for faster lookup'),
      dry_run: z.boolean().optional().describe("Preview only (true) or apply changes (false). Defaults to confirm_mode setting. Use toggle_confirm_mode to change default."),
      style: z.record(z.any()).optional().describe("CSS style properties to merge"),
      config: z.record(z.any()).optional().describe("Config properties to merge"),
      specials: z.record(z.any()).optional().describe("Specials to merge (text, custom_class, custom_css)"),
      events: z.array(z.record(z.any())).optional().describe("Complete events array (replaces existing)"),
      bindings: z.array(z.record(z.any())).optional().describe("Complete bindings array (replaces existing)"),
      responsive: z.record(z.any()).optional().describe("Responsive overrides (e.g. {bp1: {style: {...}}})"),
    },
    ({ global_source_id, element_id, component, dry_run: dryRunParam, ...updates }) =>
      handle(async () => {
        // Resolve dry_run: explicit param wins, otherwise follow confirm_mode setting
        const dry_run = dryRunParam !== undefined ? dryRunParam : getConfirmMode() === "always_confirm";
        // Force fresh read before write to avoid stale cache overwriting newer data
        invalidateGsCache();
        const { gs, source, error } = await getGsWithSource(api, global_source_id, component);
        if (error) return { error };
        if (!source) return { error: "Global source has no source data" };

        const node = findNodeById(source, element_id);
        if (!node) return { error: `Element "${element_id}" not found` };

        // Clone node before mutation for diff
        const beforeNode = JSON.parse(JSON.stringify(node));
        applyNodeUpdates(node, updates);
        const diff = computeNodeDiff(beforeNode, node);

        if (!diff) return { info: "No changes detected", element_id };

        // Dry run: return diff without saving
        if (dry_run) {
          return {
            dry_run: true,
            element_id,
            diff,
            hint: "Review the changes above. Call again with dry_run=false to apply.",
          };
        }

        // Actual save — send source as OBJECT (not string) because backend does Jason.encode!
        const existingLen = JSON.stringify(parseSource(gs.source)).length;
        const newLen = JSON.stringify(source).length;

        // Safeguard: block if source shrinks significantly
        if (existingLen > 200 && newLen < existingLen * 0.5) {
          return {
            error: `BLOCKED: Source would shrink from ${existingLen} to ${newLen} chars. This indicates data loss.`,
            existing_length: existingLen,
            new_length: newLen,
          };
        }

        const isCart = gs.component === "cart-droppable";
        let res: any;
        if (isCart) {
          res = await api.updateSourceCart({ source, type: gs.type, site_id: api.siteId });
        } else {
          res = await api.updateGlobalSource({ global_source_id, source, type: gs.component, site_id: api.siteId });
        }
        invalidateGsCache();

        const saved = res && res.data;
        if (!saved) return { error: "Backend returned empty response — update may not have persisted", sent_length: newLen };

        return { success: true, element_id, diff, source_length: newLen };
      })
  );

  server.tool(
    "update_global_source_elements",
    `Batch update multiple elements in one global source. Two-step process:
STEP 1: Call with dry_run=true (default) → returns per-element diff.
STEP 2: Show all diffs to the user and ask for confirmation. NEVER proceed without explicit user approval.
STEP 3: Only after user confirms, call again with dry_run=false to apply.
IMPORTANT: You MUST show the diff to the user and get explicit "yes/ok/confirm" before calling with dry_run=false. Skipping confirmation risks data loss.
Same merge rules: style/config/specials = shallow merge, events/bindings = replace.`,
    {
      global_source_id: z.string().describe("Global source ID"),
      component: z.string().optional().describe('Component hint for faster lookup'),
      dry_run: z.boolean().optional().describe("Preview only (true) or apply changes (false). Defaults to confirm_mode setting."),
      updates: z.array(elementUpdateShape).describe("Array of element updates"),
    },
    ({ global_source_id, component, dry_run: dryRunParam, updates: elementUpdates }) =>
      handle(async () => {
        const dry_run = dryRunParam !== undefined ? dryRunParam : getConfirmMode() === "always_confirm";
        invalidateGsCache();
        const { gs, source, error } = await getGsWithSource(api, global_source_id, component);
        if (error) return { error };
        if (!source) return { error: "Global source has no source data" };

        const results: any[] = [];
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
        const existingLen = JSON.stringify(parseSource(gs.source)).length;
        const newLen = JSON.stringify(source).length;

        if (existingLen > 200 && newLen < existingLen * 0.5) {
          return {
            error: `BLOCKED: Source would shrink from ${existingLen} to ${newLen} chars. This indicates data loss.`,
            existing_length: existingLen,
            new_length: newLen,
          };
        }

        const isCart = gs.component === "cart-droppable";
        let res: any;
        if (isCart) {
          res = await api.updateSourceCart({ source, type: gs.type, site_id: api.siteId });
        } else {
          res = await api.updateGlobalSource({ global_source_id, source, type: gs.component, site_id: api.siteId });
        }
        invalidateGsCache();

        const saved = res && res.data;
        if (!saved) return { error: "Backend returned empty response — update may not have persisted", sent_length: newLen };

        return { success: true, elements: results, source_length: newLen };
      })
  );

  // ── CRUD ──

  server.tool(
    "create_global_source",
    `Create a new global source component. Component types: "cart-droppable" (cart), "popup", or any custom type.`,
    {
      component: z.string().describe('Component type (e.g. "cart-droppable", "popup")'),
      source: z.any().describe("Source configuration (sections/elements JSON)"),
      type: z.string().default("default").describe('Type variant (default: "default")'),
    },
    ({ component, source, type }) =>
      handle(async () => {
        const params = { component, source, type, site_id: api.siteId };
        const res = component === "cart-droppable"
          ? await api.createSourceCart(params)
          : await api.createGlobalSource(params);
        invalidateGsCache();
        return res;
      })
  );

  server.tool(
    "update_global_source",
    `Replace full source of a global source.
IMPORTANT: Before calling this tool, you MUST:
1. Read existing source with get_global_source_detail first
2. Show the user what will change and get explicit confirmation
3. NEVER call without user approval — this replaces the ENTIRE source
Safeguarded: blocks if new source is <50% of existing size. For element-level changes, prefer update_global_source_element instead.`,
    {
      global_source_id: z.string().describe("Global source ID"),
      source: z.any().describe("New source configuration (JSON object)"),
    },
    ({ global_source_id, source: newSourceInput }) =>
      handle(async () => {
        // Force fresh read before write to avoid stale cache
        invalidateGsCache();
        const { gs, source: existingSource, error } = await getGsWithSource(api, global_source_id);
        if (error) return { error };

        // Ensure source is an object (not string) — backend does Jason.encode! so we must send object
        const newSourceObj = typeof newSourceInput === "string" ? JSON.parse(newSourceInput) : newSourceInput;
        const newLen = JSON.stringify(newSourceObj).length;

        // Safeguard: block if new source is suspiciously smaller
        if (existingSource) {
          const existingLen = JSON.stringify(existingSource).length;
          if (existingLen > 200 && newLen < existingLen * 0.5) {
            return {
              error: `BLOCKED: New source (${newLen} chars) is much smaller than existing (${existingLen} chars) — ${Math.round((newLen / existingLen) * 100)}% of original. Use get_global_source_detail to read existing data first, or use update_global_source_element for targeted changes.`,
              existing_length: existingLen,
              new_length: newLen,
            };
          }
        }

        const isCart = gs.component === "cart-droppable";
        if (isCart) {
          await api.updateSourceCart({ source: newSourceObj, type: gs.type, site_id: api.siteId });
        } else {
          await api.updateGlobalSource({ global_source_id, source: newSourceObj, type: gs.component, site_id: api.siteId });
        }
        invalidateGsCache();

        return { success: true, global_source_id, new_length: newLen };
      })
  );

  server.tool(
    "delete_global_source",
    "Delete a global source and its published version",
    {
      global_source_id: z.string().describe("Global source ID to delete"),
    },
    ({ global_source_id }) =>
      handle(async () => {
        const res = await api.deleteGlobalSource({ global_source_id, site_id: api.siteId });
        invalidateGsCache();
        return res;
      })
  );

  // ── Multilingual contents ──

  server.tool(
    "get_global_source_contents",
    "Get multilingual contents for global sources by component type",
    {
      component: z.string().describe('Component type (e.g. "cart-droppable", "popup")'),
    },
    ({ component }) =>
      handle(() => api.getGlobalSourceContents({ site_id: api.siteId, component }))
  );

  server.tool(
    "update_global_source_contents",
    `Update multilingual contents (upsert). Each entry: global_source_id, language_code, content.
IMPORTANT: Before calling, you MUST read existing contents with get_global_source_contents first, then show the user what will change and get explicit confirmation. NEVER update without user approval.`,
    {
      contents: z.array(z.object({
        global_source_id: z.string().describe("Global source ID"),
        language_code: z.string().describe("Language code (e.g. 'en', 'vi')"),
        content: z.any().describe("Translation content (JSON object)"),
        type_component: z.string().optional().describe("Component type"),
      })).describe("Array of content entries to upsert"),
    },
    ({ contents }) =>
      handle(async () => {
        // Safeguard: for each entry, check existing content size
        for (const entry of contents) {
          if (!entry.content) continue;
          const component = entry.type_component;
          if (!component) continue;

          const existingRes = await api.getGlobalSourceContents({ site_id: api.siteId, component });
          const existingList = (existingRes && existingRes.data) || existingRes || [];
          if (!Array.isArray(existingList)) continue;

          const existing = existingList.find(
            (c: any) => String(c.global_source_id) === String(entry.global_source_id) && c.language_code === entry.language_code
          );
          if (existing && existing.content) {
            const existingStr = JSON.stringify(existing.content);
            const newStr = JSON.stringify(entry.content);
            if (existingStr.length > 200 && newStr.length < existingStr.length * 0.5) {
              return {
                error: `BLOCKED: Content for ${entry.global_source_id}/${entry.language_code} would shrink from ${existingStr.length} to ${newStr.length} chars (${Math.round((newStr.length / existingStr.length) * 100)}% of original). Read existing with get_global_source_contents first.`,
                existing_length: existingStr.length,
                new_length: newStr.length,
              };
            }
          }
          break; // Only check first entry to avoid excessive API calls
        }

        return api.updateGlobalSourceContents({
          site_id: api.siteId,
          contents: contents.map((c) => ({ ...c, site_id: api.siteId })),
        });
      })
  );
}

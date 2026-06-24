import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import {
  buildOverview,
  buildTreeText,
  searchElements,
  nodeToDetail,
  findNodeById,
} from "./global-sources.js";
import { cacheLarge } from "./result-cache.js";

/**
 * Global SECTIONS tools — reusable page chrome (Header, Footer) + shared content
 * blocks (breadcrumb, "about", product strips) that pages embed by reference.
 *
 * Why this module exists: the raw `GET /global_sections` response is HUGE (a real
 * site's Header+Footer trees alone are >1MB), which overflows the tool-result token
 * budget. So instead of dumping the whole tree, we:
 *   - cache the fetched list for the session (30s TTL) so drill-down is free, and
 *   - expose SLIM tools: a summary list, a compact per-section tree, and
 *     element search / element detail — mirroring the global_sources tools.
 *
 * Shape note: each global section's element tree lives under `gs.section` (a single
 * section node with `children`), NOT under `gs.source`. `gs.contents` is the
 * (usually empty) multilingual override list. `gs.type` is the chrome slot:
 * 1 = header, 3 = footer, 2 = reusable content block.
 */

const TYPE_LABEL: Record<number, string> = { 1: "header", 2: "block", 3: "footer" };
const CACHE_TTL = 30000;

let _cache: { items: any[]; time: number } | null = null;

/** Pull the array of global sections out of the various response envelopes. */
function extractList(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.global_sections)) return res.global_sections;
  if (res.data) {
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data.global_sections)) return res.data.global_sections;
  }
  return [];
}

async function fetchSections(api: WebcakeCmsApi, force = false): Promise<any[]> {
  if (!force && _cache && Date.now() - _cache.time < CACHE_TTL) return _cache.items;
  const res = await api.listGlobalSections();
  const items = extractList(res);
  _cache = { items, time: Date.now() };
  return items;
}

/** The element-tree root of a global section is its `section` node. */
function rootOf(gs: any): any {
  return gs && gs.section ? gs.section : null;
}

function summarize(gs: any): any {
  const root = rootOf(gs);
  const ov = root ? buildOverview(root) : null;
  const langs = Array.isArray(gs.contents) ? gs.contents.map((c: any) => c.language_code).filter(Boolean) : [];
  return {
    id: gs.id,
    name: gs.name,
    type: gs.type,
    slot: TYPE_LABEL[gs.type] || "block",
    elements: ov ? ov.elements : 0,
    types: ov ? ov.types : {},
    classes: ov ? ov.classes : [],
    contents_langs: langs,
  };
}

async function resolveSection(api: WebcakeCmsApi, id: string): Promise<any | null> {
  let items = await fetchSections(api);
  let found = items.find((g) => String(g.id) === String(id));
  if (!found) {
    items = await fetchSections(api, true); // force refresh once
    found = items.find((g) => String(g.id) === String(id));
  }
  return found || null;
}

export function registerGlobalSectionTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_global_sections",
    `List reusable global sections (Header, Footer, shared content blocks) — SLIM summary only.
Each entry: id, name, slot (header/footer/block), element count + type histogram + custom classes.
The full element tree is large, so it is NOT returned here — drill in with get_global_section
(compact tree), search_global_section_elements, or get_global_section_element.`,
    {},
    () =>
      handle(async () => {
        const items = await fetchSections(api);
        return {
          count: items.length,
          global_sections: items.map(summarize),
          hint: "Use get_global_section(global_section_id) for a compact element tree of one section.",
        };
      })
  );

  server.tool(
    "get_global_section",
    `Get one global section as a COMPACT tree (3-5x fewer tokens than raw JSON).
Each line: ID [type] "text" .class [Nbind] [Nev] (children_count).
Use this to learn how a real Header/Footer/block is composed before building your own.`,
    {
      global_section_id: z.string().describe("Global section ID (from list_global_sections)"),
      raw: z.boolean().default(false).describe("Return the FULL raw section JSON (large) instead of the compact tree — delivered via the large-result cache so you can split-read it with read_cached_result."),
    },
    ({ global_section_id, raw }) =>
      handle(async () => {
        const gs = await resolveSection(api, global_section_id);
        if (!gs) return { error: `Global section "${global_section_id}" not found. Call list_global_sections first.` };
        const root = rootOf(gs);
        if (raw) {
          // Full fidelity — cache-then-split-read so even a >1MB tree is reachable.
          return cacheLarge(`global_section:${gs.name || gs.id}`, root || {});
        }
        return {
          id: gs.id,
          name: gs.name,
          slot: TYPE_LABEL[gs.type] || "block",
          overview: root ? buildOverview(root) : null,
          tree: root ? buildTreeText(root) : "(empty)",
          hint: "Use get_global_section_element(global_section_id, element_id) for full style/config of one node. Pass raw=true for the full JSON via the cache.",
        };
      })
  );

  server.tool(
    "search_global_section_elements",
    `Search/filter elements within a global section (Header/Footer/block) without dumping the whole tree.
Filter by type, id substring, custom_class, text, or has_bind / has_events / has_custom_class.`,
    {
      global_section_id: z.string().describe("Global section ID"),
      type: z.string().optional().describe("Filter by element type (e.g. 'menu', 'menu-item', 'container', 'image', 'text')"),
      id: z.string().optional().describe("Filter by element ID substring"),
      custom_class: z.string().optional().describe("Filter by custom class substring"),
      text: z.string().optional().describe("Filter by text content substring"),
      has_custom_class: z.boolean().optional().describe("Only elements with a custom class"),
      has_bind: z.boolean().optional().describe("Only elements with data bindings"),
      has_events: z.boolean().optional().describe("Only elements with events"),
      limit: z.number().default(50).describe("Max results (default 50)"),
    },
    ({ global_section_id, ...filters }) =>
      handle(async () => {
        const gs = await resolveSection(api, global_section_id);
        if (!gs) return { error: `Global section "${global_section_id}" not found.` };
        const root = rootOf(gs);
        if (!root) return { error: "Global section has no element tree." };
        const results = searchElements(root, filters);
        return { global_section_id, matched: results.length, elements: results };
      })
  );

  server.tool(
    "get_global_section_element",
    "Get full detail (style, config, specials, events, bindings, responsive bp1..bp4, children IDs) of a single element inside a global section.",
    {
      global_section_id: z.string().describe("Global section ID"),
      element_id: z.string().describe("Element ID (e.g. 'MENU-1', 'TEXT-3')"),
    },
    ({ global_section_id, element_id }) =>
      handle(async () => {
        const gs = await resolveSection(api, global_section_id);
        if (!gs) return { error: `Global section "${global_section_id}" not found.` };
        const root = rootOf(gs);
        if (!root) return { error: "Global section has no element tree." };
        const node = findNodeById(root, element_id);
        if (!node) return { error: `Element "${element_id}" not found in global section.` };
        const detail = nodeToDetail(node);
        if (node.children && node.children.length) {
          detail.children = node.children.map((c: any) => ({ id: c.id, type: c.type }));
        }
        return detail;
      })
  );
}

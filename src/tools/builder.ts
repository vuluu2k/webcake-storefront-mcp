import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { BUILD_GUIDE } from "../builder/guide.js";
import { PAGE_SCHEMA } from "../builder/page-schema.js";
import { listElements, getElement, buildElement } from "../builder/catalog.js";
import { describeEventsCatalog } from "../builder/events.js";
import { describeBindingsCatalog } from "../builder/bindings.js";
import {
  buildSection,
  buildRow,
  newPageSkeleton,
  validatePage,
  finalizeForRender,
  walk,
  reassignIds,
} from "../builder/page.js";

// Recursive spec for new_section / build_page children.
const elementSpec = z.object({
  type: z.string().describe("Element type (see list_elements)"),
  opts: z.record(z.any()).optional().describe("Factory opts: { style, config, specials, text, src, width, height, ... }"),
  children: z.array(z.any()).optional().describe("Nested child specs (same shape) for container types"),
  layout: z.enum(["row", "column"]).optional().describe("How this node's children are laid out: 'row' = side by side (responsive columns, auto-collapses on tablet/mobile), 'column' = stacked top-to-bottom (default). Use 'row' on a container to make feature cards / category tiles / footer columns / 2-col hero."),
  rowGap: z.number().optional().describe("Vertical gap (px) between stacked children / wrapped rows"),
  columnGap: z.number().optional().describe("Horizontal gap (px) between columns (layout:'row' only)"),
  colWidths: z.array(z.any()).optional().describe("layout:'row' only — explicit per-column unit objects (length = #children), e.g. [{unit:'fr',value:2},{unit:'fr',value:1}] for a 2:1 split. Default: equal columns."),
  collapse: z.record(z.number()).optional().describe("layout:'row' only — columns to show per breakpoint, e.g. {bp3:2,bp4:1}. Default: tablet 2, mobile 1."),
});

function parseSource(src: any): any {
  if (src == null) return null;
  return typeof src === "string" ? JSON.parse(src) : src;
}

function newPageId(res: any): string | null {
  return (res && res.data && res.data.id) || (res && res.id) || null;
}

// BuilderX page kinds. The numeric `type` is what the backend stores (PAGE_TYPE in
// builderx_spa); SPECIAL kinds also require a site-level data-source flag enabled on
// site.settings, otherwise components that bind to store/customer/blog data render
// with null bindings. build_page sets both for you.
// Page kind → numeric backend type. Exported so create_page maps the same way (the backend
// type is numeric 1–7, NOT a string).
export const PAGE_TYPE_NUM: Record<string, number> = {
  main: 1, store: 2, member: 3, blog: 4, custom: 5, error: 6, maintain: 7,
};
export const PAGE_TYPE_FLAG: Record<string, string> = {
  store: "use_store", member: "use_member", blog: "use_blog",
  error: "use_error", maintain: "use_maintain",
};
export const PAGE_KINDS = ["main", "store", "member", "blog", "custom", "error", "maintain"] as const;

/** Build the page.settings.seo block from simple inputs (the real shape; tokens like
 *  {{name_page}} / {{name_site}} are resolved by the storefront). */
export function buildPageSeo(seo: any = {}): any {
  const out: any = {};
  if (seo.title) out.title = seo.title;
  if (seo.description) out.description = seo.description;
  if (seo.keyword) out.keyword = seo.keyword;
  if (seo.favicon) out.favicon = seo.favicon;
  if (seo.thumbnail) out.thumbnail = seo.thumbnail;
  // Open Graph mirrors title/description/thumbnail when not given explicitly.
  if (seo.title || seo.og_title) out.og_title = seo.og_title || seo.title;
  if (seo.description || seo.og_description) out.og_description = seo.og_description || seo.description;
  if (seo.thumbnail) out.og_image = seo.thumbnail;
  return out;
}

export function registerBuilderTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "get_build_guide",
    "Get the BuilderX page authoring guide: page shape, the grid layout model, styling, breakpoints, forms/data, and the build workflow. Read this before building or heavily editing a page.",
    {},
    () => handle(async () => ({ guide: BUILD_GUIDE }))
  );

  server.tool(
    "get_page_schema",
    "Get the authoritative JSON Schema (Draft 2020-12) for a page source `{ sections: [...] }` — the structural contract for every node (id/type/specials/runtime{style,config}/children/events/bindings) in the CSS-grid model. Use it as the shape to emit; validate_page enforces the semantic rules.",
    {},
    () => handle(async () => PAGE_SCHEMA)
  );

  server.tool(
    "list_elements",
    "List all BuilderX element/component types you can place on a page, grouped by category with a one-line summary and whether each is a container.",
    {},
    () => handle(async () => listElements())
  );

  server.tool(
    "get_element",
    "Get the full detail of an element type: category, container flag, summary, an ATTRIBUTES reference (the meaningful specials/config keys + their purpose/allowed values, events, and dataset binding targets), and a live skeleton node (the authoritative default shape) you can copy and edit. Read this before authoring/editing an element so you set the right keys.",
    {
      type: z.string().describe("Element type, e.g. 'text', 'button', 'grid-product'"),
    },
    ({ type }) => handle(async () => getElement(type))
  );

  server.tool(
    "list_events",
    "List every interaction EVENT you can attach to a node: the triggers (eventName: click/hover/success/submit/…) and the actions (open_page, scroll_to, toggle, open_popup, add_to_cart, buy_now, phone_call, open_link, …) with the exact extra fields each action needs. Attach via new_element/new_section opts.events (ids are auto-minted, e.g. opts.events=[{ action:'add_to_cart', open_page:'cart' }]).",
    {},
    () => handle(async () => describeEventsCatalog())
  );

  server.tool(
    "list_bindings",
    "List every dynamic-data BINDING target: the datasets (product, cart_item, order, order_item, post, category, customer, customer_address, …) and their exact field names ('product::product_price', …), which page type each needs (store/member/blog), and how repeater children (grid-product, cart-items, post-list) bind per-item. Attach via new_element opts.bindings (ids auto-minted, e.g. opts.bindings=[{ target:'product::product_price' }]).",
    {},
    () => handle(async () => describeBindingsCatalog())
  );

  server.tool(
    "new_element",
    "Build a single structurally-valid element node from the real builder factory. Returns the node — edit its specials/style, then place it in a section's children.",
    {
      type: z.string().describe("Element type (see list_elements)"),
      opts: z.record(z.any()).optional().describe("Factory opts: { text, src, width, height, style, config, specials, events }"),
    },
    ({ type, opts }) => handle(async () => buildElement(type, opts || {}))
  );

  server.tool(
    "new_section",
    `Build a complete section node with children laid out in the builder's vertical grid.
Pass an array of element specs; each child is stacked top-to-bottom. Nest containers via the child's own 'children'.
Example children: [{ "type":"text", "opts":{"text":"Welcome","style":{"fontSize":"40px"}} }, { "type":"button", "opts":{"text":"Shop now"} }]`,
    {
      children: z.array(elementSpec).default([]).describe("Child element specs, stacked vertically in the section"),
      section_opts: z.record(z.any()).optional().describe("Optional factory opts for the section node itself"),
    },
    ({ children, section_opts }) => handle(async () => buildSection(children || [], section_opts || {}))
  );

  server.tool(
    "new_row",
    `Build a multi-column ROW container: children laid out SIDE BY SIDE (not stacked).
This is how real pages build feature cards, category tiles, footer columns, a 2-col hero, etc.
The row is RESPONSIVE — it auto-collapses to fewer columns on tablet/mobile (default tablet 2, mobile 1) so cards never become cramped slivers.
Place the returned node as a child inside a section (section children still stack vertically; nest a row for horizontal layout).
Example children: [{ "type":"container", "children":[{"type":"image","opts":{...}},{"type":"text","opts":{...}}] }, { ... }, { ... }]`,
    {
      children: z.array(elementSpec).default([]).describe("Child specs, one per column (laid out left-to-right)"),
      column_gap: z.number().optional().describe("Horizontal gap (px) between columns (default 24)"),
      row_gap: z.number().optional().describe("Vertical gap (px) between wrapped rows (default 24)"),
      col_widths: z.array(z.any()).optional().describe("Explicit per-column unit objects (length = #children), e.g. [{unit:'fr',value:2},{unit:'fr',value:1}]. Default: equal columns."),
      collapse: z.record(z.number()).optional().describe("Columns to show per breakpoint, e.g. {bp3:2,bp4:1}. Default: tablet 2, mobile 1."),
      container_opts: z.record(z.any()).optional().describe("Optional factory opts for the row container node itself (e.g. { style:{...} })"),
    },
    ({ children, column_gap, row_gap, col_widths, collapse, container_opts }) =>
      handle(async () =>
        buildRow(children || [], {
          columnGap: column_gap,
          rowGap: row_gap,
          colWidths: col_widths,
          collapse,
          containerOpts: container_opts || {},
        })
      )
  );

  server.tool(
    "new_page_skeleton",
    "Return an empty but valid page source: { sections: [] }. Add sections built with new_section, then save with build_page.",
    {},
    () => handle(async () => newPageSkeleton())
  );

  server.tool(
    "validate_page",
    "Validate a page source ({ sections: [...] }). Returns errors (block saving: duplicate/missing ids, missing types) and warnings (unknown types, form fields without field_name, dangling event targets) plus stats. Always run this before build_page.",
    {
      source: z.any().describe("Page source object or JSON string"),
    },
    ({ source }) =>
      handle(async () => {
        const parsed = parseSource(source);
        return validatePage(parsed);
      })
  );

  server.tool(
    "build_page",
    `Create a brand-new page AND set its full content source in one step.
Two-step safety: call with dry_run=true (default) to validate and preview, then dry_run=false to actually create + save.
The source must be { sections: [...] } — build sections with new_section. Validation errors block the real save.`,
    {
      name: z.string().describe("Page name"),
      slug: z.string().describe("URL slug, e.g. '/landing' or '/about'"),
      source: z.any().describe("Full page source { sections: [...] } (object or JSON string)"),
      type: z
        .enum(PAGE_KINDS)
        .optional()
        .describe(
          "Page kind. SPECIAL pages need a site data-source enabled — build_page does this automatically: store→use_store (product/cart bindings), member→use_member (customer/order bindings), blog→use_blog, error→use_error, maintain→use_maintain. 'main'/'custom' need nothing. Omit for a normal content page (defaults to 'main' for the homepage).",
        ),
      is_homepage: z.boolean().default(false).describe("Set as the site homepage"),
      seo: z
        .object({
          title: z.string().optional().describe("SEO/browser title. Tokens allowed: {{name_page}}, {{name_site}}, {{name_product}}, {{name_category}}."),
          description: z.string().optional().describe("Meta description (~155 chars)."),
          keyword: z.string().optional().describe("Comma-separated keywords."),
          favicon: z.string().optional().describe("Favicon URL (hosted)."),
          thumbnail: z.string().optional().describe("Social/OG share image URL (hosted)."),
        })
        .optional()
        .describe("SEO for this page → settings.seo. Without it the page publishes with an EMPTY title/description. For a store page a good default title is '{{name_product}} | {{name_site}}' (product) or '{{name_category}} | {{name_site}}' (category)."),
      dry_run: z.boolean().default(true).describe("Preview+validate only (true) or create+save (false)"),
    },
    ({ name, slug, source, type, is_homepage, seo, dry_run }) =>
      handle(async () => {
        const parsed = parseSource(source);
        const validation: any = validatePage(parsed);

        // Resolve numeric page type + the site data-source flag a special page needs.
        const kind = type || (is_homepage ? "main" : undefined);
        const typeNum = kind ? PAGE_TYPE_NUM[kind] : undefined;
        const requiredFlag = kind ? PAGE_TYPE_FLAG[kind] : undefined;

        if (dry_run) {
          return {
            dry_run: true,
            validation,
            request: { name, slug, type: kind ?? null, page_type_num: typeNum ?? null, is_homepage, sections: (parsed && parsed.sections || []).length },
            will_enable_feature: requiredFlag ?? null,
            renders_at_breakpoints: ["bp1", "bp2", "bp3", "bp4"],
            hint: validation.valid
              ? `Looks valid. On save, every node's runtime is expanded into the bp1..bp4 keys the storefront renders. Call again with dry_run=false to create and save the page.${requiredFlag ? ` Will also enable site.settings.${requiredFlag} so its data bindings resolve.` : ""}`
              : "Fix the errors above before saving.",
          };
        }

        if (!validation.valid) {
          return { error: "Validation failed — not saving.", validation };
        }

        // A special page is useless if its site data-source flag is off (bindings
        // return null). Enable it BEFORE creating the page so the page works on first load.
        let feature: { changed: boolean; flag: string } | null = null;
        if (requiredFlag) {
          try {
            feature = await api.enableSiteFeature(requiredFlag);
          } catch (e) {
            return { error: `Could not enable site.settings.${requiredFlag} (needed for a '${kind}' page). ${(e as any)?.message ?? e}` };
          }
        }

        // Expand runtime -> bp1..bp4 so the saved source actually renders on the storefront.
        finalizeForRender(parsed);

        // createPage saves the page AND its source in one call (source is required there).
        const created = await api.createPage({ name, source: parsed, ...(typeNum != null ? { type: typeNum } : {}) });
        const pageId = newPageId(created);
        if (!pageId) {
          return { error: "Page created but no id was returned.", created };
        }
        // slug / homepage / SEO are not applied at create — set them via update_page.
        const seoBlock = seo ? buildPageSeo(seo) : null;
        if (slug || is_homepage || (seoBlock && Object.keys(seoBlock).length)) {
          await api
            .updatePage(pageId, {
              ...(slug ? { slug } : {}),
              ...(is_homepage ? { is_homepage: true } : {}),
              ...(seoBlock && Object.keys(seoBlock).length ? { settings: { seo: seoBlock } } : {}),
            })
            .catch(() => {});
        }
        return {
          success: true,
          page_id: pageId,
          name,
          slug,
          page_type: kind ?? null,
          ...(feature ? { data_source: { flag: feature.flag, newly_enabled: feature.changed } } : {}),
          stats: validation.stats,
        };
      })
  );

  server.tool(
    "add_section",
    `Append a section to an EXISTING page's source. Reads the current source, appends your section, validates, and (when dry_run=false) saves.
The section is re-id'd to avoid collisions. Build it with new_section.
Two-step safety: dry_run=true (default) previews; dry_run=false saves.`,
    {
      page_id: z.string().describe("Target page id"),
      section: z.any().describe("A section node (from new_section) — object or JSON string"),
      dry_run: z.boolean().default(true).describe("Preview only (true) or save (false)"),
    },
    ({ page_id, section, dry_run }) =>
      handle(async () => {
        const pagesRes = await api.listPages();
        const pages = (pagesRes && pagesRes.data) || pagesRes || [];
        const page = Array.isArray(pages) ? pages.find((p: any) => p.id === page_id) : null;
        if (!page) return { error: `Page "${page_id}" not found.` };

        const source: any = parseSource(page.source && page.source.source) || newPageSkeleton();
        if (!Array.isArray(source.sections)) source.sections = [];

        const sectionNode = reassignIds(parseSource(section));
        if (!sectionNode || sectionNode.type !== "section") {
          return { error: "Provided 'section' is not a section node (type must be 'section')." };
        }

        source.sections.push(sectionNode);
        const validation: any = validatePage(source);

        if (dry_run) {
          return {
            dry_run: true,
            page_id,
            section_id: sectionNode.id,
            validation,
            total_sections: source.sections.length,
            hint: validation.valid ? "Call again with dry_run=false to save." : "Fix errors before saving.",
          };
        }

        if (!validation.valid) return { error: "Validation failed — not saving.", validation };

        // Expand the newly-added section's runtime -> bp1..bp4 (existing sections are
        // already in breakpoint shape and are left untouched).
        finalizeForRender(source);
        const saved = await api.updatePageSource(page_id, { source });
        return {
          success: true,
          page_id,
          section_id: sectionNode.id,
          total_sections: source.sections.length,
          page_source_id: saved && saved.data && saved.data.id,
        };
      })
  );
}

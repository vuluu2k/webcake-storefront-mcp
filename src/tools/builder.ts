import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { BUILD_GUIDE } from "../builder/guide.js";
import { listElements, getElement, buildElement } from "../builder/catalog.js";
import {
  buildSection,
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
const PAGE_TYPE_NUM: Record<string, number> = {
  main: 1, store: 2, member: 3, blog: 4, custom: 5, error: 6, maintain: 7,
};
const PAGE_TYPE_FLAG: Record<string, string> = {
  store: "use_store", member: "use_member", blog: "use_blog",
  error: "use_error", maintain: "use_maintain",
};
const PAGE_KINDS = ["main", "store", "member", "blog", "custom", "error", "maintain"] as const;

export function registerBuilderTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "get_build_guide",
    "Get the BuilderX page authoring guide: page shape, the grid layout model, styling, breakpoints, forms/data, and the build workflow. Read this before building or heavily editing a page.",
    {},
    () => handle(async () => ({ guide: BUILD_GUIDE }))
  );

  server.tool(
    "list_elements",
    "List all BuilderX element/component types you can place on a page, grouped by category with a one-line summary and whether each is a container.",
    {},
    () => handle(async () => listElements())
  );

  server.tool(
    "get_element",
    "Get the full detail of an element type: category, container flag, summary, and a live skeleton node (the authoritative default shape) you can copy and edit.",
    {
      type: z.string().describe("Element type, e.g. 'text', 'button', 'grid-product'"),
    },
    ({ type }) => handle(async () => getElement(type))
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
      dry_run: z.boolean().default(true).describe("Preview+validate only (true) or create+save (false)"),
    },
    ({ name, slug, source, type, is_homepage, dry_run }) =>
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

        const created = await api.createPage({ name, slug, ...(typeNum != null ? { type: typeNum } : {}), is_homepage });
        const pageId = newPageId(created);
        if (!pageId) {
          return { error: "Page created but no id was returned; cannot save source.", created };
        }

        // Expand runtime -> bp1..bp4 so the saved source actually renders on the storefront.
        finalizeForRender(parsed);
        const saved = await api.updatePageSource(pageId, { source: parsed });
        return {
          success: true,
          page_id: pageId,
          name,
          slug,
          page_type: kind ?? null,
          ...(feature ? { data_source: { flag: feature.flag, newly_enabled: feature.changed } } : {}),
          page_source_id: saved && saved.data && saved.data.id,
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

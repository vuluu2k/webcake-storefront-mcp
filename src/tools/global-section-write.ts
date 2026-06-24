import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { validatePage, finalizeForRender } from "../builder/page.js";

/**
 * Write tools for global SECTIONS (Header / Footer / reusable blocks).
 *
 * Mirrors exactly what builderx_spa does on save (see PagePublish.vue + globalSection.js):
 * a global section is persisted through the site `/save` pipeline as
 *   { section_id, name, type(1=header,2=section,3=footer), pages:[pageId...],
 *     status:"new"|"update"|"delete", section:<node>, contents:[] }
 * matched by (site_id, section_id). The node is marked with specials.global =
 * "header"|"section"|"footer" and carries the SAME id on every page that embeds it.
 *
 * For a header/footer to actually RENDER, the same node must also be injected into each
 * page's source.sections (header → top, footer → bottom). We do both in ONE atomic /save:
 * the global_sections upsert AND the updated page sources (which also rebuilds each page's
 * app_css). api.saveGlobalSections sends the current site.settings so /save can't null them.
 */

const TYPE_NUM: Record<string, number> = { header: 1, section: 2, footer: 3 };

function parseSource(src: any): any {
  if (src == null) return null;
  return typeof src === "string" ? JSON.parse(src) : src;
}

/** All pages with their parsed source. listPages returns each page's source under
 *  page.source.source (a JSON string), same as the add_section tool relies on. */
async function loadPages(api: WebcakeCmsApi): Promise<Array<{ id: string; name: string; source: any }>> {
  const res: any = await api.listPages();
  const pages = (res && res.data) || res || [];
  return (Array.isArray(pages) ? pages : []).map((p: any) => ({
    id: p.id,
    name: p.name,
    source: parseSource(p.source && p.source.source) || { sections: [] },
  }));
}

/** Insert `node` into a page source at the right slot for its global type, replacing any
 *  existing section with the same id (idempotent). Returns true if the source changed. */
function injectNode(source: any, node: any, type: string): boolean {
  if (!source || !Array.isArray(source.sections)) source.sections = [];
  const existingIdx = source.sections.findIndex((s: any) => s && s.id === node.id);
  if (existingIdx !== -1) source.sections.splice(existingIdx, 1);

  if (type === "footer") {
    source.sections.push(node);
  } else if (type === "header") {
    source.sections.unshift(node);
  } else {
    // reusable section → after the last header, else at top
    const lastHeader = source.sections.map((s: any) => s?.specials?.global).lastIndexOf("header");
    source.sections.splice(lastHeader + 1, 0, node);
  }
  return true;
}

export function registerGlobalSectionWriteTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "create_global_section",
    `Create a reusable global section (Header / Footer / shared block) the way the builder does:
persists a global_section record AND embeds the same section node into page sources so it
actually renders across the site (header → top of every page, footer → bottom).
Build the section first with new_section (give it a real bg/padding + logo/menu/links), then pass it here.
Two-step safety: dry_run=true (default) previews which pages change; dry_run=false performs the atomic save.`,
    {
      type: z.enum(["header", "section", "footer"]).describe("header = top chrome (logo/nav/cart), footer = bottom chrome, section = reusable content block"),
      name: z.string().describe("Display name in the editor (e.g. 'Header', 'Footer')"),
      section: z.any().describe("A section node from new_section (object or JSON string) — the content of the header/footer."),
      page_ids: z.array(z.string()).optional().describe("Pages to embed into. Omit to apply to ALL pages of the site (typical for header/footer)."),
      dry_run: z.boolean().default(true).describe("Preview which pages would change (true) or perform the atomic save (false)."),
    },
    ({ type, name, section, page_ids, dry_run }) =>
      handle(async () => {
        const node = parseSource(section);
        if (!node || node.type !== "section") {
          return { error: "`section` must be a section node (type:'section') built with new_section." };
        }
        if (!node.id) return { error: "section node has no id." };

        // Mark it as a global section and expand runtime → bp1..bp4 (renderer reads bpN).
        node.specials = { ...(node.specials || {}), global: type };
        const wrap = { sections: [node] };
        const validation: any = validatePage(wrap);
        if (!validation.valid) return { error: "Section failed validation.", validation };
        finalizeForRender(wrap);
        const finalNode = wrap.sections[0];

        // Resolve target pages + inject the node into each one's source.
        const allPages = await loadPages(api);
        const targets = page_ids && page_ids.length
          ? allPages.filter((p) => page_ids.includes(p.id))
          : allPages;
        if (!targets.length) return { error: "No matching pages to attach the global section to." };

        const changedPages = targets.map((p) => {
          injectNode(p.source, finalNode, type);
          return { id: p.id, name: p.name, source: JSON.stringify(p.source) };
        });
        const targetIds = targets.map((p) => p.id);

        const globalSection = {
          section_id: finalNode.id,
          name,
          type: TYPE_NUM[type],
          pages: targetIds,
          section: finalNode,
          status: "new",
          contents: [],
        };

        if (dry_run) {
          return {
            dry_run: true,
            section_id: finalNode.id,
            type,
            name,
            embeds_into_pages: targets.map((p) => ({ id: p.id, name: p.name })),
            page_count: targets.length,
            hint: "Call again with dry_run=false to create the global section and embed it. Then publish_site to take it live.",
          };
        }

        const changes = targetIds.reduce((o: any, id) => { o[id] = 1; return o; }, {});
        const res: any = await api.saveGlobalSections({ global_sections: [globalSection], pages: changedPages.map(({ id, source }) => ({ id, source })), changes });
        const ok = !!(res && (res.success || res.data));
        return {
          success: ok,
          section_id: finalNode.id,
          type,
          name,
          embedded_pages: targetIds.length,
          note: "Publish the site (publish_site) to take the new header/footer live.",
          raw: ok ? undefined : res,
        };
      })
  );

  server.tool(
    "delete_global_section",
    `Delete a global section (Header/Footer/block) and remove its node from every page source.
Two-step safety: dry_run=true (default) shows which pages would change; dry_run=false performs the atomic save.`,
    {
      section_id: z.string().describe("The global section's section_id (the section node id) — from list_global_sections."),
      dry_run: z.boolean().default(true).describe("Preview (true) or perform the delete + page cleanup (false)."),
    },
    ({ section_id, dry_run }) =>
      handle(async () => {
        const allPages = await loadPages(api);
        const affected = allPages.filter((p) => Array.isArray(p.source.sections) && p.source.sections.some((s: any) => s && s.id === section_id));

        if (dry_run) {
          return {
            dry_run: true,
            section_id,
            removes_from_pages: affected.map((p) => ({ id: p.id, name: p.name })),
            page_count: affected.length,
            hint: "Call again with dry_run=false to delete the global section and clean it out of those pages.",
          };
        }

        const changedPages = affected.map((p) => {
          p.source.sections = p.source.sections.filter((s: any) => !(s && s.id === section_id));
          return { id: p.id, source: JSON.stringify(p.source) };
        });
        const changes = affected.reduce((o: any, p) => { o[p.id] = 1; return o; }, {});
        const res: any = await api.saveGlobalSections({
          global_sections: [{ section_id, status: "delete", section: null }],
          pages: changedPages,
          changes,
        });
        const ok = !!(res && (res.success || res.data));
        return { success: ok, section_id, cleaned_pages: changedPages.length, note: "Publish the site to apply.", raw: ok ? undefined : res };
      })
  );
}

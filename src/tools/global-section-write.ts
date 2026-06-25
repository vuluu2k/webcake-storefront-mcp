import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { validatePage, finalizeForRender } from "../builder/page.js";
import { headerSection, footerSection, wireNavigation, type NavLink } from "../builder/templates.js";

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
    "scaffold_global_sections",
    `Generate a DESIGNED global Header and Footer in one call and embed them on every page —
the fast path to consistent site chrome. The header has logo + nav links + cart icon + CTA;
the footer has brand blurb + link columns + contact + copyright. Navigation is auto-wired to
real pages (Home/Products/Cart). Colours follow the site theme vars unless you pass a palette.
SKIPS a slot that already has a global section (won't create a second header/footer) unless
force=true. Two-step safety: dry_run=true (default) previews; dry_run=false performs the atomic save.`,
    {
      brand: z.string().describe("Shop / brand name shown as the logo and in the footer."),
      links: z.array(z.object({ label: z.string(), navTo: z.string().optional(), url: z.string().optional() })).optional().describe("Header nav links. navTo = a page slug ('home','collections','cart') auto-wired to open_page; url = external link. Defaults to Home/Products/Cart."),
      contact: z.object({ phone: z.string().optional(), email: z.string().optional(), address: z.string().optional() }).optional().describe("Real contact info for the footer (don't invent — omit what you don't have)."),
      cta: z.string().optional().describe("Header call-to-action button label (default 'Đặt mua ngay')."),
      palette: z.record(z.any()).optional().describe("Optional colour overrides { accent, onAccent, text, muted, surface, surfaceAlt, border }."),
      include: z.enum(["both", "header", "footer"]).default("both").describe("Which chrome to generate."),
      force: z.boolean().default(false).describe("Create even if a header/footer global already exists (otherwise that slot is skipped)."),
      dry_run: z.boolean().default(true).describe("Preview (true) or perform the atomic save (false)."),
    },
    ({ brand, links, contact, cta, palette, include, force, dry_run }) =>
      handle(async () => {
        // Which slots already have a global section? (dedupe by type unless force)
        const existingRes: any = await api.listGlobalSections().catch(() => null);
        const existing = (existingRes && (existingRes.data || existingRes.global_sections || existingRes)) || [];
        const slotTaken = (slot: string) =>
          Array.isArray(existing) && existing.some((g: any) => (g.slot || "").toLowerCase() === slot || TYPE_NUM[slot] === g.type);

        const wantHeader = include !== "footer";
        const wantFooter = include !== "header";
        const skipped: string[] = [];

        // Resolve slug -> page id for nav wiring + page embedding.
        const allPages = await loadPages(api);
        const slugToId: Record<string, string> = {};
        const pagesRes: any = await api.listPages();
        for (const pg of (pagesRes && pagesRes.data) || pagesRes || []) {
          const sl = (pg.slug || "").replace(/^\//, "");
          if (sl) slugToId[sl] = pg.id;
          if (pg.is_homepage) slugToId["home"] = pg.id;
        }

        // Build the finalized, nav-wired global nodes for each requested slot.
        const toCreate: Array<{ type: "header" | "footer"; name: string; node: any }> = [];
        const buildNode = (type: "header" | "footer", raw: any) => {
          raw.specials = { ...(raw.specials || {}), global: type };
          const wrap = { sections: [raw] };
          const validation: any = validatePage(wrap);
          if (!validation.valid) throw new Error(`${type} failed validation: ${JSON.stringify(validation.errors)}`);
          finalizeForRender(wrap);
          wireNavigation(wrap, slugToId); // resolve _navTo on header links/CTA
          return wrap.sections[0];
        };
        if (wantHeader) {
          if (!force && slotTaken("header")) skipped.push("header");
          else toCreate.push({ type: "header", name: "Header", node: buildNode("header", headerSection({ brand, links: links as NavLink[] | undefined, cta, palette })) });
        }
        if (wantFooter) {
          if (!force && slotTaken("footer")) skipped.push("footer");
          else toCreate.push({ type: "footer", name: "Footer", node: buildNode("footer", footerSection({ brand, contact, palette })) });
        }

        if (!toCreate.length) {
          return { success: true, created: [], skipped, note: skipped.length ? "Those slots already have a global section (pass force=true to add anyway)." : "Nothing to create." };
        }

        if (dry_run) {
          return {
            dry_run: true,
            will_create: toCreate.map((t) => ({ type: t.type, section_id: t.node.id })),
            skipped,
            embeds_into_pages: allPages.length,
            hint: "Call again with dry_run=false to create + embed the header/footer, then publish_site.",
          };
        }

        // Inject every node into every page, then one atomic /save with all globals + pages.
        for (const t of toCreate) for (const p of allPages) injectNode(p.source, t.node, t.type);
        const changedPages = allPages.map((p) => ({ id: p.id, source: JSON.stringify(p.source) }));
        const changes = allPages.reduce((o: any, p) => { o[p.id] = 1; return o; }, {});
        const global_sections = toCreate.map((t) => ({
          section_id: t.node.id, name: t.name, type: TYPE_NUM[t.type],
          pages: allPages.map((p) => p.id), section: t.node, status: "new", contents: [],
        }));
        const res: any = await api.saveGlobalSections({ global_sections, pages: changedPages, changes });
        const ok = !!(res && (res.success || res.data));
        return {
          success: ok,
          created: toCreate.map((t) => ({ type: t.type, section_id: t.node.id })),
          skipped,
          embedded_pages: changedPages.length,
          note: "Publish the site (publish_site) to take the header/footer live.",
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

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { PAGE_TYPE_NUM, PAGE_TYPE_FLAG, PAGE_KINDS, buildPageSeo } from "./builder.js";
import { validatePage, finalizeForRender, reassignIds } from "../builder/page.js";
import {
  createDraft,
  getDraft,
  setDraft,
  appendDraftSection,
  listDrafts,
  delDraft,
} from "../persistence/draft-cache.js";

// Friendly result when a draft is gone (disposable cache: expired ~2h or restart).
const DRAFT_EXPIRED = {
  error: "draft_expired",
  hint: "The draft is gone (expired ~2h or cache restart). Re-send the sections via start_page_draft + add_draft_section, or build_page directly.",
} as const;

// Accept a node as an object or a JSON string.
function parseSource(src: any): any {
  if (src == null) return null;
  return typeof src === "string" ? JSON.parse(src) : src;
}

function newPageId(res: any): string | null {
  return (res && res.data && res.data.id) || (res && res.id) || null;
}

/**
 * DURABLE PAGE-DRAFT CACHE.
 * An AI builds a page section-by-section into a LOCAL cache first (safe against
 * timeouts / dropped turns), then commits it to the backend INCREMENTALLY (one
 * section per request) so no single huge request can hit the 15s timeout. The
 * commit is RESUMABLE: a draft keeps its page_id + committed_count after a partial
 * commit, so re-running commit_page_draft continues from where it stopped.
 */
export function registerPageDraftTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "start_page_draft",
    `Start a page draft (no network). Build a multi-section page safely: cache each section with add_draft_section, then commit_page_draft persists it to the backend INCREMENTALLY (resumable on timeout). Use this instead of build_page for large/multi-section pages. The draft cache is DISPOSABLE (Redis on the remote server when REDIS_URL is set, in-memory otherwise; sliding ~2h TTL) — if a draft is ever lost, just re-send the sections, never a failure.`,
    {
      name: z.string().describe("Page name"),
      slug: z.string().describe("URL slug, e.g. '/landing' or '/about'"),
      type: z
        .enum(PAGE_KINDS)
        .optional()
        .describe(
          "Page kind. SPECIAL pages need a site data-source enabled on commit: store→use_store, member→use_member, blog→use_blog, error→use_error, maintain→use_maintain. 'main'/'custom' need nothing.",
        ),
      is_homepage: z.boolean().default(false).describe("Set as the site homepage on commit"),
      seo: z
        .object({
          title: z.string().optional(),
          description: z.string().optional(),
          keyword: z.string().optional(),
          favicon: z.string().optional(),
          thumbnail: z.string().optional(),
        })
        .optional()
        .describe("SEO for this page → settings.seo (applied on commit)."),
    },
    ({ name, slug, type, is_homepage, seo }) =>
      handle(async () => {
        const draft = await createDraft(api.siteId, { name, slug, type, is_homepage, seo });
        return {
          draft_id: draft.draft_id,
          meta: draft.meta,
          total_sections: 0,
          hint: "Add sections one at a time with add_draft_section (cached locally, can't time out), then commit_page_draft (dry_run to validate, then dry_run=false to persist incrementally).",
        };
      }),
  );

  server.tool(
    "add_draft_section",
    `Append ONE section to a local page draft (NO network — this is the durable per-section cache step that can't time out). The section is re-id'd to avoid collisions and quick-validated; warnings are surfaced but never block. Build the section with new_section.`,
    {
      draft_id: z.string().describe("Draft id from start_page_draft"),
      section: z.any().describe("A section node (from new_section) — object or JSON string"),
    },
    ({ draft_id, section }) =>
      handle(async () => {
        const draft = await getDraft(draft_id);
        if (!draft) return DRAFT_EXPIRED;

        const sectionNode = reassignIds(parseSource(section));
        if (!sectionNode || sectionNode.type !== "section") {
          return { error: "Provided 'section' is not a section node (type must be 'section')." };
        }

        const validation: any = validatePage({ sections: [sectionNode] });
        const updated = await appendDraftSection(draft_id, sectionNode);
        return {
          draft_id,
          section_id: sectionNode.id,
          total_sections: updated ? updated.sections.length : draft.sections.length,
          validation,
        };
      }),
  );

  server.tool(
    "get_page_draft",
    "Inspect a local page draft: its meta, the section ids, total section count, and (if a commit is in progress) the page_id + committed_count.",
    {
      draft_id: z.string().describe("Draft id"),
    },
    ({ draft_id }) =>
      handle(async () => {
        const draft = await getDraft(draft_id);
        if (!draft) return DRAFT_EXPIRED;
        return {
          draft_id: draft.draft_id,
          meta: draft.meta,
          section_ids: draft.sections.map((s: any) => s && s.id),
          total_sections: draft.sections.length,
          page_id: draft.page_id ?? null,
          committed_count: draft.committed_count ?? 0,
          updated_at: draft.created,
        };
      }),
  );

  server.tool(
    "list_page_drafts",
    "List local page drafts for the current site (summaries only: id, name, slug, type, section count, commit progress, updated_at).",
    {},
    () => handle(async () => ({ drafts: await listDrafts(api.siteId) })),
  );

  server.tool(
    "commit_page_draft",
    `Persist a local page draft to the backend INCREMENTALLY (one section per request, 120s timeout each) so no single huge request can time out.
dry_run=true (default) validates the assembled page and previews stats. dry_run=false creates the page then appends sections one at a time, saving progress after each.
RESUMABLE: if a request fails mid-commit, the draft keeps its page_id + committed_count — just call commit_page_draft again to continue from where it stopped.`,
    {
      draft_id: z.string().describe("Draft id from start_page_draft"),
      dry_run: z.boolean().default(true).describe("Validate+preview only (true) or create+persist incrementally (false)"),
    },
    ({ draft_id, dry_run }) =>
      handle(async () => {
        const draft = await getDraft(draft_id);
        if (!draft) return DRAFT_EXPIRED;

        const full = { sections: draft.sections };
        const validation: any = validatePage(full);
        const total = draft.sections.length;

        if (dry_run) {
          return { dry_run: true, draft_id, total_sections: total, validation, stats: validation.stats };
        }

        if (!validation.valid) {
          return { error: "Validation failed — not committing.", validation };
        }

        // Resolve numeric page type + the site data-source flag a special page needs.
        const kind = draft.meta.type || (draft.meta.is_homepage ? "main" : undefined);
        const typeNum = kind ? PAGE_TYPE_NUM[kind] : undefined;
        const requiredFlag = kind ? PAGE_TYPE_FLAG[kind] : undefined;
        if (requiredFlag) {
          try {
            await api.enableSiteFeature(requiredFlag);
          } catch (e) {
            return { error: `Could not enable site.settings.${requiredFlag} (needed for a '${kind}' page). ${(e as any)?.message ?? e}` };
          }
        }

        // Expand runtime -> bp1..bp4 so the saved nodes actually render.
        finalizeForRender(full);
        const finalizedSections: any[] = full.sections;

        try {
          // Create the page with only the FIRST section (a SMALL first request) if not already created.
          if (!draft.page_id) {
            const created = await api.createPage(
              { name: draft.meta.name, source: { sections: [finalizedSections[0]] }, ...(typeNum != null ? { type: typeNum } : {}) },
              { timeout: 120000 },
            );
            const pageId = newPageId(created);
            if (!pageId) return { error: "Page created but no id was returned.", created };
            draft.page_id = pageId;
            draft.committed_count = 1;
            await setDraft(draft);
          }

          // Append the remaining sections one at a time, saving progress after each.
          for (let i = draft.committed_count ?? 1; i < finalizedSections.length; i++) {
            await api.updatePageSource(
              draft.page_id!,
              { source: { sections: finalizedSections.slice(0, i + 1) } },
              { timeout: 120000 },
            );
            draft.committed_count = i + 1;
            await setDraft(draft);
          }

          // All sections committed → apply slug / homepage / SEO, then drop the draft.
          const seoBlock = draft.meta.seo ? buildPageSeo(draft.meta.seo) : null;
          if (draft.meta.slug || draft.meta.is_homepage || (seoBlock && Object.keys(seoBlock).length)) {
            await api
              .updatePage(draft.page_id!, {
                ...(draft.meta.slug ? { slug: draft.meta.slug } : {}),
                ...(draft.meta.is_homepage ? { is_homepage: true } : {}),
                ...(seoBlock && Object.keys(seoBlock).length ? { settings: { seo: seoBlock } } : {}),
              })
              .catch(() => {});
          }

          const pageId = draft.page_id!;
          await delDraft(draft_id);
          return { success: true, page_id: pageId, total_sections: total, stats: validation.stats };
        } catch (e) {
          const committed = draft.committed_count ?? 0;
          return {
            error: (e as any)?.message ?? String(e),
            page_id: draft.page_id ?? null,
            committed_sections: committed,
            remaining: total - committed,
            hint: "Re-run commit_page_draft to RESUME from where it stopped.",
          };
        }
      }),
  );

  server.tool(
    "clear_page_draft",
    "Delete a local page draft (does NOT delete any backend page already created from it).",
    {
      draft_id: z.string().describe("Draft id"),
    },
    ({ draft_id }) =>
      handle(async () => {
        await delDraft(draft_id);
        return { success: true };
      }),
  );
}

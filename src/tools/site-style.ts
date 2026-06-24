import { z } from "zod";
import { setConfig } from "../db.js";
import { resolvePreviewUrl } from "../config.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

const TEMPLATE_THEMES_URL = "https://api.storecake.io/api/v1/templates/list_themes";
const THEME_CATALOG_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

interface ThemeEntry {
  id: string;
  name: string;
  preview_url: string;
  thumbnail: string;
  categories: string[];
  site_id?: string; // the template's source site — duplicate it to create a site from this template
}

interface ThemeCatalogCache {
  at: number;
  map: Map<string, ThemeEntry>;
}

let _themeCatalogCache: ThemeCatalogCache | null = null;

async function fetchTemplateThemes({ page = 1, limit = 12, lang = "vi", q = "" } = {}): Promise<any> {
  const url = new URL(TEMPLATE_THEMES_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", lang);
  if (q) url.searchParams.set("q", q);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": lang,
        authorization: "Bearer null",
        origin: "https://webcake.io",
        referer: "https://webcake.io/",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`list_template_themes ${res.status}: ${body}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getThemeCatalog(force = false): Promise<Map<string, ThemeEntry>> {
  if (!force && _themeCatalogCache && Date.now() - _themeCatalogCache.at < THEME_CATALOG_TTL_MS) {
    return _themeCatalogCache.map;
  }
  const map = new Map<string, ThemeEntry>();
  let page = 1;
  const limit = 100;
  for (let i = 0; i < 5; i++) {
    const res = await fetchTemplateThemes({ page, limit });
    const themes: any[] = (res && res.themes) || [];
    for (const t of themes) {
      map.set(t.id, {
        id: t.id,
        name: t.name,
        preview_url: t.preview_url || "",
        thumbnail: t.thumbnail || "",
        categories: (t.categories || []).map((c: any) => c.name).filter(Boolean),
        site_id: (t.site && t.site.id) || undefined,
      });
    }
    if (themes.length < limit) break;
    page += 1;
  }
  _themeCatalogCache = { at: Date.now(), map };
  return map;
}

function parseThemeDescription(d: unknown): { description_vi: string; description_en: string } {
  if (typeof d !== "string") return { description_vi: "", description_en: "" };
  try {
    const j = JSON.parse(d);
    return {
      description_vi: (j.description_vi || "").slice(0, 600),
      description_en: (j.description_en || "").slice(0, 300),
    };
  } catch {
    return { description_vi: d.slice(0, 600), description_en: "" };
  }
}

export function registerSiteStyleTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "get_site_info",
    "Get full site information: name, domain, settings (colors, typography, layout, language, payment methods, etc.)",
    {},
    () =>
      handle(async () => {
        const res = await api.getSite();
        const site = (res && (res as any).data) || res;
        if (!site) return { error: "Site not found" };
        return {
          id: (site as any).id,
          name: (site as any).name,
          domain: (site as any).domain,
          custom_domain: (site as any).custom_domain || undefined,
          logo: (site as any).logo || undefined,
          favicon: (site as any).favicon || undefined,
          settings: (site as any).settings || {},
          created_at: (site as any).created_at,
        };
      })
  );

  server.tool(
    "list_themes",
    "List all custom themes of the site. Returns theme name, colors, typographies, transitions, and which one is active",
    {},
    () => handle(() => api.listThemes())
  );

  server.tool(
    "list_template_themes",
    "Search/list the public Webcake template marketplace (api.storecake.io). Use to match customer brief against existing templates by keyword. Returns id, name, preview_url, thumbnail, categories",
    {
      q: z.string().optional().describe("Keyword to search themes"),
      page: z.number().optional().describe("Page number (default 1)"),
      limit: z.number().optional().describe("Items per page (default 12)"),
      lang: z.string().optional().describe("Language code (default 'vi')"),
    },
    ({ q, page, limit, lang }) =>
      handle(async () => {
        const res = await fetchTemplateThemes({
          q: q || "",
          page: page || 1,
          limit: limit || 12,
          lang: lang || "vi",
        });
        const themes = ((res && res.themes) || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          preview_url: t.preview_url,
          thumbnail: t.thumbnail,
          categories: (t.categories || []).map((c: any) => c.name),
          preview_img:
            (t.site && t.site.preview_img && (t.site.preview_img["1920_1080"] || t.site.preview_img["430_932"])) ||
            null,
        }));
        return {
          page: res && res.page,
          limit: res && res.limit,
          total: res && res.total_entries,
          count: themes.length,
          themes,
        };
      })
  );

  server.tool(
    "semantic_search_themes",
    "Semantic search across the theme marketplace using bge-m3 embeddings (cosine similarity). Use when the brief is a natural-language description of industry + features (e.g. 'website mỹ phẩm có popup minigame và loyalty'), not just keywords. Returns top matches with theme_id, score, name, preview_url, thumbnail, description_vi/en",
    {
      query: z.string().describe("Natural-language description of the desired website (industry + features)"),
      limit: z.number().optional().describe("Number of matches to return (default 5, max 10)"),
    },
    ({ query, limit }) =>
      handle(async () => {
        const q = (query || "").trim();
        if (!q) return { error: "query is required" };
        const cap = Math.min(Math.max(limit || 5, 1), 10);

        const raw = await api.semanticSearchThemes(q);
        const pairs: any[] = Array.isArray(raw && (raw as any).results) ? (raw as any).results : [];

        let catalog: Map<string, ThemeEntry>;
        try {
          catalog = await getThemeCatalog();
        } catch {
          catalog = new Map();
        }

        const matches = pairs.slice(0, cap).map(([te, score]: [any, any]) => {
          const themeId = te && te.theme_id;
          const info = catalog.get(themeId) || ({} as Partial<ThemeEntry>);
          const desc = parseThemeDescription(te && te.description);
          return {
            theme_id: themeId,
            template_site_id: info.site_id || null, // pass to create_site_from_template
            score: typeof score === "number" ? Number(score.toFixed(4)) : null,
            name: info.name || null,
            preview_url: info.preview_url || null,
            thumbnail: info.thumbnail || null,
            categories: info.categories || [],
            description_vi: desc.description_vi,
            description_en: desc.description_en,
          };
        });

        return {
          query: q,
          count: matches.length,
          matches,
          hint: "Pick one and call create_site_from_template with its theme_id (or template_site_id) to clone it into a new editable site.",
        };
      })
  );

  server.tool(
    "create_site_from_template",
    `Create a NEW site by CLONING a marketplace template (all its pages + settings), so the
customer starts from a finished design and then edits it. Resolve a template with
semantic_search_themes / list_template_themes first, then pass its theme_id (or
template_site_id). After cloning, switch to the new site and edit layout/content with
update_page_element(s), colours/typography with the site-style tools, and republish.`,
    {
      name: z.string().describe("Name for the new site"),
      theme_id: z.string().optional().describe("Marketplace theme id (from semantic_search_themes / list_template_themes)"),
      template_site_id: z.string().optional().describe("The template's source site id (alternative to theme_id; semantic_search_themes returns it as template_site_id)"),
      slug: z.string().optional().describe("URL-safe slug for the new site (auto-generated if omitted)"),
      switch_to: z.boolean().default(true).describe("Switch the session to the new site after cloning (saved for next session)"),
    },
    ({ name, theme_id, template_site_id, slug, switch_to }) =>
      handle(async () => {
        // Resolve the template's source site id.
        let sourceSiteId = template_site_id;
        if (!sourceSiteId && theme_id) {
          const catalog = await getThemeCatalog().catch(() => new Map<string, ThemeEntry>());
          sourceSiteId = catalog.get(theme_id)?.site_id;
        }
        if (!sourceSiteId) {
          throw new Error("Could not resolve the template's source site. Pass template_site_id, or a theme_id that exists in the marketplace (list_template_themes / semantic_search_themes).");
        }

        // The duplicate endpoint returns success-only (no id), so snapshot the site list
        // first, clone, then resolve the new site by diff.
        const listIds = async () => {
          const r: any = await api.listMySites({ page: 1, limit: 100 }).catch(() => null);
          const arr = r?.data?.sites || r?.data || [];
          return Array.isArray(arr) ? arr : [];
        };
        const before = await listIds();
        const beforeIds = new Set(before.map((s: any) => s.id));

        try {
          await api.duplicateSite({ site_id: sourceSiteId, name, ...(slug ? { slug } : {}) });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("403")) throw new Error("Cannot create site: account site quota reached (free plan allows up to 4 sites).");
          throw new Error(`Cloning the template failed: ${msg}`);
        }

        const after = await listIds();
        const fresh = after.filter((s: any) => !beforeIds.has(s.id));
        const newSite = fresh.find((s: any) => s.name === name) || fresh[0];
        const newId = newSite?.id;
        if (!newId) throw new Error("Template was cloned but the new site could not be located in your site list — check list_my_sites.");

        let switched = false;
        let previewUrl: string | null = null;
        const previousSiteId = api.siteId;
        if (switch_to) {
          api.switchSite(newId);
          setConfig("site_id", newId);
          setConfig("site_name", newSite?.name || name);
          switched = true;
          previewUrl = await resolvePreviewUrl(api).catch(() => null);
        }

        return {
          success: true,
          site_id: newId,
          name: newSite?.name || name,
          from_template: { theme_id: theme_id || null, source_site_id: sourceSiteId },
          switched,
          ...(switched ? { current_site_id: api.siteId, previous_site_id: previousSiteId } : {}),
          preview_url: previewUrl,
          next_step: "Site cloned with all template pages. Edit content with search_page_elements + update_page_element(s), change colours/fonts via list_themes/site-style, then publish_site.",
        };
      })
  );
}

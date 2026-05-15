import { z } from "zod";

const TEMPLATE_THEMES_URL = "https://api.storecake.io/api/v1/templates/list_themes";
const THEME_CATALOG_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

let _themeCatalogCache = null;

async function fetchTemplateThemes({ page = 1, limit = 12, lang = "vi", q = "" } = {}) {
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

async function getThemeCatalog(force = false) {
  if (!force && _themeCatalogCache && Date.now() - _themeCatalogCache.at < THEME_CATALOG_TTL_MS) {
    return _themeCatalogCache.map;
  }
  const map = new Map();
  let page = 1;
  const limit = 100;
  for (let i = 0; i < 5; i++) {
    const res = await fetchTemplateThemes({ page, limit });
    const themes = (res && res.themes) || [];
    for (const t of themes) {
      map.set(t.id, {
        id: t.id,
        name: t.name,
        preview_url: t.preview_url || "",
        thumbnail: t.thumbnail || "",
        categories: (t.categories || []).map((c) => c.name).filter(Boolean),
      });
    }
    if (themes.length < limit) break;
    page += 1;
  }
  _themeCatalogCache = { at: Date.now(), map };
  return map;
}

function parseThemeDescription(d) {
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

export function registerSiteStyleTools(server, api, handle) {
  server.tool(
    "get_site_info",
    "Get full site information: name, domain, settings (colors, typography, layout, language, payment methods, etc.)",
    {},
    () =>
      handle(async () => {
        const res = await api.getSite();
        const site = (res && res.data) || res;
        if (!site) return { error: "Site not found" };
        return {
          id: site.id,
          name: site.name,
          domain: site.domain,
          custom_domain: site.custom_domain || undefined,
          logo: site.logo || undefined,
          favicon: site.favicon || undefined,
          settings: site.settings || {},
          created_at: site.created_at,
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
        const themes = ((res && res.themes) || []).map((t) => ({
          id: t.id,
          name: t.name,
          preview_url: t.preview_url,
          thumbnail: t.thumbnail,
          categories: (t.categories || []).map((c) => c.name),
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
        const pairs = Array.isArray(raw && raw.results) ? raw.results : [];

        let catalog;
        try {
          catalog = await getThemeCatalog();
        } catch {
          catalog = new Map();
        }

        const matches = pairs.slice(0, cap).map(([te, score]) => {
          const themeId = te && te.theme_id;
          const info = catalog.get(themeId) || {};
          const desc = parseThemeDescription(te && te.description);
          return {
            theme_id: themeId,
            score: typeof score === "number" ? Number(score.toFixed(4)) : null,
            name: info.name || null,
            preview_url: info.preview_url || null,
            thumbnail: info.thumbnail || null,
            categories: info.categories || [],
            description_vi: desc.description_vi,
            description_en: desc.description_en,
          };
        });

        return { query: q, count: matches.length, matches };
      })
  );
}

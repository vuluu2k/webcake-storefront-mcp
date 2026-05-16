import { z } from "zod";
import { getImageAlt, setImageAlts as dbSetImageAlts, listImageAlts, countImageAlts } from "../db.js";
import { isMongoEnabled, mongoUpsertAlts, mongoFindAlts, mongoListAlts } from "../mongo.js";

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico)(\?[^"')\s]*)?$/i;
const URL_IN_CSS_RE = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
const HTTP_URL_RE = /https?:\/\/[^\s"'<>)]+/g;

function isImageUrl(s) {
  if (typeof s !== "string") return false;
  if (s.startsWith("data:")) return false;
  return IMAGE_EXT_RE.test(s);
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.search = "";
    return url.toString().toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

function parseSource(raw) {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function getRoots(source) {
  if (!source) return [];
  if (source.sections) return source.sections;
  if (source.id) return [source];
  if (Array.isArray(source)) return source;
  return [];
}

function walkNodes(roots, fn) {
  function walk(n) {
    if (!n) return;
    fn(n);
    for (const c of n.children || []) walk(c);
  }
  for (const r of roots || []) walk(r);
}

function collectImagesFromValue(value, ctx, out) {
  if (typeof value === "string") {
    // CSS url(...) refs
    URL_IN_CSS_RE.lastIndex = 0;
    let m;
    while ((m = URL_IN_CSS_RE.exec(value)) !== null) {
      const u = m[1];
      if (u && !u.startsWith("data:")) out.push({ url: u, ...ctx });
    }

    const trimmed = value.trim();
    // Whole string is a URL/path image
    if (isImageUrl(trimmed) && (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/"))) {
      out.push({ url: trimmed, ...ctx });
      return;
    }

    // Image URLs embedded in HTML/longer text
    const matches = value.match(HTTP_URL_RE) || [];
    for (const u of matches) {
      if (isImageUrl(u)) out.push({ url: u, ...ctx });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectImagesFromValue(v, ctx, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) {
      if (k === "children") continue; // walked separately
      collectImagesFromValue(value[k], ctx, out);
    }
  }
}

function extractFromSource(source, sourceMeta) {
  const out = [];
  const roots = getRoots(source);
  walkNodes(roots, (node) => {
    const { children, ...rest } = node;
    collectImagesFromValue(rest, {
      source_type: sourceMeta.source_type,
      source_id: sourceMeta.source_id,
      source_name: sourceMeta.source_name,
      element_id: node.id || null,
      element_type: node.type || null,
    }, out);
  });
  return out;
}

export function registerImageTools(server, api, handle) {
  server.tool(
    "scan_unique_images",
    `Scan all images used across page sources, global sources, and global sections. Returns a unique list of image URLs with which elements use each one.
Useful for: image audit, finding broken/duplicated CDN URLs, bulk replace planning, theme migration.
Scans every string field in the source tree (config.src, style.background-image, etc.) and CSS url(...) refs — wide net catches all variants.`,
    {
      scope: z.enum(["all", "pages", "global_sources", "global_sections"]).default("all").describe("Which sources to scan"),
      page_id: z.string().optional().describe("Limit to one page (only used when scope is 'pages' or 'all')"),
      lazy: z.boolean().default(false).describe("Return only unique URL list, no usage tracking — faster for large sites"),
      include_relative: z.boolean().default(false).describe("Include relative-path images (e.g. /uploads/...). Default only http(s) URLs"),
    },
    ({ scope, page_id, lazy, include_relative }) =>
      handle(async () => {
        const all = [];
        const errors = [];

        if (scope === "all" || scope === "pages") {
          try {
            const res = await api.listPages();
            const pages = (res && res.data) || res || [];
            if (Array.isArray(pages)) {
              const targets = page_id ? pages.filter((p) => p.id === page_id) : pages;
              for (const p of targets) {
                const source = parseSource(p.source && p.source.source);
                if (!source) continue;
                all.push(...extractFromSource(source, {
                  source_type: "page",
                  source_id: p.id,
                  source_name: p.name,
                }));
              }
            }
          } catch (e) {
            errors.push(`pages: ${e.message}`);
          }
        }

        if (scope === "all" || scope === "global_sources") {
          try {
            const [gsRes, cartRes] = await Promise.all([
              api.getGlobalSources({}).catch(() => null),
              api.getSourceCart().catch(() => null),
            ]);
            const gsList = (gsRes && gsRes.data) || (Array.isArray(gsRes) ? gsRes : []) || [];
            const cartList = (cartRes && cartRes.data) || (Array.isArray(cartRes) ? cartRes : []) || [];
            for (const gs of [...gsList, ...cartList]) {
              const source = parseSource(gs.source);
              if (!source) continue;
              all.push(...extractFromSource(source, {
                source_type: "global_source",
                source_id: gs.id,
                source_name: gs.component || gs.type || `gs-${gs.id}`,
              }));
            }
          } catch (e) {
            errors.push(`global_sources: ${e.message}`);
          }
        }

        if (scope === "all" || scope === "global_sections") {
          try {
            const res = await api.listGlobalSections();
            const items = (res && res.data) || res || [];
            if (Array.isArray(items)) {
              for (const sec of items) {
                const raw = sec.source && typeof sec.source === "object" && sec.source.source
                  ? sec.source.source
                  : sec.source;
                const source = parseSource(raw);
                if (!source) continue;
                all.push(...extractFromSource(source, {
                  source_type: "global_section",
                  source_id: sec.id,
                  source_name: sec.name || sec.component || `section-${sec.id}`,
                }));
              }
            }
          } catch (e) {
            errors.push(`global_sections: ${e.message}`);
          }
        }

        const byUrl = new Map();
        for (const hit of all) {
          const raw = hit.url;
          if (!raw) continue;
          if (!include_relative && !/^https?:\/\//i.test(raw)) continue;
          const key = normalizeUrl(raw);
          if (!byUrl.has(key)) byUrl.set(key, { url: raw, used_in: [], _seen: new Set() });
          if (!lazy) {
            const entry = byUrl.get(key);
            const usageKey = `${hit.source_type}:${hit.source_id}:${hit.element_id}`;
            if (!entry._seen.has(usageKey)) {
              entry._seen.add(usageKey);
              entry.used_in.push({
                source_type: hit.source_type,
                source_id: hit.source_id,
                source_name: hit.source_name,
                element_id: hit.element_id,
                element_type: hit.element_type,
              });
            }
          }
        }

        const images = [...byUrl.values()].map((img) =>
          lazy
            ? { url: img.url }
            : { url: img.url, used_count: img.used_in.length, used_in: img.used_in }
        );

        return {
          scope,
          unique_count: images.length,
          total_references: all.length,
          ...(errors.length && { errors }),
          images,
        };
      })
  );

  // ── Image reader: fetch image bytes, return as MCP image content for vision-capable clients ──

  const DESCRIBE_HINT = `Describe the image with these fields, useful as input for new image generation:
- subject: main object / scene / person
- style: photography, illustration, 3D render, flat vector, watercolor, ...
- palette: 3–5 dominant colors (hex or names)
- composition: layout, framing, focal point
- mood: emotion or atmosphere
- lighting: natural / studio / golden hour / dramatic / soft / ...
- background: setting / environment
- notable_details: props, textures, typography, brand elements
Use these as building blocks when drafting an image-gen brief.`;

  async function fetchImageAsContent(url, maxSizeMb) {
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: "must be absolute http(s) URL" };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    let res;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, error: `fetch failed: ${e.message}` };
    }
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const ctype = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!ctype.startsWith("image/")) return { ok: false, error: `not an image (${ctype || "unknown"})` };
    const buf = Buffer.from(await res.arrayBuffer());
    const sizeMb = buf.length / (1024 * 1024);
    if (sizeMb > maxSizeMb) {
      return { ok: false, error: `image too large (${sizeMb.toFixed(2)}MB > ${maxSizeMb}MB)` };
    }
    return { ok: true, mime: ctype, data: buf.toString("base64"), size_kb: Math.round(buf.length / 1024) };
  }

  server.tool(
    "read_image",
    `Fetch an image URL and return its bytes for vision analysis by the AI client. Pair with scan_unique_images to inspect images already on the site.

After receiving the image, describe it (subject, style, palette, composition, mood, lighting, background, notable_details) to build an image-generation brief.

${DESCRIBE_HINT}`,
    {
      url: z.string().describe("Absolute http(s) image URL"),
      max_size_mb: z.number().default(8).describe("Reject images larger than this (default 8MB)"),
    },
    async ({ url, max_size_mb }) => {
      const r = await fetchImageAsContent(url, max_size_mb);
      if (!r.ok) {
        return { content: [{ type: "text", text: `Error: ${r.error}` }], isError: true };
      }
      return {
        content: [
          { type: "image", data: r.data, mimeType: r.mime },
          { type: "text", text: JSON.stringify({ url, mime: r.mime, size_kb: r.size_kb }) },
        ],
      };
    }
  );

  // ── Image element discovery + alt writer ──

  function isImageElement(node) {
    const t = (node && node.type) ? String(node.type).toLowerCase() : "";
    if (/image|img|picture|photo/i.test(t)) return true;
    // Check root + every breakpoint config for an image-bearing field
    const configs = [node && node.config];
    for (const k of Object.keys(node || {})) {
      if (/^bp\d+$/.test(k) && node[k] && typeof node[k] === "object") configs.push(node[k].config);
    }
    for (const cfg of configs) {
      if (!cfg || typeof cfg !== "object") continue;
      const candidates = [cfg.src, cfg.url, cfg.image && (cfg.image.src || cfg.image.url), cfg.background && (cfg.background.src || cfg.background.url)];
      if (candidates.some((v) => typeof v === "string" && isImageUrl(v))) return true;
    }
    return false;
  }

  /** Find src inside a config object (used per-breakpoint). Returns { src, sub_path } where sub_path is the leaf path inside config. */
  function findSrcInConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return { src: "", sub_path: "" };
    if (cfg.image && typeof cfg.image === "object") {
      const src = cfg.image.src || cfg.image.url || "";
      if (src) return { src, sub_path: "image.src" };
    }
    if (typeof cfg.src === "string" && isImageUrl(cfg.src)) {
      return { src: cfg.src, sub_path: "src" };
    }
    if (typeof cfg.url === "string" && isImageUrl(cfg.url)) {
      return { src: cfg.url, sub_path: "url" };
    }
    if (cfg.background && typeof cfg.background === "object") {
      const src = cfg.background.src || cfg.background.url || "";
      if (src) return { src, sub_path: "background.src" };
    }
    return { src: "", sub_path: "" };
  }

  /** Locate the src path. In this builder, config lives inside breakpoints (bp1, bp2...).
   * Walks bp1 → bp2 → ... → root.config as fallback. Alt is always at specials.image_alt. */
  function probeImagePaths(node) {
    const specials = (node && node.specials) || {};
    const alt_path = "specials.image_alt";
    const alt = specials.image_alt || specials.alt || "";

    // Iterate breakpoints in sorted order (bp1 first)
    const bpKeys = Object.keys(node || {})
      .filter((k) => /^bp\d+$/.test(k))
      .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));

    for (const bp of bpKeys) {
      const cfg = node[bp] && node[bp].config;
      const { src, sub_path } = findSrcInConfig(cfg);
      if (src) return { src, alt, src_path: `${bp}.config.${sub_path}`, alt_path };
    }

    // Fallback: root config (some legacy/non-responsive nodes)
    const { src, sub_path } = findSrcInConfig(node && node.config);
    if (src) return { src, alt, src_path: `config.${sub_path}`, alt_path };

    return { src: "", alt, src_path: "", alt_path };
  }

  function setByPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  }

  server.tool(
    "list_image_elements",
    `Find all image elements across pages + global sources, with element_id, current alt, src, and the field path where alt is/should be written. Use as the first step before generating alt text via vision (read_image) and writing back with set_image_alts.
Note: global_sections are read-only via the API and are not included.`,
    {
      scope: z.enum(["all", "pages", "global_sources"]).default("all").describe("Which sources to inspect"),
      page_id: z.string().optional().describe("Limit to one page (only used when scope is 'pages' or 'all')"),
      only_missing_alt: z.boolean().default(false).describe("Return only elements whose alt is empty"),
      limit: z.number().default(500).describe("Max elements to return"),
    },
    ({ scope, page_id, only_missing_alt, limit }) =>
      handle(async () => {
        const out = [];
        const errors = [];

        function visitSource(source, meta) {
          if (out.length >= limit) return;
          const roots = getRoots(source);
          walkNodes(roots, (node) => {
            if (out.length >= limit) return;
            if (!isImageElement(node)) return;
            const { src, alt, src_path, alt_path } = probeImagePaths(node);
            if (only_missing_alt && alt && alt.trim()) return;
            const cached = src ? getImageAlt(normalizeUrl(src)) : null;
            out.push({
              source_type: meta.source_type,
              source_id: meta.source_id,
              source_name: meta.source_name,
              element_id: node.id || null,
              element_type: node.type || null,
              src: src || null,
              alt: alt || "",
              src_path,
              alt_path,
              ...(cached && { cached_alt: cached.alt, cached_source: cached.source, cached_at: cached.updated_at }),
            });
          });
        }

        if (scope === "all" || scope === "pages") {
          try {
            const res = await api.listPages();
            const pages = (res && res.data) || res || [];
            if (Array.isArray(pages)) {
              const targets = page_id ? pages.filter((p) => p.id === page_id) : pages;
              for (const p of targets) {
                const source = parseSource(p.source && p.source.source);
                if (source) visitSource(source, { source_type: "page", source_id: p.id, source_name: p.name });
              }
            }
          } catch (e) { errors.push(`pages: ${e.message}`); }
        }

        if (scope === "all" || scope === "global_sources") {
          try {
            const [gsRes, cartRes] = await Promise.all([
              api.getGlobalSources({}).catch(() => null),
              api.getSourceCart().catch(() => null),
            ]);
            const gsList = (gsRes && gsRes.data) || (Array.isArray(gsRes) ? gsRes : []) || [];
            const cartList = (cartRes && cartRes.data) || (Array.isArray(cartRes) ? cartRes : []) || [];
            for (const gs of [...gsList, ...cartList]) {
              const source = parseSource(gs.source);
              if (source) visitSource(source, {
                source_type: "global_source",
                source_id: gs.id,
                source_name: gs.component || gs.type || `gs-${gs.id}`,
              });
            }
          } catch (e) { errors.push(`global_sources: ${e.message}`); }
        }

        return {
          scope,
          count: out.length,
          truncated: out.length >= limit,
          ...(errors.length && { errors }),
          elements: out,
        };
      })
  );

  function findNodeByIdInSource(source, elementId) {
    let found = null;
    const roots = getRoots(source);
    walkNodes(roots, (n) => { if (n.id === elementId) found = n; });
    return found;
  }

  server.tool(
    "set_image_alts",
    `Batch-write alt text for image elements across pages + global sources. Groups updates by source so each source is fetched + saved exactly once.
Workflow: list_image_elements → read_image (per src) → describe → set_image_alts(items).
If alt_path is omitted, it is auto-detected via the same probe used by list_image_elements (config.image.alt → config.alt → specials.alt).`,
    {
      items: z.array(z.object({
        source_type: z.enum(["page", "global_source"]).describe("Which source contains the element"),
        source_id: z.string().describe("Page ID or global source ID"),
        element_id: z.string().describe("Element ID"),
        alt: z.string().describe("Alt text to write"),
        alt_path: z.string().optional().describe("Dotted path inside the node, e.g. 'config.image.alt'. Omit to auto-detect"),
      })).min(1).describe("List of alt updates"),
      dry_run: z.boolean().default(false).describe("Preview the diff without saving"),
    },
    ({ items, dry_run }) =>
      handle(async () => {
        const groups = new Map();
        for (const it of items) {
          const key = `${it.source_type}:${it.source_id}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(it);
        }

        const results = [];

        for (const [key, group] of groups) {
          const [source_type, source_id] = key.split(":");
          let source = null;
          let saver = null;
          let existingLen = 0;
          let context = null;

          try {
            if (source_type === "page") {
              const pages = await api.listPages();
              const list = (pages && pages.data) || pages || [];
              const page = Array.isArray(list) ? list.find((p) => p.id === source_id) : null;
              if (!page) { results.push({ source_type, source_id, error: "Page not found" }); continue; }
              source = parseSource(page.source && page.source.source);
              if (!source) { results.push({ source_type, source_id, error: "Page has no source" }); continue; }
              existingLen = JSON.stringify(source).length;
              saver = (newSrc) => api.updatePageSource(source_id, { source: newSrc });
              context = { page };
            } else {
              const [gsRes, cartRes] = await Promise.all([
                api.getGlobalSources({}).catch(() => null),
                api.getSourceCart().catch(() => null),
              ]);
              const gsList = (gsRes && gsRes.data) || (Array.isArray(gsRes) ? gsRes : []) || [];
              const cartList = (cartRes && cartRes.data) || (Array.isArray(cartRes) ? cartRes : []) || [];
              const gs = [...gsList, ...cartList].find((g) => String(g.id) === String(source_id));
              if (!gs) { results.push({ source_type, source_id, error: "Global source not found" }); continue; }
              source = parseSource(gs.source);
              if (!source) { results.push({ source_type, source_id, error: "Global source has no source" }); continue; }
              existingLen = JSON.stringify(source).length;
              const isCart = gs.component === "cart-droppable";
              saver = (newSrc) =>
                isCart
                  ? api.updateSourceCart({ source: newSrc, type: gs.type, site_id: api.siteId })
                  : api.updateGlobalSource({ global_source_id: source_id, source: newSrc, type: gs.component, site_id: api.siteId });
              context = { gs };
            }
          } catch (e) {
            results.push({ source_type, source_id, error: `load failed: ${e.message}` });
            continue;
          }

          const perItem = [];
          for (const it of group) {
            const node = findNodeByIdInSource(source, it.element_id);
            if (!node) { perItem.push({ element_id: it.element_id, error: "Element not found" }); continue; }
            const probe = probeImagePaths(node);
            const path = it.alt_path || probe.alt_path;
            const before = path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), node);
            setByPath(node, path, it.alt);
            perItem.push({ element_id: it.element_id, alt_path: path, before: before == null ? "" : before, after: it.alt, _src: probe.src });
          }

          if (dry_run) {
            results.push({ source_type, source_id, dry_run: true, updates: perItem });
            continue;
          }

          const newLen = JSON.stringify(source).length;
          if (existingLen > 200 && newLen < existingLen * 0.5) {
            results.push({ source_type, source_id, error: `BLOCKED: source would shrink ${existingLen} → ${newLen}`, updates: perItem });
            continue;
          }

          try {
            await saver(source);
            // Auto-cache: save alt per src URL so re-runs can skip OCR
            const cacheBatch = [];
            for (const u of perItem) {
              if (u.error || !u._src) continue;
              if (!/^https?:\/\//i.test(u._src)) continue;
              cacheBatch.push({ url_key: normalizeUrl(u._src), url: u._src, alt: u.after, source: "ai" });
            }
            if (cacheBatch.length) {
              try { dbSetImageAlts(cacheBatch); } catch { /* cache best-effort */ }
              if (isMongoEnabled()) {
                mongoUpsertAlts(cacheBatch).catch(() => { /* fire-and-forget */ });
              }
            }
            results.push({
              source_type,
              source_id,
              success: true,
              updated: perItem.filter((u) => !u.error).length,
              cached: cacheBatch.length,
              updates: perItem.map(({ _src, ...rest }) => rest),
            });
          } catch (e) {
            results.push({ source_type, source_id, error: `save failed: ${e.message}`, updates: perItem.map(({ _src, ...rest }) => rest) });
          }
        }

        return { dry_run, sources: results.length, results };
      })
  );

  // ── Alt cache tools ──

  server.tool(
    "get_cached_image_alts",
    `Look up cached alt descriptions for image URLs. URLs are matched by normalized form (query string stripped, lowercase). Use BEFORE running read_image/OCR — skip already-described URLs.
When MONGO_URI is set, misses are then checked against MongoDB and successful hits are backfilled into the local SQLite cache for fast re-lookup.`,
    {
      urls: z.array(z.string()).min(1).describe("Image URLs to look up"),
    },
    ({ urls }) =>
      handle(async () => {
        const hits = [];
        let misses = [];
        const keyToUrl = new Map();

        for (const u of urls) {
          if (!/^https?:\/\//i.test(u)) { misses.push(u); continue; }
          const key = normalizeUrl(u);
          keyToUrl.set(key, u);
          const row = getImageAlt(key);
          if (row) hits.push({ url: u, url_key: key, alt: row.alt, source: row.source, updated_at: row.updated_at });
          else misses.push(u);
        }

        let mongo_hits = 0;
        if (isMongoEnabled() && misses.length) {
          const missKeys = misses
            .filter((u) => /^https?:\/\//i.test(u))
            .map((u) => normalizeUrl(u));
          try {
            const found = await mongoFindAlts(missKeys);
            if (found.size) {
              const backfill = [];
              const stillMissing = [];
              for (const u of misses) {
                const k = /^https?:\/\//i.test(u) ? normalizeUrl(u) : null;
                if (k && found.has(k)) {
                  const doc = found.get(k);
                  hits.push({ url: u, url_key: k, alt: doc.alt, source: doc.source || "mongo", updated_at: doc.updated_at, origin: "mongo" });
                  backfill.push({ url_key: k, url: doc.url || u, alt: doc.alt, source: doc.source || "mongo" });
                  mongo_hits++;
                } else {
                  stillMissing.push(u);
                }
              }
              if (backfill.length) {
                try { dbSetImageAlts(backfill); } catch { /* best-effort */ }
              }
              misses = stillMissing;
            }
          } catch { /* fall through with original misses */ }
        }

        return { hits_count: hits.length, miss_count: misses.length, mongo_hits, hits, misses };
      })
  );

  server.tool(
    "save_image_alts_cache",
    `Manually save image URL → alt entries to the local cache. Useful for bulk import or saving descriptions generated outside the set_image_alts flow.`,
    {
      items: z.array(z.object({
        url: z.string().describe("Image URL"),
        alt: z.string().describe("Alt/description text"),
        source: z.string().optional().describe("Origin tag (e.g. 'ai', 'manual', 'imported'). Default 'manual'"),
      })).min(1),
    },
    ({ items }) =>
      handle(async () => {
        const batch = [];
        const skipped = [];
        for (const it of items) {
          if (!/^https?:\/\//i.test(it.url)) { skipped.push({ url: it.url, reason: "non-http URL" }); continue; }
          batch.push({ url_key: normalizeUrl(it.url), url: it.url, alt: it.alt, source: it.source || "manual" });
        }
        if (batch.length) {
          dbSetImageAlts(batch);
          if (isMongoEnabled()) {
            mongoUpsertAlts(batch).catch(() => { /* fire-and-forget */ });
          }
        }
        return { saved: batch.length, skipped, mongo: isMongoEnabled() ? "queued" : "disabled" };
      })
  );

  server.tool(
    "list_image_alts_cache",
    `List entries in the alt cache, most recently updated first.`,
    {
      limit: z.number().default(100).describe("Max entries (default 100)"),
      offset: z.number().default(0).describe("Pagination offset"),
    },
    ({ limit, offset }) =>
      handle(async () => {
        const total = countImageAlts();
        const rows = listImageAlts(limit, offset);
        return { total, count: rows.length, entries: rows };
      })
  );

  // ── Mongo sync (active when MONGO_URI is set) ──

  server.tool(
    "sync_image_alts_to_mongo",
    `Push local SQLite alt cache entries up to MongoDB. Bulk upsert keyed by url_key. Use when you want to back up local-only entries to the shared central store, or after a session of heavy AI describes.
Requires MONGO_URI env var.`,
    {
      limit: z.number().default(1000).describe("Max entries to push per call"),
      offset: z.number().default(0).describe("Offset into local cache"),
    },
    ({ limit, offset }) =>
      handle(async () => {
        if (!isMongoEnabled()) return { error: "MONGO_URI not configured" };
        const rows = listImageAlts(limit, offset);
        if (!rows.length) return { pushed: 0, total_local: countImageAlts() };
        const res = await mongoUpsertAlts(rows.map((r) => ({ url_key: r.url_key, url: r.url, alt: r.alt, source: r.source })));
        return { pushed: rows.length, ...res, total_local: countImageAlts() };
      })
  );

  server.tool(
    "sync_image_alts_from_mongo",
    `Pull MongoDB alt entries down into local SQLite cache. Useful when starting on a new machine/site to warm the local cache from the central store.
Requires MONGO_URI env var.`,
    {
      limit: z.number().default(1000).describe("Max entries to pull"),
      offset: z.number().default(0).describe("Offset into Mongo collection"),
    },
    ({ limit, offset }) =>
      handle(async () => {
        if (!isMongoEnabled()) return { error: "MONGO_URI not configured" };
        const { total, entries } = await mongoListAlts(limit, offset);
        if (entries.length) {
          dbSetImageAlts(entries.map((e) => ({ url_key: e.url_key, url: e.url, alt: e.alt, source: e.source || "mongo" })));
        }
        return { pulled: entries.length, total_remote: total, total_local: countImageAlts() };
      })
  );

  server.tool(
    "read_images",
    `Batch fetch multiple image URLs in parallel. Use when comparing several references or extracting motifs across a set.
Capped at 5 images per call to keep context manageable. For each image, describe subject/style/palette/composition/mood; then synthesize common themes for the brief.

${DESCRIBE_HINT}`,
    {
      urls: z.array(z.string()).min(1).max(5).describe("1–5 absolute http(s) image URLs"),
      max_size_mb: z.number().default(8).describe("Per-image size cap in MB"),
    },
    async ({ urls, max_size_mb }) => {
      const results = await Promise.all(urls.map((u) => fetchImageAsContent(u, max_size_mb)));
      const content = [];
      const summary = [];
      for (let i = 0; i < urls.length; i++) {
        const r = results[i];
        if (!r.ok) {
          summary.push({ url: urls[i], error: r.error });
          continue;
        }
        content.push({ type: "image", data: r.data, mimeType: r.mime });
        summary.push({ url: urls[i], mime: r.mime, size_kb: r.size_kb });
      }
      content.push({ type: "text", text: JSON.stringify({ count: content.length - 0, images: summary }) });
      return { content };
    }
  );
}

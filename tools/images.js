import { z } from "zod";

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

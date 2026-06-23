import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico)(\?[^"')\s]*)?$/i;
const URL_IN_CSS_RE = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
const HTTP_URL_RE = /https?:\/\/[^\s"'<>)]+/g;

function isImageUrl(s: any): boolean {
  if (typeof s !== "string") return false;
  if (s.startsWith("data:")) return false;
  return IMAGE_EXT_RE.test(s);
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.search = "";
    return url.toString().toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

function parseSource(raw: any): any {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function getRoots(source: any): any[] {
  if (!source) return [];
  if (source.sections) return source.sections;
  if (source.id) return [source];
  if (Array.isArray(source)) return source;
  return [];
}

function walkNodes(roots: any[], fn: (n: any) => void): void {
  function walk(n: any): void {
    if (!n) return;
    fn(n);
    for (const c of n.children || []) walk(c);
  }
  for (const r of roots || []) walk(r);
}

function collectImagesFromValue(value: any, ctx: any, out: any[]): void {
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

function extractFromSource(source: any, sourceMeta: any): any[] {
  const out: any[] = [];
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

export function registerImageTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
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
            errors.push(`pages: ${(e as any).message}`);
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
            errors.push(`global_sources: ${(e as any).message}`);
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
            errors.push(`global_sections: ${(e as any).message}`);
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

  /** Resize raw image buffer with sharp so base64 output stays under targetBytes.
   * Skips svg/gif (sharp can't easily handle animation, svg is text). */
  async function shrinkImageBuffer(buf: any, ctype: string, targetRawBytes: number): Promise<{ buf: any; mime: string }> {
    if (ctype.includes("svg") || ctype.includes("gif")) return { buf, mime: ctype };
    try {
      const sharp = (await import("sharp")).default;
      let width = 1024;
      let quality = 80;
      let out = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality }).toBuffer();
      // Step down if still too big
      const steps = [[768, 70], [512, 60], [384, 50]];
      for (const [w, q] of steps) {
        if (out.length <= targetRawBytes) break;
        out = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: q }).toBuffer();
      }
      return { buf: out, mime: "image/jpeg" };
    } catch {
      return { buf, mime: ctype };
    }
  }

  async function fetchImageAsContent(url: string, maxSizeMb: number, opts: { targetBase64Kb?: number } = {}) {
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
      return { ok: false, error: `fetch failed: ${(e as any).message}` };
    }
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const ctype = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!ctype.startsWith("image/")) return { ok: false, error: `not an image (${ctype || "unknown"})` };
    let buf = Buffer.from(await res.arrayBuffer());
    const sizeMb = buf.length / (1024 * 1024);
    if (sizeMb > maxSizeMb) {
      return { ok: false, error: `image too large (${sizeMb.toFixed(2)}MB > ${maxSizeMb}MB)` };
    }

    // Target: base64 output should stay under (targetBase64Kb) → raw bytes = targetBase64Kb * 1024 * 0.75
    // Default 600KB base64 for single-image use; caller can override (batch uses smaller target).
    const targetBase64Kb = opts.targetBase64Kb || 600;
    const targetRawBytes = Math.floor(targetBase64Kb * 1024 * 0.75);
    let mime = ctype;
    if (buf.length > targetRawBytes) {
      const shrunk = await shrinkImageBuffer(buf, ctype, targetRawBytes);
      buf = shrunk.buf;
      mime = shrunk.mime;
    }

    return { ok: true, mime, data: buf.toString("base64"), size_kb: Math.round(buf.length / 1024), resized: mime !== ctype };
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
        return { content: [{ type: "text" as const, text: `Error: ${r.error}` }], isError: true };
      }
      return {
        content: [
          { type: "image" as const, data: r.data as string, mimeType: r.mime as string },
          { type: "text" as const, text: JSON.stringify({ url, mime: r.mime, size_kb: r.size_kb }) },
        ],
      };
    }
  );

  // ── Image element discovery + alt writer ──

  function isImageElement(node: any): boolean {
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
  function findSrcInConfig(cfg: any): { src: string; sub_path: string } {
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
  function probeImagePaths(node: any): { src: string; alt: string; src_path: string; alt_path: string } {
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

  function setByPath(obj: any, path: string, value: any): void {
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
        const out: any[] = [];
        const errors: string[] = [];

        function visitSource(source: any, meta: any): void {
          if (out.length >= limit) return;
          const roots = getRoots(source);
          walkNodes(roots, (node) => {
            if (out.length >= limit) return;
            if (!isImageElement(node)) return;
            const { src, alt, src_path, alt_path } = probeImagePaths(node);
            if (only_missing_alt && alt && alt.trim()) return;
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
          } catch (e) { errors.push(`pages: ${(e as any).message}`); }
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
          } catch (e) { errors.push(`global_sources: ${(e as any).message}`); }
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

  function findNodeByIdInSource(source: any, elementId: string): any {
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
              saver = (newSrc: any) => api.updatePageSource(source_id, { source: newSrc });
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
              saver = (newSrc: any) =>
                isCart
                  ? api.updateSourceCart({ source: newSrc, type: gs.type, site_id: api.siteId })
                  : api.updateGlobalSource({ global_source_id: source_id, source: newSrc, type: gs.component, site_id: api.siteId });
              context = { gs };
            }
          } catch (e) {
            results.push({ source_type, source_id, error: `load failed: ${(e as any).message}` });
            continue;
          }

          const perItem: any[] = [];
          for (const it of group) {
            const node = findNodeByIdInSource(source, it.element_id);
            if (!node) { perItem.push({ element_id: it.element_id, error: "Element not found" }); continue; }
            const probe = probeImagePaths(node);
            const path = it.alt_path || probe.alt_path;
            const before = path.split(".").reduce((acc: any, k: string) => (acc == null ? acc : acc[k]), node);
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
            results.push({
              source_type,
              source_id,
              success: true,
              updated: perItem.filter((u) => !u.error).length,
              updates: perItem.map(({ _src, ...rest }) => rest),
            });
          } catch (e) {
            results.push({ source_type, source_id, error: `save failed: ${(e as any).message}`, updates: perItem.map(({ _src, ...rest }) => rest) });
          }
        }

        return { dry_run, sources: results.length, results };
      })
  );

  // ── Combo: fetch images + metadata in one call so Claude can describe + call set_image_alts once ──

  server.tool(
    "fetch_images_for_alt_fill",
    `One-shot helper for filling image_alt across the site. Returns image bytes + element metadata in a single response so Claude can describe everything in one pass, then call set_image_alts once.

Workflow:
1. Call this tool with scope/limit.
2. Tool returns each image inline with its element_id + source_type + source_id.
3. Claude reads images, drafts an alt for each, then calls set_image_alts(items) once with the template at the end of the response.

The pre-built "items" template at the end contains placeholders — fill in "alt" and call set_image_alts.`,
    {
      scope: z.enum(["all", "pages", "global_sources"]).default("all"),
      page_id: z.string().optional(),
      only_missing_alt: z.boolean().default(true).describe("Default true — skip elements that already have alt"),
      limit: z.number().default(10).describe("Max images per call (cap 20)"),
      max_size_mb: z.number().default(8),
    },
    async ({ scope, page_id, only_missing_alt, limit, max_size_mb }) => {
      try {
        const cap = Math.min(Math.max(limit, 1), 20);

        // 1. Collect candidate elements
        const candidates: any[] = [];
        const addFromSource = (source: any, meta: any) => {
          const roots = getRoots(source);
          walkNodes(roots, (node) => {
            if (candidates.length >= cap * 3) return; // overscan, will filter
            if (!isImageElement(node)) return;
            const probe = probeImagePaths(node);
            if (only_missing_alt && probe.alt && probe.alt.trim()) return;
            if (!probe.src || !/^https?:\/\//i.test(probe.src)) return;
            candidates.push({
              source_type: meta.source_type,
              source_id: meta.source_id,
              source_name: meta.source_name,
              element_id: node.id,
              src: probe.src,
              alt_path: probe.alt_path,
            });
          });
        };

        if (scope === "all" || scope === "pages") {
          const res = await api.listPages();
          const pages = (res && res.data) || res || [];
          if (Array.isArray(pages)) {
            const targets = page_id ? pages.filter((p) => p.id === page_id) : pages;
            for (const p of targets) {
              const source = parseSource(p.source && p.source.source);
              if (source) addFromSource(source, { source_type: "page", source_id: p.id, source_name: p.name });
            }
          }
        }
        if (scope === "all" || scope === "global_sources") {
          const [gsRes, cartRes] = await Promise.all([
            api.getGlobalSources({}).catch(() => null),
            api.getSourceCart().catch(() => null),
          ]);
          const gsList = (gsRes && gsRes.data) || (Array.isArray(gsRes) ? gsRes : []) || [];
          const cartList = (cartRes && cartRes.data) || (Array.isArray(cartRes) ? cartRes : []) || [];
          for (const gs of [...gsList, ...cartList]) {
            const source = parseSource(gs.source);
            if (source) addFromSource(source, {
              source_type: "global_source",
              source_id: gs.id,
              source_name: gs.component || gs.type || `gs-${gs.id}`,
            });
          }
        }

        // 2. Take up to `cap` candidates that need a vision-generated description
        const needVision = [];
        for (const c of candidates) {
          needVision.push(c);
          if (needVision.length >= cap) break;
        }

        // 3. Fetch image bytes in parallel (budget ~950KB total / N images, base64)
        const perImageBase64Kb = needVision.length ? Math.max(60, Math.floor(950 / needVision.length)) : 600;
        const fetched = await Promise.all(needVision.map((c) => fetchImageAsContent(c.src, max_size_mb, { targetBase64Kb: perImageBase64Kb })));

        // 4. Build mixed content response
        const content: any[] = [];
        content.push({
          type: "text" as const,
          text: `Fetched ${needVision.length} image(s) needing description. ${Math.max(0, candidates.length - needVision.length)} more candidate(s) not included in this batch.

For each image below, write a short alt description in the language of the site (Vietnamese unless content suggests otherwise). Focus on the SUBJECT visible — avoid generic phrases like "image of...".

When done, call set_image_alts with the items array. The template is at the bottom of this response.`,
        });

        const visionItems: any[] = [];
        for (let i = 0; i < needVision.length; i++) {
          const c = needVision[i];
          const r = fetched[i];
          const header = `[#${i + 1}] element_id=${c.element_id} | source=${c.source_type}:${c.source_id} (${c.source_name}) | src=${c.src}`;
          content.push({ type: "text" as const, text: header });
          if (r.ok) {
            content.push({ type: "image" as const, data: r.data as string, mimeType: r.mime as string });
            visionItems.push({
              source_type: c.source_type,
              source_id: c.source_id,
              element_id: c.element_id,
              alt: "<FILL_ALT_FOR_#" + (i + 1) + ">",
            });
          } else {
            content.push({ type: "text" as const, text: `(fetch error: ${r.error})` });
          }
        }

        const template = {
          to_describe: visionItems,
          next_step: "Replace each <FILL_ALT_FOR_#N> with your description, then call set_image_alts with items = to_describe.",
        };
        content.push({ type: "text" as const, text: JSON.stringify(template, null, 2) });

        return { content };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as any).message}` }], isError: true };
      }
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
      const perImageBase64Kb = urls.length ? Math.max(60, Math.floor(950 / urls.length)) : 600;
      const results = await Promise.all(urls.map((u) => fetchImageAsContent(u, max_size_mb, { targetBase64Kb: perImageBase64Kb })));
      const content: any[] = [];
      const summary = [];
      for (let i = 0; i < urls.length; i++) {
        const r = results[i];
        if (!r.ok) {
          summary.push({ url: urls[i], error: r.error });
          continue;
        }
        content.push({ type: "image" as const, data: r.data as string, mimeType: r.mime as string });
        summary.push({ url: urls[i], mime: r.mime, size_kb: r.size_kb });
      }
      content.push({ type: "text" as const, text: JSON.stringify({ count: content.length - 0, images: summary }) });
      return { content };
    }
  );
}

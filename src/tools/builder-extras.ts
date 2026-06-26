import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { resolvePreviewUrl } from "../config.js";
import { getCachedUpload, setCachedUpload } from "../persistence/imageCache.js";
import { parse as parseHtml } from "node-html-parser";
import { stat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_IMG = /^image\/(jpe?g|png|webp)$/;
const LOCAL_MAX = 200 * 1024 * 1024; // 200 MB, matches the backend multipart limit

/** Is this entry a LOCAL filesystem path (vs an http(s) URL or data: URI)? */
function isLocalPath(s: string): boolean {
  if (s.startsWith("data:") || /^https?:\/\//i.test(s)) return false;
  return s.startsWith("file://") || s.startsWith("/") || s.startsWith("~") || /^[a-zA-Z]:[\\/]/.test(s);
}
/** Resolve ~ and file:// to an absolute path. */
function resolveLocalPath(s: string): string {
  if (s.startsWith("file://")) return fileURLToPath(s);
  if (s.startsWith("~")) return join(homedir(), s.slice(1));
  return s;
}
/** Read a local image file into a buffer (with a size cap) + guess its content type. */
async function readLocalImage(s: string): Promise<{ buf: Buffer; contentType: string }> {
  const p = resolveLocalPath(s);
  const st = await stat(p);
  if (st.size > LOCAL_MAX) throw new Error(`File too large (${st.size} bytes, max ${LOCAL_MAX}).`);
  const buf = await readFile(p);
  const ext = (p.split(".").pop() || "").toLowerCase();
  const contentType =
    ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : "application/octet-stream";
  return { buf, contentType };
}

/** Fetch a URL into a Buffer with a size cap. */
async function fetchBuffer(url: string, maxBytes = 15 * 1024 * 1024) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error(`Image too large (${ab.byteLength} bytes, max ${maxBytes}).`);
  return { buf: Buffer.from(ab), contentType: ct };
}

/** Ensure a buffer is jpeg/png/webp (the only types the CDN base64 endpoint accepts). */
async function toAllowedImage(buf: Buffer, contentType: string) {
  if (ALLOWED_IMG.test(contentType)) return { buf, contentType };
  const sharp = (await import("sharp")).default;
  const out = await sharp(buf).jpeg({ quality: 85 }).toBuffer();
  return { buf: out, contentType: "image/jpeg" };
}

/** Re-host one external image (http(s) URL or data: URI) on the WebCake CDN, with a
 *  per-site cache so the same source is never uploaded twice. Returns the hosted URL.
 *  The storefront only renders whitelisted (WebCake CDN) image domains, so every image
 *  used on a page/product MUST go through this — external URLs (Pexels, etc.) won't show. */
async function cdnUpload(api: WebcakeCmsApi, source: string): Promise<string> {
  const cached = await getCachedUpload(api.siteId, source);
  if (cached) return cached;
  let buf: Buffer, contentType: string;
  if (source.startsWith("data:")) {
    const m = source.match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) throw new Error("Malformed data URI.");
    contentType = m[1];
    buf = Buffer.from(m[2], "base64");
  } else {
    ({ buf, contentType } = await fetchBuffer(source));
  }
  const norm = await toAllowedImage(buf, contentType);
  const dataUri = `data:${norm.contentType};base64,${norm.buf.toString("base64")}`;
  const res: any = await api.uploadImageBase64({ base64: dataUri, content_type: norm.contentType });
  const hosted = (res && res.data) || (res && res.url) || null;
  if (!hosted) throw new Error("Upload returned no URL.");
  await setCachedUpload(api.siteId, source, hosted);
  return hosted;
}

export function registerBuilderExtraTools(
  server: McpServer,
  api: WebcakeCmsApi,
  handle: Handle,
  opts: { allowLocalFiles?: boolean } = {},
) {
  // ── Stock images (Pexels) ──────────────────────────────────────────────────
  server.tool(
    "search_images",
    `Search stock photos (Pexels) for a page/product. IMPORTANT: the storefront only renders
images served from the WebCake CDN (image domains are whitelisted) — raw Pexels URLs will
NOT display. By default this re-hosts each result on the WebCake CDN and returns a ready-to-use
cdn_url (cached, so repeats are free). Use cdn_url for image src / product images.
Requires the PEXELS_API_KEY environment variable.`,
    {
      query: z.string().describe("Subject to search, e.g. 'coffee shop interior'"),
      per_page: z.number().min(1).max(30).default(6).describe("How many results (default 6)"),
      orientation: z.enum(["landscape", "portrait", "square"]).optional().describe("Preferred orientation"),
      upload: z
        .boolean()
        .default(true)
        .describe("Re-host each result on the WebCake CDN and return cdn_url (default true — required for the image to show). Set false to only browse Pexels URLs."),
    },
    ({ query, per_page, orientation, upload }) =>
      handle(async () => {
        const key = process.env.PEXELS_API_KEY;
        if (!key) return { error: "PEXELS_API_KEY env var is not set. Add it to use stock image search." };

        const url = new URL("https://api.pexels.com/v1/search");
        url.searchParams.set("query", query);
        url.searchParams.set("per_page", String(per_page));
        if (orientation) url.searchParams.set("orientation", orientation);

        const res = await fetch(url, { headers: { Authorization: key } });
        if (!res.ok) return { error: `Pexels error ${res.status}` };
        const json: any = await res.json();
        let photos = (json.photos || []).map((p: any) => ({
          url: p.src && (p.src.large || p.src.original),
          thumbnail: p.src && p.src.medium,
          width: p.width,
          height: p.height,
          alt: p.alt || "",
          credit: p.photographer,
          source: p.url,
        }));

        if (upload) {
          photos = await Promise.all(
            photos.map(async (ph: any) => {
              try {
                return { ...ph, cdn_url: await cdnUpload(api, ph.url) };
              } catch (e: any) {
                return { ...ph, cdn_url: null, upload_error: e?.message ?? String(e) };
              }
            }),
          );
        }
        return {
          query,
          total_results: json.total_results,
          uploaded_to_cdn: upload,
          note: upload
            ? "Use each photo's cdn_url (WebCake-hosted) for image src / product images — NOT url (Pexels, not whitelisted)."
            : "These are Pexels URLs and will NOT render on the storefront. Run upload_images (or upload:true) to re-host them on the CDN first.",
          photos,
        };
      })
  );

  // ── Upload images to the site CDN ───────────────────────────────────────────
  server.tool(
    "upload_images",
    `Convert external image URLs, data: URIs, or LOCAL FILE PATHS into site-hosted CDN URLs by reading/downloading each image and re-uploading it to the WebCake backend. Use this whenever the user supplies their OWN images (their URLs or files from their machine), or a page is built from a reference HTML/URL. The returned CDN URLs go straight into an image element's specials.src / runtime.config.src, or a product/category image. This is REQUIRED for any external image (incl. Pexels search results) because the storefront only renders whitelisted WebCake-CDN image domains. Results are cached per site, so re-uploading the same source is free.
Processes up to 20 entries per call in parallel; non jpeg/png/webp inputs are converted to JPEG. UPLOADS BY DEFAULT (dry_run defaults to FALSE — this touches no account data): returns an "images" map (original source → hosted URL). Pass dry_run:true to only preview the entries that WOULD be processed (local paths report whether the file exists + its size) without any network/filesystem upload. Local file paths are only permitted when the MCP server runs locally (stdio); on the remote HTTP transport they are rejected per-entry.`,
    {
      urls: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe(
          "Image sources — 1–20 per call. Accepts: http(s) URLs, data:image/...;base64,... URIs, or local file paths (absolute /path, ~/path, file:// — stdio mode only).",
        ),
      dry_run: z
        .boolean()
        .default(false)
        .describe("Default FALSE — actually reads/downloads and uploads, returning hosted URLs. Set true to only preview what would be processed."),
    },
    ({ urls, dry_run }) =>
      handle(async () => {
        const deduped = [...new Set(urls)];
        const localAllowed = opts.allowLocalFiles === true;

        if (dry_run) {
          const entries = await Promise.all(
            deduped.map(async (entry) => {
              if (entry.startsWith("data:")) return { entry, kind: "data-uri" };
              if (isLocalPath(entry)) {
                if (!localAllowed)
                  return { entry, kind: "local", error: "Local file paths are only supported in stdio mode." };
                try {
                  const st = await stat(resolveLocalPath(entry));
                  return { entry, kind: "local", exists: true, size: st.size };
                } catch (e: any) {
                  return { entry, kind: "local", exists: false, error: e?.message ?? String(e) };
                }
              }
              return { entry, kind: "url" };
            }),
          );
          return { dry_run: true, count: deduped.length, entries };
        }

        const images: Record<string, string> = {};
        const errors: Array<{ url: string; error: string }> = [];
        await Promise.all(
          deduped.map(async (entry) => {
            try {
              if (isLocalPath(entry)) {
                if (!localAllowed)
                  throw new Error("Local file paths are only supported when the server runs locally (stdio). Send a public URL or data: URI instead.");
                const cached = await getCachedUpload(api.siteId, entry);
                if (cached) { images[entry] = cached; return; }
                const { buf, contentType } = await readLocalImage(entry);
                const norm = await toAllowedImage(buf, contentType);
                const dataUri = `data:${norm.contentType};base64,${norm.buf.toString("base64")}`;
                const res: any = await api.uploadImageBase64({ base64: dataUri, content_type: norm.contentType });
                const hosted = (res && res.data) || (res && res.url) || null;
                if (!hosted) throw new Error("Upload returned no URL.");
                await setCachedUpload(api.siteId, entry, hosted);
                images[entry] = hosted;
              } else {
                // http(s) URL or data: URI — cdnUpload handles fetch/convert/upload + cache.
                images[entry] = await cdnUpload(api, entry);
              }
            } catch (e: any) {
              errors.push({ url: entry, error: e?.message ?? String(e) });
            }
          }),
        );

        return {
          uploaded: Object.keys(images).length,
          failed: errors.length,
          images,
          ...(errors.length ? { errors } : {}),
        };
      })
  );

  // ── Publish the site ────────────────────────────────────────────────────────
  server.tool(
    "publish_site",
    `Publish the whole site live — snapshots all current page sources into the live (published) version.
Note: BuilderX publishes at the SITE level, not per page; publishing makes every saved page go live.
Two-step safety: dry_run=true (default) describes what will happen; dry_run=false actually publishes.`,
    {
      dry_run: z.boolean().default(true).describe("Preview (true) or publish for real (false)"),
    },
    ({ dry_run }) =>
      handle(async () => {
        const preview_url = await resolvePreviewUrl(api);
        if (dry_run) {
          return {
            dry_run: true,
            preview_url,
            note: "This will publish ALL saved pages of the site live. Call again with dry_run=false to publish.",
          };
        }
        // builderx_spa's Publish button sends `domain: this.link` (the site's live URL) in the
        // /publish body — without it the backend publishes to an expiring preview. preview_url
        // is exactly that link (resolvePreviewUrl == link(): primary_domain wins, else subdomain).
        const res = await api.publishSite(preview_url ? { domain: preview_url } : {});
        const data = (res && res.data) || res;
        return { success: true, published_at: data && data.published_at, site: data && data.name, preview_url };
      })
  );

  // ── Ingest reference HTML / URL into a blueprint ────────────────────────────
  function blueprintFromHtml(html: string) {
    const root = parseHtml(html, { blockTextElements: { script: false, style: false } });

    const text = (el: any) => (el ? el.text.replace(/\s+/g, " ").trim() : "");
    const attr = (sel: string, name: string) => {
      const el = root.querySelector(sel);
      return el ? el.getAttribute(name) : undefined;
    };

    const title = text(root.querySelector("title")) || attr('meta[property="og:title"]', "content");
    const description =
      attr('meta[name="description"]', "content") || attr('meta[property="og:description"]', "content");
    const ogImage = attr('meta[property="og:image"]', "content");

    const headings = root
      .querySelectorAll("h1, h2, h3")
      .map((h) => ({ level: h.tagName.toLowerCase(), text: text(h) }))
      .filter((h) => h.text)
      .slice(0, 40);

    const paragraphs = root
      .querySelectorAll("p")
      .map((p) => text(p))
      .filter((t) => t.length > 20)
      .slice(0, 40);

    const images = root
      .querySelectorAll("img")
      .map((img) => ({ src: img.getAttribute("src"), alt: img.getAttribute("alt") || "" }))
      .filter((i) => i.src && /^https?:\/\//.test(i.src))
      .slice(0, 40);

    const buttons = root
      .querySelectorAll("a, button")
      .map((b) => ({ text: text(b), href: b.getAttribute("href") || null }))
      .filter((b) => b.text && b.text.length < 40)
      .slice(0, 30);

    // Collect colours mentioned in inline styles (rough palette signal).
    const colors = new Set();
    for (const el of root.querySelectorAll("[style]")) {
      const style = el.getAttribute("style") || "";
      for (const m of style.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g)) colors.add(m[0]);
      if (colors.size > 24) break;
    }

    return {
      title,
      description,
      og_image: ogImage,
      headings,
      paragraphs,
      images,
      buttons,
      palette: [...colors].slice(0, 24),
      hint: "Rebuild this as BuilderX sections: map each heading group + its text/image/button into a new_section call. Generate fresh copy where useful; re-host external images with upload_images if you want them on the site CDN. This is a structural blueprint, not a 1:1 clone.",
    };
  }

  server.tool(
    "ingest_html",
    "Parse reference HTML into a structural blueprint (title, headings, paragraphs, images, buttons, colour palette) you can rebuild as BuilderX sections with new_section. Not a 1:1 clone.",
    {
      html: z.string().describe("Raw HTML to analyse"),
    },
    ({ html }) => handle(async () => blueprintFromHtml(html))
  );

  server.tool(
    "ingest_url",
    "Fetch a public URL and parse it into a structural blueprint (see ingest_html). Note: client-rendered (React/Vue) pages may return little content.",
    {
      url: z.string().describe("Public page URL to analyse"),
    },
    ({ url }) =>
      handle(async () => {
        const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "webcake-storefront-mcp" } });
        if (!res.ok) return { error: `Fetch failed (${res.status}).` };
        const html = await res.text();
        const blueprint: any = blueprintFromHtml(html);
        if (!blueprint.headings.length && !blueprint.paragraphs.length) {
          blueprint.warning = "Little text found — the page may be client-rendered (JS). Consider ingest_html with rendered source.";
        }
        return { url, status: res.status, ...blueprint };
      })
  );
}

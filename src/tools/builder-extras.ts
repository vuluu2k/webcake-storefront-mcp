import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { resolvePreviewUrl } from "../config.js";
import { parse as parseHtml } from "node-html-parser";

const ALLOWED_IMG = /^image\/(jpe?g|png|webp)$/;

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

export function registerBuilderExtraTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  // ── Stock images (Pexels) ──────────────────────────────────────────────────
  server.tool(
    "search_images",
    `Search stock photos (Pexels) to use on a page. Returns hosted image URLs you can put straight into an image element's runtime.config.src.
Requires the PEXELS_API_KEY environment variable.`,
    {
      query: z.string().describe("Subject to search, e.g. 'coffee shop interior'"),
      per_page: z.number().min(1).max(30).default(6).describe("How many results (default 6)"),
      orientation: z.enum(["landscape", "portrait", "square"]).optional().describe("Preferred orientation"),
    },
    ({ query, per_page, orientation }) =>
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
        const photos = (json.photos || []).map((p: any) => ({
          url: p.src && (p.src.large || p.src.original),
          thumbnail: p.src && p.src.medium,
          width: p.width,
          height: p.height,
          alt: p.alt || "",
          credit: p.photographer,
          source: p.url,
        }));
        return { query, total_results: json.total_results, photos };
      })
  );

  // ── Upload an image to the site CDN ─────────────────────────────────────────
  server.tool(
    "upload_image",
    `Upload an image to the site's CDN and get back a hosted URL. Accepts an http(s) URL or a data:image/...;base64 data URI. Non jpeg/png/webp inputs are converted to JPEG.
Use this for the user's own images; stock photos from search_images are already hosted and don't need uploading.`,
    {
      url: z.string().describe("http(s) URL or data:image/...;base64,... data URI"),
    },
    ({ url }) =>
      handle(async () => {
        let buf: Buffer, contentType: string;
        if (url.startsWith("data:")) {
          const m = url.match(/^data:([^;]+);base64,(.*)$/s);
          if (!m) return { error: "Malformed data URI." };
          contentType = m[1];
          buf = Buffer.from(m[2], "base64");
        } else {
          ({ buf, contentType } = await fetchBuffer(url));
        }

        const norm = await toAllowedImage(buf, contentType);
        const dataUri = `data:${norm.contentType};base64,${norm.buf.toString("base64")}`;
        const res = await api.uploadImageBase64({ base64: dataUri, content_type: norm.contentType });
        const hosted = (res && res.data) || (res && res.url) || null;
        if (!hosted) return { error: "Upload returned no URL.", raw: res };
        return { success: true, url: hosted, content_type: norm.contentType };
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
        const res = await api.publishSite({ is_publish: true });
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
      hint: "Rebuild this as BuilderX sections: map each heading group + its text/image/button into a new_section call. Generate fresh copy where useful; re-host external images with upload_image if you want them on the site CDN. This is a structural blueprint, not a 1:1 clone.",
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

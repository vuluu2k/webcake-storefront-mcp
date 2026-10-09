import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

/** The dashboard blog API answers with two different envelopes:
 *  /blog/articles/all        → { articles: { data: [...], total_entries, page, limit } }
 *  /blog/articles/{category} → { data: { articles: [...] } }
 *  Flatten both to a plain array. */
function pickArticles(res: any): any[] {
  const candidates = [
    res?.articles?.data,
    res?.articles,
    res?.data?.articles?.data,
    res?.data?.articles,
    res?.data?.data,
    res?.data,
    res,
  ];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

function summarizeArticle(a: any) {
  return {
    id: a.id || a._id,
    name: a.name,
    slug: a.slug,
    summary: a.summary || undefined,
    cover: (Array.isArray(a.images) && a.images[0]) || undefined,
    category_ids: Array.isArray(a.article_categories)
      ? a.article_categories.map((ac: any) => ac.category_id).filter(Boolean)
      : undefined,
    tags: a.tags && a.tags.length ? a.tags : undefined,
    is_hidden: a.is_hidden,
    published_at: a.render_inserted_at || undefined,
    inserted_at: a.inserted_at,
    updated_at: a.updated_at,
  };
}

/** "Cài đặt SEO" fields → the `meta_tags` property each one is stored under (same shape the
 *  dashboard's SEOBasic / SEOSocialShare panels write). */
const SEO_PROPS = {
  page_title: "page_title",
  meta_description: "meta_description",
  page_keywords: "page_keywords",
  og_title: "og:title",
  og_description: "og:description",
  og_image: "og:image",
} as const;

export const seoSchema = z
  .object({
    page_title: z.string().optional().describe("Title tag (~60 chars)"),
    meta_description: z.string().optional().describe("Meta description (~155 chars)"),
    page_keywords: z.string().optional().describe("Comma-separated keywords"),
    og_title: z.string().optional().describe("Social share title (og:title)"),
    og_description: z.string().optional().describe("Social share description (og:description)"),
    og_image: z.string().optional().describe("Social share image URL (og:image), must be hosted"),
  })
  .optional()
  .describe("SEO settings (\"Cài đặt SEO\"). Without these the site falls back to the whole post body as the meta description.");

/** set_article_seo replaces the whole meta_tags array, so merge into the existing tags:
 *  passed fields overwrite by property, "" removes one, everything else is kept. */
export function mergeSeoTags(seo: Record<string, string | undefined>, existing: any[] = []): any[] {
  const tags = [...existing];
  for (const [key, property] of Object.entries(SEO_PROPS)) {
    const content = seo[key];
    if (content === undefined) continue;
    const i = tags.findIndex((t) => (t?.props?.property || t?.props?.name) === property);
    if (i > -1) tags.splice(i, 1);
    if (content !== "") tags.push({ type: "meta", props: { property, content } });
  }
  return tags;
}

export function registerArticleTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_articles",
    `List blog articles (metadata only, without HTML content). Use get_article for the full content.
Pass term to search by title/slug. Pass category_id to list the posts filed under one blog category —
that view is the public one, so hidden posts and posts scheduled in the future are left out.`,
    {
      page: z.number().optional().describe("Page number (default 1)"),
      limit: z.number().optional().describe("Items per page (default 20)"),
      category_id: z.string().optional().describe("Filter by blog category id"),
      term: z.string().optional().describe("Search articles by title or slug"),
    },
    ({ page, limit, category_id, term }) =>
      handle(async () => {
        const res: any = category_id
          ? await api.listArticlesByCategory(category_id, { page, limit })
          : await api.listArticles({ page, limit, term });
        const articles = pickArticles(res);
        return {
          data: articles.map(summarizeArticle),
          total: res?.articles?.total_entries ?? articles.length,
          page: res?.articles?.page ?? page ?? 1,
          limit: res?.articles?.limit ?? limit ?? articles.length,
        };
      })
  );

  server.tool(
    "get_article",
    "Get article details by ID (includes the full HTML content)",
    {
      id: z.string().describe("Article ID"),
    },
    ({ id }) =>
      handle(async () => {
        const res: any = await api.getArticle(id);
        return (res && res.data) || res;
      })
  );

  server.tool(
    "create_article",
    `Create a blog article so blog/post pages (post-list, grid-blog, post-overlay) have content.
Built via the dashboard command pipeline: title + optional summary, HTML content, image URLs, and
category linkage. Pass category_ids from create_blog_category / list articles' categories so the
post shows up under those categories (it is also auto-filed under the default category). Image URLs
must be hosted (search_images / upload_images). The backend generates the id and slug.`,
    {
      name: z.string().describe("Article title"),
      content: z.string().optional().describe("HTML content of the post"),
      summary: z.string().optional().describe("Short summary / excerpt"),
      images: z.array(z.string()).optional().describe("Hosted image URLs; the first is the cover image"),
      category_ids: z.array(z.string()).optional().describe("Blog category IDs to file the post under (from create_blog_category)"),
      seo: seoSchema,
    },
    ({ name, content, summary, images, category_ids, seo }) =>
      handle(async () => {
        const id = randomUUID();
        const commands: any[] = [{ name: "create_article", data: { id, name } }];
        if (summary) commands.push({ name: "summary_article", data: { id, summary } });
        if (images && images.length) commands.push({ name: "image_article", data: { id, images } });
        if (content) commands.push({ name: "content_article", data: { id, content } });
        if (category_ids && category_ids.length)
          commands.push({ name: "bulk_add_category_to_article", data: { id, ids: category_ids } });
        if (seo) commands.push({ name: "set_article_seo", data: { id, meta_tags: mergeSeoTags(seo) } });

        await api.createBlogArticle(commands);
        return {
          success: true,
          article_id: id,
          name,
          categories: category_ids || [],
          cover: images?.[0] || null,
        };
      })
  );

  server.tool(
    "update_article",
    `Update a blog article. Only the fields you pass are changed — each one becomes a command in the
same dashboard pipeline create_article uses. NOTE: renaming regenerates the slug, so pass slug in
the SAME call if you want a custom one (it is applied after the rename).`,
    {
      id: z.string().describe("Article ID"),
      name: z.string().optional().describe("New title (regenerates the slug unless slug is also passed)"),
      slug: z.string().optional().describe("New custom slug"),
      content: z.string().optional().describe("New HTML content (replaces the old content)"),
      summary: z.string().optional().describe("New summary / excerpt"),
      images: z.array(z.string()).optional().describe("Hosted image URLs; the first is the cover image"),
      category_ids: z.array(z.string()).optional().describe("Blog category IDs to file the post under (added, existing ones are kept)"),
      remove_category_ids: z.array(z.string()).optional().describe("Blog category IDs to unfile the post from"),
      tags: z.array(z.string()).optional().describe("Article TAG IDs (uuids from the blog tag list) — not free text"),
      is_hidden: z.boolean().optional().describe("Hide from public"),
      published_at: z.string().optional().describe("Publish date, ISO/naive datetime (render_inserted_at)"),
      seo: seoSchema.describe("SEO settings to change; other existing SEO tags are kept. Pass \"\" to clear a field."),
    },
    ({ id, name, slug, content, summary, images, category_ids, remove_category_ids, tags, is_hidden, published_at, seo }) =>
      handle(async () => {
        const commands: any[] = [];
        // Order matters: name_article rewrites the slug, so the custom slug must come after it.
        if (name != null) commands.push({ name: "name_article", data: { id, name } });
        if (slug != null) commands.push({ name: "set_article_custom_slug", data: { id, custom_slug: slug } });
        if (summary != null) commands.push({ name: "summary_article", data: { id, summary } });
        if (content != null) commands.push({ name: "content_article", data: { id, content } });
        if (images) commands.push({ name: "image_article", data: { id, images } });
        if (tags) commands.push({ name: "set_article_tags", data: { id, article_tags: tags } });
        if (is_hidden != null) commands.push({ name: "set_article_visible", data: { id, is_hidden } });
        if (published_at != null)
          commands.push({ name: "set_article_render_inserted_at", data: { id, render_inserted_at: published_at } });
        if (category_ids && category_ids.length)
          commands.push({ name: "bulk_add_category_to_article", data: { id, ids: category_ids } });
        if (remove_category_ids && remove_category_ids.length)
          commands.push({ name: "bulk_remove_category_to_article", data: { id, ids: remove_category_ids } });
        if (seo) {
          const current: any = await api.getArticle(id);
          const existing = (current?.data || current)?.meta_tags || [];
          commands.push({ name: "set_article_seo", data: { id, meta_tags: mergeSeoTags(seo, existing) } });
        }

        if (!commands.length) throw new Error("Nothing to update — pass at least one field besides id.");

        await api.updateBlogArticle(commands);
        return { success: true, article_id: id, updated: commands.map((c) => c.name) };
      })
  );

  server.tool(
    "delete_article",
    "Delete blog articles (soft delete — they disappear from the site)",
    {
      id: z.string().optional().describe("Article ID"),
      ids: z.array(z.string()).optional().describe("Several article IDs to delete in one call"),
    },
    ({ id, ids }) =>
      handle(async () => {
        const list = [...(ids || []), ...(id ? [id] : [])].filter(Boolean);
        if (!list.length) throw new Error("Pass id or ids.");
        await api.deleteArticles(list);
        return { success: true, deleted: list };
      })
  );
}

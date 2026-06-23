import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

export function registerArticleTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_articles",
    "List blog articles (metadata only, without HTML content). Use get_article to get full content",
    {
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      category_id: z.string().optional().describe("Filter by category"),
    },
    ({ page, limit, category_id }) =>
      handle(async () => {
        const res = await api.listArticles({ page, limit, category_id });
        const articles = (res && (res as any).data) || res || [];
        if (!Array.isArray(articles)) return res;
        return {
          data: articles.map((a: any) => ({
            id: a.id || a._id,
            name: a.name,
            slug: a.slug,
            summary: a.summary || undefined,
            category_id: a.category_id || undefined,
            tags: a.tags || undefined,
            is_hidden: a.is_hidden,
            created_at: a.created_at,
            updated_at: a.updated_at,
          })),
          total: (res as any).total || articles.length,
        };
      })
  );

  server.tool(
    "get_article",
    "Get article details by ID",
    {
      id: z.string().describe("Article ID"),
    },
    ({ id }) => handle(() => api.getArticle(id))
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
    },
    ({ name, content, summary, images, category_ids }) =>
      handle(async () => {
        const id = randomUUID();
        const commands: any[] = [{ name: "create_article", data: { id, name } }];
        if (summary) commands.push({ name: "summary_article", data: { id, summary } });
        if (images && images.length) commands.push({ name: "image_article", data: { id, images } });
        if (content) commands.push({ name: "content_article", data: { id, content } });
        if (category_ids && category_ids.length)
          commands.push({ name: "bulk_add_category_to_article", data: { id, ids: category_ids } });

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
    "Update a blog article",
    {
      id: z.string().describe("Article ID"),
      name: z.string().optional().describe("New title"),
      slug: z.string().optional().describe("New slug"),
      content: z.string().optional().describe("New HTML content"),
      summary: z.string().optional().describe("New summary"),
      category_id: z.string().optional().describe("Category ID"),
      tags: z.array(z.string()).optional().describe("Tags"),
      is_hidden: z.boolean().optional().describe("Hide from public"),
    },
    ({ id, ...params }) => handle(() => api.updateArticle(id, params))
  );

  server.tool(
    "delete_article",
    "Delete a blog article",
    {
      id: z.string().describe("Article ID"),
    },
    ({ id }) => handle(() => api.deleteArticle(id))
  );
}

import { z } from "zod";
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
    "Create a new blog article",
    {
      name: z.string().describe("Article title"),
      slug: z.string().describe("URL slug"),
      content: z.string().describe("HTML content"),
      summary: z.string().optional().describe("Summary"),
      category_id: z.string().optional().describe("Category ID"),
      tags: z.array(z.string()).optional().describe("Tags"),
      images: z.array(z.string()).optional().describe("Image URLs"),
      is_hidden: z.boolean().default(false).describe("Hide from public"),
    },
    (params) => handle(() => api.createArticle(params))
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

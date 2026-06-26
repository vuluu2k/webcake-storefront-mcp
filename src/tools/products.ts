import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

export function registerProductTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_products",
    "List products of the site (metadata only: id, name, slug, price, image, status). Use get_product for full details",
    {
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      term: z.string().optional().describe("Search by product name"),
    },
    ({ page, limit, term }) =>
      handle(async () => {
        // Build a clean query — the /products/all endpoint 400s on undefined/blank keys,
        // so default page/limit and drop term unless it's a real search string.
        const query: any = { page: page ?? 1, limit: limit ?? 50 };
        if (term && term.trim()) query.term = term.trim();
        const res = await api.listProducts(query);
        // Real shape: { products:[…], total_product }. Fall back to data/array for safety.
        const products = (res && ((res as any).products || res.data)) || res || [];
        if (!Array.isArray(products)) return res;
        return {
          data: products.map((p: any) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            custom_id: p.custom_id || undefined,
            image: p.image || undefined,
            price: p.price || undefined,
            is_published: p.is_published,
            total_sold: p.total_sold || 0,
            rating: p.rating || undefined,
            categories: p.categories || undefined,
            updated_at: p.updated_at,
          })),
          total: (res as any).total_product ?? res.total ?? products.length,
        };
      })
  );

  server.tool(
    "get_product",
    "Get full product details by ID: name, description, price, variations, images, attributes, SEO, etc.",
    {
      id: z.string().describe("Product ID"),
    },
    ({ id }) => handle(() => api.getProduct(id))
  );

  server.tool(
    "search_products",
    "Search products by keyword. Returns matching products with basic info",
    {
      term: z.string().describe("Search keyword"),
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
    },
    ({ term, page, limit }) => handle(() => api.searchProducts({ term, page, limit }))
  );

  server.tool(
    "list_categories",
    "List all product categories of the site",
    {},
    () => handle(() => api.listCategories())
  );
}

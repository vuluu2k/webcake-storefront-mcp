import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Product-review app (Enum.Application product_review = 0). Install it first via
// install_app({ app: "product_review" }). Endpoints live under
// /applications/product_reviews/* and mirror the dashboard "Reviews" screen.

export function registerReviewTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_reviews",
    `List product reviews (admin view) for the current site. Requires the product_review app installed.
\`permission\` filters by moderation state (0 = approved/shown, 1 = pending). \`sort_by\`: "latest" | "oldest".`,
    {
      page: z.number().optional().describe("Page number (default 1)"),
      limit: z.number().optional().describe("Items per page (default 20)"),
      term: z.string().optional().describe("Search term (customer name / comment)"),
      permission: z.number().optional().describe("Moderation filter: 0=approved, 1=pending"),
      is_sync_pos: z.boolean().optional().describe("Only POS-synced reviews"),
      sort_by: z.enum(["latest", "oldest"]).optional().describe('Sort order (default "latest")'),
    },
    (query) =>
      handle(async () => {
        const res: any = await api.listReviews(query);
        return res?.data?.result ?? res?.result ?? res?.data ?? res;
      })
  );

  server.tool(
    "get_review",
    "Get one review (with its replies / nested data) by id.",
    { review_id: z.string().describe("Review id") },
    ({ review_id }) =>
      handle(async () => {
        const res: any = await api.getReview(review_id);
        return res?.data?.product_review ?? res?.product_review ?? res?.data ?? res;
      })
  );

  server.tool(
    "get_review_products",
    "List the products a review is attached to (by review id).",
    { review_id: z.string().describe("Review id") },
    ({ review_id }) =>
      handle(async () => {
        const res: any = await api.getReviewProducts(review_id);
        return res?.data?.products ?? res?.products ?? res?.data ?? res;
      })
  );

  server.tool(
    "create_or_update_review",
    `Create a new review, edit an existing one, or post a shop reply.
Omit \`id\` to create; include \`id\` to update. For a reply, set \`parent_id\` to the parent review id and \`is_shop: true\`.
\`product_ids\` attaches the review to products (sent as product_reviews entries). \`permission\`: 0 = approved/shown, 1 = pending.`,
    {
      id: z.string().optional().describe("Review id (omit to create)"),
      rating: z.number().min(0).max(5).optional().describe("Star rating 0–5"),
      title: z.string().optional().describe("Review title"),
      comment: z.string().optional().describe("Review body text"),
      customer_info: z.record(z.any()).optional().describe('Reviewer info, e.g. { "name": "...", "email": "...", "phone": "..." }'),
      images: z.array(z.string()).optional().describe("Image URLs attached to the review"),
      parent_id: z.number().optional().describe("Parent review id for a reply (default -1 = top-level)"),
      apply_to: z.number().optional().describe("Scope: 0 = specific products (default)"),
      is_shop: z.boolean().optional().describe("True when this is a shop reply"),
      permission: z.number().optional().describe("Moderation: 0 = approved/shown (default), 1 = pending"),
      categories: z.array(z.union([z.string(), z.number()])).optional().describe("Category ids the review applies to"),
      product_ids: z.array(z.string()).optional().describe("Product ids to attach the review to"),
      expand_data: z.record(z.any()).optional().describe("Extra structured data (optional)"),
    },
    ({ product_ids, categories, ...rest }) =>
      handle(() => {
        const body: any = { ...rest };
        body.parent_id = body.parent_id ?? -1;
        body.apply_to = body.apply_to ?? 0;
        body.permission = body.permission ?? 0;
        if (categories) body.categories = categories;
        if (product_ids) body.product_reviews = product_ids.map((product_id) => ({ product_id, is_removed: false, new: true }));
        return api.createOrUpdateReview(body);
      })
  );

  server.tool(
    "remove_reviews",
    "Delete one or more reviews by id.",
    { ids: z.array(z.string()).min(1).describe("Review ids to delete") },
    ({ ids }) => handle(() => api.removeReviews(ids)),
  );

  server.tool(
    "moderate_reviews",
    `Approve or hide reviews (change moderation status). \`permission\`: 0 = approved/shown, 1 = pending/hidden.`,
    {
      ids: z.array(z.string()).min(1).describe("Review ids to update"),
      permission: z.number().describe("0 = approved/shown, 1 = pending/hidden"),
    },
    ({ ids, permission }) => handle(() => api.updateReviewStatus({ ids, permission })),
  );
}

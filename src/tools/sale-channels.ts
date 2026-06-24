import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Sale-channels app: sitemap generation, partner product feeds (Google/Facebook/etc.),
// and catalog syncs. Google Ads / OAuth-connect flows are intentionally omitted —
// they require an externally-authorized Google/Facebook partner.

export function registerSaleChannelTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const unwrap = (res: any, key?: string) => (key && (res?.data?.[key] ?? res?.[key])) ?? res?.data ?? res;

  // ── Sitemap ──
  server.tool(
    "sync_sitemap",
    "Sync a resource type into the site's sitemap. Requires sitemap enabled in site settings.",
    { kind: z.enum(["products", "categories", "articles", "pages"]).describe("What to sync into the sitemap") },
    ({ kind }) => handle(() => api.sitemapSync(kind)),
  );
  server.tool(
    "rebuild_sitemap",
    "Rebuild the whole sitemap (async background job).",
    { type: z.string().optional().describe("Optional rebuild scope hint") },
    ({ type }) => handle(() => api.sitemapRebuild(type)),
  );

  // ── Partner feeds ──
  server.tool(
    "list_partner_feeds",
    "List product feeds for sale channels (Google Shopping, Facebook, etc.).",
    {
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      term: z.string().optional().describe("Search term"),
      type: z.string().optional().describe("Feed type filter"),
    },
    (query) => handle(async () => unwrap(await api.listPartnerFeeds(query), "partner_feeds")),
  );
  server.tool(
    "create_partner_feed",
    "Create a product feed. `name` is required; slug auto-generates. Optionally pass product_conditions to auto-populate.",
    {
      type: z.string().describe("Feed type, e.g. 'google', 'facebook'"),
      partner_feed: z.object({
        name: z.string().describe("Feed name"),
        slug: z.string().optional(),
        type: z.string().optional(),
        product_conditions: z.array(z.any()).optional().describe("Auto-include conditions"),
        condition_type: z.string().optional(),
        settings: z.record(z.any()).optional(),
        status: z.string().optional(),
      }).passthrough().describe("Feed object"),
      add_partner_product_feed_ids: z.array(z.string()).optional().describe("Product ids to add"),
      delete_partner_product_feed_ids: z.array(z.string()).optional().describe("Product ids to remove"),
    },
    (body) => handle(async () => unwrap(await api.createPartnerFeed(body), "partner_feed")),
  );
  server.tool(
    "update_partner_feed",
    "Update a product feed. `partner_feed.id` must match `partner_feed_id`.",
    {
      partner_feed_id: z.string().describe("Feed id (path)"),
      type: z.string().describe("Feed type"),
      partner_feed: z.record(z.any()).describe("Feed object incl. id"),
      add_partner_product_feed_ids: z.array(z.string()).optional(),
      delete_partner_product_feed_ids: z.array(z.string()).optional(),
    },
    ({ partner_feed_id, ...body }) => handle(async () => unwrap(await api.updatePartnerFeed(partner_feed_id, body), "partner_feed")),
  );
  server.tool(
    "delete_partner_feeds",
    "Delete product feeds by id.",
    { ids: z.array(z.string()).min(1).describe("Feed ids") },
    ({ ids }) => handle(() => api.deletePartnerFeeds(ids)),
  );
  server.tool(
    "list_partner_feed_products",
    "List the products inside a specific product feed.",
    {
      partner_feed_id: z.string().describe("Feed id"),
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      term: z.string().optional().describe("Search term"),
    },
    ({ partner_feed_id, ...query }) => handle(async () => unwrap(await api.listPartnerFeedProducts(partner_feed_id, query), "product_feeds")),
  );
  server.tool(
    "sync_partner_feed",
    "Publish/sync a feed's products to its destination channel.",
    { partner_feed_id: z.string().describe("Feed id") },
    ({ partner_feed_id }) => handle(() => api.syncPartnerFeed(partner_feed_id)),
  );

  // ── Google merchants (read) ──
  server.tool(
    "list_google_merchants",
    "List the Google Merchant records linked to the site (read-only).",
    { platform: z.number().optional().describe("Platform code (default 1 = google_merchant)") },
    (query) => handle(async () => unwrap(await api.listGoogleMerchants(query), "merchants")),
  );
}

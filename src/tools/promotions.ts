import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

const PROMOTION_TYPES = `
## Promotion Types (type field)
- "normal" — Standard product discount (fixed price or level-based)
- "same_price" — Fixed price for all items (đồng giá)
- "coupon" — Coupon/voucher code discount
- "coupon_id_multiple_times" — Reusable coupon code
- "discount_by_coupon_id" — Discount by coupon ID
- "promotion_order" — Order-level discount (by total amount)
- "promotion_category" — Category-level discount
- "x_get_y_prod" — Buy X get Y products free
- "x_get_y_category" — Buy X get Y from category free

## Promotion Classify (promotion_classify)
- "product" — Apply to specific products/variations
- "order" — Apply to entire order
- "category" — Apply to product categories
- "shipping" — Free shipping promotion

## Key Fields
- is_activated: whether promotion is currently active
- start_time / end_time: promotion schedule (UTC+7)
- priority_level: higher = applied first when conflicts
- coupon_info: coupon settings (code, max_uses, min_order, etc.)
- promo_code_info: promo code settings
- is_free_shipping: whether promotion gives free shipping
- level_order_prices: tiered discounts by order amount
- arr_level_promotion: tiered discount levels
- arr_price_promotion: tiered price discounts
- payment_methods: restrict to specific payment methods
- warehouse_ids: restrict to specific warehouses
- customer_tags: restrict to specific customer tags
- is_detail_time: has specific day/time scheduling
- is_hidden: hidden from storefront but still active
`;

export function registerPromotionTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_promotions",
    "List all promotions/discounts of the site (metadata only). Use get_promotion for full details",
    {
      page: z.number().optional().describe("Page number (default: 1)"),
      limit: z.number().optional().describe("Items per page (default: 20)"),
      include_guide: z.boolean().optional().describe("Include promotion type reference guide"),
    },
    ({ page, limit, include_guide }) =>
      handle(async () => {
        const res = await api.listPromotions({ page, limit });
        const promotions = (res && res.data) || [];
        const result: Record<string, any> = {
          data: Array.isArray(promotions)
            ? promotions.map((p: any) => ({
                id: p.id,
                name: p.name,
                type: p.type,
                promotion_classify: p.promotion_classify || undefined,
                is_activated: p.is_activated,
                start_time: p.start_time || undefined,
                end_time: p.end_time || undefined,
                priority_level: p.priority_level,
                is_free_shipping: p.is_free_shipping || undefined,
                is_hidden: p.is_hidden || undefined,
                coupon_info: p.coupon_info || undefined,
                used_count: p.used_count || 0,
                inserted_at: p.inserted_at,
              }))
            : promotions,
          total: res.total_entries || res.total || (Array.isArray(promotions) ? promotions.length : 0),
        };
        if (include_guide) result.guide = PROMOTION_TYPES.trim();
        return result;
      })
  );

  server.tool(
    "get_promotion",
    "Get full promotion details by ID: name, type, schedule, discount rules, coupon settings, items, bonus products, etc.",
    {
      id: z.string().describe("Promotion ID"),
    },
    ({ id }) =>
      handle(async () => {
        const res = await api.getPromotion(id);
        return (res && res.data && res.data.promotion) || (res && res.data) || res;
      })
  );

  server.tool(
    "get_promotion_items",
    "Get products/variations/categories attached to a promotion. Returns items with discount details (fixed_prices, level_info, coupon_item_info)",
    {
      id: z.string().describe("Promotion ID"),
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
    },
    ({ id, page, limit }) =>
      handle(async () => {
        const res = await api.getPromotionItems(id, { page, limit });
        return (res && res.data && res.data.result) || (res && res.data) || res;
      })
  );

  server.tool(
    "get_active_promotions",
    "Get all currently active promotions (is_activated=true and within start_time/end_time range)",
    {},
    () =>
      handle(async () => {
        const res = await api.getActivePromotions();
        // Real shape: { promotions:[…] } at the top level (not under data).
        const promotions = (res && ((res as any).promotions || (res.data && res.data.promotions) || res.data)) || [];
        return {
          data: Array.isArray(promotions)
            ? promotions.map((p: any) => ({
                id: p.id,
                name: p.name,
                type: p.type,
                promotion_classify: p.promotion_classify || undefined,
                is_activated: p.is_activated,
                start_time: p.start_time || undefined,
                end_time: p.end_time || undefined,
                priority_level: p.priority_level,
                is_free_shipping: p.is_free_shipping || undefined,
                coupon_info: p.coupon_info || undefined,
                level_order_prices: p.level_order_prices || undefined,
                arr_level_promotion: p.arr_level_promotion || undefined,
                arr_price_promotion: p.arr_price_promotion || undefined,
              }))
            : promotions,
          total: Array.isArray(promotions) ? promotions.length : 0,
        };
      })
  );

  server.tool(
    "search_promotions",
    "Search/filter promotions with advanced filters: by type, status (coming_soon/in_progress/finished), keyword, date range",
    {
      term: z.string().optional().describe("Search by promotion name"),
      type: z.string().optional().describe("Filter by type: normal, same_price, coupon, coupon_id_multiple_times, discount_by_coupon_id, promotion_order, promotion_category, x_get_y_prod, x_get_y_category"),
      status: z.number().optional().describe("Filter by time status: 1=coming_soon, 2=in_progress, 3=finished"),
      is_activated: z.boolean().optional().describe("Filter by active status"),
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
    },
    ({ term, type, status, is_activated, page, limit }) =>
      handle(async () => {
        const query: Record<string, any> = {};
        if (term) query.term = term;
        if (type) query.type = type;
        if (status != null) query.status = status;
        if (is_activated != null) query.is_activated = is_activated;
        if (page) query.page = page;
        if (limit) query.limit = limit;
        const res = await api.searchPromotions({ page: page ?? 1, limit: limit ?? 50 });
        let list: any[] = (res && (res.data?.result || res.data)) || [];
        if (!Array.isArray(list)) return res;
        // The /all endpoint doesn't filter, so apply the requested filters client-side.
        if (term) list = list.filter((p) => (p.name || "").toLowerCase().includes(term.toLowerCase()));
        if (type) list = list.filter((p) => p.type === type);
        if (status != null) list = list.filter((p) => p.time_status === status || p.status === status);
        if (is_activated != null) list = list.filter((p) => Boolean(p.is_activated) === is_activated);
        return { data: list, total: list.length, total_unfiltered: (res as any).total_entries };
      })
  );
}

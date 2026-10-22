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

/** /promotion_advance/all pages at 15 rows by default (builderx_api Tools.get_page_limit_from_params),
 *  so one call used to show 15 of 46 promotions — walk every page instead. */
const PAGE_SIZE = 100;
const MAX_ROWS = 2000; // ponytail: 20 pages max; a site past 2000 promotions gets `truncated: true`
export async function fetchAllPromotions(api: WebcakeCmsApi, query: Record<string, unknown> = {}) {
  const rows: any[] = [];
  let total = 0;
  for (let page = 1; rows.length < MAX_ROWS; page++) {
    const res: any = await api.listPromotions({ ...query, page, limit: PAGE_SIZE });
    const data: any[] = Array.isArray(res?.data) ? res.data : [];
    total = Number(res?.total_entries) || total;
    rows.push(...data);
    if (data.length < PAGE_SIZE || (total && rows.length >= total)) break;
  }
  return { rows: rows.slice(0, MAX_ROWS), total: total || rows.length };
}

/** Compact row: the list endpoint already carries pos_id + is_activated, so nobody needs get_promotion per row. */
export const promotionRow = (p: any) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  promotion_classify: p.promotion_classify || undefined,
  is_activated: p.is_activated,
  pos_id: p.pos_id || null, // non-null = linked/synced with Pancake POS
  start_time: p.start_time || undefined,
  end_time: p.end_time || undefined,
  priority_level: p.priority_level ?? undefined,
  is_free_shipping: p.is_free_shipping || undefined,
  is_hidden: p.is_hidden || undefined,
  used_count: p.used_count || 0,
  inserted_at: p.inserted_at,
});

/** Totals the model is usually asked for, so it never has to count rows itself. */
export function summarizePromotions(rows: any[], total: number) {
  const linked = rows.filter((p) => p.pos_id).length;
  return {
    total,
    returned: rows.length,
    ...(rows.length < total ? { truncated: true } : {}),
    linked_pos: linked,
    not_linked_pos: rows.length - linked,
    activated: rows.filter((p) => p.is_activated).length,
  };
}

export function registerPromotionTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_promotions",
    `List ALL promotions/discounts of the site (every page is fetched for you). Each row has id, name, type,
is_activated, pos_id (non-null = linked/synced with POS), start/end time. The summary answers "how many promotions /
how many synced with POS / how many active" in ONE call — do not call get_promotion per row for that.
Use get_promotion only for one promotion's full rules.`,
    {
      include_guide: z.boolean().optional().describe("Include promotion type reference guide"),
    },
    ({ include_guide }) =>
      handle(async () => {
        const { rows, total } = await fetchAllPromotions(api);
        const data = rows.map(promotionRow);
        const result: Record<string, any> = { summary: summarizePromotions(data, total), data };
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
    "Search/filter ALL promotions (every page): by keyword, type, time status (coming_soon/in_progress/finished), active flag. Rows carry pos_id (non-null = synced with POS)",
    {
      term: z.string().optional().describe("Search by promotion name"),
      type: z.string().optional().describe("Filter by type: normal, same_price, coupon, coupon_id_multiple_times, discount_by_coupon_id, promotion_order, promotion_category, x_get_y_prod, x_get_y_category"),
      status: z.number().optional().describe("Filter by time status: 1=coming_soon, 2=in_progress, 3=finished"),
      is_activated: z.boolean().optional().describe("Filter by active status"),
    },
    ({ term, type, status, is_activated }) =>
      handle(async () => {
        // term + is_activated filter server-side; type/status are applied here (the backend's `types`
        // filter wants a list, which a query string can't carry).
        const query: Record<string, unknown> = {};
        if (term && term.trim()) query.term = term.trim();
        if (is_activated != null) query.is_activated = is_activated;
        let list = (await fetchAllPromotions(api, query)).rows;
        if (type) list = list.filter((p) => p.type === type);
        if (status != null) list = list.filter((p) => p.time_status === status || p.status === status);
        const data = list.map(promotionRow);
        return { summary: summarizePromotions(data, data.length), data };
      })
  );
}

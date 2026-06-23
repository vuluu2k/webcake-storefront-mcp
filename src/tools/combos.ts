import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

const COMBO_GUIDE = `
## Combo Product Types

### By item matching:
- is_variation=true — Variation-based: combo requires specific product variations
- is_variation=false — Product-based: combo requires specific products (any variation)
- is_categories=true — Category-based: combo requires items from specific categories with quantities

### Discount types:
- discount_amount > 0 — Fixed discount amount off combo price
- is_use_percent=true — Percentage discount (discount_by_percent %), capped by max_discount_by_percent
- is_value_combo=true — Fixed total price for combo (value_combo)
- is_free_shipping=true — Combo includes free shipping

### Key Fields:
- name: combo display name
- slug: URL-friendly identifier
- is_activated: whether combo is currently active
- start_time / end_time: combo schedule (UTC+7)
- images: combo images array
- categories: for category-based combos, array of {id, name, count} specifying required categories and quantities
- combo_product_variations: items that make up the combo (products/variations with count)
- bonus_items: free/bonus products included with the combo
`;

export function registerComboTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_combos",
    "List all combo/bundle products of the site. Use get_combo_items for combo composition details",
    {
      page: z.number().optional().describe("Page number (default: 1)"),
      limit: z.number().optional().describe("Items per page (default: 20)"),
      term: z.string().optional().describe("Search by combo name"),
      include_guide: z.boolean().optional().describe("Include combo type reference guide"),
    },
    ({ page, limit, term, include_guide }) =>
      handle(async () => {
        const res = await api.listCombos({ page, limit, term });
        const combos = (res && res.combo_products) || (res && res.data) || [];
        const result: Record<string, any> = {
          data: Array.isArray(combos)
            ? combos.map((c: any) => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
                custom_id: c.custom_id || undefined,
                is_activated: c.is_activated,
                is_variation: c.is_variation,
                is_categories: c.is_categories || undefined,
                discount_amount: c.discount_amount || undefined,
                is_use_percent: c.is_use_percent || undefined,
                discount_by_percent: c.discount_by_percent || undefined,
                max_discount_by_percent: c.max_discount_by_percent || undefined,
                is_value_combo: c.is_value_combo || undefined,
                value_combo: c.value_combo || undefined,
                is_free_shipping: c.is_free_shipping || undefined,
                start_time: c.start_time || undefined,
                end_time: c.end_time || undefined,
                images: c.images || undefined,
                categories: c.categories || undefined,
                inserted_at: c.inserted_at,
              }))
            : combos,
          total: res.total || (Array.isArray(combos) ? combos.length : 0),
        };
        if (include_guide) result.guide = COMBO_GUIDE.trim();
        return result;
      })
  );

  server.tool(
    "get_combo_items",
    "Get items (products/variations) and bonus products that compose a combo. Returns combo_items (required items with count) and bonus_items (free gifts)",
    {
      combo_product_id: z.string().describe("Combo product ID"),
      is_variation_bonus: z.boolean().optional().describe("Whether bonus items are variation-based"),
    },
    ({ combo_product_id, is_variation_bonus }) =>
      handle(async () => {
        const res = await api.getComboItems(combo_product_id, { is_variation_bonus });
        return (res && res.data && res.data.data) || (res && res.data) || res;
      })
  );
}

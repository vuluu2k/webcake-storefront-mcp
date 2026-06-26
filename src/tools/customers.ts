import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

export function registerCustomerTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_customers",
    "List/search the site's customers (browse or segment). Pass `term` to search by name/phone/email. Returns name, phone, email, order_count, purchased_amount, reward_point, tags, last_order_at. Use find_customer for an exact id/phone/email lookup.",
    {
      page: z.number().optional().describe("Page number (default 1)"),
      limit: z.number().optional().describe("Items per page (default 50)"),
      term: z.string().optional().describe("Keyword — searches name / phone / email"),
    },
    ({ page, limit, term }) =>
      handle(async () => {
        const query: any = { page: page ?? 1, limit: limit ?? 50 };
        if (term && term.trim()) query.term = term.trim();
        const res: any = await api.listCustomers(query);
        // Real shape: { customers: { data:[…], total_entries } }.
        const box = (res && res.customers) || res || {};
        const list = (Array.isArray(box) ? box : box.data) || [];
        if (!Array.isArray(list)) return res;
        return {
          data: list.map((c: any) => ({
            id: c.id,
            name: c.name,
            phone_number: c.phone_number || c.recent_phone_number || undefined,
            email: c.email || undefined,
            order_count: c.order_count ?? undefined,
            succeed_order_count: c.succeed_order_count ?? undefined,
            purchased_amount: c.purchased_amount ?? undefined,
            reward_point: c.reward_point ?? undefined,
            tags: c.tags && c.tags.length ? c.tags : undefined,
            last_order_at: c.last_order_at || undefined,
          })),
          total: (box.total_entries ?? res.total) || list.length,
        };
      })
  );

  server.tool(
    "find_customer",
    "Find a customer by ID, phone number, or email",
    {
      by: z.enum(["id", "phone", "email"]).describe("Search field"),
      value: z.string().describe("Search value"),
    },
    ({ by, value }) =>
      handle(() => {
        switch (by) {
          case "id": return api.findCustomerById(value);
          case "phone": return api.findCustomerByPhone(value);
          case "email": return api.findCustomerByEmail(value);
        }
      })
  );
}

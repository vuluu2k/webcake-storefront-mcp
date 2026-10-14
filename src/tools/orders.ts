import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

/** builderx_api Enum.OrderStatus (lib/builderx_api/enum.ex). */
const ORDER_STATUS: Record<number, string> = {
  0: "new", 1: "submitted", 2: "shipped", 3: "delivered", 4: "returning", 5: "returned", 6: "canceled",
  7: "removed", 8: "packing", 9: "pending", 11: "waiting", 12: "wait_print", 13: "printed",
  15: "part_returned", 16: "received_money", 17: "wait_submit", 20: "ordered", 22: "draft", 50: "blocked",
};
const STATUS_HELP = Object.entries(ORDER_STATUS).map(([k, v]) => `${k}=${v}`).join(", ");

export function registerOrderTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_orders",
    "List orders of the site (metadata only). Use get_order for full details including items",
    {
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      status: z.number().optional().describe(`Filter by status: ${STATUS_HELP}. Omit or -1 = all (except removed/blocked).`),
    },
    ({ page, limit, status }) =>
      handle(async () => {
        const res = await api.listOrders({ page, limit, status });
        // Real shape: { orders: { data:[…], total_entries, count_status } }.
        const orders = (res && ((res as any).orders?.data || res.data)) || res || [];
        if (!Array.isArray(orders)) return res;
        return {
          data: orders.map((o: any) => ({
            id: o.id,
            bill_full_name: o.bill_full_name,
            bill_phone_number: o.bill_phone_number,
            status: o.status,
            status_name: ORDER_STATUS[o.status] ?? null,
            payment_status: o.payment_status,
            payment_method: o.payment_method,
            invoice_value: o.invoice_value || o.total,
            items_count: (o.order_items || o.items || []).length,
            created_at: o.created_at,
            updated_at: o.updated_at,
          })),
          total: (res as any).orders?.total_entries ?? res.total ?? orders.length,
          ...(( res as any).orders?.count_status ? { count_status: (res as any).orders.count_status } : {}),
        };
      })
  );

  server.tool(
    "get_order",
    "Get full order details by ID: customer info, items, payment, shipping, discounts, etc.",
    {
      id: z.string().describe("Order ID"),
    },
    ({ id }) => handle(() => api.getOrder(id))
  );

  server.tool(
    "count_orders_by_status",
    "Get order count grouped by status. Useful for dashboard overview",
    {},
    () => handle(() => api.countOrdersByStatus())
  );
}

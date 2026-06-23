import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

export function registerOrderTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_orders",
    "List orders of the site (metadata only). Use get_order for full details including items",
    {
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      status: z.number().optional().describe("Filter by status (0=pending, 50=confirmed, 100=shipping, 150=delivered, -1=cancelled)"),
    },
    ({ page, limit, status }) =>
      handle(async () => {
        const res = await api.listOrders({ page, limit, status });
        const orders = (res && res.data) || res || [];
        if (!Array.isArray(orders)) return res;
        return {
          data: orders.map((o: any) => ({
            id: o.id,
            bill_full_name: o.bill_full_name,
            bill_phone_number: o.bill_phone_number,
            status: o.status,
            payment_status: o.payment_status,
            payment_method: o.payment_method,
            invoice_value: o.invoice_value || o.total,
            items_count: (o.order_items || o.items || []).length,
            created_at: o.created_at,
            updated_at: o.updated_at,
          })),
          total: res.total || orders.length,
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

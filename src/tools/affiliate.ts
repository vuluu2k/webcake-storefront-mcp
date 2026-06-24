import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Affiliate / referral app (Enum.Application affiliates = 4).
// Install first via install_app({ app: "affiliates" }). Endpoints under /affiliate/*.
// Programs define commission rules; products opt in; accounts are affiliates; payouts settle commissions.

export function registerAffiliateTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const listShape = {
    page: z.number().optional().describe("Page number (default 1)"),
    limit: z.number().optional().describe("Items per page"),
    term: z.string().optional().describe("Search term"),
  };
  const unwrap = (res: any, key: string) => res?.data?.[key] ?? res?.[key] ?? res?.data ?? res;

  server.tool(
    "get_affiliate_programs",
    "Get the affiliate commission programs (order-level and product-level) configured for the site.",
    {},
    () => handle(async () => unwrap(await api.getProgramAffiliates(), "program_affiliates")),
  );

  server.tool(
    "get_affiliate_statistic",
    "Get aggregate affiliate statistics (clicks, orders, commission, payouts) for the site.",
    {},
    () => handle(async () => unwrap(await api.getAffiliateStatistic(), "statistic")),
  );

  server.tool(
    "list_affiliate_products",
    "List products enrolled in the affiliate program (with their commission settings).",
    listShape,
    (query) => handle(async () => unwrap(await api.getProductAffiliates(query), "product_affiliates")),
  );

  server.tool(
    "list_affiliate_orders",
    "List affiliate-attributed orders (referrals that converted).",
    { ...listShape, status: z.number().optional().describe("Filter by order status code") },
    (query) => handle(async () => unwrap(await api.getOrderAffiliates(query), "order_affiliates")),
  );

  server.tool(
    "list_affiliate_accounts",
    "List affiliate accounts (registered affiliates / referrers).",
    listShape,
    (query) => handle(async () => unwrap(await api.getAccountAffiliates(query), "account_affiliates")),
  );

  server.tool(
    "list_affiliate_payouts",
    "List affiliate payout requests/records.",
    { ...listShape, status: z.number().optional().describe("Filter by payout status code") },
    (query) => handle(async () => unwrap(await api.getPayoutAffiliates(query), "payout_affiliates")),
  );

  server.tool(
    "update_affiliate_order_program",
    `Create/update the order-level affiliate commission program. \`payload\` is the program object
(e.g. { "is_activated": true, "commission_type": ..., "commission_value": ... }).`,
    { payload: z.record(z.any()).describe("Order program settings object") },
    ({ payload }) => handle(() => api.upsertOrderProgramAffiliate(payload)),
  );

  server.tool(
    "update_affiliate_product_program",
    "Create/update the product-level affiliate commission program. `payload` is the program object.",
    { payload: z.record(z.any()).describe("Product program settings object") },
    ({ payload }) => handle(() => api.upsertProductProgramAffiliate(payload)),
  );

  server.tool(
    "upsert_affiliate_product",
    `Enroll/update a product in the affiliate program with its own commission. \`payload\` includes the
product id and commission fields (e.g. { "product_id": "...", "commission_type": ..., "commission_value": ... }).`,
    { payload: z.record(z.any()).describe("Affiliate-product settings object") },
    ({ payload }) => handle(() => api.upsertProductAffiliate(payload)),
  );

  server.tool(
    "delete_affiliate_products",
    "Remove products from the affiliate program. `payload` typically { ids: [...] }.",
    { payload: z.record(z.any()).describe('e.g. { "ids": ["..."] }') },
    ({ payload }) => handle(() => api.deleteProductAffiliates(payload)),
  );

  server.tool(
    "update_affiliate_payout_status",
    `Update the status of affiliate payout(s). \`payload\` typically { ids: [...], status: <code> }.`,
    { payload: z.record(z.any()).describe('e.g. { "ids": ["..."], "status": 1 }') },
    ({ payload }) => handle(() => api.updatePayoutAffiliateStatus(payload)),
  );

  server.tool(
    "delete_affiliate_accounts",
    "Remove affiliate accounts. `payload` typically { ids: [...] }.",
    { payload: z.record(z.any()).describe('e.g. { "ids": ["..."] }') },
    ({ payload }) => handle(() => api.deleteAccountAffiliates(payload)),
  );

  server.tool(
    "update_affiliate_account",
    "Update an affiliate account (e.g. commission rate, status). `payload` is the account object incl. its id.",
    { payload: z.record(z.any()).describe("Affiliate account object incl. id") },
    ({ payload }) => handle(() => api.updateAccountAffiliate(payload)),
  );
}

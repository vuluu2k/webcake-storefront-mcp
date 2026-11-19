import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Marketing / CRM / team management: transactional email templates, contact-form
// submissions, newsletter subscribers, customer tags, site employees & invitations,
// insight dashboards, and account notifications.

export function registerMarketingTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const unwrap = (res: any, key: string) => res?.data?.[key] ?? res?.[key] ?? res?.data ?? res;
  const list = {
    page: z.number().optional().describe("Page number (default 1)"),
    limit: z.number().optional().describe("Items per page"),
    term: z.string().optional().describe("Search term"),
  };
  const emailBlock = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    status: z.boolean().optional(),
  }).passthrough();

  server.tool(
    "create_contact",
    "Create a contact entry.",
    {
      name: z.string().describe("Contact name"),
      number_phone: z.string().optional().describe("Phone number"),
      email: z.string().optional().describe("Email"),
      note: z.string().optional().describe("Note"),
    },
    (body) => handle(() => api.createContact(body)),
  );

  server.tool(
    "upsert_customer_tag",
    "Create or update a customer tag. Omit `id` to create.",
    { id: z.string().optional().describe("Tag id (omit to create)"), name: z.string().describe("Tag name") },
    (body) => handle(async () => unwrap(await api.upsertCustomerTag(body), "tag")),
  );
  server.tool(
    "assign_customer_tags",
    "Add or remove tags on multiple customers at once.",
    {
      customer_ids: z.array(z.string()).min(1).describe("Customer ids"),
      tags: z.array(z.string()).min(1).describe("Tag ids/names"),
      type: z.enum(["add", "remove"]).optional().describe('"add" (default) or "remove"'),
    },
    (body) => handle(() => api.assignCustomerTags(body)),
  );

}

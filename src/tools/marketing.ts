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

  // ── Transactional email templates ──
  server.tool(
    "get_email_templates",
    "Get the site's transactional email templates (order confirmation, receipt, shop notice).",
    {},
    () => handle(async () => unwrap(await api.getSendEmail(), "send_email")),
  );
  server.tool(
    "save_email_templates",
    "Create/update the transactional email templates. Each block is { title, content, status }.",
    {
      id: z.string().optional().describe("Existing record id (omit to create)"),
      email: z.string().optional().describe("Sender/site email"),
      email_customer_order: emailBlock.optional().describe("Email to customer on new order"),
      email_customer_recieve: emailBlock.optional().describe("Email to customer on receipt"),
      email_order_to_shop: emailBlock.optional().describe("Email to shop on new order"),
    },
    (body) => handle(() => api.saveSendEmail(body)),
  );

  // ── Contacts ──
  server.tool(
    "list_contacts",
    "List contact-form submissions.",
    { ...list, status: z.number().optional().describe("Filter by status code") },
    (query) => handle(async () => unwrap(await api.listContacts(query), "contact")),
  );
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
    "delete_contacts",
    "Delete contacts by id.",
    { ids: z.array(z.string()).min(1).describe("Contact ids") },
    ({ ids }) => handle(() => api.deleteContacts(ids)),
  );

  // ── Subscribers ──
  server.tool(
    "list_subscribers",
    "List newsletter subscribers.",
    list,
    (query) => handle(async () => unwrap(await api.listSubscribers(query), "subscriber")),
  );
  server.tool(
    "create_subscriber",
    "Add a newsletter subscriber (upsert by email or phone).",
    {
      email: z.string().optional().describe("Email"),
      phone_number: z.string().optional().describe("Phone number"),
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      note: z.string().optional().describe("Note"),
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      ref: z.string().optional().describe("Referral code"),
    },
    (body) => handle(async () => unwrap(await api.createSubscriber(body), "subscriber")),
  );
  server.tool(
    "delete_subscribers",
    "Delete subscribers by id.",
    { ids: z.array(z.string()).min(1).describe("Subscriber ids") },
    ({ ids }) => handle(() => api.deleteSubscribers(ids)),
  );

  // ── Customer tags ──
  server.tool(
    "list_customer_tags",
    "List customer tags for the site.",
    {},
    () => handle(async () => unwrap(await api.listCustomerTags(), "customer_tags")),
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

  // ── Employees / team ──
  server.tool(
    "list_employees",
    "List the site's employees (team members with permissions).",
    {},
    () => handle(async () => unwrap(await api.listEmployees(), "employees")),
  );
  server.tool(
    "invite_employee",
    "Invite an employee to the site by email.",
    { email: z.string().describe("Invitee email") },
    ({ email }) => handle(() => api.inviteEmployee(email)),
  );
  server.tool(
    "update_employee_permissions",
    "Change an employee's permission bitmask. Cannot change self or owner.",
    {
      id: z.string().describe("site_permission id"),
      permissions: z.number().describe("Permission bitmask integer"),
    },
    ({ id, permissions }) => handle(() => api.updateEmployeePermissions({ id, permissions })),
  );
  server.tool(
    "delete_employees",
    "Remove employees (and any pending invitations) by site_permission id.",
    { ids: z.array(z.string()).min(1).describe("site_permission ids") },
    ({ ids }) => handle(() => api.deleteEmployees(ids)),
  );

  // ── Invitations (account-level) ──
  server.tool(
    "list_invitations",
    "List site invitations for the current account.",
    {},
    () => handle(async () => unwrap(await api.listInvitations(), "invitations")),
  );
  server.tool(
    "accept_invitation",
    "Accept a site invitation.",
    { invitation_id: z.string().describe("Invitation id") },
    ({ invitation_id }) => handle(() => api.acceptInvitation(invitation_id)),
  );
  server.tool(
    "refuse_invitation",
    "Refuse a site invitation.",
    { invitation_id: z.string().describe("Invitation id") },
    ({ invitation_id }) => handle(() => api.refuseInvitation(invitation_id)),
  );

  // ── Insight / notifications ──
  server.tool(
    "get_insight_today",
    "Get today's insight snapshot (orders, customers, conversion).",
    {},
    () => handle(async () => unwrap(await api.getInsightToday(), "insight_data_today")),
  );
  server.tool(
    "get_insight",
    "Get analytics insight over a time range (defaults to last 7 days on the UI).",
    { start_time: z.string().optional().describe("ISO start time"), end_time: z.string().optional().describe("ISO end time") },
    (query) => handle(async () => unwrap(await api.getInsight(query), "statistic")),
  );
  server.tool(
    "list_notifications",
    "List notifications for the current account.",
    {},
    () => handle(async () => unwrap(await api.listNotifications(), "notifications")),
  );
  server.tool(
    "mark_notification_read",
    "Mark a notification as read.",
    { notification_id: z.string().describe("Notification id") },
    ({ notification_id }) => handle(() => api.markNotificationRead(notification_id)),
  );
}

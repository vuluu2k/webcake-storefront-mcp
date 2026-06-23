import { z } from "zod";
import { APP_TYPES } from "../enums.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

export function registerAutomationTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_automations",
    `List the site's automations so you can find an automation_id (e.g. to call send_mail, or to trigger from an HTTP function via @webcake/app/automation sendMail).
Returns each automation's id, name, status and trigger info. Filter with 'term'. The id is what send_mail / the cms automation flow needs.`,
    {
      term: z.string().optional().describe("Search by automation name"),
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(50).describe("Items per page"),
    },
    ({ term, page, limit }) =>
      handle(async () => {
        const res = await api.listAutomations({ ...(term ? { term } : {}), page, limit });
        // Response shape: { automations: { data:[...], total_entries, page, limit }, ... }
        const body = (res as any)?.automations || (res as any)?.data || res;
        const raw = body?.data || body || [];
        const list: any[] = Array.isArray(raw) ? raw : [];
        const automations = list.map((a: any) => ({
          id: a.id,
          name: a.name,
          status: a.status ?? (a.is_completed ? "completed" : undefined),
          is_completed: a.is_completed,
          // surface the trigger so the agent can tell which automation does what
          trigger: a.rule?.trigger?.triggerType || a.rule?.trigger?.triggerKey || a.trigger_type || undefined,
          updated_at: a.updated_at,
        }));
        return {
          automations,
          total: body?.total_entries ?? automations.length,
          page,
          hint: "Pass an automation's id as send_mail.automation_id (or to sendMail(request, automationId, data) inside an HTTP function).",
        };
      })
  );

  // Automation lives behind the "Automation" application (Enum.Application automation = 2).
  // Creating an automation requires that app installed, so we ensure it first.
  const AUTOMATION_APP = APP_TYPES.automation;
  async function ensureAutomationApp(): Promise<{ installed: boolean; just_installed: boolean }> {
    const res: any = await api.getApp(AUTOMATION_APP).catch(() => null);
    const app = res?.app ?? res?.data ?? null;
    if (app) return { installed: true, just_installed: false };
    await api.registerApp(AUTOMATION_APP, true);
    return { installed: true, just_installed: true };
  }

  server.tool(
    "create_automation",
    `Create an automation. Checks the Automation app is installed first and installs it if needed.
An automation = { name, type, status, rule }. 'rule' holds the trigger + actions (a map; shape depends on the trigger). Returns the new automation id (use it with send_mail for cms-triggered email).`,
    {
      name: z.string().describe("Automation name"),
      description: z.string().optional().describe("Description"),
      type: z.string().default("CUSTOM").describe("Automation type (default CUSTOM)"),
      status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE").describe("ACTIVE to run it, INACTIVE to keep it off"),
      rule: z.record(z.any()).default({}).describe("Trigger + actions map. Leave {} for a blank automation you wire up later."),
    },
    ({ name, description, type, status, rule }) =>
      handle(async () => {
        const app = await ensureAutomationApp();
        const res: any = await api.createAutomation({ name, ...(description ? { description } : {}), type, status, rule });
        const a = res?.automation ?? res?.data ?? res;
        return { success: true, automation_id: a?.id ?? null, name, status, app, hint: "Pass automation_id to send_mail to trigger it." };
      })
  );

  server.tool(
    "update_automation",
    "Update an automation by id. Pass only the fields to change (name, description, type, status, rule).",
    {
      id: z.string().describe("Automation id"),
      name: z.string().optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      rule: z.record(z.any()).optional().describe("Replace the trigger + actions map"),
    },
    ({ id, ...fields }) =>
      handle(async () => {
        const res: any = await api.updateAutomation({ id, ...fields });
        const a = res?.automation ?? res?.data ?? res;
        return { success: true, automation_id: a?.id ?? id, updated: Object.keys(fields) };
      })
  );

  server.tool(
    "delete_automation",
    "Delete one or more automations by id.",
    {
      ids: z.array(z.string()).describe("Automation ids to delete"),
    },
    ({ ids }) =>
      handle(async () => {
        await api.deleteAutomations(ids);
        return { success: true, deleted: ids };
      })
  );

  server.tool(
    "send_mail",
    `Trigger a CMS automation to send an email (same endpoint @webcake/app/automation sendMail uses).
Requires the automation_id — get it from list_automations. 'data' is the payload passed to that automation/email template.`,
    {
      automation_id: z.string().describe("Automation id (a UUID) — from list_automations"),
      data: z.record(z.any()).default({}).describe("Data object passed into the automation (e.g. recipient, variables for the email template)"),
    },
    ({ automation_id, data }) => handle(() => api.sendMail({ automation_id, data })),
  );
}

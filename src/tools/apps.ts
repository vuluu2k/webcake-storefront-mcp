import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { APP_TYPES, APP_NAMES, APP_TYPE_REFERENCE, APP_NAME_BY_TYPE, type AppName } from "../enums.js";

/** Presence in /subcriptions/all = installed (that is what the dashboard shows). builderx_api get_app ignores
 *  is_active for every type except product_design (10), so is_active=false alone does not mean "off". */
export function summarizeApps(list: any[]) {
  const installed = list.map((a: any) => ({
    id: a.id,
    type: a.type,
    name: APP_NAME_BY_TYPE[a.type] ?? undefined,
    enabled: a.type === APP_TYPES.product_design ? Boolean(a.is_active) : true,
    is_active: a.is_active,
  }));
  const have = new Set(list.map((a: any) => a.type));
  return {
    installed_count: installed.length,
    installed,
    not_installed: APP_NAMES.filter((n) => !have.has(APP_TYPES[n])),
  };
}

export function registerAppTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_apps",
    `Which applications are installed / enabled on the site — and which are not — in ONE call.
Returns installed[] (id, type, name, enabled) plus not_installed[] (app names). Do NOT call get_app per type
to answer "which apps are on"; use get_app only for one app's settings.
App type codes: ${APP_TYPE_REFERENCE}.`,
    {},
    () =>
      handle(async () => {
        const res: any = await api.listApps();
        // Real shape: { success, apps:[…] } — every non-removed AppSubscription row of the site.
        const list: any[] = res?.apps ?? res?.data?.apps ?? (Array.isArray(res?.data) ? res.data : []);
        return summarizeApps(list);
      })
  );

  server.tool(
    "get_app",
    `Get one installed app by its type code (returns null if not installed).
App type codes: ${APP_TYPE_REFERENCE}. You may pass the number or the name.`,
    {
      type: z.union([z.number(), z.string()]).describe(`App type — a code (e.g. 2) or a name (e.g. "automation"). Codes: ${APP_TYPE_REFERENCE}`),
    },
    ({ type }) =>
      handle(() => {
        const code = typeof type === "string" && type in APP_TYPES ? APP_TYPES[type as AppName] : type;
        return api.getApp(code);
      })
  );

  server.tool(
    "install_app",
    `Install (register) an application on the current site so its features become usable.
For example, automations need the "automation" app installed first.
App types: ${APP_TYPE_REFERENCE}.`,
    {
      app: z.enum(APP_NAMES as [AppName, ...AppName[]]).describe("App to install (by name)"),
      is_active: z.boolean().default(true).describe("Activate the app on install"),
    },
    ({ app, is_active }) =>
      handle(async () => {
        const type = APP_TYPES[app];
        const existing: any = await api.getApp(type).catch(() => null);
        if (existing?.app ?? existing?.data) {
          return { app, type, already_installed: true };
        }
        await api.registerApp(type, is_active);
        return { app, type, installed: true };
      })
  );

  server.tool(
    "uninstall_app",
    `Uninstall (remove) an installed application from the current site.
Pass the app's subscription id — get it from list_apps (the \`id\` field) or get_app.`,
    {
      id: z.string().describe("App subscription id (from list_apps / get_app)"),
    },
    ({ id }) =>
      handle(async () => {
        await api.uninstallApp(id);
        return { id, uninstalled: true };
      })
  );

  server.tool(
    "update_app",
    `Update an installed app's configuration. Pass the app subscription id and an \`attrs\` object
that is merged onto the subscription — usually \`{ settings: {...} }\`, optionally \`{ status }\`.
For the product-review app, prefer update_app_review (it also propagates shop_info).`,
    {
      id: z.string().describe("App subscription id (from list_apps / get_app)"),
      attrs: z.record(z.any()).describe('Fields to update, e.g. { "settings": { ... }, "status": 1 }'),
    },
    ({ id, attrs }) => handle(() => api.updateApp(id, attrs)),
  );

  server.tool(
    "update_app_review",
    `Update the product-review app's settings (e.g. shop_info, auto-approve, display options).
Pass the review app's subscription id (get_app with type "product_review") and the full \`settings\` object.`,
    {
      id: z.string().describe("Review app subscription id (get_app type=product_review)"),
      settings: z.record(z.any()).describe('Review app settings object, e.g. { "shop_info": { ... }, "auto_approve": true }'),
    },
    ({ id, settings }) => handle(() => api.updateAppReview(id, settings)),
  );
}

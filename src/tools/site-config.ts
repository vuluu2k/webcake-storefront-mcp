import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { SITE_CODE_FIELDS } from "../builder/native-first.js";

// Site-level configuration the dashboard manages: custom domains, SEO redirect URLs,
// shipping rules, marketing UTM links, system logs, saved table filters, general site
// settings, site rename/slug, fonts, API keys, and publish history.

export function registerSiteConfigTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const unwrap = (res: any, key: string) => res?.data?.[key] ?? res?.[key] ?? res?.data ?? res;
  const list = {
    page: z.number().optional().describe("Page number (default 1)"),
    limit: z.number().optional().describe("Items per page"),
    term: z.string().optional().describe("Search term"),
  };

  // ── General settings / rename ──
  server.tool(
    "update_site_settings",
    `Update general site settings. The \`settings\` object is shallow-merged onto existing settings;
other top-level keys (currency, slugs, is_maintenance, robot_txt, …) replace directly.`,
    { settings: z.record(z.any()).describe("Top-level keys to update (nested settings:{...} merges; others replace)") },
    ({ settings }) =>
      handle(async () => {
        // Custom code only changes through update_site_custom_code, where the native-first checks live.
        // Sending it back unchanged is fine: that's a read-modify-write of the whole settings object.
        const blocked = { error: "BLOCKED: custom code fields can't be changed here. Use update_site_custom_code." };
        let nested = settings.settings;
        if (typeof nested === "string") {
          try { nested = JSON.parse(nested); } catch { nested = null; }
        }
        const sent = { ...settings, ...(nested && typeof nested === "object" ? nested : {}) };
        for (const field of SITE_CODE_FIELDS) {
          if (field in sent && String(sent[field] ?? "") !== String((await api.getSiteSettingField(field)) ?? "")) return blocked;
        }
        return api.updateSiteRaw(settings);
      }),
  );

  server.tool(
    "create_font_group",
    "Create a font group (e.g. a Google Font family by URL).",
    {
      name: z.string().describe("Font group name"),
      type: z.string().optional().describe("Font type"),
      url: z.string().optional().describe("Font CSS/source URL"),
    },
    (body) => handle(() => api.createFontGroup(body)),
  );

}

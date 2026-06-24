import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Multilingual app (Enum.Application multilingual = 5). Install first via
// install_app({ app: "multilingual" }), then enable languages. Each resource type
// (product, category, article, …) has its own translations list + save endpoint.

const RESOURCES = [
  "product", "combo_product", "product_attribute", "category", "ribbon",
  "article", "article_category", "promotion", "page_name", "site", "notification",
] as const;
type Resource = (typeof RESOURCES)[number];

// resource -> { save action, body field name } (defaults to `${resource}_translations`)
const SAVE: Record<Resource, { action: string; field?: string; special?: "site" | "notification" }> = {
  product: { action: "update_product_translations" },
  combo_product: { action: "update_combo_product_translations" },
  product_attribute: { action: "update_product_attribute_translations", field: "translation_data" },
  category: { action: "update_category_translations" },
  ribbon: { action: "update_ribbon_translations" },
  article: { action: "update_article_translations" },
  article_category: { action: "update_article_category_translations" },
  promotion: { action: "update_promotion_translations" },
  page_name: { action: "update_page_name_translations" },
  site: { action: "update_site_translations", special: "site" },
  notification: { action: "update_notification_translations", special: "notification" },
};

export function registerMultilingualTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const unwrap = (res: any, key: string) => res?.data?.[key] ?? res?.[key] ?? res?.data ?? res;

  server.tool(
    "add_site_languages",
    `Set the full list of enabled languages for the site (used to add, remove, toggle, or change currency —
always send the complete updated list). Requires the multilingual app installed.`,
    {
      languages: z.array(z.object({
        lang: z.string().describe("Language code, e.g. 'en', 'vi'"),
        currency: z.string().optional().describe("Currency code for this language"),
        status: z.string().optional().describe("Status, e.g. 'ACTIVE'"),
      }).passthrough()).describe("Complete list of enabled languages"),
    },
    ({ languages }) => handle(async () => unwrap(await api.mlAddLanguages(languages), "multiple_language")),
  );

  server.tool(
    "set_default_language",
    "Change which enabled language is the site default.",
    { language_code: z.string().describe("Language code to make default") },
    ({ language_code }) => handle(() => api.mlChangeDefault(language_code)),
  );

  server.tool(
    "list_translations",
    `List translations for a resource type in a target language. Resources: ${RESOURCES.join(", ")}.
'notification' takes no language filter; 'site' returns a flat key→value object.`,
    {
      resource: z.enum(RESOURCES).describe("Resource type to translate"),
      language_code: z.string().describe("Target language code, e.g. 'en'"),
      page: z.number().optional().describe("Page number (paginated resources)"),
      limit: z.number().optional().describe("Items per page"),
      term: z.string().optional().describe("Search term"),
    },
    ({ resource, ...query }) =>
      handle(async () => {
        const path = `${resource}_translations`;
        const res = await api.mlGetTranslations(path, query);
        return unwrap(res, path);
      })
  );

  server.tool(
    "save_translations",
    `Save translations for a resource type in a target language. Resources: ${RESOURCES.join(", ")}.
For most resources \`items\` is an array of translation rows. For 'site' pass the translations object
(key→value). For 'notification' pass an array of { key, value } and language_code is ignored.`,
    {
      resource: z.enum(RESOURCES).describe("Resource type"),
      language_code: z.string().describe("Target language code"),
      items: z.any().describe("Translation rows (array) — or object for 'site', array of {key,value} for 'notification'"),
    },
    ({ resource, language_code, items }) =>
      handle(() => {
        const def = SAVE[resource as Resource];
        let body: any;
        if (def.special === "site") body = { language_code, translations: items };
        else if (def.special === "notification") body = { languages: items };
        else body = { [def.field || `${resource}_translations`]: items, language_code };
        return api.mlSaveTranslations(def.action, body);
      })
  );

  server.tool(
    "auto_translate",
    `Machine-translate a JSON blob from one language to another. \`type\` must be a valid translation
type (e.g. 'product', 'category'). Returns { trans, count }.`,
    {
      type: z.string().describe("Translation type, e.g. 'product'"),
      source_language: z.string().describe("Source language code"),
      target_language: z.string().describe("Target language code"),
      json: z.record(z.any()).describe("Key→text object to translate"),
    },
    (body) => handle(async () => unwrap(await api.mlTranslateJson(body), "translate_json")),
  );
}

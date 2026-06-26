import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle, McpResult } from "../server.js";

import { registerContextTools } from "./context.js";
import { registerCmsFileTools } from "./cms-files.js";
import { registerPageTools } from "./pages.js";
import { registerCollectionTools } from "./collections.js";
import { registerArticleTools } from "./articles.js";
import { registerCustomerTools } from "./customers.js";
import { registerAutomationTools } from "./automation.js";
import { registerProductTools } from "./products.js";
import { registerCatalogWriteTools } from "./catalog-write.js";
import { registerOrderTools } from "./orders.js";
import { registerSiteStyleTools } from "./site-style.js";
import { registerAppTools } from "./apps.js";
import { registerReviewTools } from "./reviews.js";
import { registerAppointmentTools } from "./appointment.js";
import { registerAffiliateTools } from "./affiliate.js";
import { registerCatalogExtraTools } from "./catalog-extras.js";
import { registerSiteConfigTools } from "./site-config.js";
import { registerMarketingTools } from "./marketing.js";
import { registerMultilingualTools } from "./multilingual.js";
import { registerMediaTools } from "./media.js";
import { registerAppsExtraTools } from "./apps-extra.js";
import { registerSaleChannelTools } from "./sale-channels.js";
import { registerPromotionTools } from "./promotions.js";
import { registerComboTools } from "./combos.js";
import { registerGlobalSourceTools } from "./global-sources.js";
import { registerGlobalSectionTools } from "./global-sections.js";
import { registerGlobalSectionWriteTools } from "./global-section-write.js";
import { registerResultCacheTools } from "./result-cache.js";
import { registerImageTools } from "./images.js";
import { registerBuilderTools } from "./builder.js";
import { registerBuilderExtraTools } from "./builder-extras.js";
import { registerPageDraftTools } from "./page-draft.js";

type RegisterFn = (server: any, api: WebcakeCmsApi, handle: Handle, opts: any) => void;

/** Tool groups. `core` groups load natively; the rest are reached via search_tools + invoke_tool. */
export const GROUPS: { name: string; title: string; desc: string; core?: boolean }[] = [
  { name: "session", title: "Session & apps", core: true, desc: "Connection context, site switch, app install/list, result cache" },
  { name: "web", title: "Page building", core: true, desc: "Pages, builder elements, sections, global sources/sections, styles, images, publish" },
  { name: "store", title: "Store", core: true, desc: "Products, categories, collections, orders, promotions, combos" },
  { name: "content", title: "Content & customers", core: true, desc: "Blog articles, customers, CMS files / HTTP functions" },
  { name: "catalog", title: "Catalog extras", desc: "Brands, suppliers, product tags, ribbons, materials, variations, measurement, price-contact" },
  { name: "site_config", title: "Site configuration", desc: "Custom domains, SEO redirects, shipping, UTM links, fonts, site settings, API keys, publish history" },
  { name: "marketing", title: "Marketing & CRM", desc: "Email templates, contacts, subscribers, customer tags, employees, invitations, insight, notifications" },
  { name: "i18n", title: "Multilingual", desc: "Enable languages and manage translations for products/categories/articles/etc." },
  { name: "media", title: "Media & PWA", desc: "Media library folders/content, capacity, base64 upload, PWA manifest" },
  { name: "appointment", title: "Appointment booking", desc: "Booking calendars, appointments, employees, addresses, classifies" },
  { name: "affiliate", title: "Affiliate", desc: "Affiliate programs, products, orders, accounts, payouts, statistics" },
  { name: "reviews", title: "Product reviews", desc: "List, create, reply, moderate, delete product reviews" },
  { name: "apps_advanced", title: "Advanced apps", desc: "Product design, personal product design (PPD), course app" },
  { name: "channels", title: "Sale channels", desc: "Sitemap sync, partner product feeds, Google merchants" },
  { name: "automation", title: "Automation", desc: "Marketing automations and send-mail" },
];

/** Each tool module mapped to its group. Order matches the original registration order. */
const MODULES: [string, RegisterFn][] = [
  ["session", registerContextTools],
  ["content", registerCmsFileTools],
  ["web", registerPageTools],
  ["store", registerCollectionTools],
  ["content", registerArticleTools],
  ["content", registerCustomerTools],
  ["automation", registerAutomationTools],
  ["store", registerProductTools],
  ["store", registerCatalogWriteTools],
  ["store", registerOrderTools],
  ["web", registerSiteStyleTools],
  ["session", registerAppTools],
  ["reviews", registerReviewTools],
  ["appointment", registerAppointmentTools],
  ["affiliate", registerAffiliateTools],
  ["catalog", registerCatalogExtraTools],
  ["site_config", registerSiteConfigTools],
  ["marketing", registerMarketingTools],
  ["i18n", registerMultilingualTools],
  ["media", registerMediaTools],
  ["apps_advanced", registerAppsExtraTools],
  ["channels", registerSaleChannelTools],
  ["store", registerPromotionTools],
  ["store", registerComboTools],
  ["web", registerGlobalSourceTools],
  ["web", registerGlobalSectionTools],
  ["web", registerGlobalSectionWriteTools],
  ["session", registerResultCacheTools],
  ["web", registerImageTools],
  ["web", registerBuilderTools],
  ["web", registerBuilderExtraTools],
  ["web", registerPageDraftTools],
];

interface ToolEntry {
  name: string;
  group: string;
  description: string;
  shape: Record<string, any>;
  handler: (args: any, extra?: any) => Promise<McpResult> | McpResult;
}

/** Captures server.tool(...) calls into a registry instead of registering them. */
class ToolCollector {
  entries: ToolEntry[] = [];
  group = "";
  tool(name: string, description: string, shapeOrCb: any, cb?: any) {
    const handler = typeof shapeOrCb === "function" ? shapeOrCb : cb;
    const shape = typeof shapeOrCb === "function" ? {} : shapeOrCb || {};
    this.entries.push({ name, group: this.group, description, shape, handler });
  }
}

/** Resolve which groups load natively. Default = core groups.
 *  Spec forms (WEBCAKE_TOOLS or ?tools=): "all" | "core,marketing" | "+marketing,-store". */
export function resolveNativeGroups(spec?: string): Set<string> {
  const core = GROUPS.filter((g) => g.core).map((g) => g.name);
  const all = GROUPS.map((g) => g.name);
  if (!spec || !spec.trim()) return new Set(core);
  const tokens = spec.split(",").map((s) => s.trim()).filter(Boolean);
  const hasDelta = tokens.some((t) => t.startsWith("+") || t.startsWith("-"));
  const set = new Set<string>(hasDelta ? core : []);
  for (const t of tokens) {
    if (t === "all") all.forEach((x) => set.add(x));
    else if (t === "core") core.forEach((x) => set.add(x));
    else if (t.startsWith("+")) set.add(t.slice(1));
    else if (t.startsWith("-")) set.delete(t.slice(1));
    else set.add(t);
  }
  return set;
}

const errorResult = (text: string): McpResult => ({ content: [{ type: "text", text }], isError: true });

/** Build a compact capability index (group list with loaded/on-demand tags) to inject into the
 *  system prompt so the model always knows which domains exist and when to use search_tools. */
export function buildToolGroupIndex(spec?: string): string {
  const native = resolveNativeGroups(spec);
  const lines = GROUPS.map((g) => `- ${g.title} [${native.has(g.name) ? "loaded" : "on-demand"}] — ${g.desc}`);
  return `## Capability map (WebCake tool groups)
Every capability below exists. Groups marked [loaded] are available as direct tools right now.
Groups marked [on-demand] are NOT loaded to save context — to use one, call search_tools("english keywords")
then invoke_tool(name, arguments). NEVER tell the user a capability is missing without searching first;
if the user's request touches an [on-demand] area (or you're unsure), search_tools BEFORE concluding.
Tip: search_tools matches English tool names/descriptions — translate the user's intent into English keywords.

${lines.join("\n")}`;
}

/** Build the full registry, register native (core) tools, and add the search gateway.
 *  Returns counts for diagnostics. */
export function installTools(
  server: McpServer,
  api: WebcakeCmsApi,
  handle: Handle,
  opts: { allowLocalFiles?: boolean; tools?: string } = {},
): { total: number; native: number; groups: number } {
  const collector = new ToolCollector();
  for (const [group, register] of MODULES) {
    collector.group = group;
    register(collector as any, api, handle, { allowLocalFiles: opts.allowLocalFiles === true });
  }

  const registry = new Map<string, ToolEntry>();
  for (const e of collector.entries) registry.set(e.name, e);

  const native = resolveNativeGroups(opts.tools ?? process.env.WEBCAKE_TOOLS);

  // Register native (core/enabled) tools directly on the MCP server.
  let nativeCount = 0;
  for (const e of collector.entries) {
    if (native.has(e.group)) {
      server.tool(e.name, e.description, e.shape, e.handler as any);
      nativeCount++;
    }
  }

  // ── Search gateway (always available) ──
  const schemaCache = new Map<string, any>();
  const jsonSchema = (e: ToolEntry) => {
    if (!schemaCache.has(e.name)) {
      try {
        schemaCache.set(e.name, zodToJsonSchema(z.object(e.shape), { $refStrategy: "none" }));
      } catch {
        schemaCache.set(e.name, { type: "object" });
      }
    }
    return schemaCache.get(e.name);
  };

  server.tool(
    "list_tool_groups",
    "List every WebCake tool group, how many tools it has, and whether it is loaded natively or reached on-demand via search_tools + invoke_tool.",
    {},
    () =>
      handle(async () =>
        GROUPS.map((g) => ({
          name: g.name,
          title: g.title,
          description: g.desc,
          native: native.has(g.name),
          tool_count: [...registry.values()].filter((e) => e.group === g.name).length,
        }))
      )
  );

  server.tool(
    "search_tools",
    `Find WebCake tools by keyword across the FULL catalog — including capabilities NOT loaded natively
(marketing/CRM, translations, media, appointments, affiliate, reviews, domains/SEO/shipping, brands/tags/ribbons,
courses, sale channels, automation…). Returns name, group, description and JSON input schema. Then run one with invoke_tool.`,
    {
      query: z.string().describe("Keywords, e.g. 'affiliate payout', 'translate product', 'add domain ssl', 'block phone'"),
      group: z.string().optional().describe("Restrict to a group name (see list_tool_groups)"),
      limit: z.number().optional().describe("Max results (default 8)"),
    },
    ({ query, group, limit }) =>
      handle(async () => {
        const ql = query.toLowerCase();
        const terms = ql.split(/\s+/).filter(Boolean);
        const PREFIX_MIN = 4;
        const tokenize = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        // Score one term against a field: full substring (base) or shared-prefix token match (recall
        // for morphological variants, e.g. "translate" ~ "translations", "ship" ~ "shipping").
        const termScore = (term: string, full: string, tokens: string[], base: number): number => {
          if (full.includes(term)) return base;
          if (term.length >= PREFIX_MIN) {
            for (const tok of tokens) {
              let i = 0;
              const m = Math.min(tok.length, term.length);
              while (i < m && tok[i] === term[i]) i++;
              if (i >= PREFIX_MIN) return Math.max(1, base - 1);
            }
          }
          return 0;
        };
        const groupMeta = new Map(GROUPS.map((g) => [g.name, g]));
        const scored = [...registry.values()]
          .filter((e) => !group || e.group === group)
          .map((e) => {
            const name = e.name.toLowerCase();
            const desc = (e.description || "").toLowerCase();
            const g = groupMeta.get(e.group);
            const gtext = `${g?.title || ""} ${g?.desc || ""}`.toLowerCase(); // group context boosts recall
            const nameTokens = tokenize(name);
            const descTokens = tokenize(desc);
            const gTokens = tokenize(gtext);
            let s = 0;
            if (name === ql) s += 10;
            for (const t of terms) {
              s += termScore(t, name, nameTokens, 3);
              s += termScore(t, desc, descTokens, 2);
              s += termScore(t, gtext, gTokens, 1);
            }
            return { e, s };
          })
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, limit && limit > 0 ? limit : 8);
        return scored.map(({ e }) => ({
          name: e.name,
          group: e.group,
          native: native.has(e.group),
          description: e.description,
          input_schema: jsonSchema(e),
        }));
      })
  );

  server.tool(
    "invoke_tool",
    `Run any WebCake tool by exact name with its arguments (discover names + schemas via search_tools).
Arguments are validated before running. Use this for tools that are not loaded natively.`,
    {
      name: z.string().describe("Exact tool name (from search_tools)"),
      arguments: z.record(z.any()).optional().describe("Arguments object matching the tool's input schema"),
    },
    async ({ name, arguments: args }) => {
      const e = registry.get(name);
      if (!e) return errorResult(`Error: unknown tool "${name}". Use search_tools to find available tools.`);
      const parsed = z.object(e.shape).safeParse(args ?? {});
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        return errorResult(`Error: invalid arguments for "${name}": ${issues}`);
      }
      return e.handler(parsed.data, {});
    }
  );

  return { total: collector.entries.length, native: nativeCount, groups: GROUPS.length };
}

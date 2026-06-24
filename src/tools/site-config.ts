import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

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

  // ── Domains ──
  server.tool(
    "list_domains",
    "List custom domains attached to the site (plus the free subdomain).",
    list,
    (query) => handle(async () => unwrap(await api.listDomains(query), "domains")),
  );
  server.tool(
    "add_domain",
    "Attach a custom domain to the site. Triggers DNS/ownership validation.",
    {
      domain: z.string().describe("Domain name, e.g. shop.example.com"),
      type: z.number().optional().describe("Domain platform type code"),
    },
    (body) => handle(async () => unwrap(await api.createDomain(body), "domain")),
  );
  server.tool(
    "update_domain",
    "Update a domain (rename or advanced settings such as redirect/SSL).",
    {
      domain_id: z.string().describe("Domain id"),
      domain: z.string().optional().describe("New domain name"),
      advanced_setting: z.record(z.any()).optional().describe("Advanced config (redirect/SSL)"),
    },
    (body) => handle(() => api.updateDomain(body)),
  );
  server.tool(
    "verify_domain",
    "Run DNS verification for a domain and enqueue SSL issuance.",
    { domain_id: z.string().describe("Domain id") },
    ({ domain_id }) => handle(() => api.verifyDomain(domain_id)),
  );
  server.tool(
    "delete_domain",
    "Detach/delete a custom domain from the site.",
    { domain_id: z.string().describe("Domain id") },
    ({ domain_id }) => handle(() => api.deleteDomain(domain_id)),
  );
  server.tool(
    "check_domain",
    "Check whether a domain is available/valid without attaching it.",
    { domain: z.string().describe("Domain name to check") },
    ({ domain }) => handle(() => api.checkDomain(domain)),
  );

  // ── SEO redirect URLs ──
  server.tool(
    "list_redirect_urls",
    "List SEO redirect URLs (301 redirects) for the site.",
    list,
    (query) => handle(async () => unwrap(await api.listRedirectUrls(query), "redirect_urls")),
  );
  server.tool(
    "create_redirect_url",
    "Create a redirect from one path to another.",
    {
      original_path: z.string().describe("Source path, e.g. /old-page"),
      target_path: z.string().describe("Destination path, e.g. /new-page"),
    },
    (redirect_url) => handle(() => api.createRedirectUrl(redirect_url)),
  );
  server.tool(
    "update_redirect_url",
    "Update a redirect URL. Pass `is_deleted:true` to disable it.",
    {
      id: z.string().describe("Redirect id"),
      original_path: z.string().describe("Source path"),
      target_path: z.string().describe("Destination path"),
      is_deleted: z.boolean().optional().describe("Disable the redirect"),
    },
    (redirect_url) => handle(() => api.updateRedirectUrl(redirect_url)),
  );
  server.tool(
    "delete_redirect_urls",
    "Delete redirect URLs by id.",
    { ids: z.array(z.string()).min(1).describe("Redirect ids") },
    ({ ids }) => handle(() => api.deleteRedirectUrls(ids)),
  );

  // ── Shipping ──
  server.tool(
    "get_shipping",
    "Get the site's shipping configuration (zones, fees, adjustments).",
    {},
    () => handle(async () => unwrap(await api.getShipping(), "shipping")),
  );
  server.tool(
    "update_shipping",
    "Update shipping config. Pass `idx` (the shipping record id) plus the fields to change (urban/suburban/area_shipping/adjust_price/shipping_unit/rank_priority).",
    {
      idx: z.string().describe("Shipping record id (from get_shipping)"),
      fields: z.record(z.any()).describe("Shipping fields to update"),
    },
    ({ idx, fields }) => handle(() => api.updateShipping({ idx, ...fields })),
  );

  // ── UTM links ──
  server.tool(
    "list_site_utms",
    "List marketing UTM links (with view/order stats over the time window).",
    { ...list, start_time: z.string().optional().describe("ISO start time"), end_time: z.string().optional().describe("ISO end time") },
    (query) => handle(async () => unwrap(await api.listSiteUtms(query), "site_utms")),
  );
  server.tool(
    "create_site_utm",
    "Create a UTM tracking link.",
    {
      name: z.string().describe("Link name"),
      url: z.string().describe("Destination URL"),
      utm_source: z.string().optional().describe("utm_source"),
      utm_medium: z.string().optional().describe("utm_medium"),
      utm_campaign: z.string().optional().describe("utm_campaign"),
      utm_term: z.string().optional().describe("utm_term"),
      utm_content: z.string().optional().describe("utm_content"),
    },
    (site_utm) => handle(() => api.createSiteUtm(site_utm)),
  );
  server.tool(
    "update_site_utm",
    "Update a UTM link. Pass `id` plus fields to change.",
    { id: z.string().describe("UTM id"), fields: z.record(z.any()).describe("Fields to update") },
    ({ id, fields }) => handle(() => api.updateSiteUtm({ id, ...fields })),
  );
  server.tool(
    "delete_site_utms",
    "Delete UTM links by id.",
    { ids: z.array(z.string()).min(1).describe("UTM ids") },
    ({ ids }) => handle(() => api.deleteSiteUtms(ids)),
  );

  // ── System logs ──
  server.tool(
    "list_entity_logs",
    "List the activity/change logs for a specific entity (e.g. an order). Requires the entity id and type.",
    {
      id: z.string().describe("Entity id (e.g. an order id)"),
      type: z.string().default("orders").describe('Entity type (currently "orders")'),
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
    },
    (query) => handle(async () => unwrap(await api.listSystemLogs(query), "system_logs")),
  );

  // ── Saved filters ──
  server.tool(
    "list_saved_filters",
    "List saved table filters for a given table (e.g. 'orders', 'products').",
    { table_key: z.string().describe("Table key the filters belong to") },
    ({ table_key }) => handle(async () => unwrap(await api.listSavedFilters(table_key), "saved_filters")),
  );
  server.tool(
    "create_saved_filter",
    "Create a saved table filter. `for_all_employees:true` shares it (needs config permission).",
    {
      name: z.string().describe("Filter name"),
      table_key: z.string().describe("Table key"),
      filters: z.record(z.any()).describe("Filter criteria object"),
      for_all_employees: z.boolean().optional().describe("Share with all employees"),
    },
    (saved_filter) => handle(async () => unwrap(await api.createSavedFilter(saved_filter), "saved_filter")),
  );
  server.tool(
    "update_saved_filter",
    "Update a saved filter by id.",
    {
      id: z.string().describe("Saved filter id"),
      name: z.string().optional().describe("New name"),
      filters: z.record(z.any()).optional().describe("New filter criteria"),
      for_all_employees: z.boolean().optional().describe("Share with all employees"),
    },
    ({ id, ...saved_filter }) => handle(async () => unwrap(await api.updateSavedFilter(id, saved_filter), "saved_filter")),
  );
  server.tool(
    "delete_saved_filter",
    "Delete (or dismiss, if not owner) a saved filter by id.",
    { id: z.string().describe("Saved filter id") },
    ({ id }) => handle(() => api.deleteSavedFilter(id)),
  );

  // ── General settings / rename ──
  server.tool(
    "update_site_settings",
    `Update general site settings. The \`settings\` object is shallow-merged onto existing settings;
other top-level keys (currency, slugs, is_maintenance, robot_txt, …) replace directly.`,
    { settings: z.record(z.any()).describe("Top-level keys to update (nested settings:{...} merges; others replace)") },
    ({ settings }) => handle(() => api.updateSiteRaw(settings)),
  );
  server.tool(
    "rename_site",
    "Rename the site (display name).",
    { name: z.string().describe("New site name") },
    ({ name }) => handle(() => api.updateSiteName(name)),
  );
  server.tool(
    "update_site_slug",
    "Change the site's slug (subdomain). Fails if the slug is already taken.",
    { slug: z.string().describe("New slug") },
    ({ slug }) => handle(() => api.updateSiteSlug(slug)),
  );

  // ── Fonts ──
  server.tool(
    "list_fonts",
    "List the site's uploaded/added fonts.",
    {},
    () => handle(async () => unwrap(await api.loadFonts(), "data")),
  );
  server.tool(
    "remove_font",
    "Remove a font by id.",
    { id: z.string().describe("Font id") },
    ({ id }) => handle(() => api.removeFont(id)),
  );
  server.tool(
    "list_font_groups",
    "List font groups (font families with weights).",
    {},
    () => handle(() => api.loadFontGroups()),
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
  server.tool(
    "remove_font_group",
    "Remove a font group by id.",
    { id: z.string().describe("Font group id") },
    ({ id }) => handle(() => api.removeFontGroup(id)),
  );

  // ── API keys / publish history ──
  server.tool(
    "list_api_keys",
    "List the site's API keys.",
    { page: z.number().optional(), limit: z.number().optional() },
    (query) => handle(async () => unwrap(await api.listApiKeys(query), "api_keys")),
  );
  server.tool(
    "list_publish_histories",
    "List the site's publish history (past publishes).",
    { page: z.number().optional(), limit: z.number().optional() },
    (query) => handle(() => api.listPublishHistories(query)),
  );
}

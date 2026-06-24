import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "./api.js";

import { registerContextTools } from "./tools/context.js";
import { registerCmsFileTools } from "./tools/cms-files.js";
import { registerPageTools } from "./tools/pages.js";
import { registerCollectionTools } from "./tools/collections.js";
import { registerArticleTools } from "./tools/articles.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerAutomationTools } from "./tools/automation.js";
import { registerProductTools } from "./tools/products.js";
import { registerCatalogWriteTools } from "./tools/catalog-write.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerSiteStyleTools } from "./tools/site-style.js";
import { registerAppTools } from "./tools/apps.js";
import { registerPromotionTools } from "./tools/promotions.js";
import { registerComboTools } from "./tools/combos.js";
import { registerGlobalSourceTools } from "./tools/global-sources.js";
import { registerGlobalSectionTools } from "./tools/global-sections.js";
import { registerGlobalSectionWriteTools } from "./tools/global-section-write.js";
import { registerResultCacheTools } from "./tools/result-cache.js";
import { registerImageTools } from "./tools/images.js";
import { registerBuilderTools } from "./tools/builder.js";
import { registerBuilderExtraTools } from "./tools/builder-extras.js";

export type McpResult = { content: { type: "text"; text: string }[]; isError?: boolean };
export type Handle = (fn: () => Promise<unknown>) => Promise<McpResult>;

const INSTRUCTIONS = `You are an AI assistant connected to the WebCake/StoreCake storefront platform via MCP tools.

IMPORTANT: When the user asks ANY question about their website, store, products, orders, pages, or code — you MUST use the available tools to look up real data before answering. Never guess.

You can also BUILD pages: use get_build_guide, list_elements, get_element to learn the BuilderX component model, new_section/new_element to compose, validate_page to check, then build_page (dry_run first) to create. Publishing is site-level via publish_site.

To make a generated site look real, also CREATE DATA so dataset bindings resolve: create_product_category + create_product (storefront), create_blog_category + create_article (blog). Get image URLs from search_images / upload_images first, then reference them. A good flow for a fresh site: create_site → create a few categories → create products in them → build_page (home + store/blog pages) → publish_site.

Workflow:
1. On first interaction, call get_current_context. The site is NOT set from env — if no site is selected yet, call list_my_sites and ask the user which site to work on, then switch_site (the choice is saved and reused next session). To start from scratch, create_site makes a new site and switches to it; then build a homepage with build_page (type:'main', is_homepage:true).
2. Before answering a site-specific question, query the relevant tool.
3. When building a page, read get_build_guide first and validate before saving.
4. Always reply in the user's language; keep Vietnamese with full diacritics.`;

function makeResult(data: unknown): McpResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export interface ServerOptions {
  /** Allow upload_images to read LOCAL file paths — only safe in stdio mode (the
   *  user's own machine), never on the shared remote HTTP transport. */
  allowLocalFiles?: boolean;
}

/** Build a fully-wired MCP server bound to the given API client. */
export function createServer(api: WebcakeCmsApi, opts: ServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: "webcake-storefront", version: "1.0.0" },
    { instructions: INSTRUCTIONS }
  );

  const handle: Handle = async (fn) => {
    try {
      return makeResult(await fn());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  };

  registerContextTools(server, api, handle);
  registerCmsFileTools(server, api, handle);
  registerPageTools(server, api, handle);
  registerCollectionTools(server, api, handle);
  registerArticleTools(server, api, handle);
  registerCustomerTools(server, api, handle);
  registerAutomationTools(server, api, handle);
  registerProductTools(server, api, handle);
  registerCatalogWriteTools(server, api, handle);
  registerOrderTools(server, api, handle);
  registerSiteStyleTools(server, api, handle);
  registerAppTools(server, api, handle);
  registerPromotionTools(server, api, handle);
  registerComboTools(server, api, handle);
  registerGlobalSourceTools(server, api, handle);
  registerGlobalSectionTools(server, api, handle);
  registerGlobalSectionWriteTools(server, api, handle);
  registerResultCacheTools(server, api, handle);
  registerImageTools(server, api, handle);
  registerBuilderTools(server, api, handle);
  registerBuilderExtraTools(server, api, handle, { allowLocalFiles: opts.allowLocalFiles === true });

  return server;
}

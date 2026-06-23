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
import { registerOrderTools } from "./tools/orders.js";
import { registerSiteStyleTools } from "./tools/site-style.js";
import { registerAppTools } from "./tools/apps.js";
import { registerPromotionTools } from "./tools/promotions.js";
import { registerComboTools } from "./tools/combos.js";
import { registerGlobalSourceTools } from "./tools/global-sources.js";
import { registerImageTools } from "./tools/images.js";
import { registerBuilderTools } from "./tools/builder.js";
import { registerBuilderExtraTools } from "./tools/builder-extras.js";

export type McpResult = { content: { type: "text"; text: string }[]; isError?: boolean };
export type Handle = (fn: () => Promise<unknown>) => Promise<McpResult>;

const INSTRUCTIONS = `You are an AI assistant connected to the WebCake/StoreCake storefront platform via MCP tools.

IMPORTANT: When the user asks ANY question about their website, store, products, orders, pages, or code — you MUST use the available tools to look up real data before answering. Never guess.

You can also BUILD pages: use get_build_guide, list_elements, get_element to learn the BuilderX component model, new_section/new_element to compose, validate_page to check, then build_page (dry_run first) to create. Publishing is site-level via publish_site.

Workflow:
1. On first interaction, call get_current_context. The site is NOT set from env — if no site is selected yet, call list_my_sites and ask the user which site to work on, then switch_site (the choice is saved and reused next session).
2. Before answering a site-specific question, query the relevant tool.
3. When building a page, read get_build_guide first and validate before saving.
4. Always reply in the user's language; keep Vietnamese with full diacritics.`;

function makeResult(data: unknown): McpResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/** Build a fully-wired MCP server bound to the given API client. */
export function createServer(api: WebcakeCmsApi): McpServer {
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
  registerOrderTools(server, api, handle);
  registerSiteStyleTools(server, api, handle);
  registerAppTools(server, api, handle);
  registerPromotionTools(server, api, handle);
  registerComboTools(server, api, handle);
  registerGlobalSourceTools(server, api, handle);
  registerImageTools(server, api, handle);
  registerBuilderTools(server, api, handle);
  registerBuilderExtraTools(server, api, handle);

  return server;
}

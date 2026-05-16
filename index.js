#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebcakeCmsApi } from "./api.js";
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
import { registerKnowledgeTools, autoSync } from "./tools/knowledge.js";
import { registerContextTools, getSavedConfig } from "./tools/context.js";
import { registerGlobalSourceTools } from "./tools/global-sources.js";
import { registerImageTools } from "./tools/images.js";

// Priority: SQLite (saved by AI tools) > env vars (initial config)
// SQLite empty → fallback to env vars
const saved = getSavedConfig();
const BASE_URL = saved.api_url || process.env.WEBCAKE_API_URL || "";
const TOKEN = saved.token || process.env.WEBCAKE_TOKEN || "";
const SITE_ID = saved.site_id || process.env.WEBCAKE_SITE_ID || "";
const SESSION_ID = saved.session_id || process.env.WEBCAKE_SESSION_ID || "";

if (!BASE_URL) {
  console.error("Required: WEBCAKE_API_URL (env var or saved in database)");
  console.error("Use update_auth tool to set token, session_id, site_id after first run");
  process.exit(1);
}

const api = new WebcakeCmsApi({ baseUrl: BASE_URL, token: TOKEN, siteId: SITE_ID, sessionId: SESSION_ID });
const server = new McpServer({
  name: "webcake-cms",
  version: "1.0.0",
  instructions: `You are an AI assistant connected to the WebCake/StoreCake CMS platform via MCP tools.

IMPORTANT: When the user asks ANY question about their website, store, products, orders, pages, code, or business — you MUST use the available tools to look up real data before answering. Never guess or make up information.

How to handle common questions:

- "Trang web của tôi có gì?" / "Show me my site" → get_current_context, then list_pages
- "Sản phẩm nào bán chạy?" / "What products do I have?" → list_products or search_products
- "Đơn hàng hôm nay?" / "Recent orders?" → list_orders or count_orders_by_status
- "Khách hàng X" / "Find customer" → find customer by ID/phone/email
- "Sửa CSS/JS" / "Change styles" → get_site_custom_code, then update or append
- "Thêm hàm API" / "Add backend function" → get_http_function (overview), then edit_http_function
- "Trang X có element gì?" → get_page_source, then search_page_elements
- "Sửa element" → get_page_element, then update_page_element
- "Cart/Popup/Overview" → list_global_sources or get_source_cart, then get_global_source_detail
- "Khuyến mãi" / "Promotions" → list_promotions or get_active_promotions
- Questions about business rules, guides → list_knowledge, then get_knowledge

Workflow:
1. If first interaction, call get_current_context to confirm which site you're connected to
2. Before answering any site-specific question, query the relevant tool
3. Check knowledge base (list_knowledge → get_knowledge) for site-specific documentation
4. Always respond in the same language the user is using
5. When writing code (HTTP functions, custom CSS/JS), follow WebCake conventions from the guides`,
});

function result(data) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

async function handle(fn) {
  try {
    return result(await fn());
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
  }
}

// Register all tools
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
registerKnowledgeTools(server, handle);
registerGlobalSourceTools(server, api, handle);
registerImageTools(server, api, handle);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Auto-sync knowledge from GitHub in background (non-blocking)
  autoSync().catch(() => {});
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

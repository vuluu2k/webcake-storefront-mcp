import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "./api.js";
import { installTools, buildToolGroupIndex } from "./tools/registry.js";

export type McpResult = { content: { type: "text"; text: string }[]; isError?: boolean };
export type Handle = (fn: () => Promise<unknown>) => Promise<McpResult>;

const INSTRUCTIONS = `You are an AI assistant connected to the WebCake/StoreCake storefront platform via MCP tools.

IMPORTANT: When the user asks ANY question about their website, store, products, orders, pages, or code — you MUST use the available tools to look up real data before answering. Never guess.

Tool discovery: the common tools (pages, builder, products, orders, blog, customers, apps, publishing) are loaded directly. MANY more capabilities are available on demand — marketing/CRM (email, contacts, subscribers, employees), translations, media library, appointments, affiliate, product reviews, custom domains / SEO redirects / shipping, brands / tags / ribbons / materials, courses, sale channels, automation, and more. If you don't see a directly-loaded tool for the task, call search_tools("keywords") to find it, then run it with invoke_tool(name, arguments). Use list_tool_groups to see everything available.

You can also BUILD pages: use get_build_guide, list_elements, get_element to learn the BuilderX component model, new_section/new_element to compose, validate_page to check, then build_page (dry_run first) to create. Publishing is site-level via publish_site.

To make a generated site look real, also CREATE DATA so dataset bindings resolve: create_product_category + create_product (storefront), create_blog_category + create_article (blog). Get image URLs from search_images / upload_images first, then reference them. A good flow for a fresh site: create_site → create a few categories → create products in them → build_page (home + store/blog pages) → publish_site.

Workflow:
1. On first interaction, call get_current_context. The site is NOT set from env — if no site is selected yet, call list_my_sites and ask the user which site to work on, then switch_site (the choice is saved and reused next session). To start from scratch, create_site makes a new site and switches to it; then build a homepage with build_page (type:'main', is_homepage:true).
2. Before answering a site-specific question, query the relevant tool (use search_tools if it isn't loaded directly).
3. When building a page, read get_build_guide first and validate before saving.
4. Always reply in the user's language; keep Vietnamese with full diacritics.`;

function makeResult(data: unknown): McpResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export interface ServerOptions {
  /** Allow upload_images to read LOCAL file paths — only safe in stdio mode (the
   *  user's own machine), never on the shared remote HTTP transport. */
  allowLocalFiles?: boolean;
  /** Which tool groups to load natively. Default = core groups; rest reachable via
   *  search_tools/invoke_tool. Forms: "all" | "core,marketing" | "+marketing,-store".
   *  Falls back to the WEBCAKE_TOOLS env var when unset. */
  tools?: string;
}

/** Build a fully-wired MCP server bound to the given API client. */
export function createServer(api: WebcakeCmsApi, opts: ServerOptions = {}): McpServer {
  const toolsSpec = opts.tools ?? process.env.WEBCAKE_TOOLS;
  const server = new McpServer(
    { name: "webcake-storefront", version: "1.0.0" },
    { instructions: `${INSTRUCTIONS}\n\n${buildToolGroupIndex(toolsSpec)}` }
  );

  const handle: Handle = async (fn) => {
    try {
      return makeResult(await fn());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  };

  installTools(server, api, handle, { allowLocalFiles: opts.allowLocalFiles === true, tools: toolsSpec });

  return server;
}

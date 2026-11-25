/**
 * render_page_source: a page source rendered like the published page (HTML + inline CSS per breakpoint),
 * WITHOUT saving it — for design apps that draw a live canvas from the source they are editing. The
 * backend builds it with the site's settings, theme, fonts, popups and cart (POST /ai/render).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";
import { getPageWithSource } from "./pages.js";

export function registerPageRenderTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "render_page_source",
    `Render a page source the way the published page renders it, WITHOUT saving: returns { html, css } (css is
inline <style> tags, one per breakpoint media query). For design apps that draw a canvas from a source they
edit in memory. The output is large (tens to hundreds of KB): to LOOK at a page use preview_page instead.
Pass source (a page source object or its JSON) to render an unsaved edit, or only page_id to render the saved one.`,
    {
      page_id: z.string().optional().describe("The page (its stored source is rendered when source is omitted)"),
      source: z.union([z.string(), z.record(z.string(), z.any())]).optional().describe("Page source { sections: [...] } or its JSON"),
    },
    ({ page_id, source }) => handle(async () => {
      let input: any = source;
      if (input == null) {
        if (!page_id) return { error: "Pass source, or page_id to render the saved page." };
        const { source: stored, error } = await getPageWithSource(api, page_id);
        if (error || !stored) return { error: error ?? "Page has no source" };
        input = stored;
      }
      const rendered = await api.renderSource(input, page_id);
      if (!rendered) {
        return {
          error: "render_unavailable: this backend has no POST /ai/render yet",
          hint: "Use preview_page to look at the saved page.",
        };
      }
      return { ...rendered, html_length: rendered.html.length, css_length: rendered.css.length };
    }),
  );
}

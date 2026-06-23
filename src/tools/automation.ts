import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

export function registerAutomationTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "send_mail",
    "Send email via CMS automation",
    {
      to: z.string().describe("Recipient email"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (supports HTML)"),
    },
    (params) => handle(() => api.sendMail(params))
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

export function registerCustomerTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "find_customer",
    "Find a customer by ID, phone number, or email",
    {
      by: z.enum(["id", "phone", "email"]).describe("Search field"),
      value: z.string().describe("Search value"),
    },
    ({ by, value }) =>
      handle(() => {
        switch (by) {
          case "id": return api.findCustomerById(value);
          case "phone": return api.findCustomerByPhone(value);
          case "email": return api.findCustomerByEmail(value);
        }
      })
  );
}

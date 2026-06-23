import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

export function registerCollectionTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "list_collections",
    "List all database collections (tables) for the site. Returns collection names, table names, and field counts. Use get_collection for full schema details",
    {
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      term: z.string().optional().describe("Search by collection name"),
    },
    ({ page, limit, term }) =>
      handle(async () => {
        const res = await api.listCollections({ page, limit, term });
        const collections = (res && (res as any).data) || res || [];
        if (!Array.isArray(collections)) return res;
        return {
          data: collections.map((c: any) => ({
            id: c.id || c._id,
            name: c.name,
            table_name: c.table_name,
            fields_count: (c.schema || []).length,
            records_count: c.records_count || undefined,
          })),
          total: (res as any).total || collections.length,
        };
      })
  );

  server.tool(
    "get_collection",
    "Get a specific collection's details including full schema (field names, types, constraints, references) and records",
    {
      id: z.string().describe("Collection ID"),
    },
    ({ id }) => handle(() => api.getCollection(id))
  );

  server.tool(
    "query_collection_records",
    "Query records from a collection by table name. Use to inspect existing data",
    {
      table_name: z.string().describe("Collection table name (e.g. 'subscribers', 'custom_orders')"),
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
    },
    ({ table_name, page, limit }) =>
      handle(() => api.queryCollectionRecords(table_name, { page, limit }))
  );
}

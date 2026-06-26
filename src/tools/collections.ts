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
        // Real shape: { data: { data:[…], total_entries } }. Accept a flat data[] too.
        const d = (res as any) && (res as any).data;
        const collections = (d && (Array.isArray(d) ? d : d.data)) || res || [];
        if (!Array.isArray(collections)) return res;
        return {
          data: collections.map((c: any) => ({
            id: c.id || c._id,
            name: c.name,
            table_name: c.table_name,
            fields_count: (c.schema || []).length,
            records_count: c.records_count || undefined,
          })),
          total: (d && !Array.isArray(d) && d.total_entries) ?? (res as any).total ?? collections.length,
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
    "Query records from a collection (custom data table) by table name. Supports paging + an optional `where` filter and `order_by` sort. (Uses the CMS api-key auth the records endpoint requires.)",
    {
      table_name: z.string().describe("Collection table name (e.g. 'subscribers', 'custom_orders') — from get_collection.table_name"),
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      where: z.record(z.any()).optional().describe("Filter object, e.g. { status: 'active' } — matches records by field value."),
      order_by: z.string().optional().describe("Field to sort by (e.g. 'inserted_at')."),
    },
    ({ table_name, page, limit, where, order_by }) =>
      handle(() => {
        const query: any = { page: page ?? 1, limit: limit ?? 50 };
        if (where && Object.keys(where).length) query.where = JSON.stringify(where);
        if (order_by) query.order_by = order_by;
        return api.queryCollectionRecords(table_name, query);
      })
  );

  // ── Write tools (custom data CRUD). Endpoints follow the same /db_collections/collections/
  //    {table}/records[/{id}] REST pattern as the verified read endpoint, with the CMS api-key
  //    header. They mutate live data — run a small test first to confirm your field shape. ──
  server.tool(
    "create_collection",
    "Create a new collection (custom data TABLE) so you can store/query arbitrary data. Pass a name + the field schema. The backend adds id/inserted_at/updated_at automatically.",
    {
      name: z.string().describe("Collection / table name (e.g. 'subscribers')."),
      schema: z
        .array(z.object({ name: z.string(), type: z.string().describe("Field type: string | text | integer | float | boolean | naive_datetime | binary_id | map | array"), required: z.boolean().optional() }))
        .describe("Field definitions, e.g. [{name:'email',type:'string',required:true},{name:'joined_at',type:'naive_datetime'}]."),
    },
    ({ name, schema }) => handle(() => api.createCollection({ name, schema })),
  );
  server.tool(
    "insert_collection_record",
    "Insert a record into a collection (custom data table). `record` is a field→value object matching the table schema.",
    {
      table_name: z.string().describe("Collection table name."),
      record: z.record(z.any()).describe("Record fields, e.g. { email:'a@b.com', joined_at:'2026-06-26T10:00:00' }."),
    },
    ({ table_name, record }) => handle(() => api.insertCollectionRecord(table_name, record)),
  );
  server.tool(
    "update_collection_record",
    "Update a record in a collection by id. `record` carries only the changed fields.",
    {
      table_name: z.string().describe("Collection table name."),
      record_id: z.string().describe("Record id to update."),
      record: z.record(z.any()).describe("Changed fields."),
    },
    ({ table_name, record_id, record }) => handle(() => api.updateCollectionRecord(table_name, record_id, record)),
  );
  server.tool(
    "delete_collection_record",
    "Delete a record from a collection by id.",
    {
      table_name: z.string().describe("Collection table name."),
      record_id: z.string().describe("Record id to delete."),
    },
    ({ table_name, record_id }) => handle(() => api.deleteCollectionRecord(table_name, record_id)),
  );
}

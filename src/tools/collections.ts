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

  // ── Table-management tools (VERIFIED live: create table, edit columns, delete table). ──
  // Custom-column types (matches the builderx_spa column editor; backend accepts these + more):
  //   text | rich_text | url | integer | float | decimal | boolean | reference | color |
  //   image | media_gallery | video | audio | document | date | naive_datetime | time |
  //   address | object | array.
  // (string/binary_id/map are backend aliases of text/reference/object; binary_id & naive_datetime
  //  are reserved for SYSTEM columns like id/inserted_at — don't pick them for custom fields.)
  const COLUMN = z.object({
    name: z.string().describe("Column name (snake_case)."),
    type: z
      .string()
      .describe(
        "text | rich_text | url | integer | float | decimal | boolean | reference | color | image | media_gallery | video | audio | document | date | naive_datetime | time | address | object | array",
      ),
    display_name: z.string().optional(),
    is_required: z.boolean().optional(),
    is_unique: z.boolean().optional(),
    note: z.string().optional().describe("Help text / description for the column."),
    default: z.any().optional().describe("Default value for the column."),
    reference: z
      .string()
      .optional()
      .describe(
        "For type 'reference' only: the referenced table_name, or a system entity (customer | product | article | blog | variation).",
      ),
    reference_type: z
      .enum(["system", "collection"])
      .optional()
      .describe("For type 'reference' only: 'system' (built-in entity) or 'collection' (another custom table)."),
    date_default_type: z
      .enum(["empty", "added", "specific"])
      .optional()
      .describe("For type 'date'/'naive_datetime' only: how the default date is set."),
  });
  server.tool(
    "create_collection",
    "Create a new collection (custom data TABLE). It starts with the system columns (id/inserted_at/updated_at/creator_id); pass `columns` to add custom fields. NOTE: to WRITE records into it, use an HTTP function (webcake-data: db.model(table).create({...})) — the dashboard has no direct record-insert API. See get_http_function for the SDK guide.",
    {
      name: z.string().describe("Display name."),
      table_name: z.string().optional().describe("Table name (snake_case, unique). Defaults to name."),
      columns: z.array(COLUMN).optional().describe("Custom columns to add, e.g. [{name:'email',type:'text'},{name:'amount',type:'integer'}]."),
    },
    ({ name, table_name, columns }) =>
      handle(async () => {
        const tn = (table_name || name).trim();
        const created: any = await api.createCollection({ name, table_name: tn });
        const col = (created && (created.data || created)) || {};
        const id = col.id;
        if (!id) return { error: "Collection created but no id returned.", raw: created };
        let schema = col.schema || [];
        if (columns && columns.length) {
          // PATCH the FULL schema = existing system columns + the new custom ones.
          const custom = columns.map((c) => ({ ...c, display_name: c.display_name || c.name, create_type: "custom" }));
          const res: any = await api.updateCollectionSchema(id, [...schema, ...custom]);
          schema = (res && (res.data || res) || {}).schema || [...schema, ...custom];
        }
        return {
          success: true,
          collection_id: id,
          table_name: col.table_name || tn,
          columns: schema.map((f: any) => ({ name: f.name, type: f.type, kind: f.create_type || "system" })),
          note: "Write rows via an HTTP function (db.model('" + (col.table_name || tn) + "').create({...})); query them with query_collection_records.",
        };
      }),
  );
  server.tool(
    "update_collection_columns",
    "Add or change a collection's custom columns. Reads the current schema, then PATCHes it with the system columns + your custom columns (the PATCH replaces the whole schema, so omitting a column drops it).",
    {
      collection_id: z.string().describe("Collection id (from list_collections / get_collection)."),
      columns: z.array(COLUMN).describe("The FULL set of custom columns the table should have."),
    },
    ({ collection_id, columns }) =>
      handle(async () => {
        const cur: any = await api.getCollectionById(collection_id);
        const schema = ((cur && (cur.data || cur)) || {}).schema || [];
        const system = schema.filter((f: any) => (f.create_type || "system") === "system");
        const custom = columns.map((c) => ({ ...c, display_name: c.display_name || c.name, create_type: "custom" }));
        const res: any = await api.updateCollectionSchema(collection_id, [...system, ...custom]);
        const newSchema = ((res && (res.data || res)) || {}).schema || [...system, ...custom];
        return { success: true, collection_id, columns: newSchema.map((f: any) => ({ name: f.name, type: f.type, kind: f.create_type || "system" })) };
      }),
  );
  server.tool(
    "delete_collection",
    "Delete a collection (table) and all its records by id. Irreversible.",
    { collection_id: z.string().describe("Collection id.") },
    ({ collection_id }) => handle(() => api.deleteCollection(collection_id)),
  );
}

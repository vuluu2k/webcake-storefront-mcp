import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Catalog taxonomy/extras that the dashboard exposes around products:
// brands, suppliers, product tags, ribbons (sale badges), materials, variations,
// measurement units, blocked phone numbers, and "contact for price" config.
// All create_or_update endpoints upsert by id; pass is_removed:true to soft-delete.

export function registerCatalogExtraTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const unwrap = (res: any, key: string) => res?.data?.[key] ?? res?.[key] ?? res?.data ?? res;

  // ── Brands ──
  server.tool(
    "list_product_brands",
    "List product brand tags for the site.",
    {},
    () => handle(async () => unwrap(await api.listProductBrands(), "brand_tags")),
  );
  server.tool(
    "upsert_product_brand",
    "Create or update a product brand. Omit `id` to create; pass `is_removed:true` with an `id` to delete.",
    {
      id: z.string().optional().describe("Brand id (omit to create)"),
      name: z.string().describe("Brand name"),
      slug: z.string().optional().describe("URL slug"),
      description: z.string().optional().describe("Description"),
      is_removed: z.boolean().optional().describe("Set true to soft-delete"),
    },
    (body) => handle(async () => unwrap(await api.upsertProductBrand(body), "brand_tag")),
  );

  // ── Suppliers ──
  server.tool(
    "list_product_suppliers",
    "List product supplier tags for the site.",
    {},
    () => handle(async () => unwrap(await api.listProductSuppliers(), "supplier_tags")),
  );
  server.tool(
    "upsert_product_supplier",
    "Create or update a product supplier. Omit `id` to create; `is_removed:true` to delete.",
    {
      id: z.string().optional().describe("Supplier id (omit to create)"),
      name: z.string().describe("Supplier name"),
      is_removed: z.boolean().optional().describe("Set true to soft-delete"),
    },
    (body) => handle(async () => unwrap(await api.upsertProductSupplier(body), "supplier_tag")),
  );

  // ── Product tags ──
  server.tool(
    "list_product_tags",
    "List product tags (paginated, searchable by name).",
    {
      page: z.number().optional().describe("Page number (default 1)"),
      limit: z.number().optional().describe("Items per page (default 20)"),
      term: z.string().optional().describe("Search by name"),
    },
    (query) => handle(async () => unwrap(await api.listProductTags(query), "data")),
  );
  server.tool(
    "upsert_product_tag",
    "Create or update a product tag. Omit `id` to create; `is_removed:true` to delete (also detaches from products).",
    {
      id: z.string().optional().describe("Tag id (omit to create)"),
      name: z.string().describe("Tag name"),
      slug: z.string().optional().describe("URL slug"),
      is_removed: z.boolean().optional().describe("Set true to soft-delete"),
    },
    (body) => handle(async () => unwrap(await api.upsertProductTag(body), "product_tag")),
  );

  // ── Ribbons (sale badges) ──
  server.tool(
    "list_ribbons",
    "List ribbons (product sale badges) for the site.",
    {},
    () => handle(async () => unwrap(await api.listRibbons(), "ribbons")),
  );
  server.tool(
    "upsert_ribbon",
    "Create or update a ribbon (sale badge). `type` and `name` are unique per site. Omit `id` to create; `is_removed:true` to delete.",
    {
      id: z.string().optional().describe("Ribbon id (omit to create)"),
      name: z.string().describe("Ribbon name (unique per site)"),
      type: z.number().describe("Ribbon type code (unique per site)"),
      status: z.number().optional().describe("Status code"),
      start_time: z.string().optional().describe("ISO datetime the ribbon starts"),
      end_time: z.string().optional().describe("ISO datetime the ribbon ends"),
      end_day: z.number().optional().describe("Auto-expire after N days"),
      is_removed: z.boolean().optional().describe("Set true to soft-delete"),
    },
    (body) => handle(async () => unwrap(await api.upsertRibbon(body), "ribbon")),
  );

  // ── Materials ──
  server.tool(
    "list_materials",
    "List product materials for the site.",
    {},
    () => handle(async () => unwrap(await api.listMaterials(), "materials")),
  );
  server.tool(
    "upsert_material",
    "Create or update a product material. Supports nesting via parent_id. Omit `id` to create; `is_removed:true` to delete.",
    {
      id: z.string().optional().describe("Material id (omit to create)"),
      name: z.string().describe("Material name"),
      slug: z.string().optional().describe("URL slug"),
      description: z.string().optional().describe("Description"),
      parent_id: z.string().optional().describe("Parent material id (for nesting)"),
      is_removed: z.boolean().optional().describe("Set true to soft-delete"),
    },
    (body) => handle(async () => unwrap(await api.upsertMaterial(body), "material")),
  );

  // ── Variations ──
  server.tool(
    "get_variation",
    "Get a single product variation by its id.",
    { variation_id: z.string().describe("Variation id") },
    ({ variation_id }) => handle(async () => unwrap(await api.getVariation(variation_id), "variation")),
  );

  // ── Measurement units ──
  server.tool(
    "get_product_measurement",
    "Get the product measurement-unit tree (units with exchange values).",
    {},
    () => handle(async () => unwrap(await api.getProductMeasurement(), "product_measures")),
  );
  server.tool(
    "update_product_measurement",
    "Upsert product measurement units (full list). Each unit upserts by id; pass is_removed:true to delete one.",
    {
      units: z.array(z.object({
        id: z.string().optional().describe("Unit id (omit to create)"),
        name: z.string().describe("Unit name"),
        is_default: z.boolean().describe("Whether this is the default/base unit"),
        exchange_value: z.number().describe("Conversion value vs the base unit"),
        parent_id: z.string().optional().describe("Parent unit id"),
        is_removed: z.boolean().optional().describe("Set true to delete this unit"),
      }).passthrough()).describe("Full list of measurement units"),
    },
    ({ units }) => handle(() => api.updateProductMeasurement(units)),
  );

  // ── Blocked phone numbers ──
  server.tool(
    "list_blocked_phones",
    "List blocked phone numbers (e.g. blacklisted customers).",
    {
      term: z.string().optional().describe("Search term"),
      type: z.number().optional().describe("Block type code"),
    },
    (query) => handle(async () => unwrap(await api.listBlockPhoneNumbers(query), "block_list")),
  );
  server.tool(
    "block_phone_customers",
    "Block customer phone numbers (upsert the given list).",
    { phone_numbers: z.array(z.string()).min(1).describe("Phone numbers to block") },
    ({ phone_numbers }) => handle(() => api.upsertBlockPhoneCustomers(phone_numbers)),
  );
  server.tool(
    "unblock_all_phone_customers",
    "Remove all blocked customer phone numbers for the site.",
    {},
    () => handle(() => api.removeAllBlockPhoneCustomers()),
  );

  // ── Contact for price ──
  server.tool(
    "get_price_contact",
    'Get the "contact for price" config. type 1 = applied to products, 2 = applied to categories.',
    { type: z.number().optional().describe("1 = products, 2 = categories") },
    ({ type }) => handle(async () => unwrap(await api.getPriceContacts(type), "price_contacts")),
  );
  server.tool(
    "update_price_contact",
    'Set which products/categories are "contact for price" (full replace within the given type). type 1 → pass product_ids; type 2 → pass category_ids.',
    {
      type: z.number().describe("1 = products, 2 = categories"),
      product_ids: z.array(z.string()).optional().describe("Product ids (when type=1)"),
      category_ids: z.array(z.string()).optional().describe("Category ids (when type=2)"),
    },
    (body) => handle(() => api.updatePriceContact(body)),
  );

  // ── Category detail ──
  server.tool(
    "get_category",
    "Get a single product category by id (includes custom sort product ids).",
    { category_id: z.string().describe("Category id") },
    ({ category_id }) => handle(async () => unwrap(await api.getCategoryById(category_id), "data")),
  );
}

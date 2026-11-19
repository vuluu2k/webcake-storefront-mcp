// Tool families: one MCP tool per domain, the operation picked by `action` — the way sbuilder's
// sb_store / sb_collection keep ~40 tools for a whole platform. The action names ARE the old tool
// names, so every guide and description that says "call new_section" still reads right, and
// invoke_tool keeps accepting the old names. Members are registered exactly as before (the
// collector in registry.ts); a family only changes how they are exposed.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface FamilyMember {
  name: string;
  description: string;
  shape: Record<string, any>;
  handler: (args: any, extra?: any) => any;
}

/** family tool name → [one-line purpose, member tool names]. Order = order shown to the model. */
export const FAMILIES: Record<string, [string, string[]]> = {
  page: ["Pages of the current site: list, create, rename/SEO, delete, read and save the source, content text, preview", [
    "list_pages", "create_page", "update_page", "delete_page", "get_page_source", "update_page_source", "list_page_contents", "update_page_content", "preview_page",
  ]],
  page_element: ["Read and edit single elements on a saved page, or append a section", [
    "search_page_elements", "get_page_element", "update_page_element", "update_page_elements", "add_section",
  ]],
  page_draft: ["Build a page section by section in a draft, then commit it as one save", [
    "start_page_draft", "add_draft_section", "get_page_draft", "list_page_drafts", "commit_page_draft", "clear_page_draft",
  ]],
  builder_ref: ["Reference for composing pages: elements, attributes, events, bindings, schema, guides, section templates", [
    "get_build_guide", "get_intake_guide", "list_elements", "get_element", "list_events", "list_bindings", "get_page_schema", "list_section_templates",
  ]],
  compose: ["Create element nodes from the factory (never hand-write nodes)", [
    "new_element", "new_section", "new_row", "new_page_skeleton",
  ]],
  global_source: ["Site-wide sources (popups, cart drawer, header/footer sources): list, read, create, edit, translate", [
    "list_global_sources", "get_global_source_detail", "create_global_source", "update_global_source", "delete_global_source",
    "search_global_source_elements", "get_global_source_element", "update_global_source_element", "update_global_source_elements",
    "get_global_source_contents", "update_global_source_contents",
  ]],
  global_section: ["Global header/footer/custom sections shown on every page", [
    "list_global_sections", "get_global_section", "create_global_section", "delete_global_section", "search_global_section_elements", "get_global_section_element",
  ]],
  site_code: ["Custom code, site-wide or for ONE page (native first: refused when an element can do it)", [
    "get_site_custom_code", "update_site_custom_code", "append_site_custom_code", "get_page_custom_code", "update_page_custom_code",
  ]],
  theme: ["Site themes and templates", ["list_themes", "semantic_search_themes", "list_template_themes", "create_site_from_template"]],
  product: ["Products of the store", ["list_products", "get_product", "create_product", "update_product", "delete_product", "set_product_published"]],
  product_category: ["Product categories", ["list_categories", "create_product_category", "update_product_category", "delete_product_category"]],
  promotion: ["Promotions and combos", ["list_promotions", "search_promotions", "get_promotion", "get_promotion_items", "get_active_promotions", "list_combos", "get_combo_items"]],
  order: ["Orders and customers", ["list_orders", "get_order", "list_customers", "find_customer"]],
  blog: ["Blog articles and blog categories", ["list_articles", "get_article", "create_article", "update_article", "delete_article", "create_blog_category", "update_blog_category"]],
  collection: ["CMS collections (custom data tables) and their records", ["list_collections", "get_collection", "create_collection", "update_collection_columns", "delete_collection", "query_collection_records"]],
  cms_function: ["CMS files and HTTP functions (backend code): read, edit, version, run", [
    "get_http_function", "get_http_function_snippet", "edit_http_function", "update_http_function", "create_cms_file", "update_cms_file",
    "save_file_version", "restore_file_version", "run_function",
  ]],
  app: ["Apps of the site (install, configure, remove)", ["list_apps", "get_app", "install_app", "uninstall_app"]],
  cached_result: ["Large results kept server-side: list and page through them", ["list_cached_results", "read_cached_result"]],
};

/** First sentence of a description, capped — the per-action line in the family description. */
const firstSentence = (d: string) => {
  const one = d.replace(/\s+/g, " ").trim();
  const cut = one.search(/(?<=[a-z0-9)\]"'])\.\s/i);
  const s = cut > 20 ? one.slice(0, cut + 1) : one;
  return s.length > 180 ? `${s.slice(0, 177)}…` : s;
};

const typeName = (s: any): string | undefined => s?._def?.typeName === "ZodOptional" || s?._def?.typeName === "ZodDefault" ? typeName(s._def.innerType) : s?._def?.typeName;

const unwrap = (s: any): any => (["ZodOptional", "ZodDefault", "ZodNullable"].includes(s?._def?.typeName) ? unwrap(s._def.innerType) : s);
/** Top-level type only: nested object/array schemas are re-checked per action and shown by help. */
function shallow(s: any): any {
  const t = unwrap(s)?._def?.typeName;
  if (t === "ZodObject" || t === "ZodRecord") return z.record(z.any());
  if (t === "ZodArray") return z.array(z.any());
  if (t === "ZodString" || t === "ZodNumber" || t === "ZodBoolean" || t === "ZodEnum" || t === "ZodLiteral") return unwrap(s);
  return z.any();
}
const shortDesc = (d: string | undefined) => {
  if (!d) return undefined;
  const one = d.replace(/\s+/g, " ").trim();
  const cut = one.search(/(?<=[a-z0-9)\]"'])\.\s/i);
  const s = cut > 10 ? one.slice(0, cut + 1) : one;
  return s.length > 100 ? `${s.slice(0, 97)}…` : s;
};

/** The union of the members' arguments, all optional, each at its top-level type (each action
 *  re-checks its own full shape). A name two members type differently becomes z.any(). */
function unionShape(members: FamilyMember[]) {
  const shape: Record<string, any> = {};
  const desc: Record<string, string | undefined> = {};
  const owners: Record<string, string[]> = {};
  for (const m of members)
    for (const [k, v] of Object.entries(m.shape)) {
      (owners[k] ||= []).push(m.name);
      const sv = shallow(v);
      if (!(k in shape)) {
        shape[k] = sv;
        desc[k] = (v as any)?.description ?? unwrap(v)?.description;
      } else if (typeName(shape[k]) !== typeName(sv)) shape[k] = z.any();
    }
  for (const k of Object.keys(shape)) {
    const who = owners[k].length === members.length ? "" : ` [${owners[k].join(", ")}]`;
    shape[k] = shape[k].optional().describe(`${shortDesc(desc[k]) || k}${who}`);
  }
  return shape;
}

export function familyTool(name: string, purpose: string, members: FamilyMember[]) {
  const actions = members.map((m) => m.name) as [string, ...string[]];
  const byName = new Map(members.map((m) => [m.name, m]));
  const description =
    `${purpose}. Pick the operation with \`action\` and pass that action's arguments (help:true returns its full documentation and schema).\n` +
    members.map((m) => `- ${m.name}: ${firstSentence(m.description)}`).join("\n");
  const shape = {
    action: z.enum(actions).describe("Which operation to run"),
    help: z.boolean().optional().describe("Return the action's full documentation and argument schema instead of running it"),
    ...unionShape(members),
  };
  const handler = async (args: any, extra?: any) => {
    const { action, help, ...rest } = args || {};
    const m = byName.get(action)!;
    if (help) {
      const schema = zodToJsonSchema(z.object(m.shape), { $refStrategy: "none" });
      return { content: [{ type: "text" as const, text: JSON.stringify({ action, description: m.description, input_schema: schema }) }] };
    }
    const parsed = z.object(m.shape).strict().safeParse(rest);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      const allowed = Object.keys(m.shape);
      return {
        content: [{ type: "text" as const, text: `Error: invalid arguments for ${name}{action:"${action}"}: ${issues}. It takes: ${allowed.join(", ") || "no arguments"} (help:true for details).` }],
        isError: true,
      };
    }
    return m.handler(parsed.data, extra);
  };
  return { description, shape, handler };
}

/** Family name for a member tool (for the system prompt / search results). */
export const FAMILY_OF: Record<string, string> = Object.fromEntries(
  Object.entries(FAMILIES).flatMap(([fam, [, members]]) => members.map((m) => [m, fam]))
);

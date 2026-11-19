// api_find / api_get / api_call: the whole builderx_api surface the storefront JWT can reach,
// from src/api-catalog.generated.json (scripts/gen-api-catalog.mjs reads the Phoenix routers and
// controllers). The hand-written tools stay the way to do anything they cover: a write to a route
// one of them owns is refused here and names that tool, since those tools carry the guards
// (settings merge, page-source validation, native-first, CMS tokens, by_ai…).
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

export interface ApiOp {
  id: string;
  method: string;
  path: string;
  handler: string;
  perms?: string[];
  /** Body (non-GET) or query (GET) keys the action reads; a key's array = its fields one level down. */
  params?: Record<string, string[] | null>;
  required?: string[];
  /** Hand-written tools that already cover this route. */
  tools?: string[];
}

let CATALOG: { meta: any; ops: ApiOp[] } = { meta: {}, ops: [] };
try {
  CATALOG = JSON.parse(readFileSync(new URL("../api-catalog.generated.json", import.meta.url), "utf8"));
} catch {
  /* catalog missing: the tools answer with an empty list */
}
export const API_OPS = CATALOG.ops;
const BY_ID = new Map(API_OPS.map((o) => [o.id, o]));

/** Irreversible account-level operations: never through the generic gateway. */
const DENY: Record<string, string> = {
  "post:/api/v1/dashboard/site/delete": "deleting a site is done by the owner in the WebCake dashboard",
  "post:/api/v1/dashboard/site/:site_id/settings/employee/move_owner_permission": "transferring site ownership is done by the owner in the WebCake dashboard",
};

const pathParams = (path: string) => [...path.matchAll(/:(\w+)/g)].map((m) => m[1]);
const words = (s: string) =>
  s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** One line per operation — what api_find returns for a query. */
export function opLine(o: ApiOp): string {
  const keys = o.params ? Object.keys(o.params) : [];
  const shown = keys.slice(0, 6).map((k) => (o.required?.includes(k) ? `${k}*` : k));
  return `${o.id} — ${o.handler}${shown.length ? ` (${shown.join(", ")}${keys.length > 6 ? ", …" : ""})` : ""}${o.tools ? ` ⇒ tool: ${o.tools.slice(0, 3).join(", ")}` : ""}`;
}

export function searchOps(query: string, limit = 15, method?: string): ApiOp[] {
  const terms = words(query);
  const scored = API_OPS.filter((o) => !method || o.method === method.toUpperCase())
    .map((o) => {
      const segs = words(o.path.replace(/:\w+/g, ""));
      const hw = words(o.handler);
      const pw = Object.keys(o.params || {}).flatMap(words);
      let s = 0;
      for (const t of terms) {
        if (segs.includes(t)) s += 3;
        else if (segs.some((w) => w.startsWith(t) || t.startsWith(w) && w.length > 3)) s += 2;
        if (hw.includes(t)) s += 2;
        if (pw.includes(t)) s += 1;
      }
      if (s && o.path.includes("/dashboard/site/:site_id/")) s += 0.5; // the site-scoped admin API
      return { o, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.o.path.length - b.o.path.length);
  return scored.slice(0, limit).map((x) => x.o);
}

/** The call sheet: everything needed to call one operation correctly. */
export function describeOp(o: ApiOp) {
  const where = o.method === "GET" ? "query" : "body";
  return {
    id: o.id,
    method: o.method,
    path: o.path,
    handler: o.handler,
    path_params: pathParams(o.path),
    [where]: o.params || "not readable from the controller — send a modified copy of the matching GET",
    ...(o.required ? { required: o.required } : {}),
    ...(o.perms ? { needs_permission: o.perms } : {}),
    ...(o.tools
      ? { prefer_tool: o.tools, note: o.method === "GET" ? "A dedicated tool covers this route and returns a cleaner result." : "Writes to this route go through the dedicated tool (it carries the guards); api_call refuses them." }
      : {}),
    ...(DENY[o.id] ? { refused: DENY[o.id] } : {}),
  };
}

const LIST_KEYS = ["data", "items", "products", "orders", "customers", "articles", "results", "list", "records", "entries"];
/** Trim a response for the model: keep `pick` fields per item, cap list length. */
export function trimResult(res: any, pick?: string[], maxItems = 50): any {
  const pickOne = (x: any) =>
    pick && x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(pick.filter((k) => k in x).map((k) => [k, x[k]])) : x;
  const trimList = (arr: any[]) => {
    const items = arr.slice(0, maxItems).map(pickOne);
    return arr.length > maxItems ? { items, total_items: arr.length, truncated: true } : items;
  };
  if (Array.isArray(res)) return trimList(res);
  if (res && typeof res === "object") {
    for (const k of LIST_KEYS) {
      if (Array.isArray(res[k])) return { ...res, [k]: trimList(res[k]) };
      if (res[k] && typeof res[k] === "object")
        for (const k2 of LIST_KEYS) if (Array.isArray(res[k][k2])) return { ...res, [k]: { ...res[k], [k2]: trimList(res[k][k2]) } };
    }
    return pick ? pickOne(res) : res;
  }
  return res;
}

const MAX_CHARS = 30_000;

export function registerApiGatewayTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "api_find",
    `Search the FULL WebCake backend API (${API_OPS.length} operations the storefront account can call — far more than the dedicated tools cover). With \`query\`: one line per match \`id — Controller.action (body/query keys, * = required) ⇒ tool: dedicated tool if one exists\`. With \`id\`: the call sheet (path params, body/query keys with their nested fields, required keys, permission needed). Prefer a dedicated tool when one is listed; use api_get / api_call for the rest.`,
    {
      query: z.string().optional().describe("English keywords from the path/controller, e.g. 'shipping fee', 'product tag', 'customer point'"),
      id: z.string().optional().describe("Exact operation id from a previous search, e.g. 'post:/api/v1/dashboard/site/:site_id/products/create'"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().describe("Only this HTTP method"),
      limit: z.number().int().min(1).max(40).optional().describe("Max lines (default 15)"),
    },
    ({ query, id, method, limit }) =>
      handle(async () => {
        if (id) {
          const o = BY_ID.get(id);
          if (!o) throw new Error(`Unknown operation "${id}". Search with api_find({ query }).`);
          return describeOp(o);
        }
        if (!query) throw new Error("Pass query (keywords) or id (an operation id).");
        const hits = searchOps(query, limit ?? 15, method);
        return hits.length ? hits.map(opLine) : `No operation matches "${query}". Try other English words from the path (e.g. 'promotion', 'shipping', 'tag').`;
      })
  );

  const call = async (args: any, readOnly: boolean) => {
    const o = args.id ? BY_ID.get(args.id) : API_OPS.find((x) => x.method === String(args.method || "").toUpperCase() && x.path === args.path);
    if (!o) throw new Error(`Unknown operation${args.id ? ` "${args.id}"` : ""}. Find it with api_find({ query }) and pass its id.`);
    if (readOnly && o.method !== "GET") throw new Error(`${o.id} is a ${o.method} — run it with api_call.`);
    if (DENY[o.id]) throw new Error(`Refused: ${DENY[o.id]}.`);
    if (o.method !== "GET" && o.tools) throw new Error(`Refused: ${o.id} is written through ${o.tools.join(" / ")} — that tool validates and guards this write. Use it instead.`);

    const params: Record<string, string> = { ...(args.path_params || {}) };
    if (params.site_id == null && pathParams(o.path).includes("site_id")) {
      if (!api.siteId) throw new Error("No site selected — call list_my_sites + switch_site, or pass path_params.site_id.");
      params.site_id = api.siteId;
    }
    const missingPath = pathParams(o.path).filter((p) => params[p] == null || params[p] === "");
    if (missingPath.length) throw new Error(`Missing path_params: ${missingPath.join(", ")}. Call sheet: api_find({ id: "${o.id}" }).`);
    const path = o.path.replace(/:(\w+)/g, (_, p) => encodeURIComponent(String(params[p])));

    const input = o.method === "GET" ? args.query || {} : args.body || {};
    const missing = (o.required || []).filter((k) => input[k] === undefined);
    if (missing.length) throw new Error(`Missing required ${o.method === "GET" ? "query" : "body"} keys: ${missing.join(", ")}. Call sheet: api_find({ id: "${o.id}" }).`);
    const unknown = o.params ? Object.keys(input).filter((k) => !(k in o.params!)) : [];

    if (o.method !== "GET" && args.dry_run !== false)
      return {
        dry_run: true,
        would_send: { method: o.method, path, ...(args.query ? { query: args.query } : {}), body: input },
        ...(unknown.length ? { unknown_keys: unknown, note: "the action never reads these keys" } : {}),
        next: "Show the user what will change; on their OK call again with dry_run:false.",
      };

    let res: any;
    try {
      res = await api.request(o.method === "ANY" ? "POST" : o.method, path, o.method === "GET" ? { query: input } : { body: input, query: args.query });
    } catch (e: any) {
      const msg = e?.message || String(e);
      throw new Error(/API 403/.test(msg) && o.perms ? `${msg} — needs site permission ${o.perms.join(" / ")}.` : msg);
    }
    const out = trimResult(res, args.pick, args.max_items ?? 50);
    const text = JSON.stringify(out);
    return {
      ...(unknown.length ? { unknown_keys: unknown } : {}),
      result: text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}… (cut at ${MAX_CHARS} chars — narrow with pick / max_items / query filters)` : out,
    };
  };

  const shared = {
    id: z.string().optional().describe("Operation id from api_find (preferred)"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "ANY"]).optional().describe("With path, when id is not given"),
    path: z.string().optional().describe("Catalog path with :params, e.g. /api/v1/dashboard/site/:site_id/product_tags/all"),
    path_params: z.record(z.string()).optional().describe("Values for :params in the path; site_id defaults to the current site"),
    query: z.record(z.any()).optional().describe("Query-string values"),
    pick: z.array(z.string()).optional().describe("Keep only these fields on each item of a list result (or on a single object)"),
    max_items: z.number().int().min(1).max(500).optional().describe("Cap list results (default 50)"),
  };

  server.tool(
    "api_get",
    "Run a READ-ONLY (GET) operation from api_find by id. site_id is filled from the current site. Use pick / max_items to keep the result small. Refuses anything that is not a GET.",
    shared,
    (args) => handle(() => call(args, true))
  );

  server.tool(
    "api_call",
    "Run any operation from api_find by id (GET, POST, PUT, PATCH, DELETE). Writes default to dry_run:true and return exactly what would be sent — show the user, then repeat with dry_run:false. Refuses writes to routes a dedicated tool owns (it names the tool) and irreversible account operations. Required keys are checked against the call sheet before sending.",
    {
      ...shared,
      body: z.any().optional().describe("JSON body for POST/PUT/PATCH/DELETE (keys from the call sheet)"),
      dry_run: z.boolean().optional().describe("Default true for writes: describe, don't send"),
    },
    (args) => handle(() => call(args, false))
  );
}

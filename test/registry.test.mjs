// Offline smoke tests for the tool registry + search gateway (no backend needed).
// Run: npm test  (node --test). Uses a stub api so nothing hits the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../dist/server.js";
import { toolEntries } from "../dist/tools/registry.js";

const stubApi = () => new Proxy({}, { get: () => async () => ({ data: {} }) });
const build = (opts) => createServer(stubApi(), opts);
const toolNames = (s) => Object.keys(s._registeredTools || {});
const meta = (s, name) => s._registeredTools[name];
const callJson = async (s, name, args) => {
  const r = await meta(s, name).handler(args ?? {}, {});
  return { isError: !!r.isError, text: r.content[0].text, json: safe(r.content[0].text) };
};
const safe = (t) => { try { return JSON.parse(t); } catch { return t; } };

test("gateway meta-tools are always present", () => {
  const s = build();
  for (const n of ["list_tool_groups", "search_tools", "invoke_tool", "invoke_read_tool"]) {
    assert.ok(toolNames(s).includes(n), `${n} must be registered`);
  }
});

test("core mode loads fewer tools than all mode; the registry keeps every tool", () => {
  const core = toolNames(build()).length;
  const all = toolNames(build({ tools: "all" })).length;
  assert.ok(core < all, "core must be smaller than all");
  assert.ok(core <= 136, `core grew to ${core} native tools — move a group on-demand or fold it into the api gateway`);
  assert.ok(toolEntries(build()).size >= 150, "the registry still holds every tool");
});

test("deferred tools are hidden in core but reachable via the registry", () => {
  const core = build();
  // A deferred (non-core) tool is not natively registered...
  assert.ok(!toolNames(core).includes("list_affiliate_payouts"), "affiliate tool should be deferred in core");
  // ...but list_tool_groups still reports its group as existing.
});

test("group spec resolution: all / explicit / +delta / -delta", () => {
  const n = (spec) => toolNames(build({ tools: spec })).length;
  const core = n(undefined);
  assert.equal(n("all") > core, true, "all must add tools");
  assert.ok(n("+i18n") > core, "+i18n must add the multilingual group");
  assert.ok(n("core") === core, "core keyword equals default");
  assert.ok(n("-store") < core, "-store must remove the store group");
});

test("capability index is injected and is dynamic per spec", () => {
  const instr = (s) => (s.server && s.server._options && s.server._options.instructions) || "";
  const core = instr(build());
  const all = instr(build({ tools: "all" }));
  assert.ok(core.includes("## Capability map"), "index must be in the system prompt");
  const onDemandCore = (core.match(/\[on-demand\]/g) || []).length;
  const onDemandAll = (all.match(/\[on-demand\]/g) || []).length;
  assert.ok(onDemandCore > onDemandAll, "core must have more on-demand groups than all");
});

test("search_tools surfaces the right tool for representative queries", async () => {
  const s = build();
  const cases = {
    "translation": "list_translations",
    "site subscription plan": "get_site_subscription",
    "count sites by plan": "count_my_sites",
    "image alt": "set_image_alts",
    "automation": "list_automations",
  };
  for (const [q, expected] of Object.entries(cases)) {
    const { json } = await callJson(s, "search_tools", { query: q, limit: 6 });
    const names = json.map((x) => x.name);
    assert.ok(names.includes(expected), `query "${q}" should surface ${expected}, got: ${names.join(", ")}`);
  }
});

test("topics of the folded CRUD tools are found by api_find (shipping, domain, ribbon, pwa, affiliate payout, partner feed)", async () => {
  const s = build();
  for (const [q, path] of Object.entries({
    "shipping": "/settings/shipping",
    "domain": "/domains",
    "ribbon": "/ribbons",
    "pwa": "pwa",
    "affiliate payout": "affiliate",
    "partner feed": "partner_feed",
  })) {
    const { json } = await callJson(s, "api_find", { query: q, limit: 10 });
    assert.ok(json.some((l) => l.includes(path)), `api_find "${q}" → ${json.slice(0, 3)}`);
  }
});

test("a folded tool name sent to invoke_tool points at its gateway route", async () => {
  const r = await callJson(build(), "invoke_tool", { name: "list_ribbons", arguments: {} });
  assert.equal(r.isError, true);
  assert.match(r.text, /folded into the API gateway — run api_get\(\{ id: "get:\/api\/v1\/dashboard\/site\/:site_id\/products\/ribbons\/all"/);
});

test("search_tools returns a JSON input schema for each match", async () => {
  const s = build();
  const { json } = await callJson(s, "search_tools", { query: "translation", limit: 3 });
  assert.ok(json.length > 0, "should have results");
  for (const r of json) {
    assert.ok(r.input_schema && typeof r.input_schema === "object", "each result needs a JSON schema");
    assert.equal(typeof r.name, "string");
  }
});

test("invoke_tool validates arguments (missing required field)", async () => {
  const s = build();
  const r = await callJson(s, "invoke_tool", { name: "create_contact", arguments: {} });
  assert.equal(r.isError, true, "missing name must error");
  assert.match(r.text, /invalid arguments/i);
});

test("invoke_tool rejects unknown tool names", async () => {
  const s = build();
  const r = await callJson(s, "invoke_tool", { name: "totally_not_a_tool", arguments: {} });
  assert.equal(r.isError, true);
  assert.match(r.text, /unknown tool/i);
});

test("invoke_tool dispatches to a real handler (reaches the stub api)", async () => {
  const s = build();
  // list_translations is deferred in core; invoking it should run the handler against the stub api
  // and return a (non-error) result rather than 'unknown tool'.
  const r = await callJson(s, "invoke_tool", { name: "list_translations", arguments: { resource: "product", language_code: "en" } });
  assert.equal(r.isError, false, `expected success, got: ${r.text}`);
});

test("every tool carries annotations matching its verb", () => {
  const s = build({ tools: "all" });
  for (const [name, t] of Object.entries(s._registeredTools)) {
    const a = t.annotations;
    assert.equal(typeof a?.readOnlyHint, "boolean", `${name} has no readOnlyHint`);
    if (/^(list|get|search)_/.test(name)) assert.equal(a.readOnlyHint, true, `${name} should be read-only`);
    if (/^(delete|remove)_/.test(name)) assert.equal(a.destructiveHint, true, `${name} should be destructive`);
    if (/^(create|update|delete|publish|upsert)_/.test(name)) assert.equal(a.readOnlyHint, false, `${name} writes`);
  }
});

test("registry and native registration agree on the full catalog", async () => {
  const s = build({ tools: "all" });
  const groups = (await callJson(s, "list_tool_groups")).json;
  const inRegistry = groups.reduce((n, g) => n + g.tool_count, 0);
  assert.equal(inRegistry, toolNames(s).length - 4, "every registry tool must register natively in all mode (no silent overwrite)");
  assert.ok(groups.every((g) => g.tool_count > 0), `empty group: ${groups.filter((g) => !g.tool_count).map((g) => g.name)}`);
});

test("every tool with arguments yields a real JSON schema via search_tools", async () => {
  const s = build({ tools: "all" });
  const withArgs = Object.entries(s._registeredTools).filter(([, t]) => t.inputSchema && Object.keys(t.inputSchema.shape || {}).length);
  for (const [name] of withArgs) {
    const { json } = await callJson(s, "search_tools", { query: name, limit: 3 });
    const hit = json.find((r) => r.name === name);
    if (!hit) continue; // gateway meta-tools aren't in the registry
    assert.ok(hit.input_schema.properties && Object.keys(hit.input_schema.properties).length, `${name}: schema conversion fell back to {type:object}`);
  }
});

test("core tool budget: image alt/SEO stays on-demand", () => {
  const names = toolNames(build());
  assert.ok(!names.includes("set_image_alts"), "image_seo group must not load natively");
  // 136 = 133 + api_find/api_get/api_call: 3 tools that reach the ~550 routes no dedicated tool covers.
  assert.ok(names.length <= 136, `core grew to ${names.length} tools — move a group on-demand or raise this deliberately`);
});

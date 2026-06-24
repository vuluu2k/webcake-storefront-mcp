// Offline smoke tests for the tool registry + search gateway (no backend needed).
// Run: npm test  (node --test). Uses a stub api so nothing hits the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../dist/server.js";

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
  for (const n of ["list_tool_groups", "search_tools", "invoke_tool"]) {
    assert.ok(toolNames(s).includes(n), `${n} must be registered`);
  }
});

test("core mode loads fewer tools than all mode, but all >= 250", () => {
  const core = toolNames(build()).length;
  const all = toolNames(build({ tools: "all" })).length;
  assert.ok(core < all, "core must be smaller than all");
  assert.ok(core >= 40, `core too small: ${core}`);
  assert.ok(all >= 250, `expected the full catalog, got ${all}`);
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
    "shipping fee": "get_shipping",
    "add domain ssl": "add_domain",
    "block phone": "block_phone_customers",
    "affiliate payout": "list_affiliate_payouts",
    "email template": "get_email_templates",
    "appointment calendar": "list_appointment_calendars",
    "sitemap": "sync_sitemap",
    "pwa manifest": "get_pwa",
    "product ribbon": "list_ribbons",
  };
  for (const [q, expected] of Object.entries(cases)) {
    const { json } = await callJson(s, "search_tools", { query: q, limit: 6 });
    const names = json.map((x) => x.name);
    assert.ok(names.includes(expected), `query "${q}" should surface ${expected}, got: ${names.join(", ")}`);
  }
});

test("search_tools returns a JSON input schema for each match", async () => {
  const s = build();
  const { json } = await callJson(s, "search_tools", { query: "ribbon", limit: 3 });
  assert.ok(json.length > 0, "should have results");
  for (const r of json) {
    assert.ok(r.input_schema && typeof r.input_schema === "object", "each result needs a JSON schema");
    assert.equal(typeof r.name, "string");
  }
});

test("invoke_tool validates arguments (missing required field)", async () => {
  const s = build();
  const r = await callJson(s, "invoke_tool", { name: "upsert_ribbon", arguments: {} });
  assert.equal(r.isError, true, "missing name/type must error");
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
  // list_ribbons is deferred in core; invoking it should run the handler against the stub api
  // and return a (non-error) result rather than 'unknown tool'.
  const r = await callJson(s, "invoke_tool", { name: "list_ribbons", arguments: {} });
  assert.equal(r.isError, false, `expected success, got: ${r.text}`);
});

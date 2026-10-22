// list_promotions / search_promotions walk every page and carry pos_id; list_apps answers
// installed/not-installed in one call; invoke_read_tool runs reads only. Stub api, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../dist/server.js";

const call = async (s, name, args) => {
  const r = await s._registeredTools[name].handler(args ?? {}, {});
  return { isError: !!r.isError, text: r.content[0].text, json: (() => { try { return JSON.parse(r.content[0].text); } catch { return null; } })() };
};

// 46 promotions, every 3rd one linked to POS, even ones active — served 100/page like the backend.
const PROMOS = Array.from({ length: 46 }, (_, i) => ({ id: `p${i}`, name: `KM ${i}`, type: "normal", is_activated: i % 2 === 0, pos_id: i % 3 === 0 ? 900 + i : null, coupon_info: { huge: "x".repeat(50) } }));
const promoApi = (calls) => new Proxy({}, {
  get: (_, k) => k === "listPromotions"
    ? async (q) => { calls.push(q); const start = (q.page - 1) * q.limit; return { success: true, data: PROMOS.slice(start, start + q.limit), total_entries: PROMOS.length }; }
    : async () => ({}),
});

test("list_promotions: one call, all rows, POS summary, compact rows", async () => {
  const calls = [];
  const { json } = await call(createServer(promoApi(calls)), "list_promotions", {});
  assert.equal(json.data.length, 46);
  assert.deepEqual(json.summary, { total: 46, returned: 46, linked_pos: 16, not_linked_pos: 30, activated: 23 });
  assert.equal(json.data[0].pos_id, 900);
  assert.equal(json.data[1].pos_id, null);
  assert.equal(json.data[0].coupon_info, undefined, "nested blobs stay out of the list");
  assert.ok(calls.every((q) => q.limit === 100), "must ask for big pages, not the backend default of 15");
});

test("list_promotions: walks pages until total_entries", async () => {
  const many = Array.from({ length: 250 }, (_, i) => ({ id: `q${i}`, pos_id: i < 7 ? 1 : null }));
  const calls = [];
  const api = new Proxy({}, { get: (_, k) => k === "listPromotions"
    ? async (q) => { calls.push(q.page); return { data: many.slice((q.page - 1) * q.limit, q.page * q.limit), total_entries: 250 }; }
    : async () => ({}) });
  const { json } = await call(createServer(api), "list_promotions", {});
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(json.summary.returned, 250);
  assert.equal(json.summary.linked_pos, 7);
});

test("search_promotions: term/is_activated go to the backend, type filters locally, all pages", async () => {
  const calls = [];
  const { json } = await call(createServer(promoApi(calls)), "search_promotions", { term: " KM ", is_activated: true, type: "normal" });
  assert.equal(calls[0].term, "KM");
  assert.equal(calls[0].is_activated, true);
  assert.equal(json.data.length, 46, "stub ignores filters server-side; all pages must still be read");
});

test("list_apps: installed + not_installed in one call; is_active only gates product_design", async () => {
  const api = new Proxy({}, { get: (_, k) => k === "listApps"
    ? async () => ({ success: true, apps: [
        { id: "a", type: 0, is_active: false, settings: { zalo_secret_key: "no" } },
        { id: "b", type: 10, is_active: false },
        { id: "c", type: 2, is_active: true },
      ] })
    : async () => ({}) });
  const { json } = await call(createServer(api), "list_apps", {});
  assert.equal(json.installed_count, 3);
  assert.deepEqual(json.installed.map((a) => [a.name, a.enabled]), [["product_review", true], ["product_design", false], ["automation", true]]);
  assert.ok(json.not_installed.includes("affiliates") && !json.not_installed.includes("automation"));
  assert.ok(!JSON.stringify(json).includes("zalo_secret_key"), "settings (may hold secrets) are not returned");
});

test("invoke_read_tool: read-only annotation, runs reads, refuses writes", async () => {
  const s = createServer(new Proxy({}, { get: () => async () => ({ data: {} }) }));
  assert.equal(s._registeredTools.invoke_read_tool.annotations.readOnlyHint, true);
  assert.equal((await call(s, "invoke_read_tool", { name: "list_domains", arguments: { limit: 100 } })).isError, false);
  const w = await call(s, "invoke_read_tool", { name: "delete_domain", arguments: { domain_id: "x" } });
  assert.equal(w.isError, true);
  assert.match(w.text, /not read-only/);
});

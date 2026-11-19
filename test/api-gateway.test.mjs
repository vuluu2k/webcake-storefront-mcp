import { toolsOf } from "./tools-of.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../dist/server.js";
import { WebcakeCmsApi } from "../dist/api.js";
import { API_OPS, searchOps, trimResult, redactSecrets } from "../dist/tools/api-gateway.js";

function setup(reply = () => [200, { data: [] }]) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : undefined });
    const [status, body] = reply(u, init);
    return new Response(JSON.stringify(body), { status });
  };
  const tools = toolsOf(createServer(new WebcakeCmsApi({ baseUrl: "http://x", token: "t", siteId: "S1" })));
  const run = async (name, args) => {
    const r = await tools[name].handler(args, {});
    const text = r.content[0].text;
    return { isError: !!r.isError, text, json: (() => { try { return JSON.parse(text); } catch { return undefined; } })() };
  };
  return { calls, run };
}

test("catalog phủ backend: hàng trăm route, gồm cả route chưa có tool riêng", () => {
  assert.ok(API_OPS.length > 600, `${API_OPS.length}`);
  assert.ok(API_OPS.filter((o) => !o.tools).length > 400);
  const create = API_OPS.find((o) => o.id === "post:/api/v1/dashboard/site/:site_id/products/create");
  assert.deepEqual(create.required, ["product_params"]);
  assert.ok(create.params.product_params.includes("variations"));
  assert.deepEqual(create.tools, ["create_product"]);
});

test("api_find: một dòng mỗi route; id → call sheet", async () => {
  const { run } = setup();
  const lines = (await run("api_find", { query: "product tag" })).json;
  // product tags have no dedicated tool any more: the route itself is the way.
  assert.ok(lines.some((l) => /^get:\/api\/v1\/dashboard\/site\/:site_id\/products\/product_tags\/all — ProductController\.get_all_product_tags( \([^)]*\))?$/.test(l)), lines.join("\n"));
  const sheet = (await run("api_find", { id: "post:/api/v1/dashboard/site/:site_id/products/create" })).json;
  assert.deepEqual(sheet.path_params, ["site_id"]);
  assert.deepEqual(sheet.prefer_tool, ["create_product"]);
  assert.ok(sheet.body.product_params);
  assert.equal((await run("api_find", { id: "nope" })).isError, true);
});

test("api_get: tự điền site_id, pick + max_items cắt gọn kết quả, từ chối không phải GET", async () => {
  const op = API_OPS.find((o) => o.method === "GET" && o.path === "/api/v1/dashboard/site/:site_id/products/all");
  const { calls, run } = setup(() => [200, { data: Array.from({ length: 80 }, (_, i) => ({ id: i, name: `P${i}`, html: "x".repeat(50) })) }]);
  const r = (await run("api_get", { id: op.id, query: { page: 1, limit: 80 }, pick: ["id", "name"], max_items: 5 })).json;
  assert.equal(calls[0].path, "/api/v1/dashboard/site/S1/products/all");
  assert.deepEqual(calls[0].query, { page: "1", limit: "80" });
  assert.deepEqual(r.result.data.items[0], { id: 0, name: "P0" });
  assert.equal(r.result.data.total_items, 80);
  assert.match((await run("api_get", { id: "post:/api/v1/dashboard/site/:site_id/products/create" })).text, /api_call/);
});

test("api_call: ghi mặc định dry_run; route có tool riêng / thao tác không hoàn tác bị từ chối; thiếu key bắt buộc bị chặn", async () => {
  const free = API_OPS.find((o) => o.method === "POST" && !o.tools && o.required?.length && o.path.includes("/dashboard/site/:site_id/"));
  const { calls, run } = setup(() => [200, { success: true }]);
  const body = Object.fromEntries(free.required.map((k) => [k, "v"]));
  const dry = (await run("api_call", { id: free.id, body: { ...body, nonsense_key: 1 } })).json;
  assert.equal(dry.dry_run, true);
  assert.equal(calls.length, 0);
  if (free.params) assert.deepEqual(dry.unknown_keys, ["nonsense_key"]);
  const sent = (await run("api_call", { id: free.id, body, dry_run: false })).json;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body[free.required[0]], "v");
  assert.equal(sent.result.success, true);

  const missing = await run("api_call", { id: free.id, body: {}, dry_run: false });
  assert.match(missing.text, /Missing required body keys/);
  const owned = await run("api_call", { id: "post:/api/v1/dashboard/site/:site_id/products/create", body: { product_params: {} }, dry_run: false });
  assert.match(owned.text, /Refused: .*create_product/);
  assert.match((await run("api_call", { id: "post:/api/v1/dashboard/site/delete", dry_run: false })).text, /Refused: deleting a site/);
  assert.equal(calls.length, 1);
});

test("api_call: 403 nói rõ quyền cần có", async () => {
  const op = API_OPS.find((o) => o.method === "GET" && o.perms && !o.required);
  const { run } = setup(() => [403, { message: "Permission denied" }]);
  const r = await run("api_get", { id: op.id });
  assert.equal(r.isError, true);
  assert.match(r.text, new RegExp(`needs site permission ${op.perms[0]}`));
});

test("searchOps xếp route site-scoped lên trước; trimResult giữ nguyên object không phải list", () => {
  assert.ok(searchOps("shipping").length > 0);
  assert.deepEqual(trimResult({ a: 1, b: 2 }, ["a"]), { a: 1 });
});

test("gateway không bao giờ trả secret (token, api key, mật khẩu, qr thanh toán…)", async () => {
  assert.deepEqual(
    redactSecrets({ data: [{ id: 1, api_key: "k", nested: { client_secret: "s", password: "p" }, qr_data: "QR", is_secret: true, name: "ok" }] }),
    { data: [{ id: 1, api_key: "[redacted]", nested: { client_secret: "[redacted]", password: "[redacted]" }, qr_data: "[redacted]", is_secret: true, name: "ok" }] }
  );
  const { run } = setup(() => [200, { data: { key: "ADMIN-KEY", token: "SECRET-TOKEN" } }]);
  const r = await run("api_get", { id: "get:/api/v1/dashboard/site/:site_id/db_collections/token" });
  assert.ok(!r.text.includes("SECRET-TOKEN") && !r.text.includes("ADMIN-KEY"), r.text);
});

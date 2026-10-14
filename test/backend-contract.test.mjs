// Offline checks that the MCP talks to builderx_api / the storefront renderer the way they
// actually work today (each case was a real mismatch). Run: npm test. No network: fetch is stubbed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebcakeCmsApi } from "../dist/api.js";
import { createServer } from "../dist/server.js";
import { createCartIcon } from "../dist/builder/factory.js";
import { ELEMENT_ATTRS } from "../dist/builder/attributes.js";
import { BUILD_GUIDE } from "../dist/builder/guide.js";

/** Real WebcakeCmsApi with fetch stubbed: records every call, answers from `reply(path)`. */
function recordingApi(reply = () => ({})) {
  const calls = [];
  const api = new WebcakeCmsApi({ baseUrl: "https://api.test", token: "SESSION_JWT", siteId: "S1", sessionId: "W1" });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ method: init.method, path, auth: init.headers.Authorization, body: init.body && JSON.parse(init.body) });
    return new Response(JSON.stringify(reply(path)), { status: 200 });
  };
  return { api, calls, restore: () => (globalThis.fetch = realFetch) };
}

test("cms_function routes use the CMS admin token, not the session JWT", async () => {
  const { api, calls, restore } = recordingApi((p) => (p.endsWith("/db_collections/token") ? { data: { key: "ADMIN" } } : { data: { key: "K" } }));
  try {
    await api.findCustomerByPhone("0901");
    await api.sendMail({ to: "a@b.c" });
  } finally {
    restore();
  }
  const cms = calls.filter((c) => c.path.startsWith("/api/v1/cms_function/"));
  assert.deepEqual(cms.map((c) => c.path), ["/api/v1/cms_function/S1/customer/phone/0901", "/api/v1/cms_function/S1/application/automation/send_mail"]);
  for (const c of cms) assert.equal(c.auth, "Bearer ADMIN");
});

test("page translations write via multilingual/update_page_contents and read via page_content", async () => {
  const { api, calls, restore } = recordingApi();
  try {
    await api.getPageContent("P1", "en");
    await api.updatePageContent({ page_id: "P1", language_code: "en", content: { E1: { text: "Hi" } } });
  } finally {
    restore();
  }
  assert.deepEqual(calls[0], { method: "POST", path: "/api/v1/site/S1/page_contents/page_content", auth: "Bearer SESSION_JWT", body: { page_id: "P1", lang: "en" } });
  assert.equal(calls[1].path, "/api/v1/dashboard/site/S1/multilingual/update_page_contents");
  assert.deepEqual(calls[1].body, { pages: [{ contents: [{ page_id: "P1", language_code: "en", content: { E1: { text: "Hi" } }, site_id: "S1" }] }] });
});

test("removed backend routes have no tools (sitemap is built at render time)", () => {
  const names = Object.keys(createServer(new Proxy({}, { get: () => async () => ({}) }), { tools: "all" })._registeredTools);
  assert.ok(!names.includes("sync_sitemap") && !names.includes("rebuild_sitemap"));
});

test("list_orders uses the backend status enum and names each status", async () => {
  const api = new Proxy({}, { get: (_, k) => async () => (k === "listOrders" ? { orders: { data: [{ id: "o1", status: 6 }], total_entries: 1 } } : {}) });
  const t = createServer(api)._registeredTools.list_orders;
  const desc = t.inputSchema.shape.status.description;
  assert.match(desc, /6=canceled/);
  assert.match(desc, /-1 = all/);
  const out = JSON.parse((await t.handler({}, {})).content[0].text);
  assert.equal(out.data[0].status_name, "canceled");
});

test("a built cart icon opens the cart on click", () => {
  const [ev] = createCartIcon().events;
  assert.equal(ev.eventName, "click");
  assert.equal(ev.action, "open_cart");
  assert.match(ev.id, /^EVENT-/);
});

test("sticky + popup docs use the keys the renderer reads", () => {
  const sectionCfg = ELEMENT_ATTRS.section.config;
  assert.ok(sectionCfg.position && sectionCfg.stickyPosition, "section must document position + stickyPosition");
  assert.match(BUILD_GUIDE, /position:"sticky"/);
  const popup = ELEMENT_ATTRS.popup.specials;
  for (const k of ["openPopupAction", "timeOpenPopup", "countOpenPopup"]) assert.ok(popup[k], `popup must document ${k}`);
  for (const k of ["trigger", "delay", "onlyOnce"]) assert.ok(!popup[k], `popup must not document invented key ${k}`);
});

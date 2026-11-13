// Offline: page writes and publishes reach the backend the way the editor's PagePublish.vue sends
// them (builderx_spa) — cart + popups in global_sources, a single /publish, global sections synced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebcakeCmsApi } from "../dist/api.js";

const header = { id: "HEADER-1", type: "section", specials: { global: "header" }, bp1: { style: {}, config: {} } };
const body = { id: "SECTION-1", type: "section", specials: {}, bp1: { style: {}, config: {} } };

/** A fake backend: answers GETs from `db`, records every POST body. */
function backend() {
  const posts = [];
  const db = {
    settings: JSON.stringify({ breakpoints: { bp1: [1320, 1e9] } }),
    pages: [
      { id: "A", slug: "a", source: { source: JSON.stringify({ sections: [header, body] }) } },
      { id: "B", slug: "b", source: { source: JSON.stringify({ sections: [header] }) } },
    ],
    cart: [{ id: "C", component: "cart-droppable", type: "default", source: JSON.stringify({ id: "CART" }) }],
    popups: [{ id: "P", component: "popup", type: "default", source: { id: "POPUP" } }],
    globalSections: [{ section_id: "HEADER-1", name: "Header", type: 1, pages: ["A", "B"], section: JSON.stringify(header) }],
  };
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    const ok = (data) => new Response(JSON.stringify({ success: true, data }));
    if (init.method === "POST") {
      posts.push({ path: u.pathname, body: JSON.parse(init.body) });
      return ok({ id: "saved" });
    }
    if (u.pathname.endsWith("/pages")) return ok(db.pages);
    if (u.pathname.endsWith("/get_source_cart")) return ok(db.cart);
    if (u.pathname.includes("/global_source")) return ok(db.popups);
    if (u.pathname.endsWith("/global_sections")) return ok(db.globalSections);
    return ok({ settings: db.settings });
  };
  return { posts, api: new WebcakeCmsApi({ baseUrl: "http://x", token: "t", siteId: "S" }) };
}

test("publish is ONE /publish carrying every page, the cart and the popups (objects, not strings)", async () => {
  const { posts, api } = backend();
  await api.publishSite({ domain: "https://shop.example" });
  assert.deepEqual(posts.map((p) => p.path), ["/api/v1/site/S/publish"]);
  const b = posts[0].body;
  assert.deepEqual(b.pages.map((p) => p.id), ["A", "B"]);
  assert.deepEqual(b.global_sources.map((g) => g.source.id), ["CART", "POPUP"]);
  assert.equal(typeof b.settings, "string");
  assert.equal(b.domain, "https://shop.example");
});

test("editing a global header on one page re-saves it to its record and every page embedding it", async () => {
  const { posts, api } = backend();
  const edited = { ...header, bp1: { style: { background: "red" }, config: {} } };
  await api.updatePageSource("A", { source: { sections: [edited, body] } });
  assert.deepEqual(posts.map((p) => p.path), ["/api/v1/site/S/A/update_page_source", "/api/v1/site/S/save"]);
  const save = posts[1].body;
  assert.equal(save.global_sections.length, 1);
  assert.equal(save.global_sections[0].status, "update");
  assert.equal(save.global_sections[0].section.bp1.style.background, "red");
  assert.deepEqual(save.pages.map((p) => p.id), ["A", "B"]);
  assert.equal(JSON.parse(save.pages[1].source).sections[0].bp1.style.background, "red");
  assert.equal(save.global_sources.length, 2);
});

test("a plain page write still goes through /save once, so its CSS is rebuilt", async () => {
  const { posts, api } = backend();
  await api.updatePageSource("A", { source: { sections: [header, { ...body, bp1: { style: { color: "#111" }, config: {} } }] } });
  const save = posts.find((p) => p.path.endsWith("/save")).body;
  assert.deepEqual(save.pages.map((p) => p.id), ["A"]);
  assert.deepEqual(save.global_sections, []);
});

test("preview_page shoots the SAVED draft through the editor's preview host, desktop + mobile", async () => {
  const { createServer } = await import("../dist/server.js");
  const shots = [];
  let refreshed = 0;
  globalThis.fetch = async (url) => {
    shots.push(new URL(url).searchParams.get("url").split("?")[0]); // client adds a cache-buster
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  };
  const api = new Proxy({}, {
    get: (_, k) => {
      if (k === "baseUrl") return "https://api.storefront.webcake.io";
      if (k === "siteId") return "S";
      if (k === "listPages") return async () => ({ data: [{ id: "A", slug: "lien-he", name: "Liên hệ" }] });
      if (k === "refreshDraftPreview") return async () => { refreshed++; };
      return async () => ({});
    },
  });
  const tools = createServer(api, { tools: "all" })._registeredTools;
  const out = await tools.preview_page.handler({ page_id: "A", widths: [1280, 420], full_page: true }, {});
  assert.equal(refreshed, 1);
  assert.deepEqual(shots, ["https://preview.webcake.biz/S/lien-he", "https://preview.webcake.biz/S/lien-he"]);
  assert.equal(out.content.filter((c) => c.type === "image").length, 2);
});

test("a write carrying an OLD copy of the header does not revert the newer one site-wide", async () => {
  const { posts, api } = backend();
  // The record (and page B) moved on to v2; page A still holds v1 and the agent writes A unchanged.
  const v2 = { ...header, bp1: { style: { background: "blue" }, config: {} } };
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init.method !== "POST" && new URL(url).pathname.endsWith("/global_sections"))
      return new Response(JSON.stringify({ data: [{ section_id: "HEADER-1", name: "Header", type: 1, pages: ["A", "B"], section: JSON.stringify(v2) }] }));
    return fetchBefore(url, init);
  };
  await api.updatePageSource("A", { source: { sections: [header, { ...body, specials: { x: 1 } }] } });
  const save = posts.find((p) => p.path.endsWith("/save")).body;
  assert.deepEqual(save.global_sections, []);
  assert.deepEqual(save.pages.map((p) => p.id), ["A"]);
  assert.deepEqual(save.changes, {}); // no version row (nor one per popup) for every element edit
});

test("a new page starts with one blank grid section from the site's defaultGrid, like the editor", async () => {
  const { posts, api } = backend();
  const wide = [{ unit: "fr", value: 1 }, { unit: "px", value: 1111 }, { unit: "fr", value: 1 }];
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async (url, init) =>
    init.method !== "POST" && new URL(url).pathname === "/api/v1/site/S/"
      ? new Response(JSON.stringify({ data: { settings: JSON.stringify({ defaultGrid: { bp1: { columns: wide } } }) } }))
      : fetchBefore(url, init);
  await api.createPage({ name: "Mới" });
  const src = JSON.parse(posts[0].body.source);
  assert.equal(src.sections.length, 1);
  assert.equal(src.sections[0].type, "section");
  assert.equal(src.sections[0].bp1.config.columns[1].value, 1111);
});

test("a popup write whose page re-save fails says the popup WAS saved (a retried create would duplicate it)", async () => {
  const { api } = backend();
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async (url, init) =>
    init.method === "POST" && new URL(url).pathname.endsWith("/save") ? new Response("{}", { status: 500 }) : fetchBefore(url, init);
  await assert.rejects(api.createGlobalSource({ component: "popup", source: {} }), /SAVED \(id saved\) — do not create it again/);
});

test("editing a popup re-saves every page, so the popup CSS compiled into each page is rebuilt", async () => {
  const { posts, api } = backend();
  await api.updateGlobalSource({ global_source_id: "P", source: { id: "POPUP" } });
  const save = posts.find((p) => p.path.endsWith("/save")).body;
  assert.deepEqual(save.pages.map((p) => p.id), ["A", "B"]);
});

test("re-saving all pages accepts page sources the API returns as objects", async () => {
  const { posts, api } = backend();
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async (url, init) =>
    init.method !== "POST" && new URL(url).pathname.endsWith("/pages")
      ? new Response(JSON.stringify({ data: [{ id: "A", source: { source: { sections: [body] } } }] }))
      : fetchBefore(url, init);
  await api.resaveAllPages();
  assert.deepEqual(JSON.parse(posts[0].body.pages[0].source).sections[0].id, "SECTION-1");
});

test("deleting a page drops it from every global section's page list", async () => {
  const { posts, api } = backend();
  assert.equal(await api.unlinkPageFromGlobalSections("B"), 1);
  const gs = posts[0].body.global_sections[0];
  assert.equal(gs.status, "update");
  assert.deepEqual(gs.pages, ["A"]);
  assert.equal(gs.section.id, "HEADER-1"); // sent back as an object, not the stored string
});

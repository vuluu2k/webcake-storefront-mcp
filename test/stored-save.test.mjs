// builderx_api AiPageController (/site/:id/ai/*): site-wide flows send no page source — the backend
// reads them; a backend without the routes (404) gets the editor's /save and /publish.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebcakeCmsApi } from "../dist/api.js";

const header = { id: "HEADER-1", type: "section", specials: { global: true }, children: [] };
const pageSrc = JSON.stringify({ sections: [header] });
function backend({ modern }) {
  const posts = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    const p = u.pathname.replace("/api/v1/site/S", "");
    const ok = (data) => new Response(JSON.stringify({ success: true, data }));
    if (p.startsWith("/ai/") && !modern) return new Response("not found", { status: 404 });
    if (init.method === "POST") {
      posts.push({ path: p, body: JSON.parse(init.body) });
      return ok(p.startsWith("/ai/") ? { pages: 2, page_id: "A", source_hash: "b".repeat(32), css_rebuilt: true } : { id: "saved" });
    }
    if (p === "/ai/pages/A/version") return ok({ page_id: "A", source_hash: "a".repeat(32) });
    if (p === "/ai/pages/A/source") return ok({ page_id: "A", source: pageSrc, source_hash: "a".repeat(32) });
    if (p === "/pages") return ok([{ id: "A", slug: "a", source: { source: pageSrc } }, { id: "B", slug: "b", source: { source: pageSrc } }]);
    if (p === "/global_sections") return ok({ global_sections: [{ section_id: "HEADER-1", name: "Header", type: 1, pages: ["A", "B"], section: JSON.stringify(header) }] });
    if (p.endsWith("/get_source_cart") || p.includes("/global_source")) return ok([]);
    return ok({ settings: JSON.stringify({ breakpoints: { bp1: [1320, 1e9] } }) });
  };
  return { posts, api: new WebcakeCmsApi({ baseUrl: "http://x", token: "t", siteId: "S" }) };
}

test("AI routes: a popup change / publish is one call with no page source in it", async () => {
  const { posts, api } = backend({ modern: true });
  await api.resaveAllPages();
  await api.publishSite({ domain: "https://shop.example" });
  assert.deepEqual(posts.map((p) => p.path), ["/ai/rebuild_css", "/ai/publish"]);
  assert.deepEqual(posts[0].body, {});
  assert.deepEqual(posts[1].body, { domain: "https://shop.example" });
});

test("AI routes: a global header edited on one page is ONE sync call — the page (with its base) + the section", async () => {
  const { posts, api } = backend({ modern: true });
  const before = JSON.parse(pageSrc);
  await api.updatePageSource("A", { source: { sections: [{ ...header, bp1: { style: { background: "red" } } }] } }, { base: "a".repeat(32), before });
  assert.deepEqual(posts.map((p) => p.path), ["/ai/global_sections/sync"]);
  const b = posts[0].body;
  assert.equal(b.page_id, "A");
  assert.equal(b.base_source_hash, "a".repeat(32));
  assert.equal(b.global_sections[0].section.bp1.style.background, "red");
});

test("AI routes: a page whose global header did not change is a plain per-page write", async () => {
  const { posts, api } = backend({ modern: true });
  const before = JSON.parse(pageSrc);
  const body = { id: "BODY-1", type: "section", children: [] };
  await api.updatePageSource("A", { source: { sections: [header, body] } }, { base: "a".repeat(32), before });
  assert.deepEqual(posts.map((p) => p.path), ["/ai/pages/A/patch"]);
});

test("no AI routes (404): publish is the editor's /publish with every page", async () => {
  const { posts, api } = backend({ modern: false });
  await api.publishSite({});
  assert.deepEqual(posts.map((p) => p.path), ["/publish"]);
  assert.deepEqual(posts[0].body.pages.map((p) => p.id), ["A", "B"]);
});

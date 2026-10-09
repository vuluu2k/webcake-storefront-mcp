// Offline check: page meta updates respect the backend's update_page cond (homepage / name / slug+settings
// are separate branches, and settings is replaced wholesale) — so SEO must merge into current settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPageMeta } from "../dist/tools/builder.js";

const stub = (settings) => {
  const calls = [];
  return {
    calls,
    listPages: async () => ({ data: [{ id: "p1", settings }] }),
    updatePage: async (_id, body) => calls.push(body),
  };
};

test("homepage + slug + seo go out as separate calls, settings merged not replaced", async () => {
  const api = stub(JSON.stringify({ page_mask: { type: "none" }, seo: { canonical: "c", title: "old" } }));
  await applyPageMeta(api, "p1", { is_homepage: true, slug: "home", seo: { title: "New" } });
  assert.deepEqual(api.calls[0], { is_homepage: true });
  assert.equal(api.calls[1].slug, "home");
  assert.deepEqual(api.calls[1].settings.page_mask, { type: "none" });
  assert.equal(api.calls[1].settings.seo.canonical, "c");
  assert.equal(api.calls[1].settings.seo.title, "New");
});

test("slug-only update still resends current settings (never null)", async () => {
  const api = stub({ page_mask: { type: "none" } });
  await applyPageMeta(api, "p1", { slug: "x" });
  assert.deepEqual(api.calls, [{ slug: "x", settings: { page_mask: { type: "none" } } }]);
});

test("name-only update does not touch settings", async () => {
  const api = stub({});
  await applyPageMeta(api, "p1", { name: "N" });
  assert.deepEqual(api.calls, [{ name: "N" }]);
});

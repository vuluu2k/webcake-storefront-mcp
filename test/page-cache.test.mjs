// Offline check: the page-list cache belongs to one API client and its current site. The hosted server serves many
// accounts and sites at once (and switch_site changes a client's site), so a page must never be looked up in another
// site's cached list — that answered "Page not found" for a page that exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPageWithSource } from "../dist/tools/pages.js";

const client = (siteId, pages) => {
  const api = {
    siteId,
    metaReads: 0,
    listPagesMeta: async () => { api.metaReads++; return { data: pages[api.siteId] ?? [] }; },
    getPageSourceOne: async (id) => ({ raw: JSON.stringify({ id }), source: { id }, version: `v-${id}` }),
    listPages: async () => ({ data: [] }),
  };
  return api;
};
const pages = { s1: [{ id: "p1", name: "Trang 1" }], s2: [{ id: "p2", name: "Trang 2" }] };

test("two clients on different sites each find their own pages", async () => {
  const a = client("s1", pages);
  const b = client("s2", pages);
  assert.equal((await getPageWithSource(a, "p1")).page.name, "Trang 1");
  assert.equal((await getPageWithSource(b, "p2")).page.name, "Trang 2");
  assert.equal((await getPageWithSource(a, "p1")).page.name, "Trang 1");
  assert.equal(a.metaReads, 1, "a client still reuses its own list within the TTL");
});

test("switching a client's site reads that site's list instead of the cached one", async () => {
  const api = client("s1", pages);
  assert.equal((await getPageWithSource(api, "p1")).page.name, "Trang 1");
  api.siteId = "s2";
  assert.equal((await getPageWithSource(api, "p2")).page.name, "Trang 2");
  assert.equal(api.metaReads, 2);
  assert.deepEqual(await getPageWithSource(api, "p1"), { error: "Page not found" }, "a page of the other site is not found here");
});

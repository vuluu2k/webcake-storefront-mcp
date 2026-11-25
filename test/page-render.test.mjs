// Offline check: render_page_source (page family) renders an unsaved source through POST /ai/render, renders
// the stored source when only page_id is given, and degrades cleanly on a backend without the route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../dist/server.js";
import { toolEntries } from "../dist/tools/registry.js";
import { FAMILIES } from "../dist/tools/families.js";
import { WebcakeCmsApi } from "../dist/api.js";

const call = async (api, args) => {
  const server = createServer(api);
  const entry = toolEntries(server).get("render_page_source");
  assert.ok(entry, "render_page_source is registered");
  const result = await entry.handler(args, {});
  return JSON.parse(result.content[0].text);
};

test("render_page_source belongs to the page family", () => {
  assert.ok(FAMILIES.page[1].includes("render_page_source"));
});

test("an unsaved source is rendered as given; only page_id renders the stored one", async () => {
  const sent = [];
  const api = {
    siteId: "s1",
    renderSource: async (source, pageId) => { sent.push([source, pageId]); return { html: "<section id=\"SECTION-a\"></section>", css: "<style>#x{}</style>" }; },
    getPageSourceOne: async (id) => ({ raw: JSON.stringify({ sections: [{ id: "SECTION-stored" }] }), source: { sections: [{ id: "SECTION-stored" }] }, version: `v-${id}` }),
    listPagesMeta: async () => ({ data: [{ id: "p1", name: "Trang" }] }),
  };
  const out = await call(api, { source: { sections: [{ id: "SECTION-a" }] } });
  assert.equal(out.html, "<section id=\"SECTION-a\"></section>");
  assert.equal(out.css_length, out.css.length);
  assert.deepEqual(sent[0], [{ sections: [{ id: "SECTION-a" }] }, undefined]);
  await call(api, { page_id: "p1" });
  assert.deepEqual(sent[1], [{ sections: [{ id: "SECTION-stored" }] }, "p1"]);
  assert.match((await call(api, {})).error, /Pass source/);
});

test("a backend without POST /ai/render: render_unavailable, and the other AI routes stay on", async () => {
  const api = new WebcakeCmsApi({ baseUrl: "https://example.invalid", token: "t", siteId: "s1" });
  const paths = [];
  api.request = async (method, path) => {
    paths.push(path);
    if (path.endsWith("/ai/render")) throw Object.assign(new Error("Not Found"), { status: 404, raw: "Not Found" });
    return { data: { source_hash: "h1", source: "{\"sections\":[]}" } };
  };
  assert.equal(await api.renderSource({ sections: [] }), null);
  assert.equal(await api.renderSource({ sections: [] }), null);
  assert.equal(paths.filter((p) => p.endsWith("/ai/render")).length, 1, "the missing route is remembered");
  const one = await api.getPageSourceOne("p1");
  assert.equal(one.version, "h1", "per-page reads still use the AI routes");
});

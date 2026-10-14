// Offline checks for builder capabilities mirrored from builderx_spa + the storefront renderer
// (events, motion docs, wishlist/OTP/course blocks, structure validation, custom breakpoints,
// the section template library). Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../dist/server.js";
import { WebcakeCmsApi } from "../dist/api.js";
import { buildSection, validatePage, finalizeForRender } from "../dist/builder/page.js";
import { buildElement, isKnownType } from "../dist/builder/catalog.js";
import { validateEvents } from "../dist/builder/events.js";
import { isKnownBindingTarget } from "../dist/builder/bindings.js";
import { genGridByBp } from "../dist/builder/grid.js";
import { BUILD_GUIDE } from "../dist/builder/guide.js";

/** Stub api: per-method answers, anything else resolves to {}. */
const stubApi = (answers = {}) => new Proxy({}, { get: (_, k) => answers[k] || (async () => ({})) });
const call = async (server, name, args) => {
  const r = await server._registeredTools[name].handler(args, {});
  return { isError: !!r.isError, json: JSON.parse(r.content[0].text) };
};

test("editor event actions are known, with list targets checked per id", () => {
  const ids = new Set(["F1"]);
  for (const action of ["filter", "change_language", "change_text_style", "open_product_link", "add_bonus_product_to_cart", "send_botcake_mess", "delete_customer_address", "course_submit", "auto_next_track", "play_video", "close_search_droppable", "bold", "create_article"]) {
    const { warnings } = validateEvents({ id: "X", events: [{ action }] }, ids);
    assert.ok(!warnings.some((w) => /unknown action/.test(w)), `${action}: ${warnings}`);
  }
  const ok = validateEvents({ id: "B", events: [{ action: "filter", filters: ["F1"] }] }, ids);
  assert.ok(!ok.warnings.some((w) => /targets missing/.test(w)), ok.warnings.join());
  const bad = validateEvents({ id: "B", events: [{ action: "filter", filters: ["F1", "GONE"] }] }, ids);
  assert.ok(bad.warnings.some((w) => /missing element "GONE"/.test(w)), bad.warnings.join());
});

test("guide teaches motion + typography with the renderer's keys", () => {
  for (const s of ["runtime.config.animation", 'class="animationText"', "text_animation_type", 'var(--font_N)', "duration:0.2"])
    assert.ok(BUILD_GUIDE.includes(s), `guide missing ${s}`);
});

test("wishlist, OTP and course blocks build, and wishlist_item binds", () => {
  for (const t of ["wishlist-container", "wishlist-item", "wishlist-empty", "otp-method", "list-courses"]) {
    assert.ok(isKnownType(t), t);
    assert.equal(buildElement(t, {}).type, t);
  }
  assert.ok(isKnownBindingTarget("wishlist_item::product_name"));
});

test("structure warnings: top level, non-container children, orphan submit, wishlist binding scope", () => {
  const good = buildSection([
    { type: "form", children: [{ type: "input", opts: { specials: { field_name: "email" } } }, { type: "submit-button", opts: { text: "Gửi" } }] },
    { type: "wishlist-container", children: [
      { type: "wishlist-item", children: [{ type: "text-dataset", opts: { bindings: [{ target: "wishlist_item::product_name" }] } }] },
      { type: "wishlist-empty", children: [{ type: "text", opts: { text: "Trống" } }] },
    ] },
  ]);
  assert.equal(validatePage({ sections: [good] }).warnings, undefined);

  const bad = buildSection([{ type: "submit-button", opts: { text: "x" } }, { type: "text-dataset", opts: { bindings: [{ target: "wishlist_item::product_name" }] } }]);
  const loose = buildElement("text", {});
  loose.children = [buildElement("button", {})];
  const w = validatePage({ sections: [bad, loose] }).warnings.join("\n");
  for (const re of [/not inside a form/, /outside a wishlist-item/, /Top-level node .* is a text/, /not a container/]) assert.match(w, re);
});

test("custom site breakpoints: re-keyed by width, standard sites untouched", () => {
  const fresh = () => buildSection([{ type: "text", opts: { text: "Hi" } }]);
  const std = finalizeForRender({ sections: [fresh()] }).sections[0];
  assert.deepEqual(Object.keys(std).filter((k) => /^bp\d/.test(k)).sort(), ["bp1", "bp2", "bp3", "bp4"]);
  const same = finalizeForRender({ sections: [fresh()] }, { bp1: [1320, 1e9], bp2: [993, 1319], bp3: [641, 992], bp4: [320, 640] }).sections[0];
  assert.deepEqual(Object.keys(same).filter((k) => /^bp\d/.test(k)).sort(), ["bp1", "bp2", "bp3", "bp4"]);
  assert.ok(finalizeForRender({ sections: [fresh()] }, {}).sections[0].bp4, "unusable map falls back to the standard four");

  // bp1 split at 1600 (new bp5 = widest) and bp2 reused for the phone range.
  const site = { bp1: [1320, 1600], bp5: [1601, 1e9], bp3: [641, 1319], bp2: [320, 640] };
  const sec = finalizeForRender({ sections: [fresh()] }, site).sections[0];
  assert.deepEqual(Object.keys(sec).filter((k) => /^bp\d/.test(k)).sort(), ["bp1", "bp2", "bp3", "bp5"]);
  assert.deepEqual(sec.bp5.config.columns, genGridByBp(1601).columns);
  const text = sec.children[0];
  assert.deepEqual(text.bp2, std.children[0].bp4, "bp2 (320-640) takes the mobile values, not laptop");
  assert.deepEqual(text.bp5, std.children[0].bp1);
});

test("getSiteBreakpoints parses string settings, caches, and resets on site switch", async () => {
  let calls = 0;
  const api = new WebcakeCmsApi({ baseUrl: "https://x", token: "t", siteId: "S1" });
  api.getSite = async () => (calls++, { data: { settings: JSON.stringify({ breakpoints: { bp1: [1, 2] } }) } });
  assert.deepEqual(await api.getSiteBreakpoints(), { bp1: [1, 2] });
  await api.getSiteBreakpoints();
  assert.equal(calls, 1);
  api.switchSite("S2");
  await api.getSiteBreakpoints();
  assert.equal(calls, 2);
  api.switchSite("S3");
  api.getSite = async () => ({ data: { settings: "{not json" } });
  assert.equal(await api.getSiteBreakpoints(), null);
});

test("section template library: browse, then insert a library section by id", async () => {
  const sectionNode = buildSection([{ type: "text", opts: { text: "Library hero" } }]);
  finalizeForRender({ sections: [sectionNode] });
  const page = { id: "P1", source: { source: JSON.stringify({ sections: [] }) } };
  const api = stubApi({
    listTemplateCategories: async () => ({ templates: [{ id: "C1", name: "Hero" }] }),
    listTemplates: async ({ page: p }) => ({ data: { templates: p === 1 ? [{ id: "T1", name: "Hero 1", thumbnail: "https://img/t1.jpg", source: JSON.stringify(sectionNode) }] : [], total_entries: 1, page: p } }),
    listPages: async () => ({ data: [page] }),
  });
  const s = createServer(api);
  assert.deepEqual((await call(s, "list_section_templates", {})).json.categories, [{ id: "C1", name: "Hero" }]);
  const listed = (await call(s, "list_section_templates", { category_id: "C1" })).json.templates[0];
  assert.deepEqual(listed, { id: "T1", name: "Hero 1", thumbnail: "https://img/t1.jpg", kind: "section" });
  const added = (await call(s, "add_section", { page_id: "P1", template: { category_id: "C1", id: "T1" }, dry_run: true })).json;
  assert.equal(added.dry_run, true);
  assert.equal(added.validation.valid, true);
  assert.notEqual(added.section_id, sectionNode.id, "library section is re-id'd");
  assert.match((await call(s, "add_section", { page_id: "P1", template: { id: "NOPE" } })).json.error, /not found/);
});

test("site info exposes post-publish screenshots", async () => {
  const s = createServer(stubApi({ getSite: async () => ({ data: { id: "S1", preview_img: { "1920_1080": "https://img/d.jpg" } } }) }));
  assert.equal((await call(s, "get_site_info", {})).json.preview_img["1920_1080"], "https://img/d.jpg");
});

test("containers with childless factories (swiper, grid-product, post-list) don't trigger the leaf warning", () => {
  const sec = buildSection([
    { type: "swiper", children: [{ type: "slide" }, { type: "slide" }] },
    { type: "grid-product", children: [{ type: "product-overlay" }] },
    { type: "post-list", children: [{ type: "post-overlay" }] },
  ]);
  const w = (validatePage({ sections: [sec] }).warnings || []).join("\n");
  assert.doesNotMatch(w, /won't render/);
});

test("a site cut down to one open-ended breakpoint keeps the desktop layout", () => {
  const fresh = () => buildSection([{ type: "text", opts: { text: "Hi" } }]);
  const std = finalizeForRender({ sections: [fresh()] }).sections[0];
  const one = finalizeForRender({ sections: [fresh()] }, { bp1: [320, 1e9] }).sections[0];
  assert.deepEqual(one.children[0].bp1, std.children[0].bp1);
  assert.deepEqual(one.bp1.config.columns, genGridByBp(1320).columns);
});

test("a failed breakpoint lookup is retried on the next save", async () => {
  let calls = 0;
  const api = new WebcakeCmsApi({ baseUrl: "https://x", token: "t", siteId: "S1" });
  api.getSite = async () => {
    calls++;
    if (calls === 1) throw new Error("timeout");
    return { data: { settings: { breakpoints: { bp1: [320, 1e9] } } } };
  };
  assert.equal(await api.getSiteBreakpoints(), null);
  assert.deepEqual(await api.getSiteBreakpoints(), { bp1: [320, 1e9] });
  assert.equal(calls, 2);
});

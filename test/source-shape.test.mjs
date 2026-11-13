// Shapes that blank the storefront renderer or the builder editor must be refused by validatePage,
// and nothing the factory builds may trip them. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ELEMENT_TYPES, buildElement } from "../dist/builder/catalog.js";
import { buildSection, finalizeForRender, newPageSkeleton, validatePage } from "../dist/builder/page.js";

const pageWith = (type) => {
  const p = newPageSkeleton();
  p.sections.push(type === "section" ? buildSection([]) : type === "popup" ? buildElement("popup") : buildSection([{ type }]));
  return finalizeForRender(p);
};

test("every factory element passes the shape checks", () => {
  for (const t of Array.isArray(ELEMENT_TYPES) ? ELEMENT_TYPES : Object.keys(ELEMENT_TYPES)) {
    const v = validatePage(pageWith(t));
    assert.equal(v.errors, undefined, `${t}: ${v.errors}`);
  }
});

// Each mutation reproduces one renderer/editor crash from builderx_api lib/qwik or builderx_spa.
const CRASHES = {
  "null child": (p, el, sec) => sec.children.push(null),
  "null section": (p) => p.sections.push(null),
  "children not an array": (p, el) => { el.children = {}; },
  "specials is an array": (p, el) => { el.specials = []; },
  "text without specials": (p, el) => { delete el.specials; },
  "bp layer without config": (p, el) => { el.bp2 = { style: {} }; },
  "bp layer is null": (p, el) => { el.bp3 = null; },
  "unknown widthUnit": (p, el) => { el.bp1.config.widthUnit = "em"; },
  "empty constraintX": (p, el) => { el.bp1.config.constraintX = []; },
  "constraint not a list": (p, el) => { el.bp1.config.constraintY = "top"; },
  "section columns as a number": (p, el, sec) => { sec.bp1.config.columns = 3; },
  "track not an object": (p, el, sec) => { sec.bp1.config.rows = [1, 2]; },
  "bad grid string": (p, el, sec) => { sec.bp1.config.grid = "three by one"; },
  "style value is an object": (p, el) => { el.bp1.style.padding = { top: 1 }; },
  "custom_css not a string": (p, el) => { el.specials.custom_css = ["a"]; },
  "text tag not a string": (p, el) => { el.specials.tag = 1; },
  "events not a list": (p, el) => { el.events = {}; },
  "video_background without url": (p, el, sec) => { sec.bp1.config.video_background = {}; },
  "constraint list with three entries and a center": (p, el) => { el.bp1.config.constraintX = ["left", "right", "centerLeft"]; },
};

for (const [name, mutate] of Object.entries(CRASHES)) {
  test(`refuses: ${name}`, () => {
    const p = pageWith("text");
    const sec = p.sections[0];
    mutate(p, sec.children[0], sec);
    assert.equal(validatePage(p).valid, false);
  });
}

test("a zero grid dimension warns instead of blocking (real editor forms carry \"2x0\")", () => {
  const p = pageWith("text");
  p.sections[0].bp1.config.grid = "2x0";
  const v = validatePage(p);
  assert.equal(v.valid, true);
  assert.match(v.warnings.join(" "), /zero dimension/);
});

test("legit variants stay valid: grid-product column count, missing widthUnit, two constraints", () => {
  const p = pageWith("text");
  const el = p.sections[0].children[0];
  delete el.bp1.config.widthUnit;
  el.bp1.config.constraintX = ["left", "right"];
  assert.equal(validatePage(p).valid, true);
  assert.equal(validatePage(pageWith("grid-product")).valid, true);
  // the editor's "no default" sentinel for a select, and an imported id: warnings, not blockers
  const sel = pageWith("select");
  sel.sections[0].children[0].specials = { ...sel.sections[0].children[0].specials, options: [{ id: "a" }], defaultValue: "none" };
  assert.equal(validatePage(sel).valid, true);
  el.id = "1-imported";
  assert.equal(validatePage(p).valid, true);
});

test("an old defect stays old when a section is inserted before it", async () => {
  const { addedErrors } = await import("../dist/builder/page.js");
  const before = pageWith("text");
  before.sections[0].children[0].bp1.config.widthUnit = "em";
  const after = structuredClone(before);
  after.sections.unshift(pageWith("text").sections[0]);
  assert.deepEqual(addedErrors(after, before), []);
});

test("element patches that would crash the renderer are refused, even on an object source", async () => {
  const { createServer } = await import("../dist/server.js");
  const p = pageWith("text");
  const el = p.sections[0].children[0];
  const saved = [];
  const api = new Proxy({}, {
    get: (_, k) => {
      if (k === "baseUrl") return "http://x";
      // source as an OBJECT, the shape where before/after once aliased and the check saw nothing
      if (k === "listPages") return async () => ({ data: [{ id: "P", source: { source: p } }] });
      if (k === "updatePageSource") return async (_id, body) => { saved.push(body); return { data: { id: "S" } }; };
      return async () => ({});
    },
  });
  const tools = createServer(api, { tools: "all" })._registeredTools;
  const run = async (args) => JSON.parse((await tools.update_page_element.handler(args, {})).content[0].text);
  const bad = await run({ page_id: "P", element_id: el.id, dry_run: false, responsive: { bp1: { config: { widthUnit: "em" } } } });
  assert.match(bad.error, /BLOCKED/);
  assert.equal(saved.length, 0);
});

test("generated nodes match an editor drop: carousel row, form/menu names, factory id prefixes, popup px", async () => {
  const { buildSection: bs, finalizeForRender: fin, reassignIds } = await import("../dist/builder/page.js");
  const car = bs([{ type: "carousel", children: [{ type: "image" }, { type: "image" }] }]);
  fin({ sections: [car] });
  for (const bp of ["bp1", "bp4"]) assert.deepEqual(car.children[0].children.map((k) => k[bp].config.columnStart), [1, 2]);
  const forms = bs([{ type: "form", opts: { specials: { type: "subscribe" } } }]);
  fin({ sections: [forms] });
  assert.match(forms.children[0].name, /^SUB-FORM-/);
  // The factory's own prefixes, including the ones it writes without a dash before the random part.
  for (const [type, prefix] of [["paypal-button", "PAYPAL"], ["text-area", "TEXTAREA"], ["input-number", "INPUT-NUMBER"],
    ["input-product-note", "INPUT-PRODUCT-NOTE"], ["layout-dataset", "LAYOUT-DATASET"], ["product-image-carousel", "PD-IMG-CAROUSEL"]])
    assert.match(reassignIds(buildElement(type)).id, new RegExp(`^${prefix}-[a-z0-9]{8}$`), type);
  const pop = buildElement("popup");
  fin({ sections: [pop] });
  assert.equal(pop.bp1.config.widthUnit, "px");
  assert.ok(pop.bp1.config.rows.length >= 1);
});

test("sections take their columns from the site's defaultGrid, like the editor's blank section", async () => {
  const { buildSection: bs, finalizeForRender: fin } = await import("../dist/builder/page.js");
  const grid = { bp1: { columns: [{ unit: "fr", value: 1 }, { unit: "px", value: 1100 }, { unit: "fr", value: 1 }] } };
  const s = bs([{ type: "text" }]);
  fin({ sections: [s] }, null, grid);
  assert.equal(s.bp1.config.columns[1].value, 1100);
  assert.notEqual(s.bp4.config.columns[1].value, 1100); // no defaultGrid for bp4 → standard
});

test("editor_v2 sources are not judged by v1 rules", () => {
  assert.equal(validatePage({ nodes: {}, root_node_id: "root", schema_version: 1 }).valid, true);
});

test("element style patches land on the breakpoints the renderer reads", async () => {
  const { applyNodeUpdates } = await import("../dist/builder/page.js");
  const el = pageWith("text").sections[0].children[0];
  applyNodeUpdates(el, { style: { color: "#f00", "font-size": "20px", width: 300 } });
  assert.equal(el.style, undefined); // never the dead top-level key
  for (const bp of ["bp1", "bp2", "bp3", "bp4"]) assert.equal(el[bp].style.color, "#f00");
  assert.equal(el.bp1.style.fontSize, "20px"); // size keys: desktop only, like the editor's sync
  assert.equal(el.bp1.style.width, 300);
  assert.notEqual(el.bp4.style.width, 300);
  applyNodeUpdates(el, { responsive: { bp4: { style: { fontSize: "14px" } } } });
  assert.equal(el.bp4.style.fontSize, "14px");
  assert.ok(el.bp4.config && el.bp4.style);
});

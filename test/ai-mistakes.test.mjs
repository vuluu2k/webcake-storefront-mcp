// The mistakes agents make when they write page sources by hand, and what a save does with each:
// FIXED (repairSource has one right answer and applies it), BLOCK (validatePage error: surely
// broken, the save is refused with a fix), WARN (wrong but legal — reported with a fix).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildElement } from "../dist/builder/catalog.js";
import { buildSection, validatePage } from "../dist/builder/page.js";
import { repairSource } from "../dist/builder/repair.js";

const B = (t, o = {}) => buildElement(t, o);
const T = (text) => B("text", { text });

const CASES = {
  "type bịa: heading": ["FIXED", () => { const n = T("Tiêu đề"); n.type = "heading"; return [n]; }],
  "type bịa: div": ["FIXED", () => { const n = B("container"); n.type = "div"; return [n]; }],
  "type không đoán được: hero-banner": ["BLOCK", () => { const n = B("container"); n.type = "hero-banner"; return [n]; }],
  "key bịa: specials.href": ["WARN", () => { const n = B("button", { text: "Mua" }); n.specials.href = "https://x"; return [n]; }],
  "key sai chính tả: specials.txt": ["WARN", () => { const n = T("Chào"); n.specials.txt = "hi"; return [n]; }],
  "CSS đặt trong config": ["FIXED", () => { const n = T("Chào"); n.runtime.config.fontSize = "20px"; return [n]; }],
  "CSS kebab-case": ["FIXED", () => { const n = T("Chào"); n.runtime.style["font-weight"] = "700"; return [n]; }],
  "CSS bịa: textColour": ["WARN", () => { const n = T("Chào"); n.runtime.style.textColour = "red"; return [n]; }],
  "tag không tồn tại: h7": ["BLOCK", () => [B("text", { text: "Chào", specials: { tag: "h7" } })]],
  "form type bịa: contact": ["BLOCK", () => { const f = B("form", { specials: { type: "contact" } }); f.children = [B("email", { specials: { field_name: "email" } }), B("submit-button")]; return [f]; }],
  "boolean viết thành chuỗi": ["FIXED", () => [B("countdown", { specials: { showDay: "true" } })]],
  "thiếu id": ["FIXED", () => { const n = T("Chào"); delete n.id; return [n]; }],
  "trùng id": ["FIXED", () => { const a = T("A"), b = T("B"); b.id = a.id; return [a, b]; }],
  "action bịa nhưng rõ nghĩa: navigate + url": ["FIXED", () => [B("button", { text: "Đi", events: [{ trigger: "click", action: "navigate", url: "/x" }] })]],
  "action bịa không đoán được": ["BLOCK", () => [B("button", { text: "Đi", events: [{ trigger: "click", action: "teleport" }] })]],
  "event thiếu đích: open_popup không popup_id": ["BLOCK", () => [B("button", { text: "Mở", events: [{ trigger: "click", action: "open_popup" }] })]],
  "event trỏ id không có trên trang": ["WARN", () => [B("button", { text: "Mở", events: [{ trigger: "click", action: "toggle", toggle_id: "TEXT-nothere1" }] })]],
  "binding field bịa: product::price": ["BLOCK", () => [B("text", { text: "x", bindings: [{ target: "product::price" }] })]],
  "ô nhập ngoài form": ["BLOCK", () => [B("email", { specials: { field_name: "email" } })]],
  "product-overlay ngoài grid": ["WARN", () => [B("product-overlay")]],
  "element không render: collapse-item": ["BLOCK", () => [B("collapse-item")]],
  "element không render có thay thế: row": ["FIXED", () => [B("row")]],
  "cả trang nhét vào embed": ["BLOCK", () => [B("embed", { specials: { htmlCode: "<html><body>" + "<div class='x'>".repeat(400) + "</body></html>" } })]],
  "ảnh ngoài CDN": ["BLOCK", () => [B("image", { src: "https://images.unsplash.com/photo-1" })]],
  "ảnh trên CDN": ["OK", () => [B("image", { src: "https://content.pancake.vn/web_content/a.jpg" })]],
  "cột vượt lưới": ["WARN", () => { const n = T("Chào"); n.runtime.config.columnStart = 9; n.runtime.config.columnEnd = 10; return [n]; }],
  "children không phải mảng": ["BLOCK", () => { const n = B("container"); n.children = { a: 1 }; return [n]; }],
  "link <a> trong text": ["WARN", () => [T('<a href="/x">Menu</a>')]],
  "chữ mẫu Lorem ipsum": ["WARN", () => [T("Lorem ipsum dolor sit amet")]],
};

const baseline = (() => {
  const s = B("section");
  s.children = [T("ok")];
  return new Set(validatePage({ sections: [s] }).warnings || []);
})();

function outcome(kids) {
  const sec = buildSection([]); // a real section grid (3 columns), like every saved page
  sec.children = kids;
  const source = { sections: [sec] };
  const fixed = repairSource(source);
  const v = validatePage(source);
  const warns = (v.warnings || []).filter((w) => !baseline.has(w) && !/^\[(FIELD_NAME|PLACEHOLDER)\].*Add a heading/.test(w));
  if (v.errors?.length) return { verdict: "BLOCK", detail: v.errors[0] };
  if (fixed.length && !warns.length) return { verdict: "FIXED", detail: fixed[0] };
  if (warns.length) return { verdict: "WARN", detail: warns[0] };
  return { verdict: "OK", detail: "" };
}

for (const [name, [want, make]] of Object.entries(CASES)) {
  test(`AI sai: ${name} → ${want}`, () => {
    const r = outcome(make());
    assert.equal(r.verdict, want, r.detail);
  });
}

test("chặn kèm cách sửa: mỗi lỗi chặn có → fix", () => {
  for (const [name, [want, make]] of Object.entries(CASES)) {
    if (want !== "BLOCK") continue;
    const r = outcome(make());
    assert.match(r.detail, /→|see |\(see /, `${name}: ${r.detail}`);
  }
});

test("catalog bổ sung: action renderer có (open_product, buy_it_now…) và binding product_item/warehouse được nhận; tracking trong events[] bị nhắc", async () => {
  const { isKnownBindingTarget } = await import("../dist/builder/bindings.js");
  assert.ok(isKnownBindingTarget("product_item::product_name") && isKnownBindingTarget("warehouse::quantity") && isKnownBindingTarget("order::subtotal_before_discount"));
  const ok = outcome([B("button", { text: "Xem", events: [{ trigger: "click", action: "open_product", open_product: "products/ao" }] })]);
  assert.notEqual(ok.verdict, "BLOCK", ok.detail);
  const tr = outcome([B("button", { text: "Mua", events: [{ trigger: "click", action: "fb_tracking" }] })]);
  assert.equal(tr.verdict, "WARN");
  assert.match(tr.detail, /tracking specials/);
});

test("lỗi tìm ra khi render thử mọi element: được sửa khi lưu hoặc bị chặn", async () => {
  const { buildElement: build } = await import("../dist/builder/catalog.js");
  const { finalizeForRender } = await import("../dist/builder/page.js");
  // text without a font size renders at font-size 0 → fixed with 16px; a theme font counts
  const bare = T("Chào");
  delete bare.runtime.style.fontSize;
  assert.equal(outcome([bare]).verdict, "FIXED");
  const themed = T("Chào");
  delete themed.runtime.style.fontSize;
  themed.runtime.style.font = "var(--font_2)";
  assert.equal(outcome([themed]).verdict, "OK");
  // number-step: buttons_in_row 0 fails the page's CSS build → fixed to 3
  const ns = build("number-step", { config: { buttons_in_row: 0 } });
  assert.equal(outcome([ns]).verdict, "FIXED");
  // wishlist without an icon / checkbox-group without options blank the page → filled on save
  const wl = build("wishlist");
  delete wl.specials.svg;
  assert.equal(outcome([wl]).verdict, "FIXED");
  // custom-layout in a product grid: the plugin that makes it render is added
  const grid = build("grid-product");
  grid.children = [build("custom-layout")];
  const src = { sections: [buildSection([])] };
  src.sections[0].children = [grid];
  const { repairSource: repair } = await import("../dist/builder/repair.js");
  assert.match(repair(src).join("\n"), /store_show_extra_info/);
  // factories that put opts.specials in runtime.specials no longer lose them on save
  const tabs = finalizeForRender({ sections: [buildSection([{ type: "tabs", opts: { specials: { navMode: "x" } } }])] }).sections[0].children[0];
  assert.equal(tabs.specials.navMode, "x");
  // calendar-content never renders children; cart-droppable belongs in the cart source
  const cal = build("calendar-content");
  cal.children = [T("x")];
  assert.match(outcome([cal]).detail, /LEAF_CHILDREN/);
  assert.match(outcome([build("cart-droppable")]).detail, /WRONG_SOURCE/);
});

test("điều kiện hiển thị đọc từ code → báo trước khi dựng (EMPTY_RENDER)", () => {
  const warn = (node, ctx) => {
    const sec = buildSection([]);
    sec.children = [node];
    return (validatePage({ sections: [sec] }, undefined, ctx).warnings || []).join("\n");
  };
  assert.match(warn(B("flash-sale")), /EMPTY_RENDER.*promotion_advance_id/);
  assert.match(warn(B("text-dataset")), /EMPTY_RENDER.*binding/);
  assert.doesNotMatch(warn(B("text-dataset", { bindings: [{ target: "product::product_name" }] })), /EMPTY_RENDER/);
  assert.match(warn(B("notify", { specials: { datagrid_id: "" } })), /EMPTY_RENDER.*datagrid_id/);
  assert.match(warn(B("rating-input"), { kind: "main" }), /auto_hide_without_star:false/);
  assert.doesNotMatch(warn(B("rating-input"), { kind: "store" }), /EMPTY_RENDER/);
});

test("lưới: mọi element có lưới ra columns/rows/grid đúng format builderx_spa, không để trống", async () => {
  const { finalizeForRender } = await import("../dist/builder/page.js");
  const { GRID_TYPES } = await import("../dist/builder/shape.js");
  const errs = (src) => (validatePage(src).errors || []).join("\n");
  // a container built with children but no layout: stacked like buildFromSpec, then renders
  const c = B("container", { children: [T("A"), T("B")] });
  const src = { sections: [buildSection([])] };
  src.sections[0].children = [c];
  assert.match(errs(src), /GRID_EMPTY/);
  assert.match(repairSource(src).join("\n"), /no grid columns\/rows → 1x2/);
  assert.deepEqual(c.children.map((k) => k.runtime.config.rowStart), [1, 2]);
  finalizeForRender(src);
  assert.equal(c.bp1.config.grid, "1x2");
  assert.equal(errs(src), "");
  // every grid type built bare and saved has a grid
  for (const t of GRID_TYPES) {
    if (t === "section" || t === "popup") continue;
    let n;
    try { n = B(t); } catch { continue; }
    const s = { sections: [buildSection([])] };
    s.sections[0].children = [n];
    repairSource(s);
    finalizeForRender(s);
    assert.doesNotMatch(errs(s), /GRID_EMPTY|GRID_TRACK|GRID_FORMAT/, t);
  }
  // saved shape: stale grid string, px rows, a px track missing absValue
  const saved = finalizeForRender({ sections: [buildSection([{ type: "container", children: [{ type: "text", opts: { text: "x" } }] }])] });
  const box = saved.sections[0].children[0];
  box.bp1.config.grid = "5x7";
  box.bp1.config.rows = [{ unit: "px", absValue: 34 }];
  assert.match((validatePage(saved).warnings || []).join("\n"), /GRID_MISMATCH/);
  assert.match(errs(saved), /GRID_FORMAT.*row drag/);
  repairSource(saved);
  assert.equal(box.bp1.config.grid, "1x1");
  assert.deepEqual(box.bp1.config.rows[0], { unit: "min/max", min: { unit: "px", absValue: 34 }, max: { unit: "px", absValue: 34 } });
  box.bp2.config.columns = [{ unit: "px" }];
  assert.match(errs(saved), /GRID_TRACK.*no absValue/);
  box.bp2.config.columns = [{ unit: "vw", vwValue: 50 }];
  assert.match((validatePage(saved).warnings || []).join("\n"), /GRID_FORMAT.*not a builder column/);
  // auto rows from stackChildren are the editor's content row
  const auto = buildSection([{ type: "container", autoRows: true, children: [{ type: "text", opts: { text: "x" } }] }]).children[0];
  assert.deepEqual(auto.runtime.config.rows[0], { unit: "min/max", min: { unit: "px", absValue: 0 }, max: { unit: "max-c" } });
});

test("padding trên container: editor bỏ qua, renderer in ra → đổi thành track đệm khi lưu", async () => {
  const { finalizeForRender } = await import("../dist/builder/page.js");
  const make = (style, cfg = {}) => {
    const s = finalizeForRender({ sections: [buildSection([{ type: "container", opts: { style, config: cfg }, children: [{ type: "text", opts: { text: "x" } }] }])] });
    return s.sections[0].children[0];
  };
  // unsaved → converted by finalizeForRender (rowGap 16 from stackChildren is subtracted)
  const box = make({ padding: "20px 24px" });
  assert.equal(box.bp1.style.padding, undefined);
  assert.equal(box.bp1.config.grid, "3x3");
  assert.deepEqual(box.bp1.config.columns.map((c) => c.absValue ?? c.unit), [24, "fr", 24]);
  assert.equal(box.bp1.config.rows[0].min.absValue, 20 - 16);
  const kid = box.children[0].bp1.config;
  assert.deepEqual([kid.columnStart, kid.columnEnd, kid.rowStart, kid.rowEnd], [2, 3, 2, 3]);
  assert.equal((validatePage({ sections: [buildSection([])] }).warnings || []).some((w) => /PADDING/.test(w)), false);
  // saved node with padding (an older write) → warned, and the save converts it
  const saved = { sections: [buildSection([])] };
  saved.sections[0].children = [make({})];
  finalizeForRender(saved);
  const b = saved.sections[0].children[0];
  b.bp1.style.padding = "14px";
  b.bp1.config.rowGap = 0; // like the pasted CONTAINER-cakesngot (rowGap/columnGap 0)
  assert.match((validatePage(saved).warnings || []).join("\n"), /PADDING/);
  assert.match(repairSource(saved).join("\n"), /spacer columns\/rows/);
  assert.equal(b.bp1.config.grid, "3x3");
  // not px, or smaller than the gap: no single answer → left, still warned
  assert.equal(make({ padding: "1em" }).bp1.style.padding, "1em");
  assert.equal(make({ padding: "8px" }).bp1.style.padding, "8px"); // < rowGap 16
});

test("schema ghi đúng format key layout và save thực thi đúng format đó", async () => {
  const { keyReference, elementSchema } = await import("../dist/builder/element-schema.js");
  const { LAYOUT_FORMATS } = await import("../dist/builder/shape.js");
  const box = keyReference("container").layout.join("\n");
  for (const k of Object.keys(LAYOUT_FORMATS)) assert.match(box, new RegExp(`^${k}: `, "m"), k);
  assert.doesNotMatch(keyReference("text").layout.join("\n"), /^(rows|columns|grid): /m); // not a grid box
  assert.deepEqual(elementSchema("grid-product").config.columns.types, ["number"]); // a count there
  // each rule is enforced
  const errs = (mut) => {
    const n = T("x");
    mut(n.runtime.config);
    return outcome([n]);
  };
  assert.match(errs((c) => { c.columnStart = 1.5; }).detail, /LAYOUT_VALUE.*integer/);
  assert.match(errs((c) => { c.rowStart = 3; c.rowEnd = 2; }).detail, /LAYOUT_VALUE.*rowEnd 2 must be > rowStart 3/);
  assert.match(errs((c) => { c.heightUnit = "em"; }).detail, /LAYOUT_VALUE.*heightUnit/);
  // one-answer forms are fixed on save
  const c = B("container", { children: [T("x")] });
  c.runtime = { config: { rowGap: "16px" } };
  assert.equal(outcome([c]).verdict, "FIXED");
  assert.equal(c.runtime.config.rowGap, 16);
  const t = T("x");
  Object.assign(t.runtime.config, { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2, lockCellGrid: { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 2 } });
  repairSource({ sections: [{ type: "section", id: "SECTION-x", children: [t] }] });
  assert.deepEqual(t.runtime.config.lockCellGrid, { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2 });
});

test("format value của style/config suy từ trang thật: schema ghi ra, save quy về, lệch thì báo", async () => {
  const { keyReference, valueFormat } = await import("../dist/builder/element-schema.js");
  const { finalizeForRender, walk } = await import("../dist/builder/page.js");
  const { checkElementKeys } = await import("../dist/builder/element-schema.js");
  const { ELEMENT_TYPES } = await import("../dist/builder/catalog.js");
  // get_element shows the style format per key
  assert.match(keyReference("text").style.join("\n"), /^fontSize: "<N>px"/m);
  assert.match(keyReference("container").style.join("\n"), /^borderRadius: "<N>px <N>px <N>px <N>px"/m);
  assert.equal(valueFormat("text", "specials.field_name"), undefined); // names are free text
  // one-answer conversions on save
  const t = T("x");
  Object.assign(t.runtime.style, { lineHeight: "27px" });
  t.runtime.style.fontSize = "18px";
  const c = B("container", { children: [T("y")] });
  c.runtime = { style: { borderRadius: 8 } };
  const fixed = repairSource({ sections: [{ id: "SECTION-x", type: "section", children: [t, c] }] }).join("\n");
  assert.equal(t.runtime.style.lineHeight, 1.5);
  const ds = B("text-dataset", { bindings: [{ target: "product::product_name" }] });
  ds.runtime.style.fontWeight = 700; // text-dataset pages: 98% "700" strings (text: numbers are common too)
  repairSource({ sections: [{ id: "SECTION-z", type: "section", children: [ds] }] });
  assert.equal(ds.runtime.style.fontWeight, "700");
  assert.equal(c.runtime.style.borderRadius, "8px 8px 8px 8px");
  assert.match(fixed, /the format real pages use/);
  const n = T("x");
  n.runtime.style.fontSize = 16;
  repairSource({ sections: [{ id: "SECTION-y", type: "section", children: [n] }] });
  assert.equal(n.runtime.style.fontSize, "16px"); // the editor (Vue :style) adds no px
  // no single fix → reported with the format
  const bad = T("x");
  bad.runtime.style.color = "{{brand}}";
  assert.match(outcome([bad]).detail, /VALUE_FORMAT.*color/);
  // every factory element, saved, writes values in the real format
  const left = [];
  for (const type of ELEMENT_TYPES) {
    let el;
    try { el = B(type); } catch { continue; }
    const src = { sections: [buildSection([])] };
    src.sections[0].children = [el];
    repairSource(src);
    finalizeForRender(src);
    walk(src, (node) => { for (const f of checkElementKeys(node)) if (f.code === "VALUE_FORMAT") left.push(`${node.type} ${f.at}`); return true; });
  }
  assert.deepEqual(left, []);
});

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
  "CSS kebab-case": ["FIXED", () => { const n = T("Chào"); n.runtime.style["font-size"] = "20px"; return [n]; }],
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

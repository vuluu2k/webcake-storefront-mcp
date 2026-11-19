import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSection, validatePage } from "../dist/builder/page.js";
import { loadPageContext, kindOfPage } from "../dist/tools/page-context.js";

const page = (children) => ({ sections: [buildSection(children)] });
const codes = (v) => [...(v.errors || []).map((e) => `E:${e.slice(1, e.indexOf("]"))}`), ...(v.warnings || []).map((w) => `W:${w.slice(1, w.indexOf("]"))}`)];

test("ngữ cảnh liên nguồn: id ở popup/global source hợp lệ; không ở đâu → chặn; popup_id phải là popup", () => {
  const ctx = { kind: "main", externalIds: new Set(["POPUP-abc12345", "TEXT-inpopup1"]), popupIds: new Set(["POPUP-abc12345"]) };
  const btn = (ev) => page([{ type: "button", opts: { text: "Mở", events: [ev] } }]);
  assert.ok(!codes(validatePage(btn({ action: "open_popup", popup_id: "POPUP-abc12345" }), undefined, ctx)).some((c) => c.startsWith("E:")));
  assert.ok(!codes(validatePage(btn({ action: "toggle", toggle_id: "TEXT-inpopup1" }), undefined, ctx)).some((c) => c.startsWith("E:")));
  assert.ok(codes(validatePage(btn({ action: "toggle", toggle_id: "TEXT-nowhere1" }), undefined, ctx)).includes("E:EVENT"));
  assert.match(validatePage(btn({ action: "open_popup", popup_id: "TEXT-inpopup1" }), undefined, ctx).errors.join("\n"), /no such popup/);
  // without the context it stays a warning (never block on missing knowledge)
  assert.ok(codes(validatePage(btn({ action: "toggle", toggle_id: "TEXT-nowhere1" }))).includes("W:EVENT"));
});

test("binding theo loại trang: product:: ngoài lưới trên trang main → chặn; trong grid-product / trang store → được", () => {
  const price = { type: "text-dataset", opts: { bindings: [{ target: "product::product_price" }] } };
  assert.ok(codes(validatePage(page([price]), undefined, { kind: "main" })).includes("E:BINDING_SCOPE"));
  assert.ok(!codes(validatePage(page([price]), undefined, { kind: "store" })).includes("E:BINDING_SCOPE"));
  assert.ok(!codes(validatePage(page([{ type: "grid-product", children: [price] }]), undefined, { kind: "main" })).includes("E:BINDING_SCOPE"));
  const search = { type: "text-dataset", opts: { bindings: [{ target: "search_result::keyword" }] } };
  assert.ok(!codes(validatePage(page([search]), undefined, { kind: "main" })).includes("E:BINDING_SCOPE"));
});

test("loadPageContext đọc popup + giỏ hàng; lỗi API thì chỉ trả kind", async () => {
  const popup = { id: "POPUP-x1y2z3w4", type: "popup", children: [{ id: "BUTTON-q1w2e3r4", type: "button" }] };
  const ok = { siteId: "S-ctx-1", getGlobalSources: async () => ({ data: [{ source: JSON.stringify(popup) }] }), getSourceCart: async () => ({ data: [] }) };
  const ctx = await loadPageContext(ok, "main");
  assert.ok(ctx.popupIds.has("POPUP-x1y2z3w4") && ctx.externalIds.has("BUTTON-q1w2e3r4"));
  const broken = { siteId: "S-ctx-2", getGlobalSources: async () => { throw new Error("down"); }, getSourceCart: async () => ({ data: [] }) };
  assert.deepEqual(await loadPageContext(broken, "blog"), { kind: "blog" });
  assert.equal(kindOfPage({ type: 2 }), "store");
  assert.equal(kindOfPage({ type: "blog" }), "blog");
});

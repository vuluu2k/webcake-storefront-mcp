import { test } from "node:test";
import assert from "node:assert/strict";
import { buildElement, ELEMENT_TYPES } from "../dist/builder/catalog.js";
import { validatePage, finalizeForRender } from "../dist/builder/page.js";
import { checkElementKeys, elementSchema, valueRules, formatFinding, collapseByCode, didYouMean } from "../dist/builder/element-schema.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/server.js";
import { WebcakeCmsApi } from "../dist/api.js";

const KEY_CODES = new Set(["UNKNOWN_KEY", "STYLE_KEY", "TYPE_MISMATCH", "BAD_VALUE"]);

test("mọi element dựng từ factory (cả sau finalize ra bp1..bp4) không bị báo key/kiểu/giá trị", () => {
  for (const type of ELEMENT_TYPES) {
    const node = buildElement(type, {});
    const sec = type === "section" ? node : { ...buildElement("section", {}), children: [node] };
    const src = finalizeForRender({ sections: [sec] });
    const saved = type === "section" ? src.sections[0] : src.sections[0].children[0];
    for (const n of [node, saved]) {
      const bad = checkElementKeys(n).filter((f) => KEY_CODES.has(f.code));
      assert.deepEqual(bad.map(formatFinding), [], type);
    }
  }
});

test("bắt các lỗi agent hay mắc, kèm cách sửa", () => {
  const sec = buildElement("section", {});
  const text = buildElement("text", {});
  text.specials = { ...text.specials, content: "Hi" };
  text.runtime.style = { ...text.runtime.style, "font-size": "20px", colour: "red" };
  text.runtime.config = { ...text.runtime.config, backgroundColor: "#fff" };
  const button = buildElement("button", {});
  button.specials = { ...button.specials, href: "/x" };
  const form = buildElement("form", {});
  form.specials = { ...form.specials, type: "contact_form" };
  const slide = buildElement("slide", {});
  sec.children = [text, button, form, slide, { ...buildElement("text", {}), type: "txt" }];
  const w = validatePage({ sections: [sec] }).warnings.join("\n");
  assert.match(w, /\[UNKNOWN_KEY\] #TEXT-\S+ \(text\) specials\.content: .* → put the text\/HTML in specials\.text/);
  assert.match(w, /runtime\.config\.backgroundColor: belongs in style/);
  assert.match(w, /\[STYLE_KEY\].*font-size.*rename to "fontSize"/);
  assert.match(w, /colour.*did you mean "color"/);
  assert.match(w, /specials\.href: .*open_link/);
  assert.match(w, /\[BAD_VALUE\].*"contact_form" is not one of .*form_order/);
  assert.match(w, /\[BAD_PARENT\] #SLIDE-\S+ \(slide\) must be a direct child of swiper or carousel/);
  assert.match(w, /\[UNKNOWN_TYPE\].*"txt" → did you mean "text"\?/);
});

test("key thật của element khác không bị báo nhầm; boolean-chuỗi được chỉ ra", () => {
  const t = buildElement("text", {});
  t.specials = { ...t.specials, label: "x" }; // a real specials key (form fields) — not a typo
  assert.equal(checkElementKeys(t).length, 0);
  const sw = buildElement("swiper", {});
  sw.specials = { ...sw.specials, infinity: "true" };
  const [f] = checkElementKeys(sw);
  assert.equal(f.code, "TYPE_MISMATCH");
  assert.match(f.fix, /use true \(boolean\)/);
});

test("schema theo element: enum chỉ khi editor + trang thật cùng xác nhận; value_rules gọn", () => {
  assert.ok(elementSchema("form").specials.type.enum.includes("form_order"));
  assert.equal(elementSchema("text").specials.tag.enum, undefined); // real pages use more tags than the curated list
  assert.deepEqual(elementSchema("slide").parents, ["swiper", "carousel"]);
  const rules = valueRules("swiper");
  assert.match(rules["specials.autoplay"], /one of on\|off/);
  assert.ok(!Object.keys(rules).some((k) => k === "config.absBottom"), "generic grid keys stay out");
  assert.equal(didYouMean("fontsize", ["fontSize"]), "fontSize");
});

test("warning lặp được gom theo mã, summary đếm đủ", () => {
  const many = Array.from({ length: 9 }, (_, i) => `[STYLE_KEY] #X${i} (text) style.k: bad`);
  const out = collapseByCode(many);
  assert.equal(out.length, 6);
  assert.match(out[5], /\[STYLE_KEY\] …and 4 more/);
  const sec = buildElement("section", {});
  sec.children = Array.from({ length: 8 }, () => {
    const t = buildElement("text", {});
    t.runtime.style = { ...t.runtime.style, colour: "red" };
    return t;
  });
  const v = validatePage({ sections: [sec] });
  assert.equal(v.summary.by_code.STYLE_KEY, 8);
  assert.equal(v.warnings.filter((m) => m.startsWith("[STYLE_KEY]")).length, 6);
});

test("tool từ chối tham số không có trong schema (cả qua invoke_tool)", async () => {
  const server = createServer(new WebcakeCmsApi({ baseUrl: "http://x", token: "t", siteId: "s" }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const c = new Client({ name: "t", version: "1" });
  await c.connect(b);
  const bad = await c.callTool({ name: "get_element", arguments: { type: "text", page_id: "P1" } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /page_id/);
  const ok = JSON.parse((await c.callTool({ name: "get_element", arguments: { type: "swiper" } })).content[0].text);
  assert.ok(ok.value_rules["specials.autoplay"]);
  const gw = await c.callTool({ name: "invoke_read_tool", arguments: { name: "get_element", arguments: { type: "text", bogus: 1 } } });
  assert.match(gw.content[0].text, /bogus/);
  await c.close();
});

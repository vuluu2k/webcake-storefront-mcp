import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotToSource, CLONE_SCRIPT } from "../dist/builder/clone.js";
import { validatePage, walk } from "../dist/builder/page.js";
import { createServer } from "../dist/server.js";
import { toolsOf } from "./tools-of.mjs";

const T = (x, y, w, h, text, extra = {}) => ({ k: "text", x, y, w, h, tag: "p", html: text, text, style: { fontSize: 16, color: "rgb(0, 0, 0)", textAlign: "start" }, ...extra });

// A captured page: header (logo + 3 links far right), dark hero (centred heading + button),
// a row of 3 cards, a contact form, a fixed chat bubble that was skipped.
const SNAP = {
  url: "https://example.com/", title: "Ex", viewport: { w: 1440, h: 900 }, pageBg: "rgb(255, 255, 255)", textTotal: 120,
  skipped: { "fixed overlay (chat widget, cookie bar, sticky button)": 1 },
  sections: [
    { k: "section", role: "header", x: 0, y: 0, w: 1440, h: 60, style: { bg: "rgba(255, 255, 255, 0.8)" }, pad: { t: 16, r: 64, b: 16, l: 64 },
      content: { k: "group", dir: "row", gap: 24, x: 64, y: 16, w: 1312, h: 28, kids: [
        T(64, 16, 80, 28, "Brand", { tag: "p" }),
        { k: "group", dir: "row", gap: 24, x: 1200, y: 18, w: 176, h: 24, kids: [T(1200, 18, 40, 24, "About", { href: "https://example.com/about" }), T(1264, 18, 40, 24, "Shop", { href: "https://example.com/shop" }), T(1328, 18, 48, 24, "Call", { href: "tel:0900" })] },
      ] } },
    { k: "section", x: 0, y: 60, w: 1440, h: 420, style: { bg: "rgb(15, 23, 42)", bgImage: "https://content.pancake.vn/test/hero.jpg" }, pad: { t: 120, r: 64, b: 120, l: 64 },
      content: { k: "group", dir: "col", gap: 16, x: 64, y: 180, w: 1312, h: 180, kids: [
        T(470, 180, 500, 64, "Big headline", { tag: "h1", style: { fontSize: 56, fontWeight: "700", color: "rgb(255, 255, 255)", textAlign: "center" } }),
        { k: "button", x: 660, y: 300, w: 120, h: 46, text: "Buy now", href: "https://example.com/buy", style: { bg: "rgb(249, 115, 22)", radius: 8, color: "rgb(255, 255, 255)", fontSize: 16, fontWeight: "600", padX: 28 } },
      ] } },
    { k: "section", x: 0, y: 480, w: 1440, h: 400, style: {}, pad: { t: 96, r: 0, b: 96, l: 0 },
      content: { k: "group", dir: "row", gap: 32, x: 170, y: 576, w: 1100, h: 300, kids: [0, 1, 2].map((i) => ({
        k: "box", x: 170 + i * 378, y: 576, w: 346, h: 300, style: { bg: "rgb(248, 250, 252)", radius: 16 }, pad: { t: 24, r: 24, b: 24, l: 24 },
        content: { k: "group", dir: "col", gap: 12, x: 194 + i * 378, y: 600, w: 298, h: 250, kids: [
          { k: "image", x: 194 + i * 378, y: 600, w: 298, h: 180, src: `https://content.pancake.vn/test/${i}.jpg`, alt: "card" },
          T(194 + i * 378, 792, 298, 24, `Card ${i}`, { tag: "h3" }),
        ] },
      })) } },
    { k: "section", x: 0, y: 880, w: 1440, h: 300, style: {}, pad: { t: 80, r: 64, b: 80, l: 64 },
      content: { k: "form", x: 744, y: 960, w: 632, h: 200, fields: [
        { tag: "input", type: "text", name: "name", label: "", placeholder: "Your name", required: true, h: 41, style: { border: "1px solid rgb(204, 204, 204)", radius: 6, color: "rgb(0, 0, 0)", fontSize: 14 } },
        { tag: "input", type: "email", name: "email", label: "", placeholder: "Email", required: false, h: 41, style: {} },
        { tag: "textarea", type: "textarea", name: "msg", label: "", placeholder: "Message", required: false, h: 56, style: {} },
      ], submit: "Send", submitStyle: { bg: "rgb(17, 17, 17)", color: "rgb(255, 255, 255)", h: 46 }, style: {} } },
  ],
};

const nodes = (source) => {
  const out = [];
  walk(source, (n) => (out.push(n), true));
  return out;
};

test("clone: snapshot → section native, không lỗi validate, không embed/custom code", () => {
  const out = snapshotToSource(SNAP);
  assert.equal(out.source.sections.length, 4);
  assert.deepEqual(out.roles, ["header", "content", "content", "content"]);
  const v = validatePage(out.source);
  assert.equal(v.valid, true, JSON.stringify(v.errors));
  // hug columns (max-c) have no builder-format equivalent yet: reported, not hidden
  assert.deepEqual((v.warnings || []).filter((w) => !/^\[GRID_FORMAT\].*"max-c"/.test(w)), []);
  const all = nodes(out.source);
  assert.ok(!all.some((n) => n.type === "embed"));
  assert.ok(out.notes.some((n) => n.startsWith("skipped: fixed overlay")));
  assert.equal(out.images.length, 4); // 3 card images + the hero's background picture (rehosted too)
  assert.ok(out.images.includes("https://content.pancake.vn/test/hero.jpg"));
});

test("clone: link cả khối → text + open_link (giữ màu), tel: → phone_call; form = subscribe, khung ô trên form", () => {
  const all = nodes(snapshotToSource(SNAP).source);
  const about = all.find((n) => n.specials?.text === "About");
  assert.equal(about.events[0].action, "open_link");
  assert.equal(about.events[0].link_target, "https://example.com/about");
  assert.ok(!/<a /.test(about.specials.text));
  assert.equal(all.find((n) => n.specials?.text === "Call").events[0].action, "phone_call");
  const form = all.find((n) => n.type === "form");
  assert.equal(form.specials.type, "subscribe");
  assert.equal(form.runtime.style.borderWidth, "1px");
  assert.deepEqual(form.children.map((c) => c.type), ["input", "email", "text-area", "submit-button"]);
});

test("clone: hàng giữ tỉ lệ cột + căn vị trí; nền màu nằm dưới ảnh; hàng nhỏ không gãy trên mobile", () => {
  const src = snapshotToSource(SNAP).source;
  const hero = src.sections[1];
  assert.match(hero.runtime.style.background, /^url\(https:\/\/content\.pancake\.vn\/test\/hero\.jpg\) rgb\(15, 23, 42\)$/);
  const button = nodes(src).find((n) => n.type === "button");
  assert.deepEqual(button.runtime.config.constraintX, ["centerLeft"]);
  const cards = src.sections[2].children[0];
  assert.equal(cards.runtime.config.__row.cols, 3);
  assert.deepEqual(cards.runtime.config.constraintX, ["centerLeft"]); // a 1100px row centred in the section
  const links = src.sections[0].children[0].children[1];
  assert.equal(links.runtime.config.__row.collapse.bp4, 3);
  // translucent header colour is laid over the page colour only when the page isn't white
  const dark = snapshotToSource({ ...SNAP, pageBg: "rgb(8, 9, 10)" }).source.sections[0];
  assert.match(dark.runtime.style.background, /^linear-gradient\(rgba\(255, 255, 255, 0\.8\), rgba\(255, 255, 255, 0\.8\)\), rgb\(8, 9, 10\)$/);
});

test("clone_page tool: snapshot → source_ref; build_page đọc được cache:…; thiếu url/snapshot thì báo", async () => {
  const api = new Proxy({}, { get: (_, k) => (k === "siteId" ? "S1" : k === "listPages" ? async () => ({ data: [] }) : async () => null) });
  const t = toolsOf(createServer(api, { tools: "all" }));
  const r = JSON.parse((await t.clone_page.handler({ snapshot: SNAP }, {})).content[0].text);
  assert.match(r.source_ref, /^cache:clone-\d+$/);
  assert.equal(r.validation.valid, true);
  assert.equal(r.outline.length, 4);
  const dry = JSON.parse((await t.build_page.handler({ name: "Clone", slug: "clone", source: r.source_ref, dry_run: true }, {})).content[0].text);
  assert.equal(dry.validation.valid, true);
  assert.equal(dry.request.sections, 4);
  const miss = await t.clone_page.handler({}, {});
  assert.match(miss.content[0].text, /url or snapshot/);
  const script = JSON.parse((await t.get_clone_script.handler({}, {})).content[0].text);
  assert.ok(script.script.startsWith("(async function captureInPage") && script.script === CLONE_SCRIPT);
});

test("clone: số cột đo từ trang gốc theo breakpoint; cụm nhỏ co theo nội dung; <details> → collapse; ảnh nhỏ giữ px", () => {
  const pills = { k: "group", dir: "row", key: "2/1", gap: 12, x: 48, y: 10, w: 400, h: 36, kids: ["Tất cả", "Trong nhà", "Ngoài trời", "Chậu"].map((t, i) => ({ k: "box", x: 48 + i * 100, y: 10, w: 88, h: 36, style: { border: "1px solid rgb(209, 213, 219)", radius: 999 }, pad: { t: 8, r: 16, b: 8, l: 16 }, content: T(64 + i * 100, 18, 56, 20, t) })) };
  const grid = { k: "group", dir: "row", key: "3", gap: 24, x: 48, y: 80, w: 1344, h: 300, kids: [0, 1, 2, 3].map((i) => ({ k: "image", x: 48 + i * 342, y: 80, w: 318, h: 300, src: `https://content.pancake.vn/test/${i}.jpg` })) };
  const faq = { k: "accordion", x: 48, y: 400, w: 700, h: 80, title: "Có giao hàng không?", titleStyle: { fontSize: 16, fontWeight: "700" }, style: {}, body: T(48, 440, 700, 24, "Có, trước 11 giờ.") };
  const quote = { k: "group", dir: "row", key: "4", gap: 24, x: 48, y: 500, w: 700, h: 96, kids: [{ k: "image", x: 48, y: 500, w: 96, h: 96, src: "https://content.pancake.vn/test/a.jpg" }, T(168, 530, 580, 24, "Bánh ngon nhất.")] };
  const snap = { ...SNAP, sections: [{ k: "section", x: 0, y: 0, w: 1440, h: 700, style: {}, pad: {}, content: { k: "group", dir: "col", gap: 20, x: 48, y: 10, w: 1344, h: 690, kids: [pills, grid, faq, quote] } }], columns: { bp2: { "2/1": 4, 3: 4, 4: 2 }, bp3: { "2/1": 4, 3: 2, 4: 1 }, bp4: { "2/1": 3, 3: 2, 4: 1 } } };
  const [p, g, f, q] = snapshotToSource(snap).source.sections[0].children;
  assert.deepEqual(p.runtime.config.__row.collapse, { bp1: null, bp2: 4, bp3: 4, bp4: 3 });
  assert.equal(p.runtime.config.__row.hug, true);
  assert.ok(p.runtime.config.columns.every((col) => col.unit === "max-c"));
  assert.deepEqual([g.runtime.config.__row.collapse.bp3, g.runtime.config.__row.collapse.bp4], [2, 2]);
  assert.equal(f.type, "collapse");
  assert.equal(f.specials.name, "Có giao hàng không?");
  assert.deepEqual(f.children.map((c) => c.type), ["collapse-content"]);
  const avatar = q.children[0];
  assert.equal(avatar.runtime.config.widthUnit, "px");
  assert.deepEqual(avatar.runtime.config.constraintX, ["centerLeft"]);
  assert.equal(validatePage(snapshotToSource(snap).source).valid, true);
});

test("clone: slider → carousel giữ mọi thẻ, số thẻ hiện cùng lúc theo từng breakpoint; slide bị bỏ không tính vào coverage", async () => {
  const cards = Array.from({ length: 10 }, (_, i) => ({ k: "image", x: 60 + i * 340, y: 100, w: 320, h: 400, src: `https://content.pancake.vn/test/c${i}.jpg` }));
  const slider = { k: "group", dir: "row", key: "5/1", slider: 4, gap: 20, x: 60, y: 100, w: 1320, h: 400, kids: cards };
  const snap = { ...SNAP, textTotal: 100, offscreenText: 60, columns: { bp3: { "5/1": 6 }, bp4: { "5/1": 2 } }, slides: { bp3: { "5/1": [40, 12] } },
    sections: [{ k: "section", x: 0, y: 0, w: 1440, h: 600, style: {}, pad: {}, content: { k: "group", dir: "col", gap: 20, x: 60, y: 40, w: 1320, h: 460, kids: [T(60, 40, 600, 40, "x".repeat(40)), slider] } }] };
  const out = snapshotToSource(snap);
  const car = out.source.sections[0].children[1];
  assert.equal(car.type, "carousel"); // a track that slides, not a grid of every card
  assert.equal(car.children.length, 10);
  assert.equal(car.runtime.config.slideItems, 10);
  assert.equal(car.runtime.config.slideWidthUnit, "%");
  assert.equal(car.runtime.config.relSlideWidth, 25); // 4 in view (no window measured)
  assert.equal(car.specials.autoplay, "off");
  // per breakpoint: the probed card width, else ~3 on a tablet / ~2 on a phone
  assert.deepEqual(car.runtime.responsive.bp3.config, { relSlideWidth: 40, columnGap: 12 });
  assert.equal(car.runtime.responsive.bp4.config.relSlideWidth, 45);
  const { finalizeForRender } = await import("../dist/builder/page.js");
  finalizeForRender(out.source);
  assert.deepEqual(["bp1", "bp3", "bp4"].map((bp) => car[bp].config.relSlideWidth), [25, 40, 45]);
  assert.deepEqual(car.children.map((k) => k.bp4.config.columnStart), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // one track, never wrapped
  assert.equal(out.stats.text_coverage_pct, 100); // 40 of the 100 - 60 left out
  assert.ok(out.notes.some((n) => /left-out slides held 60 characters/.test(n)));
  assert.equal(validatePage(out.source).valid, true);
});

test("clone rehost: mọi ảnh (src, nền url có/không ngoặc kép, layer bp, ảnh trong carousel) lên CDN; thử lại, bỏ query; ảnh hỏng bị bỏ và liệt kê", async () => {
  const { rehost } = await import("../dist/tools/clone.js");
  const { buildSection } = await import("../dist/builder/page.js");
  const X = "https://shop.example/img";
  const sec = buildSection([
    { type: "image", opts: { src: `${X}/flaky.jpg` } },
    { type: "image", opts: { src: `${X}/sized.jpg?w=700` } },
    { type: "image", opts: { src: `${X}/gone.jpg` } },
    { type: "container", opts: { style: { background: `url("${X}/q_(1).jpg") rgb(1, 2, 3)` } }, children: [{ type: "text", opts: { text: "x" } }] },
    { type: "container", opts: { style: { background: `linear-gradient(red, blue), url('${X}/s.jpg')` } }, children: [{ type: "text", opts: { text: "y" } }] },
    { type: "container", opts: { style: { background: `url(${X}/a_%281%29.jpg) rgb(4, 5, 6)` } }, children: [{ type: "text", opts: { text: "z" } }] },
    { type: "container", opts: { style: { background: `url(${X}/dead.jpg) rgb(7, 8, 9)` } }, children: [{ type: "text", opts: { text: "w" } }] },
    { type: "carousel", children: [{ type: "image", opts: { src: `${X}/card.jpg` } }, { type: "image", opts: { src: "data:image/svg+xml;base64,PHN2Zy8+" } }] },
  ]);
  const flat = sec.children[3];
  flat.runtime.responsive = undefined;
  flat.bp3 = { style: { backgroundImage: `url(${X}/mobile.jpg)` }, config: {} }; // a per-breakpoint layer
  const source = { sections: [sec] };
  assert.ok(validatePage(source).errors.some((e) => e.startsWith("[IMAGE_HOST]")));

  const calls = {};
  const upload = async (src) => {
    calls[src] = (calls[src] || 0) + 1;
    if (src.endsWith("/flaky.jpg") && calls[src] < 3) throw new Error("fetch failed (ECONNRESET)");
    if (src.includes("?w=700") || /gone|dead/.test(src)) throw new Error(`Fetch failed (404) for ${src}`);
    return `https://content.pancake.vn/hosted/${Object.keys(calls).length}.png`;
  };
  const r = await rehost(source, upload, { delayMs: 1 });
  assert.equal(calls[`${X}/flaky.jpg`], 3); // retried with backoff
  assert.equal(calls[`${X}/sized.jpg?w=700`], 1); // a 404 is not retried…
  assert.equal(calls[`${X}/sized.jpg`], 1); // …the url without its query is tried instead
  assert.equal(calls[`${X}/q_(1).jpg`], 1); // quoted: brackets inside kept whole
  assert.deepEqual(r.failed.map((f) => f.src).sort(), [`${X}/dead.jpg`, `${X}/gone.jpg`]);
  assert.ok(r.failed.every((f) => /404/.test(f.error) && f.elements.length === 1));
  const v = validatePage(source);
  assert.deepEqual(v.errors.filter((e) => e.startsWith("[IMAGE_HOST]")), []); // build_page takes the ref as is
  const json = JSON.stringify(source);
  assert.ok(!json.includes("shop.example"));
  assert.ok(json.includes('"background":"rgb(7, 8, 9)"')); // the dead background keeps its colour
  assert.equal(sec.children.filter((k) => k.type === "image").length, 2); // the dead picture is gone
  assert.ok(!json.includes("data:image")); // svg icons are uploaded too
});

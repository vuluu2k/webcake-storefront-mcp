// captureInPage in a real Chrome (playwright-core, optional dependency): skipped where none runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { capturePage, snapshotToSource } from "../dist/builder/clone.js";

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {}
const launch = async () => {
  try {
    return await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: "chrome", headless: true });
  } catch {
    return null;
  }
};
const browser = chromium && (await launch());

const IMG = (c) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${c}"/></svg>`)}`;
const card = (i) => `<div class="card" style="width:300px;flex:none"><img src="${IMG("#" + (i % 9) + "88")}" style="width:300px;height:200px;display:block"><h3>Card ${i}</h3><p>${(i + 1) * 100}.000đ <s>999.000đ</s></p><p style="text-decoration:line-through">${i}99.000đ</p></div>`;
const PAGE = `<!doctype html><html style="scroll-behavior:smooth"><body style="margin:0;font:16px sans-serif">
<nav class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">${"Hidden menu link ".repeat(40)}</nav>
<header style="height:60px;background:#111;color:#fff;display:flex;gap:40px"><a href="/">Brand</a><input type="search" placeholder="Tìm kiếm..." style="width:300px;height:36px"></header>
<div style="position:relative;height:30px;overflow:hidden;background:#cf0"><a href="/ship"><div style="position:absolute;left:600px;top:6px">Free shipping</div></a></div>
<section style="position:relative;height:400px;overflow:hidden">
  <div style="display:flex;transform:translateX(-1200px)">${[0, 1, 2].map((i) => `<img src="${IMG(["red", "green", "blue"][i])}" style="width:1200px;height:400px;flex:none">`).join("")}</div>
  <button aria-label="Previous slide" style="position:absolute;left:8px;top:180px;width:32px;height:32px">‹</button>
</section>
<section style="padding:40px 60px"><h2>Best sellers</h2>
  <div style="overflow:hidden"><div style="display:flex;gap:20px">${Array.from({ length: 8 }, (_, i) => card(i)).join("")}</div></div>
</section>
<section style="position:relative;height:360px">
  <img src="${IMG("navy")}" style="width:100%;height:360px;display:block">
  <div style="position:absolute;left:60px;top:120px;color:#fff"><h2 style="margin:0">Gift shop</h2><p>Pick any gift</p></div>
</section>
<section style="padding:40px"><header><h1>Product title</h1></header><p>399.000đ</p>
  <div style="display:flex;gap:8px"><button type="button" role="radio" value="mac-ra-duong" style="width:20px;height:20px;border:1px solid #333;border-radius:50%;padding:0"></button><label>Mặc ra đường</label></div>
</section>
<section style="padding:20px"><nav style="display:flex"><a href="/a" style="padding:0 16px">About</a><a href="/b" style="padding:0 16px">Blog</a></nav>
  <div style="position:relative;width:60px;height:60px;margin-top:20px"><div style="position:absolute;inset:0;background:#ccc"></div><img src="${IMG("teal")}" style="position:relative;z-index:1;width:60px;height:60px;display:block"></div>
  <div style="width:200px;height:20px;font-size:16px;line-height:20px;margin-top:20px">Long text that wraps onto several lines in this short box</div>
  <div style="width:100px;height:100px;margin-top:20px;background:url('https://example.com/a_(1).jpg') #eee"></div>
</section>
<div style="height:1600px;padding:60px"><p>Lots of content below the fold</p></div>
<div style="position:fixed;inset:0;background:rgba(0,0,0,.5)" id="backdrop"></div>
<div style="position:fixed;left:0;right:0;bottom:0;height:80px;background:#fff" id="consent">We use cookies <button onclick="document.getElementById('consent').remove();document.getElementById('backdrop').remove()">Chấp nhận tất cả</button></div>
<div style="position:fixed;right:16px;bottom:16px;height:0"><div style="width:56px;height:56px;background:#0a0">Chat</div></div>
</body></html>`;

test("clone capture: consent closed, smooth scroll, sr-only out of the base, sliders, layered banner", { skip: !browser && "no local Chrome" }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.setContent(PAGE);
    const snap = await capturePage(page, 1440);
    const json = JSON.stringify(snap);
    // consent accepted (its backdrop went with it); the chat bubble inside a 0-height pinned wrapper is skipped
    assert.equal(snap.skipped["dismissed overlay (consent / popup)"], 1);
    assert.ok(!json.includes("We use cookies") && !json.includes('"Chat"'), "no consent bar / chat bubble in the snapshot");
    assert.ok(!snap.sections.some((s) => s.h >= 900 && !s.content), "no empty full-screen backdrop band");
    // smooth scroll did not leave the page mid-way: the header is measured at the top
    assert.equal(snap.sections[0].y, 0);
    // sr-only text is not part of what a visitor sees
    assert.ok(snap.textTotal < 400, `textTotal ${snap.textTotal}`);
    // one-per-view hero: the shown slide alone, its arrow dropped
    assert.equal(snap.skipped["off-screen slide of a one-per-view carousel / marquee (the shown one is kept)"], 2);
    assert.ok(snap.skipped["carousel arrow"] >= 1);
    // several per view: every card kept, tagged with how many show at once
    const rows = [];
    const walk = (n) => n && typeof n === "object" && (n.slider && rows.push(n), Object.values(n).forEach(walk));
    walk(snap.sections);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kids.length, 8);
    assert.equal(rows[0].slider, 4);
    // the caption laid on the banner picture is inside a box painted with it, not stacked under it
    const banner = [];
    const find = (n) => n && typeof n === "object" && (n.k === "box" && n.style?.bgImage && JSON.stringify(n.content || {}).includes("Gift shop") && banner.push(n), Object.values(n).forEach(find));
    find(snap.sections);
    assert.equal(banner.length, 1);
    assert.deepEqual([banner[0].pad.l, banner[0].pad.t], [60, 120]);

    // a 0×0 inline link around an absolutely placed label still shows the label
    assert.ok(json.includes('"text":"Free shipping"'));
    // struck old prices keep their line
    assert.ok(json.includes("<s>999.000đ</s>") && json.includes('"textDecoration":"line-through"'));

    // padding around a link is spacing between links: the words are measured, not the box
    const texts = {};
    const t = (n) => n && typeof n === "object" && (n.k === "text" && (texts[n.text] = n), Object.values(n).forEach(t));
    t(snap.sections);
    assert.equal(texts.Blog.x - (texts.About.x + texts.About.w), 32);
    // text spilling out of its short box keeps its real height
    assert.ok(texts["Long text that wraps onto several lines in this short box"].h >= 50); // 3 lines, box 20px
    // the grey skeleton under the picture is gone; a url with brackets is read whole
    assert.ok(json.includes(IMG("teal")) && !json.includes('"bg":"rgb(204, 204, 204)"'));
    assert.ok(json.includes("https://example.com/a_(1).jpg"));
    // the slider's card width at every probed width (% of its window)
    assert.equal(snap.probes.bp4.slides[rows[0].key][0] > snap.probes.bp2.slides[rows[0].key][0], true);

    // only the band at the top is the site header; a product block's own <header> is content
    assert.deepEqual(snap.sections.filter((x) => x.role === "header").map((x) => x.y), [0]);
    // a radio control's value is not a label: no "button" with it
    assert.ok(!json.includes('"text":"mac-ra-duong"'));
    // content insets per probed width (the 60px side padding of "Best sellers")
    const best = snap.sections.find((x) => JSON.stringify(x).includes("Best sellers"));
    assert.deepEqual(snap.probes.bp2.insets[best.key], [60, 60]);
    const out = snapshotToSource(snap);
    assert.ok(JSON.stringify(out.source).includes("url(https://example.com/a_%281%29.jpg)"));
    assert.ok(JSON.stringify(out.source).includes('"type":"input-search"'), "header search box → input-search");
    assert.ok(out.stats.text_coverage_pct >= 90, `coverage ${out.stats.text_coverage_pct}`);
    // 8 cards, 4 in view → the builder's carousel holding all 8, each 300/1320 of the window
    const car = [];
    const g = (n) => (n.type === "carousel" && car.push(n), (n.children || []).forEach(g));
    out.source.sections.forEach(g);
    assert.equal(car.length, 1);
    assert.equal(car[0].children.length, 8);
    assert.equal(car[0].runtime.config.slideItems, 8);
    assert.equal(car[0].runtime.config.relSlideWidth, 22.73);
    assert.ok(car[0].runtime.responsive.bp4.config.relSlideWidth > 22.73);
  } finally {
    await page.close();
  }
});

const MOBILE = `<!doctype html><html><head><style>
.burger { display: none } .nav { display: flex; gap: 32px }
@media (max-width: 640px) { .nav { display: none } .burger { display: block } h1 { font-size: 24px !important } .hero { aspect-ratio: 3 / 4 !important } }
</style></head><body style="margin:0;font:16px sans-serif">
<header style="display:flex;justify-content:space-between;align-items:center;height:60px;padding:0 40px;background:#fff">
  <button class="burger" aria-label="Menu" style="width:32px;height:32px">☰</button>
  <a href="/"><img src="${IMG("navy")}" style="width:90px;height:40px;display:block"></a>
  <nav class="nav"><a href="/a">NAM</a><a href="/b">NỮ</a><a href="/c">THỂ THAO</a></nav>
  <a href="/cart"><img src="${IMG("red")}" style="width:24px;height:24px;display:block"></a>
</header>
<section style="padding:40px"><h1 style="font-size:48px;margin:0 0 20px">Mua 1 tặng 1</h1>
  <picture><source media="(max-width: 640px)" srcset="https://img.test/tall.svg"><img class="hero" src="https://img.test/wide.svg" style="width:100%;aspect-ratio:3/1;display:block"></picture>
  <div style="display:flex;gap:8px;margin-top:20px">${["red", "#fff", "#000"].map((c) => `<span style="display:block;width:36px;height:22px;border-radius:11px;border:1px solid #333;background:${c}"></span>`).join("")}</div>
</section></body></html>`;

test("clone capture mobile: what the phone hides / only shows, its font size and picture, measured in narrower passes", { skip: !browser && "no local Chrome" }, async () => {
  const { finalizeForRender } = await import("../dist/builder/page.js");
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.route("https://img.test/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="10"/>' }));
    await page.setContent(MOBILE);
    const snap = await capturePage(page, 1440);
    assert.deepEqual(Object.keys(snap.probes), ["bp2", "bp3", "bp4"]);
    assert.equal(snap.probe, undefined);
    const src = finalizeForRender(snapshotToSource(snap).source);
    const all = [];
    const g = (n) => (all.push(n), (n.children || []).forEach(g));
    src.sections.forEach(g);
    const text = (t) => all.find((n) => String(n.specials?.text || "").includes(t));
    const navRow = all.find((n) => n.type === "container" && (n.children || []).some((k) => String(k.specials?.text).includes("NAM")));
    assert.equal(navRow.bp1.config.isHidden, undefined);
    assert.equal(navRow.bp4.config.isHidden, true);
    const burger = text("☰");
    assert.equal(burger.bp1.config.isHidden, true);
    assert.equal(burger.bp4.config.isHidden, false);
    assert.equal(text("Mua 1").bp4.style.fontSize, "24px");
    const hero = all.find((n) => n.type === "image" && /wide/.test(n.bp1.config.src));
    assert.equal(hero.bp4.config.src, "https://img.test/tall.svg");
    const swatches = all.find((n) => (n.children || []).length === 3 && n.children.every((k) => k.type === "rectangle"));
    assert.equal(swatches.bp4.config.columns.length, 3);
  } finally {
    await page.close();
  }
});

test.after(() => browser?.close());

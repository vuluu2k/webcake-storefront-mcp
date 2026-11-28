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
    assert.equal(snap.slides.bp4[rows[0].key][0] > snap.slides.bp2[rows[0].key][0], true);

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

test.after(() => browser?.close());

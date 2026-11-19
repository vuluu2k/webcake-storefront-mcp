#!/usr/bin/env node
// Render every element type the MCP can build on the published page (dev machine only): each type
// gets its own section, nested in the parents it needs (submenu ⊂ menu-item ⊂ menu, fields ⊂ form,
// product-overlay ⊂ grid-product…), the page is written to a LOCAL scratch homepage
// (scripts/local-backend.mjs; backed up and restored) and opened in Chrome. Per type:
//   VISIBLE  its node is in the DOM with a size      EMPTY  in the DOM, 0×0 (often: needs data)
//   MISSING  not in the DOM at all                   (expected for NOT_RENDERED types)
// Writes test/fidelity/out/render-smoke.json.   FIDELITY_SITE=… FIDELITY_PAGE=… npm run render-smoke
import fs from "node:fs";
import path from "node:path";
import { ELEMENT_TYPES, buildElement } from "../dist/builder/catalog.js";
import { buildSection, finalizeForRender } from "../dist/builder/page.js";
import { elementSchema, FORM_FIELDS, relationsOf } from "../dist/builder/element-schema.js";
import { OBSERVED } from "../dist/builder/attributes.js";
import { repairSource } from "../dist/builder/repair.js";
import { localBackend } from "./local-backend.mjs";

const { RENDER, writeSource, readSource } = localBackend("smoke");
const OUT = path.resolve("test/fidelity/out");
fs.mkdirSync(OUT, { recursive: true });

// Global-source / page-level types: not something a page section holds.
const SKIP = new Set(["section", "popup", "cart-droppable"]);
const FORMISH = (t) => FORM_FIELDS.has(t) || Object.keys(OBSERVED[t]?.parents || {})[0] === "form" || t === "submit-button";
const SAMPLE = {
  text: { text: "Smoke text" }, button: { text: "Smoke button" },
  image: { src: "https://content.pancake.vn/web_content/29/46/e9/c6/c1d9a74e82dd593b64b32c3f0129af5027a18b701a9e509c27f0665c-w:800-h:800-l:84959-t:image/jpeg.jpeg" },
};

/** A spec for `type`, wrapped in the parent chain it must sit in. */
function specFor(type, depth = 0) {
  let spec = { type, opts: { ...(SAMPLE[type] || {}), ...(FORM_FIELDS.has(type) ? { specials: { field_name: `f_${type}` } } : {}) } };
  const parents = elementSchema(type)?.parents;
  if (parents?.length && depth < 4) {
    const outer = specFor(parents[0], depth + 1);
    // put this node at the innermost level of the parent chain
    let leaf = outer;
    while (leaf.children?.length) leaf = leaf.children[0];
    leaf.children = [spec];
    return outer;
  }
  if (FORMISH(type) && depth === 0) spec = { type: "form", opts: { specials: { type: "subscribe" } }, children: [spec] };
  return spec;
}

function pageFor(types) {
  const ids = {};
  const sections = types.map((t) => {
    const sec = buildSection([specFor(t)]);
    // find the node of type t (first match, depth-first)
    const find = (n) => (n.type === t ? n : (n.children || []).map(find).find(Boolean));
    ids[t] = find(sec)?.id;
    return sec;
  });
  // What a save stores: the one-answer repairs run first (plugins, defaults…).
  repairSource({ sections });
  return { source: finalizeForRender({ sections }), ids };
}

async function probe(browser, ids) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(RENDER, { waitUntil: "networkidle", timeout: 90000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const res = await page.evaluate((ids) => {
    const out = {};
    for (const [t, id] of Object.entries(ids)) {
      const el = id && document.getElementById(id);
      if (!el) out[t] = "MISSING";
      else {
        // A wrapper can be 0 tall while its content shows (text's <p>): any box in the subtree counts.
        const boxes = [el, ...Array.from(el.querySelectorAll("*")).slice(0, 300)].map((x) => x.getBoundingClientRect());
        out[t] = boxes.some((r) => r.width > 1 && r.height > 1) ? "VISIBLE" : "EMPTY";
      }
    }
    return out;
  }, ids);
  await page.close();
  return res;
}

const { chromium } = await import("playwright-core");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
const backup = readSource();
if (!backup.startsWith("{")) throw new Error("Could not read the scratch page's source — check FIDELITY_* settings.");
const types = ELEMENT_TYPES.filter((t) => !SKIP.has(t));
const results = {};
try {
  // One page for all; a renderer crash blanks the whole page → retry in chunks to isolate it.
  const run = async (batch) => {
    const { source, ids } = pageFor(batch);
    const css = writeSource(JSON.stringify(source));
    if (!/^=> \d+$/.test(String(css).trim())) console.warn(`CSS build for ${batch.length} type(s) failed: ${css}`);
    const r = await probe(browser, ids);
    const found = Object.values(r).filter((v) => v !== "MISSING").length;
    if (found === 0 && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      await run(batch.slice(0, mid));
      await run(batch.slice(mid));
    } else if (found === 0) results[batch[0]] = "PAGE_FAILS";
    else Object.assign(results, r);
  };
  await run(types);
} finally {
  await browser.close();
  console.log("restore:", writeSource(backup));
}

const notRendered = new Set(types.filter((t) => (relationsOf(t) || []).some((l) => l.startsWith("NOT RENDERED"))));
const by = {};
for (const [t, v] of Object.entries(results)) (by[v] ||= []).push(t);
const unexpected = (by.MISSING || []).filter((t) => !notRendered.has(t));
fs.writeFileSync(path.join(OUT, "render-smoke.json"), JSON.stringify({ results, by }, null, 1));
for (const [k, v] of Object.entries(by)) console.log(`${k.padEnd(10)} ${String(v.length).padStart(3)}  ${v.join(" ")}`);
console.log(`\nMISSING but not marked NOT_RENDERED: ${unexpected.join(" ") || "none"}`);
console.log(`marked NOT_RENDERED but rendered: ${[...notRendered].filter((t) => results[t] && results[t] !== "MISSING").join(" ") || "none"}`);

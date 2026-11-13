// Offline checks for the publish guard: preflight blocks what makes /publish fail or ship a broken
// site, the live page is verified afterwards, and raw source writes get the full validator. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../dist/server.js";
import { buildSection, finalizeForRender, missingBreakpoints, newPageSkeleton } from "../dist/builder/page.js";
import { CODE_BUDGET } from "../dist/builder/native-first.js";
import { checkLive } from "../dist/tools/builder-extras.js";

const page = () => {
  const p = newPageSkeleton();
  p.sections.push(buildSection([{ type: "text" }]));
  return finalizeForRender(p);
};

const site = ({ css = "", pages = [page()] } = {}) => {
  const calls = [];
  const api = new Proxy({}, {
    get: (_, k) => {
      if (k === "baseUrl") return "http://x";
      if (k === "getSiteSettings") return async () => ({ code_custom_css: css });
      if (k === "listPages") return async () => ({ data: pages.map((s, i) => ({ id: `P${i}`, slug: `p${i}`, source: { source: JSON.stringify(s) } })) });
      if (k === "getSite") return async () => ({ data: null }); // no live URL → no live fetch
      if (k === "publishSite" || k === "updatePageSource") return async (...a) => { calls.push([k, ...a]); return { data: {} }; };
      return async () => ({});
    },
  });
  return { calls, tools: createServer(api, { tools: "all" })._registeredTools };
};
const run = async (tools, name, args) => JSON.parse((await tools[name].handler(args, {})).content[0].text);

test("missingBreakpoints counts saved nodes without every site breakpoint", () => {
  const p = page();
  assert.equal(missingBreakpoints(p).missing, 0);
  delete p.sections[0].children[0].bp4;
  assert.equal(missingBreakpoints(p).missing, 1);
  assert.equal(missingBreakpoints(p, ["bp1"]).missing, 0);
});

test("site CSS past the ceiling blocks publish, dry run says why", async () => {
  const { calls, tools } = site({ css: "x".repeat(CODE_BUDGET.css.hard + 1) });
  const dry = await run(tools, "publish_site", { dry_run: true });
  assert.equal(dry.preflight.ok, false);
  assert.match(dry.preflight.errors[0], /css/);
  assert.match((await run(tools, "publish_site", { dry_run: false })).error, /BLOCKED/);
  assert.equal(calls.length, 0);
});

test("a broken page blocks publish, a clean site publishes", async () => {
  const dup = page();
  dup.sections.push(structuredClone(dup.sections[0]));
  assert.match((await run(site({ pages: [dup] }).tools, "publish_site", { dry_run: false })).errors[0], /Duplicate/);
  const ok = site();
  assert.equal((await run(ok.tools, "publish_site", { dry_run: false })).success, true);
  assert.equal(ok.calls.length, 1);
});

test("old native-first defects warn in preflight instead of blocking publish", async () => {
  const p = page();
  p.sections[0].children[0].specials.text = '[{"a":1}]';
  const dry = await run(site({ pages: [p] }).tools, "publish_site", { dry_run: true });
  assert.equal(dry.preflight.ok, true);
  assert.match(dry.preflight.warnings.join(" "), /placeholder/);
});

test("live check flags bps = [] and passes a real breakpoint list", async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("<script>const bps = [];detectBp(bps)</script>");
    assert.equal((await checkLive("https://x.test", 2, 0)).ok, false);
    globalThis.fetch = async () => new Response('<script>const bps = [["bp1",[1320,1e9]]]</script>');
    assert.equal((await checkLive("https://x.test", 2, 0)).ok, true);
    globalThis.fetch = async () => new Response("blocked", { status: 403 });
    const blocked = await checkLive("https://x.test", 2, 0);
    assert.equal(blocked.ok, true);
    assert.equal(blocked.unverified, "HTTP 403");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("update_page_source refuses new structural errors but lets a broken page be edited", async () => {
  const p = page();
  const dup = structuredClone(p);
  dup.sections.push(structuredClone(p.sections[0]));
  const clean = site({ pages: [p] });
  assert.match((await run(clean.tools, "update_page_source", { page_id: "P0", source: dup })).errors[0], /Duplicate/);
  const legacy = site({ pages: [dup] });
  const edited = structuredClone(dup);
  edited.sections[0].children[0].specials.text = "new";
  assert.equal((await run(legacy.tools, "update_page_source", { page_id: "P0", source: edited })).error, undefined);
  assert.equal(legacy.calls.length, 1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { lintPageCode, mergePageCode, readPageCode, codeTargets, PAGE_CODE_BUDGET } from "../dist/builder/page-code.js";
import { writePageCode } from "../dist/tools/page-code.js";
import { buildElement } from "../dist/builder/catalog.js";
import { createServer } from "../dist/server.js";
import { toolsOf } from "./tools-of.mjs";

const SEC = () => {
  const s = buildElement("section", {});
  s.children = [buildElement("text", {}), buildElement("button", {})];
  return s;
};

/** A fake api with one page; records every updatePage / updatePageSource / createPage. */
function fakeApi({ settings = { seo: { title: "T" } }, source = { sections: [SEC()] } } = {}) {
  const page = { id: "P1", name: "Home", slug: null, settings: JSON.stringify(settings), source: { source: JSON.stringify(source) } };
  const calls = [];
  const api = new Proxy({}, {
    get: (_, k) => {
      if (k === "siteId") return "S1";
      if (k === "listPages") return async () => ({ data: [page] });
      if (k === "updatePage") return async (id, body) => { calls.push({ k, id, body }); if (body.settings) page.settings = JSON.stringify(body.settings); return { data: {} }; };
      if (k === "updatePageSource") return async (id, body) => { calls.push({ k, id, body }); return { data: { id: "PS", page_id: id, source: JSON.stringify(body.source || {}) } }; };
      if (k === "createPage") return async (b) => { calls.push({ k, body: b }); page.id = "NEW"; page.source = { source: JSON.stringify(b.source) }; return { data: { id: "NEW" } }; };
      if (k === "getSiteBreakpoints" || k === "getSiteDefaultGrid") return async () => null;
      return async () => ({});
    },
  });
  return { api, page, calls, ids: codeTargets(source).ids, source };
}

test("lint: lỗi cú pháp JS bị chặn kèm dòng; CSS lệch ngoặc; #id không có trên trang; script inline trong head", () => {
  const ids = new Set(["TEXT-abc12345"]);
  const bad = lintPageCode({ code_custom_javascript: "const a = 1;\nif (a { }" }, ids);
  assert.match(bad.errors[0], /code_custom_javascript: SyntaxError.*line 2/);
  assert.match(lintPageCode({ code_custom_css: ".a{color:red" }, ids).errors[0], /unbalanced braces \(missing \}\)/);
  const w = lintPageCode({ code_custom_css: "#TEXT-abc12345{color:red} #BUTTON-zzzzzz99{}" }, ids);
  assert.deepEqual(w.errors, []);
  assert.match(w.warnings[0], /#BUTTON-zzzzzz99/);
  assert.match(lintPageCode({ code_before_head: "<script>let x = ;</script>" }, ids).errors[0], /code_before_head <script> #1/);
  assert.deepEqual(lintPageCode({ code_before_head: '<script src="https://x/y.js"></script><script type="application/ld+json">{"a":1}</script>' }, ids).errors, []);
});

test("merge: bỏ <script> bọc ngoài, append nối thêm, \"\" xoá slot", () => {
  const { after, notes } = mergePageCode({}, { code_custom_javascript: "<script>console.log(1)</script>" });
  assert.equal(after.code_custom_javascript, "console.log(1)");
  assert.match(notes[0], /removed the <script> wrapper/);
  assert.equal(mergePageCode({ code_custom_css: ".a{}" }, { code_custom_css: ".b{}" }, "append").after.code_custom_css, ".a{}\n.b{}");
  assert.deepEqual(mergePageCode({ code_custom_css: ".a{}" }, { code_custom_css: "" }).after, {});
  assert.deepEqual(readPageCode('{"custom_code":{"code_custom_css":".a{}","junk":1,"code_before_head":5}}'), { code_custom_css: ".a{}" });
});

test("writePageCode lưu vào page.settings.custom_code, giữ nguyên SEO và các key khác", async () => {
  const f = fakeApi();
  const id = [...f.ids][0];
  const r = await writePageCode(f.api, "P1", { code_custom_css: `#${id}{color:red}`, code_custom_javascript: "(()=>{document.title='x'})()" });
  assert.equal(r.saved, true);
  const saved = f.calls.find((c) => c.k === "updatePage").body.settings;
  assert.equal(saved.seo.title, "T");
  assert.equal(saved.custom_code.code_custom_css, `#${id}{color:red}`);
  assert.deepEqual(r.changed.sort(), ["code_custom_css", "code_custom_javascript"]);
});

test("writePageCode: dry_run không ghi; lỗi cú pháp không ghi; thu nhỏ đột ngột bị chặn; quá ngân sách cần native_gap", async () => {
  const f = fakeApi({ settings: { custom_code: { code_custom_css: "x".repeat(400) } } });
  assert.equal((await writePageCode(f.api, "P1", { code_custom_css: ".a{}" }, { dry_run: true })).error !== undefined, true); // shrink blocks even in dry run
  const dry = await writePageCode(f.api, "P1", { code_custom_javascript: "1+1" }, { dry_run: true });
  assert.equal(dry.dry_run, true);
  assert.equal(f.calls.length, 0);
  assert.match((await writePageCode(f.api, "P1", { code_custom_javascript: "if (" })).error, /errors/);
  assert.match((await writePageCode(f.api, "P1", { code_custom_css: ".a{}" })).error, /shrink/);
  assert.equal((await writePageCode(f.api, "P1", { code_custom_css: ".a{}" }, { allow_shrink: true })).saved, true);
  const big = "a".repeat(PAGE_CODE_BUDGET.script.soft + 10);
  const refused = await writePageCode(f.api, "P1", { code_custom_javascript: `/*${big}*/` });
  assert.match(refused.error, /BLOCKED/);
  assert.match(refused.reasons.join(" "), /^Page script/);
  const ok = await writePageCode(f.api, "P1", { code_custom_javascript: `/*${big}*/` }, { native_gap: "a size calculator: no element computes it; checked form, collection, http function" });
  assert.equal(ok.saved, true);
});

test("update_page_source.custom_code giờ ghi vào settings (trước đây ghi page_source.custom_code — không bao giờ render)", async () => {
  const f = fakeApi();
  const t = toolsOf(createServer(f.api, { tools: "all" }));
  const r = JSON.parse((await t.update_page_source.handler({ page_id: "P1", custom_code: "console.log('hi')" }, {})).content[0].text);
  assert.equal(r.success, true);
  assert.ok(!f.calls.some((c) => c.k === "updatePageSource" && "custom_code" in c.body));
  assert.equal(JSON.parse(f.page.settings).custom_code.code_custom_javascript, "console.log('hi')");
});

test("build_page dựng trang đầy đủ kèm custom code; dry_run báo lỗi code trước khi tạo gì", async () => {
  const f = fakeApi();
  const t = toolsOf(createServer(f.api, { tools: "all" }));
  const source = { sections: [SEC()] };
  const dry = JSON.parse((await t.build_page.handler({ name: "LP", slug: "lp", source, custom_code: { code_custom_javascript: "if (" }, dry_run: true }, {})).content[0].text);
  assert.match(dry.custom_code.errors[0], /SyntaxError/);
  assert.equal(f.calls.length, 0);
  const made = JSON.parse((await t.build_page.handler({ name: "LP", slug: "lp", source, custom_code: { code_custom_css: ".hero{gap:8px}" }, dry_run: false }, {})).content[0].text);
  assert.equal(made.success, true, JSON.stringify(made));
  assert.equal(made.custom_code.saved, true);
  assert.equal(JSON.parse(f.page.settings).custom_code.code_custom_css, ".hero{gap:8px}");
});

test("family site_code chạy được get/update_page_custom_code", async () => {
  const f = fakeApi();
  const s = createServer(f.api);
  const fam = s._registeredTools.site_code;
  const read = JSON.parse((await fam.handler({ action: "get_page_custom_code", page_id: "P1" }, {})).content[0].text);
  assert.ok(read.targets.length >= 3 && read.guide.includes("Per-page custom code"));
  const w = JSON.parse((await fam.handler({ action: "update_page_custom_code", page_id: "P1", code_custom_css: ".x{}", dry_run: false }, {})).content[0].text);
  assert.equal(w.saved, true);
});

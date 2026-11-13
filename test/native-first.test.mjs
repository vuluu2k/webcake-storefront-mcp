// Offline checks for the native-first policy: custom code is the last resort, enforced on every
// code writer, while a site that is already large can still shrink or swap code, but never grow past the ceiling. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../dist/server.js";
import { buildElement, isKnownType } from "../dist/builder/catalog.js";
import { newPageSkeleton, validatePage } from "../dist/builder/page.js";
import { BUILD_GUIDE } from "../dist/builder/guide.js";
import { CUSTOM_CODE_GUIDE } from "../dist/guides.js";
import { CODE_BUDGET, NATIVE_ALTERNATIVES, NODE_CODE_BUDGET, checkSiteCode, codeGuard } from "../dist/builder/native-first.js";

const JS = "code_custom_javascript";
const CSS = "code_custom_css";
const GAP = "Size advisor: checked attr, popup, table; none computes a size from body measurements.";

/** A stub site: reads answer from `code`, writes are recorded in `saved`. */
const site = (code = {}, extra = {}) => {
  const saved = [];
  const api = new Proxy({}, {
    get: (_, k) => {
      if (k === "getSiteSettingField") return async (f) => code[f] || "";
      if (k === "updateSiteSettings" || k === "updateSiteRaw") return async (s) => { saved.push(s); return { ok: true }; };
      return extra[k] || (async () => ({}));
    },
  });
  return { saved, tools: createServer(api, { tools: "all" })._registeredTools };
};
const run = async (tools, name, args) => JSON.parse((await tools[name].handler(args, {})).content[0].text);

const sectionWith = (specials, type = "text") => {
  const page = newPageSkeleton();
  const sec = buildElement("section");
  const node = buildElement(type);
  node.specials = { ...node.specials, ...specials };
  sec.children = [node];
  page.sections.push(sec);
  return page;
};

test("every element the guide recommends exists in the catalog", () => {
  for (const { need, elements } of NATIVE_ALTERNATIVES)
    for (const el of elements) assert.ok(isKnownType(el), `${need}: unknown element ${el}`);
});

test("agents are taught native first, then CMS + small glue", () => {
  for (const guide of [BUILD_GUIDE, CUSTOM_CODE_GUIDE]) {
    assert.match(guide, /NATIVE FIRST/);
    assert.match(guide, /create_collection/);
    assert.match(guide, /edit_http_function/);
    assert.match(guide, /webcake-fn\.umd\.min\.js/);
  }
  assert.ok(BUILD_GUIDE.indexOf("NATIVE FIRST") < BUILD_GUIDE.indexOf("DESIGN SYSTEM"));
});

test("everyday snippets pass without native_gap", () => {
  const snippets = {
    code_before_head: `<script async src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-X');</script>
<meta name="facebook-domain-verification" content="abc">`,
    [JS]: `api.get_SizeAdvice({ height: 170 }).then((r) => { document.querySelector(".size-result p").textContent = r.size; });`,
    [CSS]: `.size-result{margin-top:8px}\n.badge{color:#fff!important}`,
  };
  assert.deepEqual(checkSiteCode({}, snippets), { hard: [], soft: [] });
});

test("UI, data and volume in code are caught", () => {
  const soft = (changes) => checkSiteCode({}, changes).soft.join();
  assert.match(soft({ [JS]: "x".repeat(CODE_BUDGET.script.soft + 1) }), /budget/);
  assert.match(soft({ [CSS]: "x".repeat(CODE_BUDGET.css.soft + 1) }), /budget/);
  assert.match(soft({ [JS]: "`<div class=a></div>`;".repeat(21) }), /HTML tags/);
  assert.match(soft({ [JS]: "el.innerHTML=x;".repeat(16) }), /DOM-building/);
  assert.match(soft({ [JS]: `window.D={${'"k":1,'.repeat(201)}}` }), /JSON keys/);
  assert.match(soft({ [CSS]: "a{b:c!important}".repeat(31) }), /!important/);
  // the budget is site-wide, so splitting code across fields doesn't dodge it
  const half = "x".repeat(CODE_BUDGET.script.soft / 2 + 1);
  assert.match(soft({ [JS]: half, code_before_body: half }), /budget/);
  // over the ceiling, or a whole document: native_gap can't help
  assert.equal(checkSiteCode({}, { [JS]: "x".repeat(CODE_BUDGET.script.hard + 1) }).hard.length, 1);
  assert.equal(checkSiteCode({}, { code_before_body: "<!doctype html><html></html>" }).hard.length, 1);
  // a note in a snippet isn't a document; a real document string in a script needs a stated gap
  assert.deepEqual(checkSiteCode({}, { code_before_body: "<!-- paste after the opening <body> tag --><script>x()</script>" }), { hard: [], soft: [] });
  const print = checkSiteCode({}, { [JS]: 'w.document.write("<html><body>" + x)' });
  assert.equal(print.hard.length, 0);
  assert.match(print.soft.join(), /document tags/);
  assert.ok(codeGuard({ hard: ["no"], soft: [] }, GAP).error);
});

test("a site past the ceiling can shrink or swap code, but not grow", () => {
  const big = { [JS]: "`<div></div>`;".repeat(50000) };
  assert.deepEqual(checkSiteCode(big, { [JS]: big[JS].slice(0, 1000) }), { hard: [], soft: [] });
  assert.deepEqual(checkSiteCode(big, { [JS]: big[JS] }), { hard: [], soft: [] });
  // past the ceiling even a few chars are refused, with or without a stated gap
  const grow = checkSiteCode(big, { [JS]: big[JS] + "fix();" });
  assert.equal(grow.hard.length, 1);
  assert.ok(codeGuard(grow, GAP).error);
  const flood = checkSiteCode(big, { [JS]: big[JS] + "x".repeat(1_000_000) });
  assert.equal(flood.hard.length, 1);
  assert.ok(codeGuard(flood, GAP).error);
});

test("update_site_custom_code refuses oversized code until a gap is named", async () => {
  const { saved, tools } = site();
  const code = "x".repeat(CODE_BUDGET.script.soft + 1);
  const blocked = await run(tools, "update_site_custom_code", { [JS]: code });
  assert.match(blocked.error, /BLOCKED/);
  assert.match(blocked.native_first, /NATIVE FIRST/);
  assert.equal(saved.length, 0);
  assert.equal((await run(tools, "update_site_custom_code", { [JS]: code, native_gap: GAP })).success, true);
  assert.equal(saved.length, 1);
});

test("update_site_custom_code keeps the data-loss guard, with an explicit way past it", async () => {
  const { saved, tools } = site({ [CSS]: "a{}".repeat(100) });
  assert.match((await run(tools, "update_site_custom_code", { [CSS]: "a{}" })).error, /allow_shrink/);
  assert.equal(saved.length, 0);
  assert.equal((await run(tools, "update_site_custom_code", { [CSS]: "a{}", allow_shrink: true })).success, true);
});

test("append_site_custom_code judges the code after appending", async () => {
  const { saved, tools } = site({ [JS]: "x".repeat(CODE_BUDGET.script.soft - 5) });
  assert.match((await run(tools, "append_site_custom_code", { field: JS, code: "y".repeat(100), position: "append" })).error, /BLOCKED/);
  assert.equal(saved.length, 0);
  assert.equal((await run(tools, "append_site_custom_code", { field: JS, code: "y".repeat(100), position: "append", native_gap: GAP })).success, true);
});

test("update_site_settings can't be used to dodge the checks", async () => {
  const { saved, tools } = site();
  assert.match((await run(tools, "update_site_settings", { settings: { settings: { [JS]: "x" } } })).error, /update_site_custom_code/);
  assert.equal(saved.length, 0);
  await run(tools, "update_site_settings", { settings: { currency: "VND" } });
  assert.equal(saved.length, 1);
});

test("update_site_settings allows a read-modify-write that leaves the code alone", async () => {
  const { saved, tools } = site({ [JS]: "old()" });
  await run(tools, "update_site_settings", { settings: { settings: { [JS]: "old()", x: 1 } } });
  await run(tools, "update_site_settings", { settings: { robot_txt: "# not about code_custom_css" } });
  assert.equal(saved.length, 2);
  assert.match((await run(tools, "update_site_settings", { settings: { settings: { [JS]: "new()" } } })).error, /BLOCKED/);
  assert.match((await run(tools, "update_site_settings", { settings: { settings: JSON.stringify({ [JS]: "new()" }) } })).error, /BLOCKED/);
  assert.equal(saved.length, 2);
  await run(tools, "update_site_settings", { settings: { settings: JSON.stringify({ [JS]: "old()", robot_txt: "code_custom_css" }) } });
  assert.equal(saved.length, 3);
});

test("get_site_custom_code reports budget usage", async () => {
  const { tools } = site({ [JS]: "x".repeat(CODE_BUDGET.script.soft + 1) });
  const res = await run(tools, "get_site_custom_code", {});
  assert.equal(res._budget.over_budget, true);
  assert.equal(res._budget.script.used, CODE_BUDGET.script.soft + 1);
});

test("validatePage refuses a script-filled shell page", () => {
  // the exact placeholder from a real page whose UI lived entirely in custom code
  for (const text of ['{"k":"e-trang","bang":"home"}', '<p>{&quot;k&quot;:&quot;x&quot;}</p>', '{&#34;k&#34;:&#34;x&#34;}', '[{"k":"x"}]'])
    assert.equal(validatePage(sectionWith({ text })).valid, false, text);
  for (const text of ["Áo polo nam", '<p class="a">{giá}: 200k</p>', 'Size {"M"}', "[1]", "{}"])
    assert.equal(validatePage(sectionWith({ text })).valid, true, text);
});

test("validatePage limits custom_css + embed code on a page", () => {
  const css = (n) => validatePage(sectionWith({ custom_css: "x".repeat(n) }));
  assert.equal(css(NODE_CODE_BUDGET.soft).warnings?.some((w) => /custom_css/.test(w)) ?? false, false);
  assert.ok(css(NODE_CODE_BUDGET.soft + 1).warnings.some((w) => /custom_css/.test(w)));
  assert.equal(css(NODE_CODE_BUDGET.hard + 1).valid, false);
  const embed = validatePage(sectionWith({ type: "code", htmlCode: "x".repeat(NODE_CODE_BUDGET.hard + 1) }, "embed"));
  assert.equal(embed.valid, false);
  assert.equal(validatePage(sectionWith({ iframe: "<!doctype html><html></html>" }, "googlemap")).valid, false);
});

test("element and source writers apply the same checks", async () => {
  const text = buildElement("text");
  const other = buildElement("text");
  other.specials = { ...other.specials, text: '{"k":"old"}' };
  const sec = buildElement("section");
  sec.children = [text, other];
  const page = { id: "P", source: { source: JSON.stringify({ sections: [sec] }) } };
  const saved = [];
  const { tools } = site({}, {
    listPages: async () => ({ data: [page] }),
    updatePageSource: async (_, b) => { saved.push(b); return { data: { id: "S", page_id: "P", source: "" } }; },
    createGlobalSource: async (b) => { saved.push(b); return { data: {} }; },
  });
  const placeholder = { text: '{"k":"e-trang"}' };
  const edit = { page_id: "P", dry_run: false };

  assert.match((await run(tools, "update_page_element", { ...edit, element_id: text.id, specials: placeholder })).error, /BLOCKED/);
  assert.match((await run(tools, "update_page_elements", { ...edit, updates: [{ element_id: text.id, specials: placeholder }] })).error, /BLOCKED/);
  assert.match((await run(tools, "update_page_source", { page_id: "P", source: sectionWith(placeholder) })).error, /BLOCKED/);
  assert.match((await run(tools, "update_page_source", { page_id: "P", custom_code: "x".repeat(CODE_BUDGET.script.soft + 1) })).error, /BLOCKED/);
  assert.match((await run(tools, "create_global_source", { component: "popup", type: "default", source: { id: "T", type: "text", specials: placeholder } })).error, /BLOCKED/);
  assert.equal(saved.length, 0);

  // an old placeholder elsewhere on the page doesn't block an unrelated edit
  const ok = await run(tools, "update_page_element", { ...edit, element_id: other.id, style: { color: "red" } });
  assert.equal(ok.success, true, JSON.stringify(ok));
});

/** A page holding an old placeholder and a 40k embed, wired to a stub API that records saves. */
const legacySite = () => {
  const text = buildElement("text");
  const old = buildElement("text");
  old.specials = { ...old.specials, text: '{"k":"old"}' };
  const embed = buildElement("embed");
  embed.specials = { ...embed.specials, type: "code", htmlCode: "x".repeat(NODE_CODE_BUDGET.hard + 10000) };
  const sec = buildElement("section");
  sec.children = [text, old, embed];
  const legacy = { sections: [sec] };
  const saved = [];
  const { tools } = site({}, {
    listPages: async () => ({ data: [{ id: "P", source: { source: JSON.stringify(legacy) } }] }),
    updatePageSource: async (_, b) => { saved.push(b); return { data: { id: "S", page_id: "P", source: "" } }; },
    getSiteBreakpoints: async () => null,
  });
  return { legacy, saved, tools, text, old, embed };
};

test("whole-source saves are judged by what they add, so old pages stay editable", async () => {
  const { legacy, saved, tools, text } = legacySite();
  const clean = buildElement("section");
  const added = await run(tools, "add_section", { page_id: "P", section: clean, dry_run: false });
  assert.equal(added.error, undefined, JSON.stringify(added));
  assert.equal((await run(tools, "update_page_source", { page_id: "P", source: legacy })).success, true);
  assert.equal(saved.length, 2);

  const dirty = sectionWith({ text: '{"k":"new"}' }).sections[0];
  assert.match((await run(tools, "add_section", { page_id: "P", section: dirty, dry_run: false })).error, /Validation failed/);
  const worse = JSON.parse(JSON.stringify(legacy));
  worse.sections[0].children.find((n) => n.id === text.id).specials.text = '{"k":"new"}';
  assert.match((await run(tools, "update_page_source", { page_id: "P", source: worse })).error, /BLOCKED/);
  const bigger = JSON.parse(JSON.stringify(legacy));
  bigger.sections[0].children.find((n) => n.type === "embed").specials.htmlCode += "x";
  assert.match((await run(tools, "update_page_source", { page_id: "P", source: bigger })).error, /BLOCKED/);
  assert.equal(saved.length, 2);
});

test("element edits are judged by the patch and by the page total", async () => {
  const { saved, tools, text, old, embed } = legacySite();
  const edit = { page_id: "P", dry_run: false };
  // unrelated specials on old content, and shrinking it, both pass
  for (const [element_id, specials] of [[old.id, { custom_class: "x" }], [embed.id, { custom_class: "x" }], [embed.id, { htmlCode: "y".repeat(35000) }]]) {
    const res = await run(tools, "update_page_element", { ...edit, element_id, specials });
    assert.equal(res.success, true, JSON.stringify(res).slice(0, 200));
  }
  assert.equal(saved.length, 3);
  // adding code on a page already over the limit doesn't
  assert.match((await run(tools, "update_page_element", { ...edit, element_id: text.id, specials: { custom_css: "a{}" } })).error, /BLOCKED/);
  assert.equal(saved.length, 3);
});

test("a batch of element edits can't add up past the page limit", async () => {
  const a = buildElement("text");
  const b = buildElement("text");
  const sec = buildElement("section");
  sec.children = [a, b];
  const saved = [];
  const { tools } = site({}, {
    listPages: async () => ({ data: [{ id: "P", source: { source: JSON.stringify({ sections: [sec] }) } }] }),
    updatePageSource: async (_, body) => { saved.push(body); return { data: { id: "S" } }; },
  });
  const css = { custom_css: "x".repeat(NODE_CODE_BUDGET.hard - 1000) };
  const res = await run(tools, "update_page_elements", { page_id: "P", dry_run: false, updates: [{ element_id: a.id, specials: css }, { element_id: b.id, specials: css }] });
  assert.match(res.error, /BLOCKED/);
  assert.equal(saved.length, 0);
});

test("global sources are checked in every shape, and translations can't hold placeholders", async () => {
  const saved = [];
  const { tools } = site({}, {
    createGlobalSource: async (b) => { saved.push(b); return { data: {} }; },
    getPageContent: async () => ({ data: { content: { T: { text: '{"k":"old"}' } } } }),
    updatePageContent: async (b) => { saved.push(b); return { data: {} }; },
  });
  const placeholder = { type: "text", specials: { text: '{"k":"x"}' } };
  for (const source of [placeholder, [placeholder], { sections: [placeholder] }, JSON.stringify(placeholder)]) {
    const res = await run(tools, "create_global_source", { component: "popup", type: "default", source });
    assert.match(res.error, /BLOCKED/, JSON.stringify(source));
  }
  const content = { page_id: "P", language_code: "en" };
  assert.match((await run(tools, "update_page_content", { ...content, content: { T: { text: '{"k":"new"}' } } })).error, /BLOCKED/);
  assert.equal(saved.length, 0);
  await run(tools, "update_page_content", { ...content, content: { T: { text: '{"k":"old"}' }, U: { text: "Hello" } } });
  assert.equal(saved.length, 1);
});

test("set_image_alts only writes alt fields", async () => {
  const img = buildElement("image");
  const sec = buildElement("section");
  sec.children = [img];
  const saved = [];
  const { tools } = site({}, {
    listPages: async () => ({ data: [{ id: "P", source: { source: JSON.stringify({ sections: [sec] }) } }] }),
    updatePageSource: async (_, body) => { saved.push(body); return { data: { id: "S" } }; },
  });
  const item = { source_type: "page", source_id: "P", element_id: img.id, alt: "Áo polo" };
  const set = (alt_path) => run(tools, "set_image_alts", { items: [{ ...item, alt_path }], dry_run: true });
  for (const bad of ["specials.text", "specials.custom_css"])
    assert.match(JSON.stringify(await set(bad)), /not an alt field/);
  for (const good of ["specials.alt", "specials.image_alt", "config.image.alt"])
    assert.doesNotMatch(JSON.stringify(await set(good)), /not an alt field/);
});

test("native can replace an oversized embed, once the agent says the shrink is deliberate", async () => {
  const { legacy, saved, tools, embed } = legacySite();
  const small = { page_id: "P", dry_run: false, element_id: embed.id, specials: { htmlCode: "y" } };
  assert.match((await run(tools, "update_page_element", small)).error, /shrink/);
  assert.equal((await run(tools, "update_page_element", { ...small, allow_shrink: true })).success, true);
  const rebuilt = JSON.parse(JSON.stringify(legacy));
  rebuilt.sections[0].children = [];
  assert.match((await run(tools, "update_page_source", { page_id: "P", source: rebuilt })).error, /smaller/);
  assert.equal((await run(tools, "update_page_source", { page_id: "P", source: rebuilt, allow_shrink: true })).success, true);
  assert.equal(saved.length, 2);
});

test("update_global_source_contents refuses only new placeholders", async () => {
  const saved = [];
  const { tools } = site({}, {
    getGlobalSourceContents: async () => ({ data: [{ global_source_id: "G", language_code: "en", content: { T: { text: '{"k":"old"}' } } }] }),
    updateGlobalSourceContents: async (b) => { saved.push(b); return { data: {} }; },
  });
  const entry = { global_source_id: "G", language_code: "en", type_component: "popup" };
  await run(tools, "update_global_source_contents", { contents: [{ ...entry, content: { T: { text: '{"k":"old"}' } } }] });
  assert.equal(saved.length, 1);
  assert.match((await run(tools, "update_global_source_contents", { contents: [{ ...entry, content: { T: { text: '{"k":"new"}' } } }] })).error, /BLOCKED/);
  assert.equal(saved.length, 1);
});

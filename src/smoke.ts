/**
 * Offline smoke test (no MCP transport, no DB/native deps): exercises the page-builder
 * building blocks so a release can verify them without a client. Run: npm run smoke
 */
import { listElements, getElement, buildElement, ELEMENT_TYPES, isKnownType } from "./builder/catalog.js";
import {
  newPageSkeleton,
  buildSection,
  validatePage,
  finalizeForRender,
  reassignIds,
  walk,
} from "./builder/page.js";

let failures = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}`, extra ?? "");
  }
};

console.log("== catalog: factory registry is well-formed ==");
{
  check("element types are non-empty", ELEMENT_TYPES.length > 0, ELEMENT_TYPES.length);
  check("no duplicate element types", new Set(ELEMENT_TYPES).size === ELEMENT_TYPES.length);
  const cat = listElements();
  check("listElements total matches type count", cat.total === ELEMENT_TYPES.length);
  check("listElements has categories", Object.keys(cat.categories).length > 0);
  check("getElement('section') is a container", (getElement("section") as any).container === true);
  check("isKnownType('button')", isKnownType("button"));
  check("isKnownType('nope') is false", !isKnownType("nope"));
}

console.log("== factory: nodes are structurally valid ==");
{
  const section = buildElement("section");
  check("section has type + children[]", section.type === "section" && Array.isArray(section.children));
  const text = buildElement("text", { text: "Hello" });
  check("text carries specials.text", text.specials?.text === "Hello");
  check("ids are prefixed by type", /^TEXT-/.test(text.id));
  let threw = false;
  try {
    buildElement("definitely-not-a-type");
  } catch (e) {
    threw = (e as any)?.code === "UNKNOWN_TYPE";
  }
  check("buildElement throws UNKNOWN_TYPE for bad type", threw);
}

console.log("== page: grid composition + validation ==");
{
  const skeleton = newPageSkeleton();
  check("skeleton is { sections: [] }", Array.isArray(skeleton.sections) && skeleton.sections.length === 0);

  const hero = buildSection([
    { type: "text", opts: { text: "Welcome" } },
    { type: "button", opts: { text: "Buy" } },
  ]);
  // A section uses the builder's centred 3-column grid; children sit in the centre column.
  // padY (default 64) adds a top + bottom SPACER ROW, so a 2-child section is 3x4 and the
  // children start at row 2 (past the top spacer) — template-native section padding.
  check("section grid is 3x(N+2) with spacer rows", hero.runtime.config.grid === "3x4", hero.runtime.config.grid);
  check("top row is a padY spacer", hero.runtime.config.rows[0].min.absValue === 64, hero.runtime.config.rows[0]);
  check("children placed in centre column", hero.children.every((c: any) => c.runtime.config.columnStart === 2));
  check("children shifted past top spacer", hero.children[0].runtime.config.rowStart === 2, hero.children[0].runtime.config.rowStart);

  const src = newPageSkeleton();
  src.sections.push(hero);
  const v: any = validatePage(src);
  check("built page validates", v.valid === true, v.errors);
  check("stats count elements", v.stats.total_elements === 3, v.stats);

  // finalizeForRender must convert runtime -> bp1..bp4 (the shape the storefront renders).
  finalizeForRender(src);
  const sec0 = src.sections[0] as any;
  check("finalize removes runtime", !("runtime" in sec0), Object.keys(sec0));
  check("finalize adds bp1..bp4", ["bp1", "bp2", "bp3", "bp4"].every((bp) => sec0[bp]?.config), Object.keys(sec0));
  check("section bp4 is mobile grid", sec0.bp4.config.grid === "3x4" && sec0.bp4.config.columns[0].absValue === 5, sec0.bp4.config.columns?.[0]);
  check("child bp1 keeps centre column", sec0.children[0].bp1.config.columnStart === 2, sec0.children[0].bp1?.config);
  check("finalize is idempotent", (finalizeForRender(src), !("runtime" in sec0)));

  // duplicate ids must fail validation
  const dup = newPageSkeleton();
  const a = buildElement("section");
  const b = buildElement("section");
  b.id = a.id;
  dup.sections.push(a, b);
  check("duplicate ids fail validation", validatePage(dup).valid === false);

  // reassignIds gives a fresh id
  const before = a.id;
  reassignIds(a);
  check("reassignIds changes the id", a.id !== before);

  // walk visits every node
  let count = 0;
  walk(src, () => {
    count += 1;
  });
  check("walk visits all nodes", count === 3, count);
}

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");

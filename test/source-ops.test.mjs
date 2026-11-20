// patch_page_source ops for a storefront page source ({ sections }): down to the changed node,
// replayed locally with the backend's semantics.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceOps, applyOps } from "../dist/builder/source-ops.js";

const t = (id, text) => ({ id, type: "text", specials: { text } });
const sec = (id, kids) => ({ id, type: "section", children: kids });
const show = (ops) => ops.map((o) => `${o.op}:${o.id ?? o.node?.id ?? o.key}${o.parent_id ? ">" + o.parent_id : ""}${o.index != null ? "@" + o.index : ""}`);

test("one text edit → one set of that node; replaying gives the new tree", () => {
  const a = { sections: [sec("S1", [t("T1", "a"), { id: "C1", type: "container", children: [t("T2", "b")] }]), sec("S2", [])] };
  const b = structuredClone(a);
  b.sections[0].children[1].children[0].specials.text = "B";
  assert.deepEqual(show(sourceOps(a, b)), ["set:T2"]);
  assert.deepEqual(applyOps(a, sourceOps(a, b)), b);
});

test("insert / remove / move between parents / new section / top key", () => {
  const a = { sections: [sec("S1", [t("T1", "a"), t("T2", "b")]), sec("S2", [])], meta: { x: 1 } };
  const b = structuredClone(a);
  const moved = b.sections[0].children.pop();
  b.sections[1].children.push(moved);
  b.sections.splice(1, 0, sec("S3", [t("T9", "n")]));
  b.meta = { x: 2 };
  const ops = sourceOps(a, b);
  assert.deepEqual(show(ops), ["remove:T2", "insert:S3@1", "insert:T2>S2@0", "top:meta"]);
  assert.deepEqual(applyOps(a, ops), b);
});

test("whole tree when not expressible: top-level reorder, duplicate ids, removed top key", () => {
  const a = { sections: [sec("S1", []), sec("S2", [])], k: 1 };
  assert.equal(sourceOps(a, { ...a, sections: [a.sections[1], a.sections[0]] }), undefined);
  const dup = { sections: [sec("S1", [t("X1", "a")]), sec("S2", [t("X1", "b")])] };
  const e = structuredClone(dup);
  e.sections[1].children[0].specials.text = "B";
  assert.equal(sourceOps(dup, e), undefined);
  assert.equal(sourceOps(a, { sections: a.sections }), undefined);
  assert.deepEqual(sourceOps(a, structuredClone(a)), []);
});

test("applyOps refuses what the backend refuses", () => {
  const a = { sections: [sec("S1", [t("T1", "a")])] };
  assert.throws(() => applyOps(a, [{ op: "set", id: "S1", node: { type: "text" } }]), /cannot turn section/);
  assert.throws(() => applyOps(a, [{ op: "insert", node: { id: "Z", type: "text" } }]), /must be a section/);
  assert.throws(() => applyOps(a, [{ op: "insert", parent_id: "T1", node: { id: "Z", type: "text" } }]), /no children list/);
  assert.throws(() => applyOps(a, [{ op: "top", key: "sections", value: [] }]), /set \/ insert \/ remove/);
});

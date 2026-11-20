/**
 * Element-level diff of a storefront page source (`{ sections: [...] }`, nodes nest in `children`)
 * as builderx_api `patch_page_source` ops — and the same ops applied locally, with the backend's
 * exact semantics (BuilderxApi.Ai.SourcePatch), so a patched page can be cached without a re-read.
 *
 *   set     { op, id, node }               replace the node (whole subtree); a section stays one
 *   remove  { op, id }
 *   insert  { op, node, parent_id?, index? } into parent_id's children, or a top-level section
 *   top     { op, key, value }              any top-level key except `sections`
 */
type Op = Record<string, any>;
const isObj = (v: unknown): v is Record<string, any> => v != null && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function hasDuplicateIds(src: any): boolean {
  const seen = new Set<string>();
  const walk = (list: any): boolean =>
    Array.isArray(list) && list.some((n) => isObj(n) && ((typeof n.id === "string" && (seen.has(n.id) || !seen.add(n.id))) || walk(n.children)));
  return walk(src.sections);
}

type Acc = { removes: Op[]; sets: Op[]; inserts: Op[] };

/** Ops for one child list (false: reordered, or a node without an id → the caller sets the parent). */
function listOps(a: any[], b: any[], where: { parent_id?: string }, acc: Acc): boolean {
  if ([...a, ...b].some((n) => !isObj(n) || typeof n.id !== "string")) return false;
  const bIds = new Set(b.map((n) => n.id));
  const aById = new Map(a.map((n) => [n.id, n]));
  const kept = b.filter((n) => aById.has(n.id)).map((n) => n.id);
  if (kept.join("\u0000") !== a.filter((n) => bIds.has(n.id)).map((n) => n.id).join("\u0000")) return false;
  for (const n of a) if (!bIds.has(n.id)) acc.removes.push({ op: "remove", id: n.id });
  b.forEach((n, index) => {
    const old = aById.get(n.id);
    if (!old) acc.inserts.push({ op: "insert", ...where, index, node: n });
    else nodeOps(old, n, acc);
  });
  return true;
}

function nodeOps(old: any, n: any, acc: Acc) {
  if (same(old, n)) return;
  const { children: oc, ...ownOld } = old;
  const { children: nc, ...ownNew } = n;
  if (same(ownOld, ownNew) && Array.isArray(oc) && Array.isArray(nc)) {
    const sub: Acc = { removes: [], sets: [], inserts: [] };
    if (listOps(oc, nc, { parent_id: n.id }, sub)) {
      acc.removes.push(...sub.removes);
      acc.sets.push(...sub.sets);
      acc.inserts.push(...sub.inserts);
      return;
    }
  }
  acc.sets.push({ op: "set", id: n.id, node: n });
}

/**
 * The ops turning `before` into `after`, down to the deepest changed node; removes first, then
 * sets, then inserts (a node moved between parents is never in two places). undefined = write the
 * whole tree: top-level sections reordered, an id-less node, or an id held by two nodes (the
 * backend edits the first one it meets, which may not be the one meant).
 */
export function sourceOps(before: any, after: any): Op[] | undefined {
  if (!isObj(before) || !isObj(after)) return undefined;
  if (hasDuplicateIds(before) || hasDuplicateIds(after)) return undefined;
  const acc: Acc = { removes: [], sets: [], inserts: [] };
  if (!listOps(Array.isArray(before.sections) ? before.sections : [], Array.isArray(after.sections) ? after.sections : [], {}, acc)) return undefined;
  const tops: Op[] = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === "sections" || same(before[k], after[k])) continue;
    if (!(k in after)) return undefined; // a removed top-level key: not expressible
    tops.push({ op: "top", key: k, value: after[k] });
  }
  return [...acc.removes, ...acc.sets, ...acc.inserts, ...tops];
}

/** `ops` applied to `source` exactly as patch_page_source does (throws where it refuses). */
export function applyOps(source: any, ops: Op[]): any {
  const out = structuredClone(source);
  const find = (id: string): { list: any[]; i: number } | undefined => {
    const walk = (list: any): { list: any[]; i: number } | undefined => {
      if (!Array.isArray(list)) return undefined;
      for (let i = 0; i < list.length; i++) {
        if (!isObj(list[i])) continue;
        if (list[i].id === id) return { list, i };
        const hit = walk(list[i].children);
        if (hit) return hit;
      }
      return undefined;
    };
    return walk(out.sections);
  };
  const at = (list: any[], index: number | undefined, node: any) => (index == null ? list.push(node) : list.splice(index, 0, node));
  for (const op of ops) {
    if (op.op === "top") {
      if (op.key === "sections") throw new Error("applyOps: sections are edited with set / insert / remove");
      out[op.key] = structuredClone(op.value);
    } else if (op.op === "insert" && !op.parent_id) {
      if (op.node?.type !== "section") throw new Error("applyOps: a top-level node must be a section");
      at((out.sections ??= []), op.index, structuredClone(op.node));
    } else {
      const hit = find(op.op === "insert" ? op.parent_id : op.id);
      if (!hit) throw new Error(`applyOps: ${op.op} ${op.id ?? op.parent_id} not found`);
      const node = hit.list[hit.i];
      if (op.op === "remove") hit.list.splice(hit.i, 1);
      else if (op.op === "set") {
        if (node.type === "section" && op.node?.type !== "section") throw new Error(`applyOps: cannot turn section ${op.id} into ${op.node?.type}`);
        hit.list[hit.i] = { ...structuredClone(op.node), id: op.id };
      } else if (op.op === "insert") {
        if (!Array.isArray(node.children)) throw new Error(`applyOps: ${op.parent_id} has no children list`);
        at(node.children, op.index, structuredClone(op.node));
      } else throw new Error(`applyOps: unknown op ${op.op}`);
    }
  }
  return out;
}

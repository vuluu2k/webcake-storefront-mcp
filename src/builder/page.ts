// Page-level helpers: skeleton, grid composition, id hygiene, and validation.
//
// A BuilderX page source is `{ sections: [ <section node>, ... ] }`. Sections lay out
// their children in a CSS grid driven by runtime.config (grid / columns / rows) and each
// child's runtime.config (columnStart/End, rowStart/End, constraintX/Y). The helpers here
// produce that structure the same way the builder does, so generated pages render.

import { buildElement, isKnownType, ELEMENT_TYPES } from "./catalog.js";
import { randomString } from "./factory.js";

/** Walk every node in a source tree (depth-first). Return false from fn to stop. */
export function walk(source: any, fn: (node: any) => any) {
  const sections = source && Array.isArray(source.sections) ? source.sections : [];
  const visit = (node: any) => {
    if (!node) return true;
    if (fn(node) === false) return false;
    for (const child of node.children || []) {
      if (visit(child) === false) return false;
    }
    return true;
  };
  for (const s of sections) {
    if (visit(s) === false) return;
  }
}

/** Empty but valid page source. */
export function newPageSkeleton() {
  return { sections: [] };
}

const typePrefix = (type: string): string =>
  ({ rectangle: "RECT", "grid-category": "GRID-CATE", "slider-category": "SLIDER-CATE" }[type] ||
    type.toUpperCase());

/** Re-id every node in a subtree so a cloned/template node can't collide with existing ids. */
export function reassignIds(node: any) {
  if (!node || typeof node !== "object") return node;
  if (node.type) node.id = `${typePrefix(node.type)}-${randomString(8)}`;
  for (const child of node.children || []) reassignIds(child);
  return node;
}

/**
 * Lay children out vertically inside a section/container using a single-column grid —
 * the same shape the builder emits. `children` are placed top-to-bottom, one grid row each.
 */
export function stackChildren(container: any, children: any[]) {
  const rows = children.map((child: any) => {
    const h = (child.runtime && child.runtime.style && child.runtime.style.height) || 50;
    return { unit: "min/max", min: { unit: "px", absValue: h }, max: { unit: "max-c" } };
  });

  container.runtime = container.runtime || {};
  container.runtime.config = {
    ...(container.runtime.config || {}),
    grid: `1x${children.length || 1}`,
    columns: [{ unit: "fr", value: 1 }],
    rows: rows.length ? rows : [{ unit: "min/max", min: { unit: "px", absValue: 50 }, max: { unit: "max-c" } }],
    heightUnit: "auto",
  };

  children.forEach((child: any, i: number) => {
    child.runtime = child.runtime || {};
    child.runtime.config = {
      ...(child.runtime.config || {}),
      columnStart: 1,
      columnEnd: 2,
      rowStart: i + 1,
      rowEnd: i + 2,
      constraintX: (child.runtime.config && child.runtime.config.constraintX) || ["centerLeft"],
      constraintY: (child.runtime.config && child.runtime.config.constraintY) || ["top"],
      loaded: true,
    };
  });

  container.children = children;
  return container;
}

/**
 * Build a ready-to-place section from a list of child specs.
 * Each spec: { type, opts?, children? } where children is a nested array of specs.
 */
export function buildSection(childSpecs: any[] = [], sectionOpts: any = {}) {
  const section = buildElement("section", sectionOpts);
  const children = childSpecs.map((spec: any) => buildFromSpec(spec));
  stackChildren(section, children);
  return section;
}

function buildFromSpec(spec: any) {
  if (!spec || !spec.type) {
    throw new Error("Each element spec must have a 'type'.");
  }
  const node = buildElement(spec.type, spec.opts || {});
  if (Array.isArray(spec.children) && spec.children.length) {
    const kids = spec.children.map((c: any) => buildFromSpec(c));
    stackChildren(node, kids);
  }
  return node;
}

/** Validate a page source. Errors block a save; warnings are fixable design issues. */
export function validatePage(source: any) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!source || typeof source !== "object" || !Array.isArray(source.sections)) {
    return { valid: false, errors: ["Source must be an object shaped { sections: [...] }."] };
  }

  const ids = new Set();
  const allIds = new Set();
  let total = 0;
  const typeCounts: Record<string, number> = {};

  // First pass: collect ids + flag duplicates / unknown types / missing fields.
  walk(source, (node) => {
    total++;
    const type = node.type || "(missing)";
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    if (!node.id) errors.push(`A ${type} node is missing an id.`);
    else if (ids.has(node.id)) errors.push(`Duplicate element id "${node.id}".`);
    else ids.add(node.id);
    if (node.id) allIds.add(node.id);

    if (!node.type) errors.push(`A node (id ${node.id || "?"}) is missing a type.`);
    else if (!isKnownType(node.type)) warnings.push(`Unknown element type "${node.type}" (id ${node.id}).`);

    // Form fields should carry a field_name so submissions map to data.
    if (/^(input|email|phone-number|text-area|select|address|password)$/.test(node.type || "")) {
      const fn = node.specials && node.specials.field_name;
      if (!fn) warnings.push(`Form field "${node.id}" (${node.type}) has no specials.field_name.`);
    }
  });

  // Second pass: event targets must point at an element that exists in the page.
  walk(source, (node) => {
    for (const ev of node.events || []) {
      const target = ev.open_page_id ? null : ev.target || ev.target_id;
      if (target && !allIds.has(target)) {
        warnings.push(`Event on "${node.id}" targets missing element "${target}".`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    ...(errors.length ? { errors } : {}),
    ...(warnings.length ? { warnings } : {}),
    stats: { sections: source.sections.length, total_elements: total, element_types: typeCounts },
  };
}

export { ELEMENT_TYPES };

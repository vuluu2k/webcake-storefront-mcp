// Page-level helpers: skeleton, grid composition, id hygiene, and validation.
//
// A BuilderX page source is `{ sections: [ <section node>, ... ] }`. Sections lay out
// their children in a CSS grid driven by runtime.config (grid / columns / rows) and each
// child's runtime.config (columnStart/End, rowStart/End, constraintX/Y). The helpers here
// produce that structure the same way the builder does, so generated pages render.

import { buildElement, isKnownType, ELEMENT_TYPES } from "./catalog.js";
import { randomString } from "./factory.js";
import { validateEvents } from "./events.js";
import { validateBindings } from "./bindings.js";
import {
  BREAKPOINTS,
  genGridByBp,
  SECTION_CONTENT_COL_START,
  SECTION_CONTENT_COL_END,
} from "./grid.js";

const clone = (o: any) => structuredClone(o);

/** Parse a CSS px length ("52px") or a bare number (52) → number, else null. */
function pxToNum(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v ?? "").trim());
  return m ? parseFloat(m[1]) : null;
}

/** AUTO-RESPONSIVE down-scaling per breakpoint. Headings/large text and very tall media
 *  keep their desktop size on phones unless the author hand-writes a responsive diff —
 *  which makes generated pages look broken on mobile. These factors shrink oversized
 *  typography (and tall images) on tablet/mobile by DEFAULT. Applied only when the author
 *  did NOT already override the property at this breakpoint (resolved value === base). */
const AUTO_FONT_FACTOR: Record<string, number> = { bp1: 1, bp2: 1, bp3: 0.86, bp4: 0.72 };
const AUTO_IMG_HEIGHT_FACTOR: Record<string, number> = { bp1: 1, bp2: 1, bp3: 0.82, bp4: 0.58 };

/** Mutate a resolved per-breakpoint `style` in place: shrink big fonts (≥22px) and tall
 *  images (>320px) for smaller breakpoints. `baseStyle` is the bp1/authored style — we only
 *  auto-scale a property the author left untouched at this bp (resolved === base). */
function applyAutoResponsive(node: any, bp: string, baseStyle: any, style: any) {
  const ff = AUTO_FONT_FACTOR[bp];
  if (ff != null && ff < 1) {
    const baseF = pxToNum(baseStyle.fontSize);
    const curF = pxToNum(style.fontSize);
    if (baseF != null && curF != null && curF === baseF && baseF >= 22) {
      style.fontSize = Math.max(15, Math.round(baseF * ff)) + "px";
    }
  }
  const hf = AUTO_IMG_HEIGHT_FACTOR[bp];
  if (hf != null && hf < 1 && (node.type === "image" || node.type === "image-dataset")) {
    const baseH = pxToNum(baseStyle.height);
    const curH = pxToNum(style.height);
    if (baseH != null && curH != null && curH === baseH && baseH > 320) {
      const nh = Math.round(baseH * hf);
      style.height = typeof baseStyle.height === "number" ? nh : nh + "px";
    }
  }
}

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
export function newPageSkeleton(): { sections: any[] } {
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

interface StackOpts {
  /** Number of grid columns the container declares (default 1). */
  gridCols?: number;
  /** Column unit objects for the container grid (default single fr). */
  columns?: any[];
  /** 1-based grid line where each child starts horizontally (default 1). */
  contentColStart?: number;
  /** 1-based grid line where each child ends horizontally (default 2). */
  contentColEnd?: number;
  /** Vertical gap (px) between stacked children (default 16). */
  rowGap?: number;
}

/**
 * Lay children out vertically inside a section/container — one grid row per child,
 * top-to-bottom — the same shape the builder emits. Values are written to `runtime`;
 * finalizeForRender() later expands `runtime` into the per-breakpoint keys the
 * storefront actually reads (bp1..bp4).
 */
/**
 * Element types that must FILL their grid cell's width to lay out correctly — the
 * storefront renderer turns a single-value `constraintX` ("centerLeft") into
 * `justify-self: center`, which shrinks the element to its content width. For repeaters
 * (a grid-product then computes `repeat(auto-fit, minmax(min, 1fr))` against that width)
 * that collapses the whole grid to ONE column. Giving them `["left","right"]` makes the
 * renderer emit `justify-self: stretch` so they span the full content column.
 */
const FILL_WIDTH_TYPES = new Set([
  "grid-product", "slider-product", "cart-items", "order-items", "post-list",
  "grid-category", "grid-blog", "product-gallery", "product-image-carousel",
  "custom-layout", "layout-dataset", "form",
]);

/**
 * Default horizontal constraint for a child in its grid cell. THE ALIGNMENT RULE:
 * an element that FILLS its cell width (widthUnit "%", relWidth 100 — the default for
 * text/image/container/repeaters) must STRETCH (`["left","right"]` → justify-self:stretch),
 * NOT centre. The old default `["centerLeft"]` (justify-self:center) snapped such elements
 * to their content width and floated them — so sibling columns/cards/images did NOT line up
 * (the "cắn left-top / không thẳng hàng" bug). Stretch makes every full-width child span its
 * cell edge-to-edge, so its OWN textAlign / inner stacking controls layout and rows align.
 * Only a genuinely CONTENT-WIDTH element (widthUnit "auto", e.g. a button) gets a point
 * constraint, defaulting to centre. An explicit constraintX (e.g. set by opts.align) always wins.
 */
function defaultConstraintX(child: any): string[] {
  const cfg = (child.runtime && child.runtime.config) || {};
  if (cfg.constraintX) return cfg.constraintX; // explicit / from opts.align
  if (FILL_WIDTH_TYPES.has(child.type)) return ["left", "right"];
  // Content-sized elements (a button opts into widthUnit:"auto") centre by default; everything
  // else fills its cell, so it must stretch to line up with its neighbours.
  if (cfg.widthUnit === "auto") return ["centerLeft"];
  return ["left", "right"];
}

export function stackChildren(container: any, children: any[], opts: StackOpts = {}) {
  const gridCols = opts.gridCols || 1;
  const colStart = opts.contentColStart || 1;
  const colEnd = opts.contentColEnd || 2;

  const rows = children.map((child: any) => {
    const h = (child.runtime && child.runtime.style && child.runtime.style.height) || 50;
    return { unit: "min/max", min: { unit: "px", absValue: h }, max: { unit: "max-c" } };
  });

  container.runtime = container.runtime || {};
  container.runtime.config = {
    ...(container.runtime.config || {}),
    grid: `${gridCols}x${children.length || 1}`,
    columns: opts.columns || [{ unit: "fr", value: 1 }],
    rows: rows.length ? rows : [{ unit: "min/max", min: { unit: "px", absValue: 50 }, max: { unit: "max-c" } }],
    rowGap: opts.rowGap ?? 16, // breathing room between stacked children
    heightUnit: "auto",
  };

  children.forEach((child: any, i: number) => {
    child.runtime = child.runtime || {};
    const cc = child.runtime.config || {};
    child.runtime.config = {
      ...cc,
      columnStart: colStart,
      columnEnd: colEnd,
      rowStart: i + 1,
      rowEnd: i + 2,
      constraintX: defaultConstraintX(child),
      constraintY: cc.constraintY || ["top"],
      // Width the template-native way: every element declares a width % of its cell
      // (config.widthUnit + relWidth). Without these the renderer emits an invalid
      // `width: %;` (the "width is 0" bug). Default to filling the cell; respect an
      // element that opted into "auto" (content-sized, e.g. buttons) or "px".
      ...sizeDefaults(cc),
      loaded: true,
    };
  });

  container.children = children;
  return container;
}

/** Template-native width defaults: fill the grid cell (widthUnit "%", relWidth 100) unless
 *  the element already chose a unit. The storefront's build_position reads these (NOT
 *  style.width, except when widthUnit==="px"). */
function sizeDefaults(cfg: any): any {
  const widthUnit = cfg.widthUnit || "%";
  const out: any = { widthUnit };
  if (widthUnit !== "auto") out.relWidth = cfg.relWidth != null ? cfg.relWidth : 100;
  return out;
}

const ROW_PLACEHOLDER_ROW = () => ({ unit: "min/max", min: { unit: "px", absValue: 50 }, max: { unit: "max-c" } });

/** Default responsive collapse for a multi-column row: full columns on desktop/laptop,
 *  2 columns on tablet, 1 column on mobile. `null` = keep the full column count. */
const ROW_COLLAPSE_DEFAULT: Record<string, number | null> = { bp1: null, bp2: null, bp3: 2, bp4: 1 };

interface RowOpts {
  /** Horizontal gap (px) between columns (default 24). */
  columnGap?: number;
  /** Vertical gap (px) between wrapped rows (default 24). */
  rowGap?: number;
  /** Explicit per-column unit objects (length must equal child count). Default: equal `fr`. */
  colWidths?: any[];
  /** Columns to show per breakpoint, e.g. { bp3: 2, bp4: 1 }. Merged over the default. */
  collapse?: Record<string, number>;
}

/**
 * Lay children out HORIZONTALLY — side by side in one grid row — the way real BuilderX
 * pages build feature cards, category tiles, footer columns, 2-col hero, etc. The grid is
 * `Nx1` with N equal `fr` columns and each child placed in its own column. Values go to
 * `runtime` plus `__row`/`__cell` markers that finalizeForRender() reads to emit a
 * RESPONSIVE grid per breakpoint (it auto-collapses to fewer columns on tablet/mobile so
 * the row never renders as cramped slivers).
 */
export function rowChildren(container: any, children: any[], opts: RowOpts = {}) {
  const cols = children.length || 1;
  const colWidths =
    opts.colWidths && opts.colWidths.length === cols
      ? opts.colWidths
      : Array.from({ length: cols }, () => ({ unit: "fr", value: 1 }));
  const collapse = { ...ROW_COLLAPSE_DEFAULT, ...(opts.collapse || {}) };
  const columnGap = opts.columnGap ?? 24;
  const rowGap = opts.rowGap ?? 24;
  const meta = { cols, count: children.length, collapse, columnGap, rowGap };

  container.runtime = container.runtime || {};
  container.runtime.config = {
    ...(container.runtime.config || {}),
    grid: `${cols}x1`,
    columns: colWidths,
    rows: [ROW_PLACEHOLDER_ROW()],
    columnGap,
    rowGap,
    heightUnit: "auto",
    __row: meta,
  };

  children.forEach((child: any, i: number) => {
    child.runtime = child.runtime || {};
    const cc = child.runtime.config || {};
    child.runtime.config = {
      ...cc,
      columnStart: i + 1,
      columnEnd: i + 2,
      rowStart: 1,
      rowEnd: 2,
      constraintX: defaultConstraintX(child),
      constraintY: cc.constraintY || ["top"],
      ...sizeDefaults(cc),
      loaded: true,
      __cell: { index: i, ...meta },
    };
  });

  container.children = children;
  return container;
}

/** Build a standalone multi-column ROW container from child specs (each laid side by side).
 *  Used by the new_row tool; inside new_section pass `layout:"row"` on a container spec. */
export function buildRow(childSpecs: any[] = [], opts: RowOpts & { containerOpts?: any } = {}) {
  const container = buildElement("container", opts.containerOpts || {});
  const children = childSpecs.map((spec: any) => buildFromSpec(spec));
  return rowChildren(container, children, opts);
}

/** How many columns a row shows at a given breakpoint (clamped to its real column count). */
function colsForBp(meta: any, bp: string): number {
  const c = meta.collapse ? meta.collapse[bp] : null;
  const k = c == null ? meta.cols : Math.min(c, meta.cols);
  return Math.max(1, k);
}

/**
 * Build a ready-to-place section from a list of child specs.
 * Each spec: { type, opts?, children? } where children is a nested array of specs.
 * A section uses the builder's centred 3-column grid (margin · content · margin); the
 * children live in the centre content column. finalizeForRender() sets the correct
 * per-breakpoint column widths via genGridByBp.
 */
export function buildSection(childSpecs: any[] = [], sectionOpts: any = {}) {
  const section = buildElement("section", sectionOpts);
  const children = childSpecs.map((spec: any) => buildFromSpec(spec));
  stackChildren(section, children, {
    gridCols: 3,
    columns: genGridByBp(BREAKPOINTS.bp1[0]).columns,
    contentColStart: SECTION_CONTENT_COL_START,
    contentColEnd: SECTION_CONTENT_COL_END,
    rowGap: sectionOpts.rowGap,
  });
  // Section vertical padding the TEMPLATE-NATIVE way: a fixed-height spacer GRID ROW at the
  // top and bottom, content rows in between (real templates do exactly this — the storefront
  // ignores CSS `padding` on a section, build_section only emits the grid). Default 64px;
  // pass sectionOpts.padY (0 disables, e.g. a full-bleed hero).
  const padY = sectionOpts.padY != null ? sectionOpts.padY : 64;
  section.runtime = section.runtime || {};
  const cfg = section.runtime.config || (section.runtime.config = {});
  if (padY > 0 && Array.isArray(cfg.rows)) {
    const spacer = () => ({ unit: "min/max", min: { unit: "px", absValue: padY }, max: { unit: "max-c" } });
    cfg.rows = [spacer(), ...cfg.rows, spacer()];
    cfg.grid = `3x${cfg.rows.length}`;
    for (const c of children) {
      const cc = c.runtime && c.runtime.config;
      if (cc) { cc.rowStart = (cc.rowStart || 1) + 1; cc.rowEnd = (cc.rowEnd || 2) + 1; }
    }
  }
  // Section style carries background only (padding is done via the spacer rows above).
  section.runtime.style = { ...(sectionOpts.style || {}) };
  return section;
}

export function buildFromSpec(spec: any) {
  if (!spec || !spec.type) {
    throw new Error("Each element spec must have a 'type'.");
  }
  const node = buildElement(spec.type, spec.opts || {});
  if (Array.isArray(spec.children) && spec.children.length) {
    const kids = spec.children.map((c: any) => buildFromSpec(c));
    // `layout:"row"` lays the children out side by side (responsive); default is a
    // top-to-bottom vertical stack. rowGap/columnGap/colWidths/collapse tune the layout.
    if (spec.layout === "row") {
      rowChildren(node, kids, {
        columnGap: spec.columnGap,
        rowGap: spec.rowGap,
        colWidths: spec.colWidths,
        collapse: spec.collapse,
      });
    } else {
      stackChildren(node, kids, { rowGap: spec.rowGap });
    }
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

  const ids = new Set<string>();
  const allIds = new Set<string>();
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

  // Second pass: events + bindings against the authoritative catalogs (unknown
  // trigger/action/dataset, missing required fields, dangling in-page event targets,
  // unknown binding fields). These are warnings — they don't block a save.
  walk(source, (node) => {
    if (node.events && node.events.length) {
      const r = validateEvents(node, allIds);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
    }
    if (node.bindings && node.bindings.length) {
      const r = validateBindings(node);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
    }
  });

  return {
    valid: errors.length === 0,
    ...(errors.length ? { errors } : {}),
    ...(warnings.length ? { warnings } : {}),
    stats: { sections: source.sections.length, total_elements: total, element_types: typeCounts },
  };
}

/**
 * Expand one node's `runtime.{style,config}` into the per-breakpoint keys the storefront
 * renderer reads (bp1..bp4). Mirrors builderx_spa's syncBreakpoint: the authored
 * (desktop) values are copied onto every breakpoint. Sections additionally get their
 * centred 3-column grid recomputed per breakpoint via genGridByBp (the side-margin
 * widths shrink on smaller screens). Nodes already in breakpoint shape are left as-is,
 * so this is safe to run over a mixed source (e.g. add_section onto an existing page).
 */
function expandNodeToBreakpoints(node: any): any {
  const rt = node && node.runtime;
  if (rt && (rt.style || rt.config || rt.responsive)) {
    const baseConfig = { ...(rt.config || {}), loaded: true };
    const isSection = node.type === "section";
    const rowMeta = baseConfig.__row; // this node is a multi-column row container
    const cellMeta = baseConfig.__cell; // this node is a cell inside a row
    // Per-breakpoint sparse overrides the AI supplied (opts.responsive → runtime.responsive):
    // { bp2?:{style?,config?}, bp3?:{...}, bp4?:{...} }. bp1 is the base (runtime.style/config).
    const overrides = rt.responsive && typeof rt.responsive === "object" ? rt.responsive : {};

    // CASCADE (waterfall) bp1→bp4: each breakpoint starts from the RESOLVED larger one, then
    // applies its own diff. So the AI only writes what CHANGES at each breakpoint and the rest
    // inherits downward — proper AI-reasoned responsive instead of a flat copy.
    let accStyle: any = rt.style || {};
    let accConfig: any = baseConfig;
    for (const [bp, [minW]] of Object.entries(BREAKPOINTS)) {
      const ov = (overrides as any)[bp];
      if (ov && typeof ov === "object") {
        if (ov.style) accStyle = { ...accStyle, ...ov.style };
        if (ov.config) accConfig = { ...accConfig, ...ov.config };
      }
      const style = clone(accStyle);
      const config = clone(accConfig);
      // Internal build-time markers never get persisted.
      delete config.__row;
      delete config.__cell;
      delete config.responsive;
      // Shrink oversized fonts / tall images on tablet & mobile by default (author diffs win).
      applyAutoResponsive(node, bp, rt.style || {}, style);
      if (isSection) {
        const g = genGridByBp(minW);
        const sectionRows =
          baseConfig.rows && baseConfig.rows.length ? clone(baseConfig.rows) : clone(g.rows);
        config.columns = clone(g.columns);
        config.rows = sectionRows;
        config.grid = `3x${sectionRows.length}`;
        config.heightUnit = config.heightUnit || "auto";
      }
      // A multi-column row collapses to fewer columns on smaller screens so cards never
      // shrink to slivers: recompute the grid + this container's columns per breakpoint.
      if (rowMeta) {
        const k = colsForBp(rowMeta, bp);
        const nrows = Math.ceil(rowMeta.count / k);
        config.columns =
          k === rowMeta.cols && Array.isArray(baseConfig.columns) && baseConfig.columns.length === k
            ? clone(baseConfig.columns)
            : Array.from({ length: k }, () => ({ unit: "fr", value: 1 }));
        config.rows = Array.from({ length: nrows }, () => ROW_PLACEHOLDER_ROW());
        config.grid = `${k}x${nrows}`;
        config.heightUnit = config.heightUnit || "auto";
      }
      // A cell repositions itself into the collapsed grid (wraps to a new row as needed).
      if (cellMeta) {
        const k = colsForBp(cellMeta, bp);
        const c = cellMeta.index % k;
        const r = Math.floor(cellMeta.index / k);
        config.columnStart = c + 1;
        config.columnEnd = c + 2;
        config.rowStart = r + 1;
        config.rowEnd = r + 2;
      }
      node[bp] = { style, config };
    }
    delete node.runtime;
  }

  for (const child of node.children || []) expandNodeToBreakpoints(child);
  return node;
}

/**
 * Convert a freshly-built page source (whose nodes carry `runtime`) into the shape the
 * storefront actually renders: every node gets bp1..bp4 `{style,config}` and `runtime`
 * is removed. MUST be called before saving a page built with new_section/new_element —
 * otherwise the page renders with no styling or grid placement.
 */
export function finalizeForRender(source: any): any {
  const sections = source && Array.isArray(source.sections) ? source.sections : [];
  for (const s of sections) expandNodeToBreakpoints(s);
  return source;
}

export { ELEMENT_TYPES };

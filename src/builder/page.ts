// Page-level helpers: skeleton, grid composition, id hygiene, and validation.
//
// A BuilderX page source is `{ sections: [ <section node>, ... ] }`. Sections lay out
// their children in a CSS grid driven by runtime.config (grid / columns / rows) and each
// child's runtime.config (columnStart/End, rowStart/End, constraintX/Y). The helpers here
// produce that structure the same way the builder does, so generated pages render.

import { buildElement, isKnownType, ELEMENT_TYPES } from "./catalog.js";
import { randomString } from "./factory.js";
import { validateEvents, normalizeEvents } from "./events.js";
import { validateBindings, normalizeBindings } from "./bindings.js";
import { NODE_CODE_BUDGET } from "./native-first.js";
import { checkShape } from "./shape.js";
import {
  BREAKPOINTS,
  BREAKPOINT_KEYS,
  STYLE_ASYNC,
  CONFIG_ASYNC,
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
    // Not `|| []`: a non-array children (an object, a string) must not crash the validator itself.
    for (const child of Array.isArray(node.children) ? node.children : []) {
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
/** Embeds render as a sandboxed, fixed-height `<iframe src="blob:…">` (builderx_api
 *  assets/render/embed.js): invisible to SEO, links can't navigate the site, forms never reach
 *  WebCake. A whole exported page (Google Stitch / Figma / Tailwind-CDN HTML) dumped into one is
 *  therefore a broken page, not a shortcut. Errors block the save; warnings are a fix list. */
export function checkEmbeds(source: any) {
  const errors: string[] = [];
  const warnings: string[] = [];
  walk(source, (node) => {
    // googlemap counts too: the renderer inlines its specials.iframe as raw HTML.
    if (node.type !== "embed" && node.type !== "googlemap") return;
    const s = node.specials || {};
    const code = String(s.htmlCode || "") + String(s.iframe || "");
    if (/<!doctype\s|<html[\s>]|<body[\s>]/i.test(code)) {
      errors.push(
        `Embed "${node.id}" holds a whole HTML document (${code.length} chars). Embed is a last resort: build natively everything ` +
          `native elements can (text/image/button/form/container… via ingest_html → new_section), and embed ONLY the one piece no element ` +
          `can do (third-party widget, tracking snippet, custom animation). Embeds render as a sandboxed fixed-height iframe — ` +
          `not indexed by Google, links can't open site pages, forms submit nowhere.`
      );
      return;
    }
    if (/<form[\s>]/i.test(code))
      warnings.push(`Embed "${node.id}" contains a <form> — native form elements can do this: its submissions never reach WebCake from the sandboxed iframe. Rebuild it as a native form.`);
    if (/href\s*=\s*["']\/(?!\/)/i.test(code))
      warnings.push(`Embed "${node.id}" has site links (href="/…") — native buttons/menus can do this: inside the embed's blob iframe they don't open your site. Rebuild them natively.`);
  });
  return { errors, warnings };
}

/** A text element holding only a JSON object is a slot for a script to fill, not content: that's how
 *  a page ends up empty on the canvas with its real UI in custom code. */
const isDataPlaceholder = (text: string) => {
  const plain = text.replace(/<[^>]+>/g, "").replace(/&quot;|&#0*34;|&#x0*22;/gi, '"').trim();
  if (!/^[{[]/.test(plain)) return false;
  try {
    const value = JSON.parse(plain);
    const first = Array.isArray(value) ? value[0] : value;
    return !!first && typeof first === "object" && Object.keys(first).length > 0;
  } catch {
    return false;
  }
};

function scanCode(source: any) {
  const { errors, warnings } = checkEmbeds(source);
  let code = 0;
  walk(source, (node) => {
    const s = node.specials || {};
    code += String(s.custom_css || "").length + String(s.htmlCode || "").length + String(s.iframe || "").length;
    if (typeof s.text === "string" && isDataPlaceholder(s.text))
      errors.push(`"${node.id}" holds placeholder JSON for a script to fill (${s.text.slice(0, 60)}). Put the real content in native elements. See get_build_guide → NATIVE FIRST. If visitors should really read this JSON, add words around it.`);
  });
  return { errors, warnings, code };
}

const codeVolumeError = (code: number) =>
  `${code} chars of custom_css + embed code (limit ${NODE_CODE_BUDGET.hard}). Build this with native elements. See get_build_guide → NATIVE FIRST.`;

/** Everything validatePage refuses about code inside a source: embeds, placeholders, code volume.
 *  Pass the `previous` source when saving over one: only what this save ADDS is refused, so an old
 *  page can still be edited and moved to native elements section by section. */
export function checkNativeContent(source: any, previous?: any) {
  const { errors, warnings, code } = scanCode(source);
  const old = previous ? scanCode(previous) : null;
  const added = old ? errors.filter((e) => !old.errors.includes(e)) : errors;
  if (code > NODE_CODE_BUDGET.hard && (!old || code > old.code)) added.push(codeVolumeError(code));
  else if (code > NODE_CODE_BUDGET.soft)
    warnings.push(`${code} chars of custom_css + embed code (budget ${NODE_CODE_BUDGET.soft}): check whether native elements or their settings can replace it.`);
  return { errors: added, warnings };
}

/** For element edits, after the patch is applied to `node` inside `source`: what the patch added to
 *  this element, plus the code total across the page, so batches can't add up past the limit. */
export function checkElementPatch(source: any, node: any, before: any, specials: unknown): string[] {
  if (!specials) return [];
  const alone = (n: any) => scanCode({ sections: [{ ...n, children: undefined }] });
  const now = alone(node);
  const old = alone(before);
  const errors = now.errors.filter((e) => !old.errors.includes(e));
  const total = scanCode(source).code;
  if (now.code > old.code && total > NODE_CODE_BUDGET.hard) errors.push(codeVolumeError(total));
  return errors;
}

/** Translations are per-element text overrides, so they can hold placeholders too. Keyed by element id. */
export function checkContentPlaceholders(content: any, previous?: any): string[] {
  return Object.entries(content || {})
    .filter(([id, v]: [string, any]) => typeof v?.text === "string" && isDataPlaceholder(v.text) && previous?.[id]?.text !== v.text)
    .map(([id]) => `"${id}" translation holds placeholder JSON for a script to fill. Translate real text. See get_build_guide → NATIVE FIRST.`);
}

export function validatePage(source: any, previous?: any) {
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

  // Third pass (needs ancestry): structures the renderer silently mishandles. Warnings only.
  // Child check uses LEAF_TYPES, not "factory has no children": swiper, grid-product, post-list,
  // member-bar… render children even though their factories create none.
  const checkTree = (node: any, ancestors: string[]) => {
    if (!node || typeof node !== "object") return;
    const type = node.type;
    const kids: any[] = Array.isArray(node.children) ? node.children : [];
    if (!ancestors.length && type && type !== "section" && type !== "popup")
      warnings.push(`Top-level node "${node.id}" is a ${type}: pages render only sections at the top level — wrap it in a section.`);
    if (kids.length && LEAF_TYPES.has(type))
      warnings.push(`"${node.id}" (${type}) has ${kids.length} child node(s), but ${type} is not a container — they won't render.`);
    if (type === "submit-button" && !ancestors.some((t) => /form/.test(t)))
      warnings.push(`Submit button "${node.id}" is not inside a form — it has nothing to submit.`);
    if ((node.bindings || []).some((b: any) => b?.name === "wishlist_item") && !ancestors.includes("wishlist-item"))
      warnings.push(`"${node.id}" binds wishlist_item::… outside a wishlist-item — those fields only resolve per saved product.`);
    for (const c of kids) checkTree(c, [...ancestors, type]);
  };
  for (const s of source.sections) checkTree(s, []);

  // Crash-level shapes for the renderer and the editor (null children, non-object specials/bp,
  // bad widthUnit/constraints/grid…). See shape.ts.
  const shape = checkShape(source);
  errors.push(...shape.errors);
  warnings.push(...shape.warnings);

  const code = checkNativeContent(source, previous);
  errors.push(...code.errors);
  warnings.push(...code.warnings);

  return {
    valid: errors.length === 0,
    ...(errors.length ? { errors } : {}),
    ...(warnings.length ? { warnings } : {}),
    stats: { sections: source.sections.length, total_elements: total, element_types: typeCounts },
  };
}

/** Saved nodes missing one of the site's breakpoint keys: the renderer reads node[bp] with no
 *  fallback, so at that screen width the node renders unstyled and off-grid. An empty `{}` counts as
 *  missing, and so does a node left in `runtime` (both consumers ignore runtime). `keys` = the
 *  site's breakpoint names (default bp1..bp4). */
const isFilled = (v: any) => !!v && typeof v === "object" && Object.keys(v).length > 0;
export function missingBreakpoints(source: any, keys: string[] = BREAKPOINT_KEYS) {
  let total = 0;
  const ids: string[] = [];
  walk(source, (node) => {
    total++;
    if (!keys.every((k) => isFilled(node[k]))) ids.push(node.id);
  });
  return { total, missing: ids.length, sample: ids.slice(0, 5) };
}

/** validatePage errors that a write ADDS over `before` (the source as saved). An old defect never
 *  blocks an unrelated save, so a broken page can still be edited and repaired. */
export function addedErrors(after: any, before?: any): string[] {
  const now: string[] = (validatePage(after, before) as any).errors || [];
  if (!before) return now;
  // Compare without the tree path (sections[2]>0…): inserting a section shifts every index, and an
  // old defect must not read as new. Messages still carry the node id, so distinct nodes stay distinct.
  const key = (e: string) => e.replace(/sections\[\d+\](>\d+)*/g, "");
  const old = new Set(((validatePage(before) as any).errors || []).map(key));
  return now.filter((e) => !old.has(key(e)));
}

/** What a patch changed on one node, key by key (style/config per breakpoint), or null. */
export function computeNodeDiff(before: any, after: any): any {
  const diff: Record<string, any> = {};
  const keys = (b: any, a: any) => {
    const out: Record<string, any> = {};
    for (const k of new Set([...Object.keys(b || {}), ...Object.keys(a || {})]))
      if (JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k])) out[k] = { before: b?.[k] ?? null, after: a?.[k] ?? null };
    return Object.keys(out).length ? out : null;
  };
  for (const f of ["specials", "style", "config"]) {
    const d = keys(before[f], after[f]);
    if (d) diff[f] = d;
  }
  for (const f of ["events", "bindings"])
    if (JSON.stringify(before[f] || null) !== JSON.stringify(after[f] || null))
      diff[f] = { before: before[f] || null, after: after[f] || null };
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!/^(bp\d+|runtime)$/.test(k)) continue;
    const layer: Record<string, any> = {};
    for (const f of ["style", "config"]) {
      const d = keys(before[k]?.[f], after[k]?.[f]);
      if (d) layer[f] = d;
    }
    if (Object.keys(layer).length) (diff.responsive ??= {})[k] = layer;
  }
  return Object.keys(diff).length ? diff : null;
}

/** Editor style keys are camelCase (fontSize); accept CSS spelling (font-size) too. */
const camelKeys = (o: any) =>
  Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));

/** Apply an element patch (update_page_element & co.) where the renderer reads it. Style/config
 *  live per breakpoint (node.bp1..bpN); a top-level node.style is never rendered. Like the editor's
 *  breakpoint sync: size/position keys (STYLE_ASYNC/CONFIG_ASYNC) land on the base breakpoint
 *  only, everything else (colour, font, border…) on every breakpoint. `responsive` targets one. */
export function applyNodeUpdates(node: any, updates: any): void {
  const style = updates.style ? camelKeys(updates.style) : null;
  const config = updates.config || null;
  if (style || config) {
    const bps = Object.keys(node).filter((k) => /^bp\d+$/.test(k) && node[k] && typeof node[k] === "object");
    if (!bps.length && node.runtime && typeof node.runtime === "object") {
      if (style) node.runtime.style = { ...(node.runtime.style || {}), ...style };
      if (config) node.runtime.config = { ...(node.runtime.config || {}), ...config };
    } else {
      const targets = bps.length ? bps : ["bp1"];
      const base = targets.includes("bp1") ? "bp1" : [...targets].sort()[0];
      const only = (o: any, async: string[], bp: string) =>
        bp === base ? o : Object.fromEntries(Object.entries(o).filter(([k]) => !async.includes(k)));
      for (const bp of targets) {
        const cur = node[bp] || {};
        node[bp] = {
          ...cur,
          style: { ...(cur.style || {}), ...(style ? only(style, STYLE_ASYNC, bp) : {}) },
          config: { ...(cur.config || {}), ...(config ? only(config, CONFIG_ASYNC, bp) : {}) },
        };
      }
    }
  }
  if (updates.specials) node.specials = { ...(node.specials || {}), ...updates.specials };
  // Normalize so events/bindings carry a valid id + eventName (the renderer won't dispatch without).
  if (updates.events !== undefined) node.events = normalizeEvents(updates.events, node.type);
  if (updates.bindings !== undefined) node.bindings = normalizeBindings(updates.bindings);
  if (updates.responsive) {
    for (const [bp, val] of Object.entries(updates.responsive) as [string, any][]) {
      if (!/^bp\d+$/.test(bp) || !val || typeof val !== "object") continue;
      const cur = node[bp] || {};
      // Always both keys: a bp layer missing config/style crashes the renderer's CSS builders.
      node[bp] = { ...cur, style: { ...(cur.style || {}), ...camelKeys(val.style) }, config: { ...(cur.config || {}), ...(val.config || {}) } };
    }
  }
}

/**
 * Expand one node's `runtime.{style,config}` into the per-breakpoint keys the storefront
 * renderer reads (bp1..bp4). Mirrors builderx_spa's syncBreakpoint: the authored
 * (desktop) values are copied onto every breakpoint. Sections additionally get their
 * centred 3-column grid recomputed per breakpoint via genGridByBp (the side-margin
 * widths shrink on smaller screens). Nodes already in breakpoint shape are left as-is,
 * so this is safe to run over a mixed source (e.g. add_section onto an existing page).
 */
/** Renderer builders that never draw children (builderx_api lib/qwik/html) — deliberately short. */
const LEAF_TYPES = new Set([
  "text", "image", "button", "line", "video", "input", "email", "password", "text-area", "select",
  "text-dataset", "image-dataset", "submit-button",
]);

/** A site's own breakpoints ({ bpN: [minW, maxW] }) when they differ from the standard four. */
export type SiteBreakpoints = Record<string, [number, number]> | null | undefined;

/** The site's breakpoints if they're a usable map that differs from the standard four, else null. */
function customBreakpoints(site: SiteBreakpoints): Record<string, [number, number]> | null {
  if (!site || typeof site !== "object") return null;
  const entries = Object.entries(site);
  if (!entries.length || !entries.every(([, r]) => Array.isArray(r) && typeof r[0] === "number" && typeof r[1] === "number")) return null;
  const standard = entries.length === BREAKPOINT_KEYS.length &&
    entries.every(([k, [lo, hi]]) => BREAKPOINTS[k] && BREAKPOINTS[k][0] === lo && BREAKPOINTS[k][1] === hi);
  return standard ? null : site;
}

/** Re-key a freshly expanded node from bp1..bp4 onto the site's breakpoints. The renderer emits
 *  CSS only for the site's keys, and users can split/delete breakpoints in the editor (a split
 *  of bp1 at 1600 gives bp1:[1320,1600] + bp5:[1601,1e9]; a deleted name can be reused for a
 *  different range) — so match by WIDTH, never by name: each site breakpoint takes the standard
 *  breakpoint containing its min width; sections regenerate their grid for that width. */
function remapToSiteBreakpoints(node: any, site: Record<string, [number, number]>) {
  const std = Object.entries(BREAKPOINTS);
  const out: Record<string, any> = {};
  for (const [key, [minW, maxW]] of Object.entries(site)) {
    // The open-ended (widest) breakpoint is the desktop view: a site cut down to one breakpoint
    // ({bp1:[320,1e9]}) must not get the phone layout everywhere.
    const openEnded = maxW >= BREAKPOINTS.bp1[1];
    const src = openEnded ? "bp1" : (std.find(([, [lo, hi]]) => minW >= lo && minW <= hi) || std[std.length - 1])[0];
    const from = node[src];
    if (!from) continue;
    out[key] = clone(from);
    const gridWidth = openEnded ? Math.max(minW, BREAKPOINTS.bp1[0]) : minW;
    if (node.type === "section") out[key].config.columns = clone(genGridByBp(gridWidth).columns);
  }
  for (const k of BREAKPOINT_KEYS) delete node[k];
  Object.assign(node, out);
}

function expandNodeToBreakpoints(node: any, site: Record<string, [number, number]> | null): any {
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
    if (site) remapToSiteBreakpoints(node, site);
  }

  for (const child of node.children || []) expandNodeToBreakpoints(child, site);
  return node;
}

/**
 * Convert a freshly-built page source (whose nodes carry `runtime`) into the shape the
 * storefront actually renders: every node gets bp1..bp4 `{style,config}` and `runtime`
 * is removed. MUST be called before saving a page built with new_section/new_element —
 * otherwise the page renders with no styling or grid placement.
 */
export function finalizeForRender(source: any, siteBreakpoints?: SiteBreakpoints): any {
  const sections = source && Array.isArray(source.sections) ? source.sections : [];
  const custom = customBreakpoints(siteBreakpoints);
  for (const s of sections) expandNodeToBreakpoints(s, custom);
  return source;
}

export { ELEMENT_TYPES };

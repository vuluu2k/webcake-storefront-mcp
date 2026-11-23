// Shape checks for a saved page source: what makes the storefront renderer or the builder editor
// throw. The renderer (builderx_api lib/qwik) rescues any exception into an EMPTY page or an
// EMPTY dynamic CSS, and the editor has no error boundary, so one bad node blanks a whole page,
// section or canvas. Every `errors` entry below is such a crash, with the code that throws.
// `warnings` are layouts that render wrong but don't throw.

import { OBSERVED } from "./attributes.js";

const isObj = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);
const BP_KEY = /^bp\d+$/;
// Ids end up in `#id` CSS selectors and querySelector (editor Grid.vue / grid.js).
const ID_RE = /^[A-Za-z][\w-]*$/;
// build_position: `case width_unit` with no fallback ("vw" is commented out). Missing → "%".
const WIDTH_UNITS = new Set(["auto", "px", "%"]);
const CONSTRAINT_X = new Set(["left", "right", "centerLeft", "centerRight"]);
const CONSTRAINT_Y = new Set(["top", "bottom", "centerTop", "centerBottom"]);
const TRACK_UNITS = new Set(["fr", "px", "%", "auto", "min/max", "max-c", "min-c", "calc", "vh", "vw"]);
// Editor components that destructure specials without a default (Text.vue, Button.vue, Select.vue…).
const NEEDS_SPECIALS = new Set([
  "text", "button", "input", "text-area", "select", "radio", "checkbox", "radio-group", "checkbox-group",
  "menu", "carousel", "swiper",
]);
/** Containers whose children are all one kind (build_swiper renders every child as a slide…). */
const CHILD_TYPES: Record<string, string[]> = { swiper: ["slide"], menu: ["menu-item", "menu-droppable"], collapse: ["collapse-item"] };
/** Editor components that index specials.options (Select.vue, Radio.vue, Checkbox). */
const OPTION_TYPES = new Set(["select", "radio", "checkbox"]);
/** Types whose config.columns/rows are grid TRACKS: every real page stores an array there
 *  (element-keys.generated.json); grid-product & co. store a count instead. */
export const GRID_TYPES = new Set([
  "section", "container", "form", "popup", "carousel",
  ...Object.entries(OBSERVED as Record<string, any>)
    .filter(([, t]) => JSON.stringify(t?.types?.["config.columns"]) === '["array"]')
    .map(([k]) => k),
]);
// convert_style_grid (builderx_api html/common.ex) prints "#{obj[key]}<unit>": a missing value
// prints a bare "px", and the browser drops the whole grid-template.
const TRACK_VALUE: Record<string, string> = { px: "absValue", "%": "relValue", calc: "calcValue", vh: "vhValue", vw: "vwValue" };
const blank = (v: any) => v == null || v === "" || (typeof v !== "string" && !Number.isFinite(Number(v)));
// The builder's own grid format (builderx_spa): GridAreaItem.vue offers columns in fr/px/% and
// rows as min/max with a px/% min; grid.js getCI measures only fr/px/% columns and Grid.vue's row
// drag reads row.min (convertUnitMinToPx), so any other row shape throws in the editor.
const EDITOR_COLUMN_UNITS = new Set(["fr", "px", "%"]);
/** The editor's content-sized row (what it saves for "auto" height rows). */
export const contentRow = () => ({ unit: "min/max", min: { unit: "px", absValue: 0 }, max: { unit: "max-c" } });
/** A row in the editor's format that renders the same, or the row unchanged when none does. */
export function toEditorRow(tr: any): any {
  if (!isObj(tr) || tr.unit === "min/max") return tr;
  const n = Number(tr.absValue), p = Number(tr.relValue);
  if (tr.unit === "px" && Number.isFinite(n)) return { unit: "min/max", min: { unit: "px", absValue: n }, max: { unit: "px", absValue: n } };
  if (tr.unit === "%" && Number.isFinite(p)) return { unit: "min/max", min: { unit: "%", relValue: p }, max: { unit: "%", relValue: p } };
  if (tr.unit === "auto" || tr.unit === "max-c" || tr.unit === "min-c") return contentRow();
  return tr;
}
/** Why the editor can't use this track, or null. */
export function editorTrackIssue(tr: any, kind: "columns" | "rows"): string | null {
  if (!isObj(tr)) return null;
  const unit = tr.unit ?? "fr";
  if (kind === "columns") return EDITOR_COLUMN_UNITS.has(unit) ? null : `unit "${unit}" is not a builder column (fr/px/%): the editor measures it as nothing and drops land in the wrong cell`;
  if (unit !== "min/max") return `{unit:"${unit}"} is not a builder row (min/max): the editor's row drag reads row.min and throws`;
  if (!isObj(tr.min) || !["px", "%"].includes(tr.min.unit)) return "the row's min must be px or %: the editor's row panel and drag only handle those";
  return null;
}
// ── Value classes: ONE classifier for the miner (value-formats.generated.json) and the checks ──
const LEN = "-?\\d*\\.?\\d+(px|em|rem|%|vw|vh|pt)";
const VALUE_CLASSES: [string, RegExp][] = [
  ["px", /^-?\d*\.?\d+px$/],
  ["length", new RegExp(`^${LEN}$`)],
  ["lengths", new RegExp(`^(${LEN}|0|auto)( (${LEN}|0|auto)){1,3}$`)],
  ["numeric-string", /^-?\d*\.?\d+$/],
  ["color", /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|transparent)$/i],
  ["var", /^var\(--[\w-]+\)$/],
  ["gradient", /gradient\(/],
  ["url", /url\(|^https?:\/\//],
  ["keyword", /^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/],
  ["shorthand", /px.*(#|rgba?\()|(#|rgba?\().*px/],
];
/** The format class of one stored value (null for null/undefined). */
export function valueClass(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isFinite(v) ? "number" : "nan";
  if (typeof v !== "string") return typeof v;
  if (v === "") return "empty";
  const s = v.trim();
  for (const [name, re] of VALUE_CLASSES) if (re.test(s)) return name;
  return "css";
}
/** How to write a value of each class (for get_element and messages). */
export const CLASS_DOC: Record<string, string> = {
  number: "number", px: '"<N>px"', length: '"<N>px|%|em|vw"', lengths: '"<N>px <N>px <N>px <N>px"',
  "numeric-string": '"<N>" (string)', color: '"#rrggbb" | "rgba(r,g,b,a)"', var: '"var(--color_N)" (theme)',
  gradient: '"linear-gradient(…)"', url: '"url(…)" | "https://…"', keyword: "keyword", shorthand: 'CSS shorthand e.g. "0px 2px 4px rgba(…)"',
  css: "CSS value", boolean: "boolean", array: "array", object: "object",
};

/** The exact value format of every layout key, in the builder's own shape (what builderx_spa
 *  writes and can edit). ONE definition: get_element shows it (schema `format`), BUILD_GUIDE
 *  quotes it, and every rule here is enforced by validatePage / checkShape (+ repairSource for the
 *  one-answer fixes). `grid: true` = only on GRID_TYPES; the others apply to any placed child. */
export const LAYOUT_FORMATS: Record<string, { format: string; grid?: true }> = {
  grid: { grid: true, format: '"<cols>x<rows>" = columns.length x rows.length, e.g. "1x3"' },
  columns: { grid: true, format: 'non-empty list of {unit:"fr",value:N} | {unit:"px",absValue:N} | {unit:"%",relValue:N}' },
  rows: { grid: true, format: 'non-empty list of {unit:"min/max",min:{unit:"px",absValue:N}|{unit:"%",relValue:N},max:{unit:"max-c"}|{unit:"px",absValue:N}}; content-sized row = min absValue 0, max max-c' },
  columnGap: { grid: true, format: "number (px), no unit string" },
  rowGap: { grid: true, format: "number (px), no unit string" },
  columnStart: { format: "integer ≥ 1: grid line in the PARENT's grid (columnEnd > columnStart, ≤ parent columns + 1)" },
  columnEnd: { format: "integer > columnStart, ≤ parent columns + 1" },
  rowStart: { format: "integer ≥ 1: grid line in the PARENT's grid (rowEnd > rowStart, ≤ parent rows + 1)" },
  rowEnd: { format: "integer > rowStart, ≤ parent rows + 1" },
  constraintX: { format: `1-2 of ${[...CONSTRAINT_X].join("|")}, e.g. ["left","right"] = stretch` },
  constraintY: { format: `1-2 of ${[...CONSTRAINT_Y].join("|")}, e.g. ["top"]` },
  widthUnit: { format: '"%" (+ relWidth N) | "px" (+ style.width N) | "auto"' },
  heightUnit: { format: '"auto" | "px" (+ style.height N) | "vh" (+ vhHeight N) | "vw" (+ vwHeight N) | "%" (+ relHeight N)' },
  lockCellGrid: { format: "optional editor lock {columnStart,columnEnd,rowStart,rowEnd} = this node's own cell" },
};
const HEIGHT_UNITS = new Set(["auto", "px", "vh", "vw", "%"]);
const PLACEMENT = ["columnStart", "columnEnd", "rowStart", "rowEnd"] as const;
/** Layout-value problems of one config layer (beyond the grid tracks), per LAYOUT_FORMATS. */
export function layoutProblems(cfg: any): string[] {
  const out: string[] = [];
  if (!isObj(cfg)) return out;
  const has = PLACEMENT.filter((k) => cfg[k] != null);
  for (const k of has) if (!Number.isInteger(cfg[k]) || cfg[k] < 1) out.push(`${k} ${JSON.stringify(cfg[k])} must be an integer ≥ 1 (a grid line)`);
  if (Number.isInteger(cfg.columnStart) && Number.isInteger(cfg.columnEnd) && cfg.columnEnd <= cfg.columnStart) out.push(`columnEnd ${cfg.columnEnd} must be > columnStart ${cfg.columnStart}`);
  if (Number.isInteger(cfg.rowStart) && Number.isInteger(cfg.rowEnd) && cfg.rowEnd <= cfg.rowStart) out.push(`rowEnd ${cfg.rowEnd} must be > rowStart ${cfg.rowStart}`);
  if (cfg.heightUnit != null && !HEIGHT_UNITS.has(cfg.heightUnit)) out.push(`heightUnit "${cfg.heightUnit}" must be ${[...HEIGHT_UNITS].join("|")}`);
  for (const k of ["columnGap", "rowGap"]) if (cfg[k] != null && !(typeof cfg[k] === "number" && Number.isFinite(cfg[k]))) out.push(`${k} ${JSON.stringify(cfg[k])} must be a number (px)`);
  return out;
}
/** Why this track prints invalid CSS, or null. A null track prints 1fr (the editor saves those). */
export function trackProblem(tr: any): string | null {
  if (!isObj(tr)) return null;
  const unit = tr.unit ?? "fr";
  const k = TRACK_VALUE[unit];
  if (k && blank(tr[k])) return `{unit:"${unit}"} has no ${k}`;
  if (unit !== "min/max") return null;
  if (!isObj(tr.min) || (tr.min.unit ?? "fr") === "fr") return "min/max needs a px/% min (a missing or fr min prints minmax(1fr, …), invalid CSS)";
  return trackProblem(tr.min) || trackProblem(tr.max);
}
const UNIT_SUFFIXED = /^-?\d+(\.\d+)?(px|%|vw|vh|rem|em)$/;
const NUMERIC_STYLE = ["width", "height", "top", "left", "right", "bottom", "columnGap", "rowGap"];

export function checkShape(source: any): { errors: string[]; warnings: string[]; editorOnly: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  /** Breaks the editor only (an element/canvas goes blank there); the storefront renders. Still
   *  refused on a write, but publish_site doesn't block on it: the live site works. */
  const editorOnly: string[] = [];
  const editorErr = (m: string) => { errors.push(m); editorOnly.push(m); };
  if (!isObj(source) || !Array.isArray(source.sections)) return { errors, warnings, editorOnly }; // validatePage reports it

  source.sections.forEach((s: any, i: number) => {
    if (!isObj(s)) editorErr(`sections[${i}] is ${s === null ? "null" : typeof s}, not an element: the editor never finishes loading.`);
  });

  const layer = (node: any, at: string, where: string, isBp: boolean) => {
    const v = node[where];
    if (v === undefined) return;
    if (!isObj(v)) {
      errors.push(`${at}.${where} must be an object (got ${Array.isArray(v) ? "array" : v === null ? "null" : typeof v}): the renderer throws and the page goes blank.`);
      return;
    }
    // build_section reads `el[bp]["style"] || %{}`; the element builders pattern-match
    // %{"style" => _, "config" => _} = el[bp] (dynamic/index.ex). Real editor sections carry
    // config-only layers, so only non-sections are refused.
    if (isBp && node.type !== "section" && Object.keys(v).length && (!isObj(v.style) || !isObj(v.config)))
      errors.push(`${at}.${where} needs both style:{} and config:{} objects: the CSS builders pattern-match them and all page CSS is lost.`);
    if (isObj(v.style)) style(v.style, `${at}.${where}.style`);
    if (isObj(v.config)) config(node, v.config, `${at}.${where}.config`);
  };

  const style = (st: any, at: string) => {
    for (const [k, val] of Object.entries(st))
      if (val !== null && typeof val === "object")
        errors.push(`${at}.${k} is an object; style values must be strings or numbers (renderer can't print it, all page CSS is lost).`);
    for (const k of NUMERIC_STYLE)
      if (typeof st[k] === "string" && UNIT_SUFFIXED.test(st[k]) && !st[k].endsWith("%"))
        warnings.push(`${at}.${k} = "${st[k]}": store the number only (the unit lives in config), or it renders as "${st[k]}px".`);
  };

  const config = (node: any, cfg: any, at: string) => {
    const wu = cfg.widthUnit;
    // "vw" is what the editor itself writes for overlays, droppables and submenus.
    if (wu != null && wu !== "vw" && !WIDTH_UNITS.has(wu)) {
      errors.push(`${at}.widthUnit "${wu}" must be auto, px or %: the renderer has no branch for it and all page CSS is lost.`);
    }
    for (const [key, allowed] of [["constraintX", CONSTRAINT_X], ["constraintY", CONSTRAINT_Y]] as const) {
      const c = cfg[key];
      if (c == null) continue;
      // get_grid_position: [c] = [] fails; with 2+ entries it String.contains? each one and
      // destructures [a, b] = when one is a center*. Unknown single values just get no CSS.
      const crash = !Array.isArray(c) || c.length === 0 ||
        (c.length > 1 && (c.some((x: any) => typeof x !== "string") || (c.length > 2 && c.some((x: string) => x.includes("center")))));
      if (crash)
        errors.push(`${at}.${key} must be 1-2 of ${[...allowed].join("/")} (got ${JSON.stringify(c)}): the renderer pattern-matches it and all page CSS is lost.`);
      else if (!c.every((x: any) => allowed.has(x)))
        warnings.push(`${at}.${key} ${JSON.stringify(c)} has values outside ${[...allowed].join("/")}: that element gets no position CSS.`);
    }
    for (const key of ["columns", "rows"]) {
      const t = cfg[key];
      if (!t) continue;
      // grid-product & co. store a per-row COUNT here; only grid containers map it as tracks.
      if (typeof t === "number" && !GRID_TYPES.has(node.type)) continue;
      // null tracks are saved by the editor itself; convert_style_grid treats nil as %{}.
      if (!Array.isArray(t) || !t.every((tr: any) => tr === null || isObj(tr))) {
        errors.push(`${at}.${key} must be an array of track objects { unit, value }: the grid builder throws.`);
        continue;
      }
      t.forEach((tr: any, i: number) => {
        if (tr && tr.unit != null && !TRACK_UNITS.has(tr.unit)) warnings.push(`${at}.${key}[${i}].unit "${tr.unit}" is unknown; the editor drops the whole grid template.`);
      });
    }
    if (cfg.grid != null && cfg.grid !== "") {
      const m = /^(\d+)x(\d+)$/.exec(String(cfg.grid));
      if (!m) editorErr(`${at}.grid "${cfg.grid}" must be "<cols>x<rows>": the editor parses it when the element is selected.`);
      else if (+m[1] < 1 || +m[2] < 1) warnings.push(`${at}.grid "${cfg.grid}" has a zero dimension; set it to match columns×rows.`);
    }
    if (cfg.animation != null && !isObj(cfg.animation)) errors.push(`${at}.animation must be an object: the renderer throws.`);
    if (cfg.borderEdges != null && !Array.isArray(cfg.borderEdges)) errors.push(`${at}.borderEdges must be an array: the renderer throws.`);
    const vb = cfg.video_background;
    if (vb && (!isObj(vb) || typeof vb.url !== "string"))
      errors.push(`${at}.video_background needs a string url (or remove it): the renderer calls String.contains? on it and the page goes blank.`);
    if (node.type === "section" && vb?.sync_width_section && !(Number(node.bp1?.style?.width) > 0))
      warnings.push(`${at}.video_background.sync_width_section needs a numeric section width.`);
  };

  const check = (node: any, at: string, parentType: string | null) => {
    if (!isObj(node)) return;
    const type = node.type;
    const label = `${at} (${node.id || "?"}${type ? ` ${type}` : ""})`;
    if (typeof node.id === "string" && node.id && !ID_RE.test(node.id))
      warnings.push(`${label}: id should start with a letter and hold only letters, digits, _ or -: as a #id selector it loses its CSS and the editor throws when it is selected.`);

    if ("specials" in node && !isObj(node.specials))
      errors.push(`${label}.specials must be an object: every renderer builder reads it and the page goes blank.`);
    else if (!("specials" in node) && NEEDS_SPECIALS.has(type))
      editorErr(`${label} has no specials: the editor's ${type} component reads it without a default and the element goes blank.`);
    const sp = isObj(node.specials) ? node.specials : {};
    for (const k of ["custom_css", "custom_class"])
      if (sp[k] != null && typeof sp[k] !== "string") errors.push(`${label}.specials.${k} must be a string: the renderer splits it and the page goes blank.`);
    if (type === "text" && sp.tag != null && typeof sp.tag !== "string") errors.push(`${label}.specials.tag must be a string (h1, p…): the page goes blank.`);
    if (OPTION_TYPES.has(type) && sp.options != null && (!Array.isArray(sp.options) || sp.options.some((o: any) => o == null)))
      editorErr(`${label}.specials.options must be an array with no null entries: the editor's ${type} goes blank.`);
    if (type === "select" && Array.isArray(sp.options) && sp.defaultValue != null && sp.defaultValue !== "" && sp.defaultValue !== "none" &&
      sp.options.every((o: any) => isObj(o) && "id" in o) && !sp.options.some((o: any) => o.id === sp.defaultValue))
      editorErr(`${label}.specials.defaultValue "${sp.defaultValue}" names no option id: the editor's select goes blank.`);

    if (node.events != null && (!Array.isArray(node.events) || !node.events.every(isObj)))
      errors.push(`${label}.events must be an array of event objects: the renderer throws and the page goes blank.`);

    for (const k of Object.keys(node)) if (BP_KEY.test(k)) layer(node, label, k, true);
    layer(node, label, "runtime", false); // unsaved builder shape: same value rules

    if (type === "section" && parentType) warnings.push(`${label}: a section nested inside a ${parentType} renders as an empty box in the editor.`);
    if (type === "popup" && !parentType) warnings.push(`${label}: popups belong in a global source (popup), not the page's sections; inline it renders without its overlay.`);
    if (type === "form" && !sp.type)
      warnings.push(`${label}: no specials.type, so the renderer treats it as form_order (a checkout). Contact/lead/newsletter → "subscribe".`);
    const kinds = CHILD_TYPES[type];
    if (kinds && Array.isArray(node.children) && node.children.some((c: any) => isObj(c) && !kinds.includes(c.type)))
      warnings.push(`${label}: a ${type} holds only ${kinds.join("/")} children (the renderer treats each child as one); wrap other content inside a ${kinds[0]}.`);
    if (type === "dropdown" && !(Array.isArray(node.children) && node.children.length))
      warnings.push(`${label}: a dropdown needs its content child, or the editor can't render it.`);

    if ("children" in node) {
      if (!Array.isArray(node.children)) {
        errors.push(`${label}.children must be an array (got ${node.children === null ? "null" : typeof node.children}): the renderer maps over it and the page goes blank.`);
        return;
      }
      node.children.forEach((c: any, i: number) => {
        if (!isObj(c)) {
          errors.push(`${label}.children[${i}] is ${c === null ? "null" : Array.isArray(c) ? "an array" : typeof c}, not an element: the renderer throws and the editor blanks every section.`);
          return;
        }
        check(c, `${at}>${i}`, type || null);
      });
    }
  };

  source.sections.forEach((s: any, i: number) => check(s, `sections[${i}]`, null));
  return { errors, warnings, editorOnly };
}

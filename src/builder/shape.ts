// Shape checks for a saved page source: what makes the storefront renderer or the builder editor
// throw. The renderer (builderx_api lib/qwik) rescues any exception into an EMPTY page or an
// EMPTY dynamic CSS, and the editor has no error boundary, so one bad node blanks a whole page,
// section or canvas. Every `errors` entry below is such a crash, with the code that throws.
// `warnings` are layouts that render wrong but don't throw.

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
const GRID_CONTAINERS = new Set(["section", "container", "form", "popup", "carousel"]);
const UNIT_SUFFIXED = /^-?\d+(\.\d+)?(px|%|vw|vh|rem|em)$/;
const NUMERIC_STYLE = ["width", "height", "top", "left", "right", "bottom", "columnGap", "rowGap"];

export function checkShape(source: any): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(source) || !Array.isArray(source.sections)) return { errors, warnings }; // validatePage reports it

  source.sections.forEach((s: any, i: number) => {
    if (!isObj(s)) errors.push(`sections[${i}] is ${s === null ? "null" : typeof s}, not an element: the editor never finishes loading.`);
  });

  const layer = (node: any, at: string, where: string, isBp: boolean) => {
    const v = node[where];
    if (v === undefined) return;
    if (!isObj(v)) {
      errors.push(`${at}.${where} must be an object (got ${Array.isArray(v) ? "array" : v === null ? "null" : typeof v}): the renderer throws and the page goes blank.`);
      return;
    }
    if (isBp && Object.keys(v).length && (!isObj(v.style) || !isObj(v.config)))
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
    if (wu != null && !WIDTH_UNITS.has(wu)) {
      if (wu === "vw") warnings.push(`${at}.widthUnit "vw" has no renderer branch; use "%" or "px".`);
      else errors.push(`${at}.widthUnit "${wu}" must be auto, px or %: the renderer has no branch for it and all page CSS is lost.`);
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
      if (typeof t === "number" && !GRID_CONTAINERS.has(node.type)) continue;
      if (!Array.isArray(t) || !t.every(isObj)) {
        errors.push(`${at}.${key} must be an array of track objects { unit, value }: the grid builder throws.`);
        continue;
      }
      t.forEach((tr: any, i: number) => {
        if (tr.unit != null && !TRACK_UNITS.has(tr.unit)) warnings.push(`${at}.${key}[${i}].unit "${tr.unit}" is unknown; the editor drops the whole grid template.`);
      });
    }
    if (cfg.grid != null && cfg.grid !== "") {
      const m = /^(\d+)x(\d+)$/.exec(String(cfg.grid));
      if (!m || +m[1] < 1 || +m[2] < 1) errors.push(`${at}.grid "${cfg.grid}" must be "<cols>x<rows>" (both ≥ 1): the editor throws a RangeError when the element is selected.`);
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
      errors.push(`${label} has no specials: the editor's ${type} component reads it without a default and the element goes blank.`);
    const sp = isObj(node.specials) ? node.specials : {};
    for (const k of ["custom_css", "custom_class"])
      if (sp[k] != null && typeof sp[k] !== "string") errors.push(`${label}.specials.${k} must be a string: the renderer splits it and the page goes blank.`);
    if (type === "text" && sp.tag != null && typeof sp.tag !== "string") errors.push(`${label}.specials.tag must be a string (h1, p…): the page goes blank.`);
    if (sp.options != null && (!Array.isArray(sp.options) || sp.options.some((o: any) => o == null)))
      errors.push(`${label}.specials.options must be an array with no null entries: the editor's ${type} goes blank.`);
    if (type === "select" && Array.isArray(sp.options) && sp.defaultValue != null && sp.defaultValue !== "" && sp.defaultValue !== "none" &&
      sp.options.every((o: any) => isObj(o) && "id" in o) && !sp.options.some((o: any) => o.id === sp.defaultValue))
      errors.push(`${label}.specials.defaultValue "${sp.defaultValue}" names no option id: the editor's select goes blank.`);

    if (node.events != null && (!Array.isArray(node.events) || !node.events.every(isObj)))
      errors.push(`${label}.events must be an array of event objects: the renderer throws and the page goes blank.`);

    for (const k of Object.keys(node)) if (BP_KEY.test(k)) layer(node, label, k, true);
    layer(node, label, "runtime", false); // unsaved builder shape: same value rules

    if (type === "section" && parentType) warnings.push(`${label}: a section nested inside a ${parentType} renders as an empty box in the editor.`);
    if (type === "popup" && !parentType) warnings.push(`${label}: popups belong in a global source (popup), not the page's sections; inline it renders without its overlay.`);
    if (type === "dropdown" && !(Array.isArray(node.children) && node.children.length))
      warnings.push(`${label}: a dropdown needs its content child, or the editor can't render it.`);

    if ("children" in node) {
      if (!Array.isArray(node.children)) {
        errors.push(`${label}.children must be an array (got ${node.children === null ? "null" : typeof node.children}): the renderer maps over it and the page goes blank.`);
        return;
      }
      const cols = Array.isArray(node.bp1?.config?.columns) ? node.bp1.config.columns.length : 0;
      const rows = Array.isArray(node.bp1?.config?.rows) ? node.bp1.config.rows.length : 0;
      node.children.forEach((c: any, i: number) => {
        if (!isObj(c)) {
          errors.push(`${label}.children[${i}] is ${c === null ? "null" : Array.isArray(c) ? "an array" : typeof c}, not an element: the renderer throws and the editor blanks every section.`);
          return;
        }
        const cc = c.bp1?.config;
        if (cols && cc && Number(cc.columnEnd) > cols + 1)
          warnings.push(`${label}.children[${i}] (${c.id}) ends at column ${cc.columnEnd} but the grid has ${cols} columns: it spills into an implicit track.`);
        if (rows && cc && Number(cc.rowEnd) > rows + 1)
          warnings.push(`${label}.children[${i}] (${c.id}) ends at row ${cc.rowEnd} but the grid has ${rows} rows: it spills into an implicit track.`);
        check(c, `${at}>${i}`, type || null);
      });
    }
  };

  source.sections.forEach((s: any, i: number) => check(s, `sections[${i}]`, null));
  return { errors, warnings };
}

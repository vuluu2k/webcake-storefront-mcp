// repairSource: fix, in place, the AI mistakes that have exactly one right answer, and say what
// changed. Runs on every page/section write before validation, so these never cost a round trip;
// anything ambiguous is left for validatePage to report (and block when it is surely broken).
import { walk, stackChildren, padToTracks } from "./page.js";
import { GRID_TYPES, toEditorRow } from "./shape.js";
import { isKnownType } from "./catalog.js";
import { randomString, WISHLIST_SVG } from "./factory.js";
import { coerceToFormat, CSS_PROPS, elementSchema, valueFormat } from "./element-schema.js";
import { GENERIC_CONFIG, OBSERVED } from "./attributes.js";

/** Type names agents invent → the element that does it (+ the semantic tag for text). */
const TYPE_ALIAS: Record<string, { type: string; tag?: string }> = {
  heading: { type: "text", tag: "h2" }, title: { type: "text", tag: "h2" }, subtitle: { type: "text", tag: "h3" },
  h1: { type: "text", tag: "h1" }, h2: { type: "text", tag: "h2" }, h3: { type: "text", tag: "h3" },
  h4: { type: "text", tag: "h4" }, h5: { type: "text", tag: "h5" }, h6: { type: "text", tag: "h6" },
  paragraph: { type: "text", tag: "p" }, p: { type: "text", tag: "p" }, label: { type: "text", tag: "p" }, span: { type: "text", tag: "p" },
  div: { type: "container" }, box: { type: "container" }, group: { type: "container" }, wrapper: { type: "container" },
  column: { type: "container" }, card: { type: "container" }, row: { type: "container" },
  img: { type: "image" }, picture: { type: "image" }, photo: { type: "image" },
  btn: { type: "button" }, cta: { type: "button" },
  hr: { type: "line" }, divider: { type: "line" }, separator: { type: "line" },
  textarea: { type: "text-area" }, phone: { type: "phone-number" }, tel: { type: "phone-number" },
  map: { type: "googlemap" }, "google-map": { type: "googlemap" }, iframe: { type: "embed" },
  accordion: { type: "collapse" },
};
/** Known types the renderer has no branch for, with a drop-in replacement. */
const UNRENDERED_SWAP: Record<string, string> = { row: "container" };

/** Invented event actions → the real one, and the field names agents use for its target. */
const ACTION_ALIAS: Record<string, { action: string; fields: Record<string, string> }> = {
  navigate: { action: "open_link", fields: { url: "link_target", href: "link_target", link: "link_target" } },
  open_url: { action: "open_link", fields: { url: "link_target", href: "link_target" } },
  link: { action: "open_link", fields: { url: "link_target", href: "link_target" } },
  redirect: { action: "open_link", fields: { url: "link_target", href: "link_target" } },
  scroll: { action: "scroll_to", fields: { target: "scroll_to_id", id: "scroll_to_id", target_id: "scroll_to_id" } },
  scroll_to_section: { action: "scroll_to", fields: { target: "scroll_to_id", id: "scroll_to_id" } },
  popup: { action: "open_popup", fields: { target: "popup_id", id: "popup_id" } },
  show_popup: { action: "open_popup", fields: { target: "popup_id", id: "popup_id" } },
  call: { action: "phone_call", fields: { phone: "phone_call_number", number: "phone_call_number", tel: "phone_call_number" } },
  phone: { action: "phone_call", fields: { phone: "phone_call_number", number: "phone_call_number" } },
};
// open_link: an agent's url field may also arrive under the real action's name.
const LINK_FIELDS: Record<string, string> = { url: "link_target", href: "link_target" };

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const mintId = (type: string) => `${type.toUpperCase()}-${randomString(8)}`;
const layersOf = (node: any) => ["runtime", ...Object.keys(node).filter((k) => /^bp\d+$/.test(k))].filter((k) => node[k] && typeof node[k] === "object");

const missing = (t: any) => t == null || (Array.isArray(t) && !t.length);
const hasTracks = (cfg: any) => !!cfg && !missing(cfg.columns) && !missing(cfg.rows);
const minRow = (h: number) => ({ unit: "min/max", min: { unit: "px", absValue: h }, max: { unit: "max-c" } });
/** Give a layer the tracks its children are placed in (1×1 when they aren't): 1fr columns and
 *  content-sized rows, like the editor's ContainerPicker (an empty box keeps its height). */
function fillTracks(layer: any, kidCfgs: any[], unsaved: boolean) {
  const cfg = (layer.config ||= {});
  const span = (k: string) => Math.max(1, ...kidCfgs.map((c) => Number(c?.[k]) - 1).filter(Number.isFinite));
  if (missing(cfg.columns)) cfg.columns = Array.from({ length: span("columnEnd") }, () => ({ unit: "fr", value: 1 }));
  if (missing(cfg.rows)) {
    const h = kidCfgs.length ? 50 : parseFloat(layer.style?.height) || 280;
    cfg.rows = Array.from({ length: span("rowEnd") }, () => minRow(h));
  }
  if (Array.isArray(cfg.columns) && Array.isArray(cfg.rows)) cfg.grid = `${cfg.columns.length}x${cfg.rows.length}`;
  if (unsaved) cfg.heightUnit ??= "auto";
}
export function repairSource(source: any): string[] {
  const fixed: string[] = [];
  if (!source || typeof source !== "object" || !Array.isArray(source.sections)) return fixed;
  const ids = new Set<string>();
  walk(source, (node) => {
    if (!node || typeof node !== "object") return true;
    const who = () => `#${node.id || "?"} (${node.type})`;

    // 1. invented type with one obvious meaning
    if (typeof node.type === "string" && UNRENDERED_SWAP[node.type]) {
      fixed.push(`${who()}: type "${node.type}" renders nothing → "${UNRENDERED_SWAP[node.type]}"`);
      node.type = UNRENDERED_SWAP[node.type];
    }
    if (typeof node.type === "string" && !isKnownType(node.type)) {
      const a = TYPE_ALIAS[node.type.toLowerCase()];
      if (a && isKnownType(a.type)) {
        const was = node.type;
        node.type = a.type;
        if (a.tag) node.specials = { ...(node.specials || {}), tag: node.specials?.tag || a.tag };
        fixed.push(`${who()}: type "${was}" → "${a.type}"${a.tag ? ` (tag ${node.specials.tag})` : ""}`);
      }
    }
    if (typeof node.specials?.tag === "string" && /^H[1-6]$|^P$/.test(node.specials.tag)) node.specials.tag = node.specials.tag.toLowerCase();

    // 2. ids: missing → minted; duplicated → the later copy gets a fresh one
    if (!node.id && typeof node.type === "string") {
      node.id = mintId(node.type);
      fixed.push(`${who()}: missing id minted`);
    } else if (node.id && ids.has(node.id)) {
      const was = node.id;
      node.id = mintId(node.type || "NODE");
      fixed.push(`#${was} (${node.type}): duplicate id → ${node.id}`);
    }
    if (node.id) ids.add(node.id);

    const schema = typeof node.type === "string" ? elementSchema(node.type) : undefined;
    const seenStyle = new Set(OBSERVED[node.type]?.style || []);
    for (const layer of layersOf(node)) {
      const L = node[layer];
      // 3. kebab-case CSS → camelCase (only where this type's real pages don't use the kebab key)
      const okStyle = L.style && typeof L.style === "object" && !Array.isArray(L.style);
      for (const k of okStyle ? Object.keys(L.style) : []) {
        const c = camel(k);
        if (k.includes("-") && !k.startsWith("--") && !seenStyle.has(k) && CSS_PROPS.has(c) && !(c in L.style)) {
          L.style[c] = L.style[k];
          delete L.style[k];
          fixed.push(`${who()} ${layer}.style: "${k}" → "${c}"`);
        }
      }
      // 4. CSS written into config that this type doesn't read there → style
      if (schema && L.config && typeof L.config === "object")
        for (const k of Object.keys(L.config)) {
          if (!CSS_PROPS.has(k) || GENERIC_CONFIG.has(k) || k in schema.config) continue;
          if (L.style != null && (typeof L.style !== "object" || Array.isArray(L.style))) continue;
          L.style = L.style || {};
          if (!(k in L.style)) L.style[k] = L.config[k];
          delete L.config[k];
          fixed.push(`${who()} ${layer}: config.${k} moved to style`);
        }
      // 5. typed values written as strings
      if (schema && L.config && typeof L.config === "object") retype(L.config, schema.config, `${layer}.config`);
    }
    if (schema && node.specials && typeof node.specials === "object") retype(node.specials, schema.specials, "specials");

    // 6. render-crash fillers with one answer (builderx_api would blank the WHOLE page)
    if (node.type === "wishlist" && typeof node.specials?.svg !== "string") {
      node.specials = { ...(node.specials || {}), svg: WISHLIST_SVG };
      fixed.push(`${who()}: specials.svg missing → default heart icon (a wishlist without one blanks the page)`);
    }
    // A text with no fontSize renders at font-size 0 (invisible): give it the body size.
    if (node.type === "text") {
      const layers = layersOf(node);
      // `font` = a theme typography shorthand (var(--font_N)) that carries the size.
      const has = layers.some((l) => node[l].style && (node[l].style.fontSize || node[l].style.font));
      if (!has && layers.length) {
        const base = layers.includes("runtime") ? "runtime" : layers[0];
        node[base].style = { ...(node[base].style || {}), fontSize: "16px" };
        fixed.push(`${who()}: fontSize missing → 16px (without it the text renders invisible)`);
      }
    }
    if (node.type === "number-step")
      for (const layer of layersOf(node)) {
        const cfg = (node[layer].config ||= {});
        if (!(Number(cfg.buttons_in_row) > 0) && (layer === "runtime" || "buttons_in_row" in cfg)) {
          cfg.buttons_in_row = 3;
          fixed.push(`${who()} ${layer}.config.buttons_in_row → 3 (0/missing fails the page's CSS build)`);
        }
      }
    if (node.type === "checkbox-group" && !Array.isArray(node.specials?.options)) {
      node.specials = { ...(node.specials || {}), options: [] };
      fixed.push(`${who()}: specials.options missing → [] (nil blanks the page)`);
    }
    // a custom-layout inside a product list renders only when the list enables store_show_extra_info
    if ((node.type === "grid-product" || node.type === "slider-product") && (node.children || []).some((c: any) => c?.type === "custom-layout")) {
      const plugins = Array.isArray(node.specials?.plugins) ? node.specials.plugins : [];
      if (!plugins.some((p: any) => p?.name === "store_show_extra_info")) {
        node.specials = { ...(node.specials || {}), plugins: [...plugins, { name: "store_show_extra_info" }] };
        fixed.push(`${who()}: added plugin store_show_extra_info (its custom-layout renders only with it)`);
      }
    }

    // 7a. values outside the format real pages use, with one answer (8 → "8px" for fontSize,
    //     "8px 8px 8px 8px" for borderRadius, "24px" → 24 for a number-only key…)
    if (typeof node.type === "string")
      for (const l of layersOf(node))
        for (const where of ["style", "config"] as const) {
          const obj = node[l]?.[where];
          if (!obj || typeof obj !== "object") continue;
          for (const [k, v] of Object.entries(obj)) {
            if (where === "config" && (GENERIC_CONFIG.has(k) || !(schema?.config && k in schema.config))) continue;
            const f = valueFormat(node.type, `${where}.${k}`);
            let to = f ? coerceToFormat(f, v) : undefined;
            // lineHeight "20px" with fontSize "16px" → 1.25: real pages store the multiplier (the
            // renderer prints it raw), and it is the same line box.
            if (k === "lineHeight" && to === undefined && f?.accept.includes("number") && !f.accept.includes("px") && /^\d+(\.\d+)?px$/.test(String(v)) && /^\d+(\.\d+)?px$/.test(String(obj.fontSize)))
              to = Math.round((parseFloat(v as string) / parseFloat(obj.fontSize)) * 100) / 100;
            if (to === undefined) continue;
            obj[k] = to;
            fixed.push(`${who()} ${l}.${where}.${k}: ${JSON.stringify(v)} → ${JSON.stringify(to)} (the format real pages use)`);
          }
        }

    // 7b. layout values with one answer: "16px" gap → 16; a stale editor lock → the node's own cell
    for (const l of layersOf(node)) {
      const cfg = node[l]?.config;
      if (!cfg || typeof cfg !== "object") continue;
      for (const k of ["columnGap", "rowGap"])
        if (typeof cfg[k] === "string" && /^\d+(\.\d+)?(px)?$/.test(cfg[k].trim())) {
          fixed.push(`${who()} ${l}.config.${k}: "${cfg[k]}" → ${parseFloat(cfg[k])}`);
          cfg[k] = parseFloat(cfg[k]);
        }
      const lk = cfg.lockCellGrid;
      if (lk && typeof lk === "object" && Number.isInteger(cfg.columnStart) && ["columnStart", "columnEnd", "rowStart", "rowEnd"].some((k) => lk[k] !== cfg[k])) {
        cfg.lockCellGrid = { columnStart: cfg.columnStart, columnEnd: cfg.columnEnd, rowStart: cfg.rowStart, rowEnd: cfg.rowEnd };
        fixed.push(`${who()} ${l}.config.lockCellGrid → its own cell (the editor drags by it)`);
      }
    }

    // 8. grid boxes: columns/rows every layer can render, and a grid string the editor agrees with
    if (GRID_TYPES.has(node.type)) {
      const kids = (Array.isArray(node.children) ? node.children : []).filter((c: any) => c && typeof c === "object");
      const bps = layersOf(node).filter((l) => l !== "runtime");
      if (!bps.length && node.type !== "section" && !hasTracks(node.runtime?.config)) {
        // Built with children but no layout (buildElement(type, { children })): stack them, as
        // buildFromSpec does. Placed children keep their cells; the grid is sized around them.
        if (kids.length && kids.every((c: any) => c.runtime?.config?.rowStart == null)) stackChildren(node, kids);
        else fillTracks((node.runtime ||= {}), kids.map((c: any) => c.runtime?.config), true);
        fixed.push(`${who()}: no grid columns/rows → ${node.runtime.config.grid} (an empty grid-template piles the children up)`);
      }
      for (const l of bps)
        if (!hasTracks(node[l].config)) {
          fillTracks(node[l], kids.map((c: any) => c[l]?.config), false);
          fixed.push(`${who()} ${l}: no grid columns/rows → ${node[l].config.grid}`);
        }
      for (const l of layersOf(node)) {
        const cfg = node[l].config;
        if (!cfg || !Array.isArray(cfg.columns) || !Array.isArray(cfg.rows)) continue;
        // The builder keeps rows as min/max (Grid.vue's drag reads row.min): px/% → minmax(N, N),
        // auto/max-c → its content row. Same render, and the editor can resize them.
        const rows = cfg.rows.map(toEditorRow);
        const changed = rows.filter((r: any, i: number) => r !== cfg.rows[i]).length;
        if (changed) fixed.push(`${who()} ${l}.config.rows: ${changed} row(s) → builder min/max rows (the editor's row drag reads row.min)`);
        cfg.rows = rows;
        for (const tr of [...cfg.columns, ...cfg.rows.flatMap((r: any) => [r, r?.min, r?.max])])
          if (tr?.unit === "px" && tr.absValue == null && Number.isFinite(Number(tr.value))) {
            tr.absValue = Number(tr.value);
            fixed.push(`${who()} ${l}: px track value → absValue (the renderer prints absValue)`);
          }
        const want = `${cfg.columns.length}x${cfg.rows.length}`;
        if (cfg.columns.length && cfg.rows.length && cfg.grid !== want) {
          fixed.push(`${who()} ${l}.config.grid "${cfg.grid ?? ""}" → "${want}" (the editor draws its cells from it)`);
          cfg.grid = want;
        }
        // 9. padding on a saved grid box: the storefront prints it, the editor ignores it → spacer
        //    tracks. Unsaved (runtime) nodes are converted by finalizeForRender, after the rows exist.
        if (l !== "runtime" && padToTracks(node, l)) fixed.push(`${who()} ${l}.style.padding → spacer columns/rows (the editor ignores padding on a ${node.type})`);
      }
    }

    // 7. events: invented action names / field names with one meaning
    for (const ev of Array.isArray(node.events) ? node.events : []) {
      if (!ev || typeof ev !== "object") continue;
      if (!ev.eventName && typeof ev.trigger === "string") ev.eventName = ev.trigger;
      const a = typeof ev.action === "string" ? ACTION_ALIAS[ev.action.toLowerCase()] : undefined;
      const map = a ? a.fields : ev.action === "open_link" ? LINK_FIELDS : undefined;
      if (a) {
        fixed.push(`${who()}: event action "${ev.action}" → "${a.action}"`);
        ev.action = a.action;
      }
      for (const [from, to] of Object.entries(map || {}))
        if (ev[from] != null && ev[to] == null) {
          ev[to] = ev[from];
          delete ev[from];
          fixed.push(`${who()}: event field "${from}" → "${to}"`);
        }
      if (ev.action === "open_link" && ev.link_target && !ev.link_target_url) ev.link_target_url = "_self";
    }
    return true;

    function retype(obj: any, specs: Record<string, any>, where: string) {
      for (const [k, v] of Object.entries(obj)) {
        const types: string[] | undefined = specs[k]?.types;
        if (typeof v !== "string" || !types || types.includes("string")) continue;
        if (types.includes("boolean") && /^(true|false)$/i.test(v)) {
          obj[k] = v.toLowerCase() === "true";
          fixed.push(`${who()} ${where}.${k}: "${v}" → ${obj[k]}`);
        } else if (types.includes("number") && /^-?\d+(\.\d+)?$/.test(v.trim())) {
          obj[k] = Number(v);
          fixed.push(`${who()} ${where}.${k}: "${v}" → ${obj[k]}`);
        }
      }
    }
  });
  return fixed;
}

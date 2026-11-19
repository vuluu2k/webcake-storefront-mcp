// Per-element schema + the checks validate_page runs against it, and the one format every
// validation message uses.
//
// The key surface of each type is the union of what is known to be real, nothing invented:
//   - keys mined from 329 published pages (element-keys.generated.json),
//   - the curated tables in attributes.ts (meanings, enums like "h1|h2|…|p"),
//   - the factory skeleton (also the source of each key's value TYPE),
//   - the generic grid config + shared specials every node may carry,
//   - the published-page renderer (renderer-keys.generated.json, scripts/mine-renderer.mjs):
//     which keys each type's HTML/CSS builder READS, their fallback default, compared values,
//   - the editor panels (editor-keys.generated.json, scripts/mine-editor.mjs): the label the
//     user sees, the control, the options a select offers.
// The renderer ignores a specials/config key it doesn't know (a dead key), so an unknown key is
// a WARNING with a did-you-mean. Style is different: the renderer emits every style key as CSS
// (camelCase → kebab), so style keys are checked as CSS properties, not per type.
import { OBSERVED, ELEMENT_ATTRS, SHARED_SPECIALS, SHARED_KEY_DICT, GENERIC_CONFIG } from "./attributes.js";
import { buildElement, describeType, isKnownType, ELEMENT_TYPES } from "./catalog.js";
import { readFileSync } from "node:fs";

const loadJson = (name: string): any => {
  try {
    return JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
  } catch {
    return {};
  }
};
type Bucket = "specials" | "config";
interface RendererKey { default?: unknown; values?: string[] }
interface EditorKey { label?: string; control?: string; options?: string[] }
const RENDERER: { mentioned?: string[]; dispatched?: string[]; event_actions?: string[]; img_hosts?: string[]; shared?: Record<Bucket, Record<string, RendererKey>>; types?: Record<string, Record<Bucket, Record<string, RendererKey>>> } = loadJson("./renderer-keys.generated.json");
const MENTIONED = new Set<string>(RENDERER.mentioned || []);
/** Types the published renderer has a branch for. A type outside it renders nothing. */
const RENDERED_TYPES = new Set<string>(RENDERER.dispatched || []);
/** Event actions the published page runs (events.js cases + names common.ex compares). */
export const RENDERER_EVENT_ACTIONS = new Set<string>(RENDERER.event_actions || []);
/** Binding targets / datasets real pages use (the binding catalog misses some). */
export const OBSERVED_BINDINGS = new Set<string>(Object.values(OBSERVED).flatMap((o) => o.bindings || []));

// Image hosts the storefront's Content-Security-Policy lets load (img-src). Anything else shows
// as a broken image on the published page.
const IMG_HOSTS = (RENDERER.img_hosts || []).filter((h) => /^https:\/\//.test(h)).map((h) => h.replace(/^https:\/\//, ""));
/** "" when the URL may load on a published page; otherwise its host. Relative/data/blob are fine. */
export function blockedImageHost(url: unknown): string {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim()) || !IMG_HOSTS.length) return "";
  let host = "";
  try {
    host = new URL(url.trim()).hostname;
  } catch {
    return "";
  }
  const ok = IMG_HOSTS.some((h) => (h.startsWith("*.") ? host.endsWith(h.slice(1)) || host === h.slice(2) : host === h));
  return ok ? "" : host;
}
const EDITOR: { types?: Record<string, Record<Bucket, Record<string, EditorKey>>> } = loadJson("./editor-keys.generated.json");

// ── Findings: one shape, one string format ──────────────────────────────────────────────
export type Severity = "error" | "warning";
export interface Finding {
  code: string;
  severity: Severity;
  id?: string;
  type?: string;
  /** Where on the node: specials.text, bp2.style.fontSize, children[1]… */
  at?: string;
  message: string;
  fix?: string;
}

/** `[CODE] #id (type) at: message → fix` — stable code first so an agent can act per code. */
export function formatFinding(f: Finding): string {
  const who = f.id ? ` #${f.id}${f.type ? ` (${f.type})` : ""}` : f.type ? ` (${f.type})` : "";
  return `[${f.code}]${who}${f.at ? ` ${f.at}:` : ""} ${f.message}${f.fix ? ` → ${f.fix}` : ""}`;
}

/** Code of a formatted message (or the fallback for older free-text ones). */
export const codeOf = (msg: string, fallback = "OTHER") => /^\[([A-Z_]+)\]/.exec(msg)?.[1] ?? fallback;

/** Prefix a free-text message from an older checker with its code, once. */
export const withCode = (code: string, msg: string) => (/^\[[A-Z_]+\]/.test(msg) ? msg : `[${code}] ${msg}`);

// ── Schema ──────────────────────────────────────────────────────────────────────────────
export type KeyType = "string" | "number" | "boolean" | "array" | "object";
export interface KeySpec {
  /** Value types the element is known to read (real pages ∪ factory default). */
  types?: KeyType[];
  /** Allowed values, enforced: the curated list ∪ values seen on real pages. */
  enum?: string[];
  /** Values seen on real pages (informative when there is no curated list). */
  seen?: string[];
  desc?: string;
  /** Label of the editor control that sets it. */
  label?: string;
  /** What the renderer falls back to when the key is absent. */
  default?: unknown;
  /** Values the editor offers / the renderer branches on (informative unless in enum). */
  values?: string[];
  /** true: the published-page renderer reads it for this type; false: stored only (no effect). */
  rendered?: boolean;
}
export interface ElementSchema {
  type: string;
  category: string;
  container: boolean;
  summary: string;
  /** Must sit inside one of these (only rules known to hold). */
  parents?: string[];
  specials: Record<string, KeySpec>;
  config: Record<string, KeySpec>;
  style: string;
  events: boolean;
  bindings?: string[];
}

/** Where a node must sit to work. Kept to rules the renderer actually depends on. */
export const FORM_FIELDS = new Set(["input", "email", "phone-number", "text-area", "select", "address", "password"]);
/** Where a node must sit, from real pages: a type seen ≥50 times whose parents (≤3, none of them a
 *  generic section/container) cover ≥99.5% of its uses — menu-item ⊂ menu, product-overlay ⊂
 *  grid-product|slider-product, submit-button ⊂ form… Form fields are left to OUTSIDE_FORM. */
const GENERIC_PARENTS = new Set(["(page)", "section", "container"]);
const PARENTS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [type, o] of Object.entries(OBSERVED)) {
    const ps = Object.entries(o.parents || {}).sort((a, b) => b[1] - a[1]);
    const total = ps.reduce((n, [, c]) => n + c, 0);
    if (total < 50 || FORM_FIELDS.has(type) || type === "submit-button") continue; // OUTSIDE_FORM covers these
    const allow: string[] = [];
    let acc = 0;
    for (const [p, c] of ps) {
      allow.push(p);
      acc += c;
      if (acc / total >= 0.995) break;
    }
    if (allow.length <= 3 && !allow.some((p) => GENERIC_PARENTS.has(p))) out[type] = allow;
  }
  // The editor also nests slides in a carousel.
  out.slide = [...new Set([...(out.slide || ["swiper"]), "carousel"])];
  return out;
})();

// "Semantic tag: h1|h2|h3." / "on|off." → an enum. Lists with an ellipsis are open-ended.
const ENUM_RE = /^(?:[^:|]*:\s*)?((?:[\w-]+)(?:\s*\|\s*[\w-]+)+)\.?$/;
const enumOf = (desc?: string) => {
  if (!desc || /…|\.\.\./.test(desc)) return undefined;
  const m = ENUM_RE.exec(desc.trim());
  return m ? m[1].split("|").map((s) => s.trim()) : undefined;
};
const typeOf = (v: any): KeyType | undefined =>
  v === null || v === undefined ? undefined : Array.isArray(v) ? "array" : (typeof v as KeyType);

const cache = new Map<string, ElementSchema>();

/** Every specials / config key any element is known to carry. A key outside these is invented
 *  or misspelled; a key that exists on another element is left alone (the mined per-type lists
 *  are a sample, so "not seen on THIS type" is too weak to warn about). */
const ANY_SPECIALS = new Set<string>([...Object.keys(SHARED_SPECIALS), ...Object.keys(SHARED_KEY_DICT)]);
const ANY_CONFIG = new Set<string>(GENERIC_CONFIG);
for (const o of Object.values(OBSERVED)) {
  o.specials.forEach((k) => ANY_SPECIALS.add(k));
  o.config.forEach((k) => ANY_CONFIG.add(k));
}
for (const a of Object.values(ELEMENT_ATTRS)) {
  Object.keys(a.specials || {}).forEach((k) => ANY_SPECIALS.add(k));
  Object.keys(a.config || {}).forEach((k) => ANY_CONFIG.add(k));
}
for (const src of [RENDERER.shared, ...Object.values(RENDERER.types || {}), ...Object.values(EDITOR.types || {})]) {
  Object.keys(src?.specials || {}).forEach((k) => ANY_SPECIALS.add(k));
  Object.keys(src?.config || {}).forEach((k) => ANY_CONFIG.add(k));
}
const KEY_TYPES = new Set<string>(["string", "number", "boolean", "array", "object"]);

export function elementSchema(type: string): ElementSchema | undefined {
  if (!isKnownType(type)) return undefined;
  const hit = cache.get(type);
  if (hit) return hit;
  const skeleton: any = buildElement(type, {});
  const obs = OBSERVED[type] || { specials: [], config: [], style: [], bindings: [], events: false };
  const cur = ELEMENT_ATTRS[type] || {};
  const rend = RENDERER.types?.[type];
  const edit = EDITOR.types?.[type];
  const bucket = (where: Bucket, keys: Iterable<string>, defaults: any, curated: Record<string, string> | undefined, shared: Record<string, string>) => {
    const out: Record<string, KeySpec> = {};
    const r = rend?.[where] || {};
    const rs = RENDERER.shared?.[where] || {};
    const e = edit?.[where] || {};
    for (const k of [...new Set([...keys, ...Object.keys(r), ...Object.keys(e)])].sort()) {
      const desc = curated?.[k] ?? shared[k] ?? SHARED_KEY_DICT[k];
      const spec: KeySpec = {};
      const rk = r[k] ?? rs[k];
      const ek = e[k];
      const types = new Set((obs.types?.[`${where}.${k}`] || []).filter((t) => KEY_TYPES.has(t)) as KeyType[]);
      const t = typeOf(defaults?.[k]) ?? typeOf(rk?.default);
      if (t) types.add(t);
      if (types.size) spec.types = [...types].sort();
      const seen = obs.values?.[`${where}.${k}`];
      const curatedEnum = enumOf(curated?.[k]);
      // Numeric editor options next to word values (renderer/real pages) come from another panel.
      const words = [...(rk?.values || []), ...(seen || [])].some((v) => !/^\d+$/.test(v));
      const opts = (ek?.options || []).filter((o) => !(words && /^\d+$/.test(o)));
      const offered = [...new Set([...opts, ...(rk?.values || [])])];
      // Enforced only when both the editor's list and real pages agree it is closed.
      if (curatedEnum && seen) spec.enum = [...new Set([...curatedEnum, ...seen])];
      else if (opts.length && seen?.length && seen.every((v) => opts.includes(v))) spec.enum = [...new Set([...opts, ...(rk?.values || [])])];
      else if (seen) spec.seen = seen;
      if (!spec.enum && offered.length) spec.values = offered;
      if (desc) spec.desc = desc;
      if (ek?.label) spec.label = ek.label;
      if (rk?.default !== undefined) spec.default = rk.default;
      // Grid/position config and shared specials are read by generic plumbing — no per-type flag.
      // false only when nothing on the render side (Elixir or client JS) mentions the key at all.
      if (rend && !(where === "config" ? GENERIC_CONFIG.has(k) : k in SHARED_SPECIALS)) {
        if (rk) spec.rendered = true;
        else if (!MENTIONED.has(k)) spec.rendered = false;
      }
      out[k] = spec;
    }
    return out;
  };
  const sk = skeleton.specials || {};
  const sc = skeleton.runtime?.config || {};
  const schema: ElementSchema = {
    ...describeType(type),
    ...(PARENTS[type] ? { parents: PARENTS[type] } : {}),
    specials: bucket(
      "specials",
      new Set([...obs.specials, ...Object.keys(cur.specials || {}), ...Object.keys(sk), ...Object.keys(SHARED_SPECIALS)]),
      sk, cur.specials, SHARED_SPECIALS
    ),
    config: bucket("config", new Set([...obs.config, ...Object.keys(cur.config || {}), ...Object.keys(sc), ...GENERIC_CONFIG]), sc, cur.config, {}),
    style: "Any CSS property in camelCase (fontSize, backgroundColor…); emitted as CSS.",
    events: !!obs.events || (!!cur.events && cur.events !== "none"),
    ...((cur.bindings?.length || obs.bindings?.length) ? { bindings: cur.bindings?.length ? cur.bindings : obs.bindings } : {}),
  };
  cache.set(type, schema);
  return schema;
}

// ── CSS property names (style keys) ─────────────────────────────────────────────────────
// Mined style keys + standard CSS properties, camelCase. ponytail: a fixed list; add a
// property here if a real one gets flagged.
export const CSS_PROPS = new Set(
  `alignContent alignItems alignSelf animation animationDelay animationDuration animationName aspectRatio
backdropFilter backfaceVisibility background backgroundAttachment backgroundBlendMode backgroundClip backgroundColor
backgroundImage backgroundOrigin backgroundPosition backgroundRepeat backgroundSize border borderBottom borderBottomColor
borderBottomLeftRadius borderBottomRightRadius borderBottomStyle borderBottomWidth borderColor borderLeft borderLeftColor
borderLeftStyle borderLeftWidth borderRadius borderRight borderRightColor borderRightStyle borderRightWidth borderSpacing
borderStyle borderTop borderTopColor borderTopLeftRadius borderTopRightRadius borderTopStyle borderTopWidth borderWidth
bottom boxShadow boxSizing clear clipPath color columnGap columns content cursor direction display fill filter flex
flexBasis flexDirection flexGrow flexShrink flexWrap float font fontFamily fontSize fontStyle fontVariant fontWeight gap
grid gridArea gridColumn gridColumnEnd gridColumnStart gridRow gridRowEnd gridRowStart gridTemplateAreas
gridTemplateColumns gridTemplateRows height inset isolation justifyContent justifyItems justifySelf left letterSpacing
lineHeight listStyle listStyleType margin marginBottom marginLeft marginRight marginTop mask maskImage maxHeight maxWidth
minHeight minWidth mixBlendMode objectFit objectPosition opacity order outline outlineColor outlineOffset outlineStyle
outlineWidth overflow overflowWrap overflowX overflowY padding paddingBottom paddingLeft paddingRight paddingTop
perspective placeItems placeSelf pointerEvents position right rotate rowGap scale stroke strokeWidth tableLayout textAlign
textDecoration textDecorationColor textIndent textOverflow textShadow textTransform top transform transformOrigin
transition transitionDelay transitionDuration transitionProperty translate userSelect verticalAlign visibility
webkitBackgroundClip webkitLineClamp webkitTextFillColor webkitTextStroke whiteSpace width wordBreak wordSpacing
writingMode zIndex WebkitBackgroundClip WebkitLineClamp WebkitTextFillColor WebkitBoxOrient`
    .split(/\s+/)
    .concat(Object.values(OBSERVED).flatMap((o) => o.style))
);

// ── Checks ──────────────────────────────────────────────────────────────────────────────
const norm = (k: string) => k.toLowerCase().replace(/[-_]/g, "");
function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
/** Closest known key: same letters ignoring case/-/_, else edit distance ≤ 2. */
export function didYouMean(key: string, known: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestD = 3;
  const nk = norm(key);
  for (const k of known) {
    if (norm(k) === nk) return k;
    const d = lev(key, k);
    if (key.length < 4 && d > 1) continue;
    if (d < bestD) [best, bestD] = [k, d];
  }
  return best;
}
const kebabToCamel = (k: string) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const NOISE = new Set(["undefined", "locked", "loaded", "isChangeSection"]);
/** Keys an agent invents from HTML habits → where the element really keeps that. */
const INVENTED: Record<string, string> = {
  content: "put the text/HTML in specials.text",
  html: "put the text/HTML in specials.text",
  label: "put the label in specials.text",
  innerText: "put the text in specials.text",
  href: 'links are events: events:[{ trigger:"click", action:"open_link", link_target_url:"…" }] (see list_events)',
  url: 'links are events: events:[{ trigger:"click", action:"open_link", link_target_url:"…" }] (see list_events)',
  onClick: "interactions are events[] (see list_events)",
  image: "put the hosted URL in specials.src / runtime.config.src",
};

function checkValue(spec: KeySpec | undefined, v: any, f: Omit<Finding, "message" | "code" | "severity">, out: Finding[]) {
  if (!spec || v === null || v === undefined || v === "") return;
  const got = typeOf(v)!;
  if (spec.types && !spec.types.includes(got)) {
    const asBool = spec.types.includes("boolean") && got === "string" && /^(true|false)$/i.test(v);
    out.push({
      ...f, code: "TYPE_MISMATCH", severity: "warning",
      message: `${got} value, the element reads ${spec.types.join("|")}`,
      fix: asBool ? `use ${String(v).toLowerCase()} (boolean)` : undefined,
    });
  }
  if (spec.enum && typeof v === "string" && !spec.enum.includes(v)) {
    const guess = didYouMean(v, spec.enum);
    out.push({ ...f, code: "BAD_VALUE", severity: "error", message: `"${v}" is not one of ${spec.enum.join("|")} — the renderer falls back to its default`, fix: guess ? `use "${guess}"` : `pick one of ${spec.enum.join("|")}` });
  }
}

/** Unknown / mistyped specials, config and style keys of one node, per layer it carries. */
export function checkElementKeys(node: any): Finding[] {
  const out: Finding[] = [];
  const schema = node && typeof node.type === "string" ? elementSchema(node.type) : undefined;
  if (!schema) return out;
  const base = { id: node.id, type: node.type };
  if (RENDERED_TYPES.size && !RENDERED_TYPES.has(node.type))
    out.push({ ...base, code: "NOT_RENDERED", severity: "error", message: `the published renderer has no branch for "${node.type}" — it renders nothing`, fix: `use another element (see relations in get_element("${node.type}"))` });
  const specialsKeys = Object.keys(schema.specials);
  const configKeys = Object.keys(schema.config);

  const keysIn = (obj: any, where: string, specs: Record<string, KeySpec>, known: string[], other?: { name: string; specs: Record<string, KeySpec> }) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const [k, v] of Object.entries(obj)) {
      if (NOISE.has(k) || k.startsWith("__")) continue; // __row/__cell: layout markers finalizeForRender consumes
      const at = `${where}.${k}`;
      if (k in specs) {
        checkValue(specs[k], v, { ...base, at }, out);
        if (specs[k].rendered === false && v !== undefined && v !== null && v !== "")
          out.push({ ...base, at, code: "NO_EFFECT", severity: "warning", message: `no render code reads ${where.split(".").pop()}.${k} — stored, changes nothing on the published page`, fix: `drop it; see keys in get_element("${node.type}")` });
        continue;
      }
      // A CSS property in config that THIS type doesn't read there is a style meant for runtime.style.
      if (where.endsWith("config") && CSS_PROPS.has(k) && !GENERIC_CONFIG.has(k)) {
        out.push({ ...base, at, code: "UNKNOWN_KEY", severity: "warning", message: `belongs in style: "${k}" is CSS and ${node.type} doesn't read it from config`, fix: "move it to style (saves do this for you)" });
        continue;
      }
      const anywhere = where === "specials" ? ANY_SPECIALS : ANY_CONFIG;
      if (anywhere.has(k)) continue; // real key (seen on another element) — not a typo
      const wrongPlace = other && k in other.specs ? other.name : CSS_PROPS.has(k) && where.endsWith("config") ? "style" : undefined;
      const guess = wrongPlace || INVENTED[k] ? undefined : didYouMean(k, known) ?? didYouMean(k, anywhere);
      out.push({
        ...base, at, code: "UNKNOWN_KEY", severity: "warning",
        message: wrongPlace ? `belongs in ${wrongPlace}, not ${where.split(".").pop()}` : `no element has a ${where.split(".").pop()} key "${k}" — the renderer ignores it`,
        fix: wrongPlace ? `move it to ${wrongPlace}` : INVENTED[k] ?? (guess ? `did you mean "${guess}"?` : `see get_element("${node.type}")`),
      });
    }
  };
  const styleIn = (obj: any, where: string) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const k of Object.keys(obj)) {
      if (CSS_PROPS.has(k) || NOISE.has(k)) continue;
      const at = `${where}.${k}`;
      if (k.includes("-") && CSS_PROPS.has(kebabToCamel(k)))
        out.push({ ...base, at, code: "STYLE_KEY", severity: "warning", message: "kebab-case style key: element-specific CSS reads camelCase", fix: `rename to "${kebabToCamel(k)}"` });
      else if (k in schema.config)
        out.push({ ...base, at, code: "UNKNOWN_KEY", severity: "warning", message: "belongs in config, not style", fix: "move it to config" });
      else {
        const guess = didYouMean(k, CSS_PROPS);
        out.push({ ...base, at, code: "STYLE_KEY", severity: "warning", message: `"${k}" is not a CSS property`, fix: guess ? `did you mean "${guess}"?` : undefined });
      }
    }
  };

  keysIn(node.specials, "specials", schema.specials, specialsKeys, { name: "config", specs: schema.config });
  for (const layer of Object.keys(node).filter((k) => k === "runtime" || /^bp\d+$/.test(k))) {
    const l = node[layer];
    if (!l || typeof l !== "object") continue;
    keysIn(l.config, `${layer}.config`, schema.config, configKeys, { name: "specials", specs: schema.specials });
    styleIn(l.style, `${layer}.style`);
  }
  return out;
}

/** An element that must sit inside a given parent type but doesn't. */
export function checkParent(node: any, ancestors: string[]): Finding | undefined {
  const need = PARENTS[node?.type];
  if (!need || need.includes(ancestors[ancestors.length - 1])) return undefined;
  return { code: "BAD_PARENT", severity: "warning", id: node.id, type: node.type, message: `must be a direct child of ${need.join(" or ")} — it won't render here`, fix: `move it into a ${need[0]}` };
}

/** The value rules of one element, compact for get_element: enums, seen values and non-string
 *  types — the part of the schema the attribute descriptions don't already say. */
export function valueRules(type: string): Record<string, string> | undefined {
  const schema = elementSchema(type);
  if (!schema) return undefined;
  const out: Record<string, string> = {};
  for (const where of ["specials", "config"] as const)
    for (const [k, spec] of Object.entries(schema[where])) {
      if (where === "config" && GENERIC_CONFIG.has(k)) continue; // grid/position: same on every element
      const parts: string[] = [];
      if (spec.enum) parts.push(`one of ${spec.enum.join("|")}`);
      else if (spec.seen) parts.push(`seen ${spec.seen.join("|")}`);
      if (spec.types && !(spec.types.length === 1 && spec.types[0] === "string")) parts.push(spec.types.join("|"));
      if (parts.length) out[`${where}.${k}`] = parts.join("; ");
    }
  return Object.keys(out).length ? out : undefined;
}

// Render-context facts no static read can see: found by rendering real output.
const CURATED_RELATIONS: Record<string, string[]> = {
  form: [
    "specials.type decides who sees it: subscribe = contact/lead/newsletter; form_order = checkout (also the default when unset); customer_data renders ONLY for a logged-in customer (hidden for visitors).",
  ],
  text: ["Links inside specials.text are forced blue + underlined (.ql-editor a { … !important }). A menu/footer link that must keep its colour = a text with an open_link click event, not an <a>."],
  collapse: ["Renders <details>: the title is specials.name, the body goes in ONE collapse-content child (a grid container)."],
  section: ["style.background is written as-is on the section's background layer: a colour, a gradient, or url(…) with background-size / background-position-x|y / background-repeat."],
};
const CONTEXT_TEXT: Record<string, { provides?: string; reads?: string }> = {
  form_element: { provides: "styles the fields inside it: their frame/background come from THIS form's style + config.backgroundInput (a field's own frame is ignored)" },
  product: { provides: "sets the current product for its items (product::… bindings, product-overlay, rating, flash-sale)", reads: "needs a current product: put it in a grid-product/slider-product card or on a product page" },
  product_countdown: { provides: "lets a countdown inside count this product's promotion", reads: "inside a product card it counts that product's promotion" },
  product_promotions_override: { reads: "can follow a promotion override set by the product page" },
};
const pctList = (o: Record<string, number> = {}, top = 4) => {
  const all = Object.entries(o).sort((a, b) => b[1] - a[1]);
  const total = all.reduce((n, [, c]) => n + c, 0) || 1;
  return all.slice(0, top).map(([k, c]) => `${k} ${Math.round((c / total) * 100)}%`).join(", ");
};

/** How a type relates to others: where it sits / what it holds on real pages, which render
 *  context it takes from or gives to its neighbours, and the hard rules. For get_element. */
export function relationsOf(type: string): string[] | undefined {
  if (!isKnownType(type)) return undefined;
  const o = OBSERVED[type];
  const r: any = (RENDERER.types as any)?.[type]?.relations || {};
  const out: string[] = [];
  if (RENDERED_TYPES.size && !RENDERED_TYPES.has(type)) out.push("NOT RENDERED: the published renderer has no branch for this type — don't use it.");
  if (PARENTS[type]) out.push(`Must sit directly in ${PARENTS[type].join(" or ")} (real pages: ${pctList(o?.parents)}).`);
  else if (o?.parents) out.push(`Sits in: ${pctList(o.parents)} (real pages).`);
  if (o?.children) out.push(`Holds: ${pctList(o.children, 6)} (real pages).`);
  for (const p of r.parent || []) {
    if (p.startsWith("form.")) {
      if (!out.some((l) => l.startsWith("Look comes from"))) out.push("Look comes from the enclosing FORM: set border/radius/colour/font size on the form's style and the field background on its config.backgroundInput.");
    } else if (p === "parent.style" || p === "parent.config") {
      if (!out.some((l) => l.startsWith("Reads its parent"))) out.push("Reads its parent's style/config (the group it belongs to) when it renders.");
    } else out.push(`Reads its parent's ${p.replace(/^parent\./, "")}.`);
  }
  for (const k of r.provides || []) if (CONTEXT_TEXT[k]?.provides) out.push(`Gives context: ${CONTEXT_TEXT[k].provides}.`);
  for (const k of r.reads || []) if (CONTEXT_TEXT[k]?.reads) out.push(`Takes context: ${CONTEXT_TEXT[k].reads}.`);
  out.push(...(CURATED_RELATIONS[type] || []));
  return out.length ? out : undefined;
}

/** One line per meaningful key of a type — what get_element shows an agent:
 *  `key: meaning · type · one of a|b · default x`. Keys the renderer reads come first; keys no
 *  render code mentions go to no_effect (stored, change nothing on the published page). */
export function keyReference(type: string) {
  const schema = elementSchema(type);
  if (!schema) return undefined;
  const fmt = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : String(v));
  const out: { specials: string[]; config: string[]; no_effect?: string[] } = { specials: [], config: [] };
  const dead: string[] = [];
  for (const where of ["specials", "config"] as const) {
    const rows = Object.entries(schema[where]).filter(
      ([k]) => !NOISE.has(k) && !(where === "config" ? GENERIC_CONFIG.has(k) : k in SHARED_SPECIALS)
    );
    rows.sort(([, a], [, b]) => Number(!!b.rendered) - Number(!!a.rendered));
    for (const [k, s] of rows) {
      if (s.rendered === false) {
        dead.push(`${where}.${k}`);
        continue;
      }
      const parts: string[] = [];
      const meaning = s.desc ?? (s.label ? `"${s.label}"` : undefined);
      if (meaning) parts.push(meaning);
      if (s.types && !(s.types.length === 1 && s.types[0] === "string" && (s.enum || s.values))) parts.push(s.types.join("|"));
      if (s.enum) parts.push(`one of ${s.enum.join("|")}`);
      else if (s.values || s.seen) parts.push(`e.g. ${[...new Set([...(s.values || []), ...(s.seen || [])])].slice(0, 12).join("|")}`);
      if (s.default !== undefined && s.default !== "") parts.push(`default ${fmt(s.default)}`);
      out[where].push(parts.length ? `${k}: ${parts.join(" · ")}` : k);
    }
  }
  out.config = groupPlain(out.config);
  if (dead.length) out.no_effect = dead;
  return out;
}

/** Style config of one part (addToCartColor, addToCartFontSize…) folded into one line per part:
 *  `addToCart{Color,FontSize,…}: style of the addToCart part` (defaults kept inline). */
const STYLE_SUFFIX = /(Background(?:Hover)?|Border(?:Color|Radius|Width|Style)?|BoxShadow|Color(?:Hover)?|Decoration|Font(?:Size|Style|Weight|Theme|Family)?|TextAlign|LetterSpacing|LineHeight|Padding[XY]?|Margin[XY]?|Radius|Width|Height|Size|Gap|Opacity|Shadow)$/;
function groupPlain(lines: string[]): string[] {
  const parse = (l: string) => {
    const i = l.indexOf(":");
    const k = i < 0 ? l : l.slice(0, i);
    const m = STYLE_SUFFIX.exec(k);
    const enumish = / · (one of|e\.g\.) /.test(l);
    const dflt = / · default (.+)$/.exec(l)?.[1];
    return { k, part: m && m.index > 1 && !enumish ? k.slice(0, m.index) : undefined, suffix: m?.[1], dflt };
  };
  const rows = lines.map((l) => ({ l, ...parse(l) }));
  const count = new Map<string, number>();
  for (const r of rows) if (r.part) count.set(r.part, (count.get(r.part) || 0) + 1);
  const done = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (!r.part || count.get(r.part)! < 3) {
      out.push(r.l);
      continue;
    }
    if (done.has(r.part)) continue;
    done.add(r.part);
    const members = rows.filter((x) => x.part === r.part).map((x) => `${x.suffix}${x.dflt ? `=${x.dflt}` : ""}`);
    out.push(`${r.part}{${members.join(",")}}: style of the ${r.part} part`);
  }
  return out;
}

/** Did-you-mean for an unknown element type. */
export const suggestType = (type: string) => didYouMean(type, ELEMENT_TYPES);

/** Collapse repeated warnings per code: keep the first `keep`, then one line with the rest. */
export function collapseByCode(msgs: string[], keep = 5): string[] {
  const seen: Record<string, number> = {};
  const out: string[] = [];
  for (const m of msgs) {
    const c = codeOf(m);
    seen[c] = (seen[c] || 0) + 1;
    if (seen[c] <= keep) out.push(m);
  }
  for (const [c, n] of Object.entries(seen)) if (n > keep) out.push(`[${c}] …and ${n - keep} more of this kind (fix the ones above the same way)`);
  return out;
}

export function countByCode(msgs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of msgs) out[codeOf(m)] = (out[codeOf(m)] || 0) + 1;
  return out;
}

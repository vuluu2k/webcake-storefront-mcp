// Per-element schema + the checks validate_page runs against it, and the one format every
// validation message uses.
//
// The key surface of each type is the union of what is known to be real, nothing invented:
//   - keys mined from 329 published pages (element-keys.generated.json),
//   - the curated tables in attributes.ts (meanings, enums like "h1|h2|…|p"),
//   - the factory skeleton (also the source of each key's value TYPE),
//   - the generic grid config + shared specials every node may carry.
// The renderer ignores a specials/config key it doesn't know (a dead key), so an unknown key is
// a WARNING with a did-you-mean. Style is different: the renderer emits every style key as CSS
// (camelCase → kebab), so style keys are checked as CSS properties, not per type.
import { OBSERVED, ELEMENT_ATTRS, SHARED_SPECIALS, SHARED_KEY_DICT, GENERIC_CONFIG } from "./attributes.js";
import { buildElement, describeType, isKnownType, ELEMENT_TYPES } from "./catalog.js";

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
const PARENTS: Record<string, string[]> = {
  slide: ["swiper", "carousel"],
  "collapse-item": ["collapse"],
};
export const FORM_FIELDS = new Set(["input", "email", "phone-number", "text-area", "select", "address", "password"]);

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
const KEY_TYPES = new Set<string>(["string", "number", "boolean", "array", "object"]);

export function elementSchema(type: string): ElementSchema | undefined {
  if (!isKnownType(type)) return undefined;
  const hit = cache.get(type);
  if (hit) return hit;
  const skeleton: any = buildElement(type, {});
  const obs = OBSERVED[type] || { specials: [], config: [], style: [], bindings: [], events: false };
  const cur = ELEMENT_ATTRS[type] || {};
  const bucket = (where: "specials" | "config", keys: Iterable<string>, defaults: any, curated: Record<string, string> | undefined, shared: Record<string, string>) => {
    const out: Record<string, KeySpec> = {};
    for (const k of [...keys].sort()) {
      const desc = curated?.[k] ?? shared[k] ?? SHARED_KEY_DICT[k];
      const spec: KeySpec = {};
      const types = new Set((obs.types?.[`${where}.${k}`] || []).filter((t) => KEY_TYPES.has(t)) as KeyType[]);
      const t = typeOf(defaults?.[k]);
      if (t) types.add(t);
      if (types.size) spec.types = [...types].sort();
      const seen = obs.values?.[`${where}.${k}`];
      const curatedEnum = enumOf(curated?.[k]);
      // Enforced only when both the editor's list and real pages agree it is closed.
      if (curatedEnum && seen) spec.enum = [...new Set([...curatedEnum, ...seen])];
      else if (seen) spec.seen = seen;
      if (desc) spec.desc = desc;
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
const CSS_PROPS = new Set(
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
    out.push({ ...f, code: "BAD_VALUE", severity: "warning", message: `"${v}" is not one of ${spec.enum.join("|")}`, fix: guess ? `use "${guess}"` : undefined });
  }
}

/** Unknown / mistyped specials, config and style keys of one node, per layer it carries. */
export function checkElementKeys(node: any): Finding[] {
  const out: Finding[] = [];
  const schema = node && typeof node.type === "string" ? elementSchema(node.type) : undefined;
  if (!schema) return out;
  const base = { id: node.id, type: node.type };
  const specialsKeys = Object.keys(schema.specials);
  const configKeys = Object.keys(schema.config);

  const keysIn = (obj: any, where: string, specs: Record<string, KeySpec>, known: string[], other?: { name: string; specs: Record<string, KeySpec> }) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const [k, v] of Object.entries(obj)) {
      if (NOISE.has(k)) continue;
      const at = `${where}.${k}`;
      if (k in specs) {
        checkValue(specs[k], v, { ...base, at }, out);
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

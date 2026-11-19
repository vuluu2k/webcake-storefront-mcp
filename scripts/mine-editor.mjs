#!/usr/bin/env node
// Static read of the builderx_spa editor panels (src/components/editor/**): for every specials/
// config key an editor control writes, the label the user sees (i18n resolved, English first),
// the control (switch/select/number/color/text) and the options a select/radio offers. Only keys
// known to be real (mined pages ∪ renderer reads) are kept, so a stray string can't become a key.
// Writes src/builder/editor-keys.generated.json. Run: npm run mine-editor  (BUILDERX_SPA_DIR).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const SPA = path.resolve(process.env.BUILDERX_SPA_DIR || "../builderx_spa");
const EDITOR = path.join(SPA, "src/components/editor");
const OUT = path.resolve("src/builder/editor-keys.generated.json");
const mined = JSON.parse(fs.readFileSync("src/builder/element-keys.generated.json", "utf8"));
const renderer = JSON.parse(fs.readFileSync("src/builder/renderer-keys.generated.json", "utf8"));

// Known keys per bucket (any type) — the filter that keeps this honest.
const known = { specials: new Set(), config: new Set() };
for (const t of Object.values(mined)) for (const b of ["specials", "config"]) for (const k of t[b] || []) known[b].add(k);
for (const t of [renderer.shared, ...Object.values(renderer.types)]) for (const b of ["specials", "config"]) for (const k of Object.keys(t[b] || {})) known[b].add(k);

// i18n: en first, vi fallback.
const flat = (o, p = "", out = {}) => {
  for (const [k, v] of Object.entries(o || {})) typeof v === "object" && v ? flat(v, `${p}${k}.`, out) : (out[`${p}${k}`] = String(v));
  return out;
};
const loc = (l) => flat(JSON.parse(fs.readFileSync(path.join(SPA, `src/i18n/locales/${l}.json`), "utf8")));
const EN = loc("en");
const VI = loc("vi");
const tr = (k) => EN[k] || VI[k];

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith(".vue")) files.push(p);
  }
})(EDITOR);

const CONTROL = [
  [/switch|checkbox/i, "boolean"],
  [/number|slider|range/i, "number"],
  [/color|pickr|painter/i, "color"],
  [/select|radio|tabs|segment|dropdown|align/i, "select"],
  [/input|textarea|text-area|editor/i, "text"],
];
const controlOf = (tag) => CONTROL.find(([re]) => re.test(tag))?.[1];
const clean = (s) => s.replace(/\s+/g, " ").replace(/[:：]\s*$/, "").trim();

// The label nearest before `at` (or on the tag itself).
function labelBefore(tpl, at, ownAttrs) {
  const own = /:(?:label|title)="\$t\('([^']+)'\)"/.exec(ownAttrs) || /(?<![:\w])(?:label|title)="([^"{}$]{2,60})"/.exec(ownAttrs);
  if (own) return clean(own[0].includes("$t") ? tr(own[1]) || own[1] : own[1]);
  const win = tpl.slice(Math.max(0, at - 700), at);
  const cands = [];
  for (const m of win.matchAll(/\$t\(\s*['"]([\w.-]+)['"]/g)) cands.push([m.index, tr(m[1])]);
  for (const m of win.matchAll(/<(?:label|span|div)[^>]*>\s*([^<>{}\n]{2,50}?)\s*<\//g)) cands.push([m.index, m[1]]);
  for (const m of win.matchAll(/(?<![:\w])(?:label|title)="([^"{}$]{2,60})"/g)) cands.push([m.index, m[1]]);
  const best = cands.filter(([, v]) => v && !/^[\d\s%px.-]+$/.test(v)).sort((a, b) => b[0] - a[0])[0];
  return best ? clean(best[1]) : undefined;
}

// Values of an options array declared in the script: `name: [ { value: 'a' } ... ]` or `name() { return [...] }`.
function scriptOptions(script, name) {
  const m = new RegExp(String.raw`\b${name}\s*(?::|\(\)\s*\{[^\[]{0,80}?return|=)\s*\[`).exec(script);
  if (!m) return [];
  let depth = 0;
  let i = m.index + m[0].length - 1;
  const start = i;
  for (; i < script.length; i++) {
    if (script[i] === "[") depth++;
    else if (script[i] === "]" && --depth === 0) break;
  }
  const block = script.slice(start, i + 1);
  const vals = [...block.matchAll(/\b(?:value|key|id)\s*:\s*['"]([^'"]{1,40})['"]/g)].map((x) => x[1]);
  if (vals.length) return vals;
  return [...block.matchAll(/^\s*\[?\s*['"]([\w-]{1,40})['"]\s*,?\s*$/gm)].map((x) => x[1]);
}

const hits = []; // { file, bucket, key, label, control, options }

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const tpl = /<template>([\s\S]*)<\/template>/.exec(src)?.[1] || "";
  const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(src)?.[1] || "";
  // Every opening tag with its attributes (multi-line).
  for (const m of tpl.matchAll(/<([A-Za-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>/g)) {
    const [whole, tag, attrs] = m;
    const handlers = [...attrs.matchAll(/(?:@[\w:.-]+|v-model(?::\w+)?|:(?:value|checked|modelValue|color))="([^"]*)"/g)].map((x) => x[1]).join(" ");
    if (!handlers) continue;
    const found = [];
    // element.specials.foo / config.foo in bindings
    for (const r of handlers.matchAll(/\b(specials|config)\??\.([A-Za-z_]\w*)/g)) found.push([r[1], r[2]]);
    // 'foo' literals in handler calls
    for (const r of handlers.matchAll(/['`]([A-Za-z_][\w]*)['`]/g)) {
      const k = r[1];
      const hint = /special/i.test(handlers) ? "specials" : /config/i.test(handlers) ? "config" : null;
      if (hint && known[hint].has(k)) found.push([hint, k]);
      else if (!hint) for (const b of ["specials", "config"]) if (known[b].has(k)) found.push([b, k]);
    }
    if (!found.length) continue;
    const label = labelBefore(tpl, m.index, attrs);
    const control = controlOf(tag);
    let options = [];
    if (control === "select" && !whole.endsWith("/>")) {
      const close = tpl.indexOf(`</${tag}>`, m.index);
      if (close > 0) options = [...tpl.slice(m.index + whole.length, close).matchAll(/(?<![:\w-])value="([^"{}]{1,40})"/g)].map((x) => x[1]);
    }
    const optRef = /:options="([A-Za-z_]\w*)"/.exec(attrs)?.[1];
    if (optRef) options.push(...scriptOptions(script, optRef));
    const inline = /:options="(\[[^"]*\])"/.exec(attrs)?.[1];
    if (inline) options.push(...[...inline.matchAll(/value:\s*'([^']{1,40})'/g)].map((x) => x[1]));
    for (const [b, k] of new Map(found.map((f) => [f.join("."), f])).values()) if (known[b].has(k)) hits.push({ file: path.relative(SPA, file), bucket: b, key: k, label, control, options });
  }
}

// ── Which element types each panel file edits: the types whose key set holds the file's
//    specific (non-generic) keys. Labels/options of a key are taken from that type's files first.
const TYPES = Object.keys(mined);
const keysOf = {};
for (const T of new Set([...TYPES, ...Object.keys(renderer.types)])) {
  const s = new Set();
  for (const b of ["specials", "config"]) {
    for (const k of mined[T]?.[b] || []) s.add(`${b}.${k}`);
    for (const k of Object.keys(renderer.types[T]?.[b] || {})) s.add(`${b}.${k}`);
  }
  keysOf[T] = s;
}
const spread = {};
for (const s of Object.values(keysOf)) for (const k of s) spread[k] = (spread[k] || 0) + 1;
const nTypes = Object.keys(keysOf).length;
const generic = (k) => spread[k] > nTypes * 0.25;

const byFile = {};
for (const h of hits) (byFile[h.file] ||= []).push(h);
const typesOfFile = {};
for (const [file, hs] of Object.entries(byFile)) {
  const S = [...new Set(hs.map((h) => `${h.bucket}.${h.key}`))].filter((k) => !generic(k));
  if (!S.length) continue;
  const scores = Object.entries(keysOf).map(([T, ks]) => [T, S.filter((k) => ks.has(k)).length / S.length]);
  const max = Math.max(...scores.map(([, s]) => s));
  if (max >= 0.6) typesOfFile[file] = scores.filter(([, s]) => s === max).map(([T]) => T);
}

const agg = (hs) => {
  const labels = {}, controls = {}, options = new Set();
  for (const h of hs) {
    if (h.label && !h.label.includes("$t(")) labels[h.label] = (labels[h.label] || 0) + 1;
    if (h.control) controls[h.control] = (controls[h.control] || 0) + 1;
    for (const o of h.options) if (/^[\w-]{1,40}$/.test(o) && !/^(item|option|opt|el)$/.test(o)) options.add(o);
  }
  return { labels, controls, options };
};
const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
const pack = ({ labels, controls, options }) => {
  const L = top(labels);
  return {
    ...(L.length ? { label: L.slice(0, 2).map(([l]) => l).join(" / ") } : {}),
    ...(Object.keys(controls).length ? { control: top(controls)[0][0] } : {}),
    ...(options.size ? { options: [...options].slice(0, 40) } : {}),
  };
};
// Global fallback only where one label clearly dominates.
const global = {};
for (const h of hits) (global[`${h.bucket}.${h.key}`] ||= []).push(h);
const globalPack = {};
for (const [k, hs] of Object.entries(global)) {
  const a = agg(hs);
  const L = top(a.labels);
  const total = L.reduce((n, [, c]) => n + c, 0);
  // label/control only — options are per type (a shared key name rarely shares its choices)
  if (L.length && L[0][1] / total >= 0.7) globalPack[k] = { label: L[0][0], ...(Object.keys(a.controls).length ? { control: top(a.controls)[0][0] } : {}) };
}

const out = { meta: { source: "builderx_spa/src/components/editor", branch: "?" }, types: {} };
try {
  out.meta.branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: SPA }).toString().trim();
} catch {}
let nLab = 0, nOpt = 0, nAll = 0;
for (const T of Object.keys(keysOf).sort()) {
  const own = hits.filter((h) => typesOfFile[h.file]?.includes(T));
  const per = {};
  for (const h of own) (per[`${h.bucket}.${h.key}`] ||= []).push(h);
  const t = { specials: {}, config: {} };
  for (const k of [...keysOf[T]].sort()) {
    const [b, key] = [k.slice(0, k.indexOf(".")), k.slice(k.indexOf(".") + 1)];
    const v = per[k] ? { ...(globalPack[k] || {}), ...pack(agg(per[k])) } : globalPack[k];
    if (!v || !Object.keys(v).length) continue;
    t[b][key] = v;
    nAll++;
    if (v.label) nLab++;
    if (v.options) nOpt++;
  }
  const files = [...new Set(own.map((h) => h.file))];
  if (files.length) t.files = files.slice(0, 6);
  if (Object.keys(t.specials).length || Object.keys(t.config).length) out.types[T] = t;
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${hits.length} control hits in ${Object.keys(byFile).length} files (${Object.keys(typesOfFile).length} tied to types); ${Object.keys(out.types).length} types, ${nAll} keys (${nLab} labelled, ${nOpt} with options) → ${path.relative(process.cwd(), OUT)}`);

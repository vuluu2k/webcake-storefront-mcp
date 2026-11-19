#!/usr/bin/env node
// Re-mine src/builder/element-keys.generated.json from real page sources (read-only GETs with the
// token saved by `login`). Merges into the existing file — a key once seen is never dropped — and
// adds, per key, the value TYPES seen and, for code-like keys, the VALUES seen (tag, type,
// display…), which validate_page uses as the allowed set. Values are kept only when they look
// like codes (identifier tokens, few distinct): no text, URLs, colours, ids or numbers.
//
//   npm run build && node scripts/mine-element-keys.mjs [--sites 100] [--env prod]
import { readFileSync, writeFileSync } from "node:fs";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const MAX_SITES = Number(arg("sites", 100));
const FILE = new URL("../src/builder/element-keys.generated.json", import.meta.url);
const { makeApi } = await import("../dist/config.js");
const api = makeApi({ env: arg("env", "prod") });

const db = JSON.parse(readFileSync(FILE, "utf8"));
const CODE = /^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/;
const ID_LIKE = /^[A-Z]+(-[A-Z]+)*-[A-Za-z0-9]{6,}$|^[0-9a-f-]{20,}$/;
const MAX_VALUES = 12;
// Keys that carry content, names or links — never record their values.
const CONTENT_KEY = /label|placeholder|text|title|name|content|desc|alt|message|msg|link|url|src|href|class|css|html|code|icon|note|caption|email|phone/i;
const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
const values = {}; // `${type}|${where}.${key}` → Set | null (null = not code-like)

function entry(type) {
  return (db[type] ??= { seen: 0, specials: [], config: [], style: [], bindings: [], events: false });
}
function note(type, bucket, obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  const e = entry(type);
  const keys = new Set(e[bucket]);
  for (const [k, v] of Object.entries(obj)) {
    keys.add(k);
    if (bucket === "style") continue;
    const tk = `${bucket}.${k}`;
    const types = new Set((e.types ??= {})[tk] || []);
    if (v !== null && v !== undefined) types.add(typeOf(v));
    e.types[tk] = [...types].sort();
    const vk = `${type}|${tk}`;
    if (CONTENT_KEY.test(k)) continue;
    if (values[vk] === null || v === null || v === undefined || v === "") continue;
    if (typeof v === "boolean" || typeof v === "number" || typeof v === "object") continue;
    if (typeof v !== "string" || !CODE.test(v) || ID_LIKE.test(v) || /^\d/.test(v)) values[vk] = null;
    else (values[vk] ??= new Set()).add(v);
  }
  e[bucket] = [...keys].sort();
}
function walk(n) {
  if (!n || typeof n !== "object" || typeof n.type !== "string") return;
  const e = entry(n.type);
  e.seen++;
  note(n.type, "specials", n.specials);
  for (const layer of Object.keys(n).filter((k) => k === "runtime" || /^bp\d+$/.test(k))) {
    note(n.type, "config", n[layer]?.config);
    note(n.type, "style", n[layer]?.style);
  }
  for (const b of Array.isArray(n.bindings) ? n.bindings : []) {
    const t = b && (b.target || (b.name && b.field && `${b.name}::${b.field}`));
    if (typeof t === "string" && !e.bindings.includes(t)) e.bindings.push(t);
  }
  if (Array.isArray(n.events) && n.events.length) e.events = true;
  for (const c of Array.isArray(n.children) ? n.children : []) walk(c);
}

const res = await api.listMySites({ filter: "all", page: 1, limit: MAX_SITES });
const sites = res?.data?.sites || [];
let pages = 0;
for (const s of sites.slice(0, MAX_SITES)) {
  api.switchSite(s.id);
  let list;
  try {
    const r = await api.listPages();
    list = r?.data || r || [];
  } catch {
    continue;
  }
  for (const p of Array.isArray(list) ? list : []) {
    const raw = p?.source?.source;
    if (!raw) continue;
    let src;
    try {
      src = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      continue;
    }
    if (!Array.isArray(src?.sections)) continue;
    pages++;
    for (const sec of src.sections) walk(sec);
  }
}

for (const [vk, set] of Object.entries(values)) {
  if (!set || set.size > MAX_VALUES) continue;
  const [type, tk] = vk.split("|");
  const e = db[type];
  e.values ??= {};
  e.values[tk] = [...new Set([...(e.values[tk] || []), ...set])].sort();
}
const sorted = Object.fromEntries(Object.keys(db).sort().map((k) => [k, db[k]]));
// One element per line: compact, and a diff still reads per element.
writeFileSync(FILE, `{\n${Object.entries(sorted).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(",\n")}\n}\n`);
console.error(`mined ${pages} pages from ${sites.length} sites → ${Object.keys(db).length} element types`);

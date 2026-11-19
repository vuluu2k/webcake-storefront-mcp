#!/usr/bin/env node
// Static read of the published-page renderer (builderx_api lib/qwik): for every element type, the
// specials/config keys its HTML + CSS builders read, the default each falls back to, and the
// literal values the code compares them against (enum candidates). Writes
// src/builder/renderer-keys.generated.json. Run: npm run mine-renderer  (BUILDERX_API_DIR).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const API = path.resolve(process.env.BUILDERX_API_DIR || "../builderx_api");
const QWIK = path.join(API, "lib/qwik");
const OUT = path.resolve("src/builder/renderer-keys.generated.json");

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name.startsWith(".")) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith(".ex")) files.push(p);
  }
})(QWIK);

// ── Functions per module: name → concatenated bodies of every clause ─────────────────────
const modules = {}; // module → { fns: {name: body}, imports: [module] , aliases: {Short: module} }
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const mod = /defmodule\s+([\w.]+)/.exec(src)?.[1];
  if (!mod) continue;
  const m = (modules[mod] ||= { fns: {}, imports: [], aliases: {} });
  for (const im of src.matchAll(/^\s*import\s+([\w.]+)/gm)) m.imports.push(im[1]);
  for (const al of src.matchAll(/^\s*alias\s+([\w.]+)\.\{([^}]+)\}/gm))
    for (const s of al[2].split(",").map((x) => x.trim())) m.aliases[s.split(".").pop()] = `${al[1]}.${s}`;
  for (const al of src.matchAll(/^\s*alias\s+([\w.]+)\s*$/gm)) m.aliases[al[1].split(".").pop()] = al[1];
  let cur = null;
  for (const line of src.split("\n")) {
    const d = /^  defp?\s+([a-z_][\w?!]*)/.exec(line);
    if (d) cur = d[1];
    if (cur) m.fns[cur] = (m.fns[cur] || "") + line + "\n";
  }
}

const resolve = (mod, call) => {
  // call: "build_x" or "Common.build_x"
  const parts = call.split(".");
  if (parts.length > 1) {
    const fn = parts.pop();
    const short = parts.join(".");
    const target = modules[mod]?.aliases[short] || Object.keys(modules).find((k) => k === short || k.endsWith(`.${short}`));
    return target && modules[target]?.fns[fn] ? [target, fn] : null;
  }
  if (modules[mod]?.fns[call]) return [mod, call];
  for (const im of modules[mod]?.imports || []) if (modules[im]?.fns[call]) return [im, call];
  return null;
};

// ── Dispatchers: case el["type"] do "x" -> build_x(...) ─────────────────────────────────
const dispatch = {}; // type → [[mod, fn], ...]
const dispatched = new Set(); // every type any build_element has a branch for (resolved or not)
for (const [mod, m] of Object.entries(modules)) {
  const body = m.fns.build_element;
  if (!body) continue;
  for (const c of body.matchAll(/^\s*"([a-z][a-z0-9-]*)"\s*->/gm)) dispatched.add(c[1]);
  for (const c of body.matchAll(/^\s*"([a-z][a-z0-9-]*)"\s*->\s*([\w.]+)\(/gm)) {
    const r = resolve(mod, c[2]);
    if (r) (dispatch[c[1]] ||= []).push(r);
  }
}

// ── Reachable functions per type (2 hops), and how many types reach each helper ──────────
const CALL = /\b((?:[A-Z]\w*\.)*[a-z_][\w?!]*)\(/g;
const reach = {};
for (const [type, roots] of Object.entries(dispatch)) {
  const seen = new Map();
  let frontier = roots.map((r) => [...r, 0]);
  while (frontier.length) {
    const next = [];
    for (const [mod, fn, depth] of frontier) {
      const key = `${mod}.${fn}`;
      if (seen.has(key)) continue;
      seen.set(key, [mod, fn]);
      if (depth >= 2) continue;
      for (const c of modules[mod].fns[fn].matchAll(CALL)) {
        const r = resolve(mod, c[1]);
        if (r && r[1] !== "build_element") next.push([...r, depth + 1]);
      }
    }
    frontier = next;
  }
  reach[type] = [...seen.values()];
}
const fanIn = {};
for (const fns of Object.values(reach)) for (const [m, f] of fns) fanIn[`${m}.${f}`] = (fanIn[`${m}.${f}`] || 0) + 1;
const GENERIC = 12; // a helper reached by more types than this is shared plumbing, not per-type

// ── Key reads in a body ──────────────────────────────────────────────────────────────────
const LIT = String.raw`("(?:[^"\\]|\\.)*"|true|false|nil|-?\d+(?:\.\d+)?)`;
const litVal = (s) => (s.startsWith('"') ? JSON.parse(s) : s === "nil" ? null : s === "true" ? true : s === "false" ? false : Number(s));
function readKeys(body) {
  const out = { specials: {}, config: {} };
  const add = (bucket, k, patch = {}) => {
    const e = (out[bucket][k] ||= {});
    if (patch.default !== undefined && e.default === undefined) e.default = patch.default;
    if (patch.values) e.values = [...new Set([...(e.values || []), ...patch.values])];
  };
  const ACCESS = [
    ["specials", /\b(?:el|element|parent|form_element|item|child|\w*_el)\["specials"\]\["(\w+)"\]/g],
    ["specials", /\bspecials\w*\["(\w+)"\]/g],
    ["specials", /Map\.get\(\s*(?:el|element)\["specials"\][^,]*,\s*"(\w+)"/g],
    ["config", /\b\w*config\w*\["(\w+)"\]/g],
    ["config", /\b(?:el|element|parent)\[(?:bp|k|"runtime")\]\["config"\]\["(\w+)"\]/g],
  ];
  const varOf = {}; // local var → [bucket, key]
  for (const [bucket, re] of ACCESS) {
    for (const m of body.matchAll(re)) {
      const k = m[1];
      add(bucket, k);
      const after = body.slice(m.index + m[0].length, m.index + m[0].length + 80);
      const dflt = new RegExp(String.raw`^\s*\|\|\s*` + LIT).exec(after);
      if (dflt) add(bucket, k, { default: litVal(dflt[1]) });
      else if (/^\s*!=\s*false/.test(after)) add(bucket, k, { default: true });
      const cmp = new RegExp(String.raw`^\s*(?:==|!=)\s*` + LIT).exec(after);
      if (cmp && typeof litVal(cmp[1]) === "string") add(bucket, k, { values: [litVal(cmp[1])] });
      const inList = /^\s*in\s*\[([^\]]+)\]/.exec(after) || /^\s*in\s*~w\(([^)]+)\)/.exec(after);
      if (inList) add(bucket, k, { values: [...inList[1].matchAll(/"([^"]+)"|(\b[\w-]+\b)/g)].map((x) => x[1] || x[2]).filter((v) => !/^(nil|true|false)$/.test(v)) });
      const before = body.slice(Math.max(0, m.index - 60), m.index);
      const v = /(?:^|\n)\s*([a-z_]\w*)\s*=\s*$/.exec(before);
      if (v) varOf[v[1]] = [bucket, k];
    }
  }
  // Values compared against a local bound from a key: var == "x", var in [...], case var do "x" ->
  for (const [v, [bucket, k]] of Object.entries(varOf)) {
    const vals = [];
    for (const m of body.matchAll(new RegExp(String.raw`\b${v}\s*(?:==|!=)\s*"((?:[^"\\]|\\.)*)"`, "g"))) vals.push(m[1]);
    for (const m of body.matchAll(new RegExp(String.raw`\b${v}\s+in\s+\[([^\]]+)\]`, "g"))) for (const s of m[1].matchAll(/"([^"]+)"/g)) vals.push(s[1]);
    for (const m of body.matchAll(new RegExp(String.raw`case\s+${v}\s+do\n([\s\S]*?)\n\s{4,6}end\b`, "g")))
      for (const s of m[1].matchAll(/^\s*"([^"]+)"\s*->/gm)) vals.push(s[1]);
    if (vals.length) add(bucket, k, { values: vals });
  }
  return out;
}

const merge = (into, from) => {
  for (const b of ["specials", "config"])
    for (const [k, v] of Object.entries(from[b])) {
      const e = (into[b][k] ||= {});
      if (v.default !== undefined && e.default === undefined) e.default = v.default;
      if (v.values) e.values = [...new Set([...(e.values || []), ...v.values])].sort();
    }
};

// Element ↔ element: render context passed through the process dictionary (Process.put by one
// builder, Process.get by another) and what a builder reads from the node it sits in.
const PLUMBING = new Set(["bp", "this", "json", "modules", "mark", "bp_value", "xevents", "global"]);
function relationsOf(fns) {
  const reads = new Set();
  const provides = new Set();
  const parent = new Set();
  for (const [m, f] of fns) {
    const body = modules[m].fns[f];
    for (const x of body.matchAll(/Process\.get\(:(\w+)/g)) if (!PLUMBING.has(x[1])) reads.add(x[1]);
    for (const x of body.matchAll(/Process\.put\(:(\w+)/g)) if (!PLUMBING.has(x[1])) provides.add(x[1]);
    for (const x of body.matchAll(/\b(parent|form_element)\[(?:bp|k|"runtime")\]\["(style|config)"\]/g)) parent.add(`${x[1] === "form_element" ? "form" : "parent"}.${x[2]}`);
    for (const x of body.matchAll(/\b(parent|form_element)\["specials"\]\["(\w+)"\]/g)) parent.add(`${x[1] === "form_element" ? "form" : "parent"}.specials.${x[2]}`);
    for (const x of body.matchAll(/\bparent\["type"\]\s*(?:==|!=|in)\s*("[^"]+"|\[[^\]]+\])/g)) parent.add(`parent.type ${x[1].replace(/\s+/g, "")}`);
  }
  const out = {};
  if (reads.size) out.reads = [...reads].sort();
  if (provides.size) out.provides = [...provides].sort();
  if (parent.size) out.parent = [...parent].sort();
  return Object.keys(out).length ? out : undefined;
}

const types = {};
const shared = { specials: {}, config: {} };
for (const [type, fns] of Object.entries(reach)) {
  const t = { builders: dispatch[type].map(([m, f]) => `${m.replace(/^Qwik\./, "")}.${f}`), specials: {}, config: {} };
  for (const [m, f] of fns) {
    const keys = readKeys(modules[m].fns[f]);
    merge(fanIn[`${m}.${f}`] > GENERIC ? shared : t, keys);
  }
  // Relations: only the type's own builders + helpers few types share (not common plumbing).
  const rel = relationsOf(fns.filter(([m, f]) => fanIn[`${m}.${f}`] <= 40)); // build_input serves ~20 field types
  if (rel) t.relations = rel;
  types[type] = t;
}

// Keys mentioned ANYWHERE on the render side (Elixir renderer + client render JS in assets/render):
// a key absent from a type's reads but mentioned here may still be read (by destructuring, a
// shared helper, the client) — only a key mentioned nowhere is safely "stored, no effect".
const mined = JSON.parse(fs.readFileSync("src/builder/element-keys.generated.json", "utf8"));
const universe = new Set();
for (const t of Object.values(mined)) for (const b of ["specials", "config"]) for (const k of t[b] || []) universe.add(k);
const renderJs = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) f.name !== "node_modules" && walk(p);
    else if (/\.(js|vue|ts)$/.test(f.name)) renderJs.push(p);
  }
})(path.join(API, "assets/render"));
const mentioned = new Set();
for (const file of [...files, ...renderJs])
  for (const m of fs.readFileSync(file, "utf8").matchAll(/[A-Za-z_][\w]*/g)) if (universe.has(m[0])) mentioned.add(m[0]);

// Event actions the published page can run: the PascalCase cases of assets/render/events.js
// (snake_cased, as stored in events[].action) + the action names common.ex compares against.
const eventActions = new Set();
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase();
const eventsJs = path.join(API, "assets/render/events.js");
if (fs.existsSync(eventsJs)) for (const m of fs.readFileSync(eventsJs, "utf8").matchAll(/case\s+['"]([A-Z][A-Za-z]+)['"]/g)) eventActions.add(snake(m[1]));
for (const file of files.filter((f) => /common\.ex$/.test(f)))
  for (const m of fs.readFileSync(file, "utf8").matchAll(/action\s*(?:==|!=)\s*"([a-z_]+)"|action\s+in\s+\[([^\]]+)\]/g))
    for (const x of (m[1] ? [m[1]] : [...m[2].matchAll(/"([a-z_]+)"/g)].map((y) => y[1]))) eventActions.add(x);

// Image hosts the published page may load (Content-Security-Policy img-src in page_controller.ex):
// an <img>/background from anywhere else is blocked by the browser.
const imgHosts = [];
const pc = path.join(API, "lib/builderx_api_web/controllers/v1/pages/page_controller.ex");
if (fs.existsSync(pc)) {
  const m = /img_policy\s*=\s*\[([\s\S]*?)\]/.exec(fs.readFileSync(pc, "utf8"));
  if (m) for (const h of m[1].matchAll(/"([^"]+)"/g)) imgHosts.push(h[1]);
}

let branch = "?";
try {
  branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: API }).toString().trim();
} catch {}
if (branch !== "master" && branch !== "?") console.warn(`! builderx_api is on "${branch}", not master`);
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v && typeof v === "object" && !Array.isArray(v) ? sortObj(v) : v]));
const out = { meta: { source: "builderx_api/lib/qwik + assets/render", branch, types: Object.keys(types).length }, shared: sortObj(shared), dispatched: [...dispatched].sort(), event_actions: [...eventActions].sort(), img_hosts: imgHosts, mentioned: [...mentioned].sort(), types: sortObj(types) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const nKeys = Object.values(types).reduce((n, t) => n + Object.keys(t.specials).length + Object.keys(t.config).length, 0);
const nVals = Object.values(types).reduce((n, t) => n + [...Object.values(t.specials), ...Object.values(t.config)].filter((v) => v.values).length, 0);
console.log(`${Object.keys(types).length} types, ${nKeys} per-type keys (${nVals} with compared values), shared ${Object.keys(shared.specials).length} specials / ${Object.keys(shared.config).length} config → ${path.relative(process.cwd(), OUT)}`);

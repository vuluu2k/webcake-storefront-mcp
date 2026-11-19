#!/usr/bin/env node
// Generate src/api-catalog.generated.json — every builderx_api route the storefront JWT can call
// (pipe_through :auth), read STATICALLY from the Phoenix routers and controllers, so api_find /
// api_call cover the whole backend without a hand-written tool per route.
//
//   BUILDERX_API_DIR=../builderx_api node scripts/gen-api-catalog.mjs
//
// Per route: method, path, Controller.action, the pipelines it runs through, the site
// permissions those pipelines check, and the body it reads — top-level keys the action
// pattern-matches (required: the clause won't match without them) or reads from params, plus,
// for a key bound to a variable, the fields read off it one level down.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.env.BUILDERX_API_DIR || new URL("../../builderx_api", import.meta.url).pathname);
const WEB = join(ROOT, "lib/builderx_api_web");
const ROUTERS = [
  ["router/dashboard_router_v1.ex", "BuilderxApiWeb"],
  ["router/router.ex", "BuilderxApiWeb"],
];
const OUT = new URL("../src/api-catalog.generated.json", import.meta.url);

const VERBS = "get|post|put|patch|delete";
const stripComments = (src) => src.replace(/^\s*#.*$/gm, "").replace(/\s+#(?![{]).*$/gm, "");

// ── Routers ─────────────────────────────────────────────────────────────────────────────
function parseRouter(file, baseAlias) {
  const src = stripComments(readFileSync(join(WEB, file), "utf8"));
  const pipelines = {};
  const routes = [];
  // Statement tokens in source order. Verb calls may span lines; join until the action atom.
  const re = new RegExp(
    [
      String.raw`(?<pipeline>^\s*pipeline\s+:(?<pname>\w+)\s+do\s*$)`,
      String.raw`(?<scope>^\s*scope\s+(?:"(?<spath>[^"]*)")?\s*(?:,\s*(?<salias>[A-Z][\w.]*))?[^\n]*\bdo\s*$)`,
      String.raw`(?<pipe>^\s*pipe_through\s*\(?\s*(?<plist>\[[^\]]*\]|:\w+))`,
      String.raw`(?<plug>^\s*plug\s+(?<pmod>[\w.]+)(?<popts>[^\n]*))`,
      String.raw`(?<verb>^\s*(?<v>${VERBS}|match\s+:\*\s*,)\s*\(?\s*"(?<vpath>[^"]*)"\s*,\s*(?<ctrl>[\w.]+)\s*,\s*:(?<action>\w+))`,
      String.raw`(?<open>^[^\n]*\bdo\s*$)`,
      String.raw`(?<close>^\s*end\b)`,
    ].join("|"),
    "gm"
  );
  const stack = [{ kind: "root", path: "", alias: baseAlias, pipes: [] }];
  let currentPipeline = null;
  for (const m of src.matchAll(re)) {
    const g = m.groups;
    const top = stack[stack.length - 1];
    if (g.pipeline) {
      currentPipeline = g.pname;
      pipelines[g.pname] = [];
      stack.push({ kind: "pipeline", path: top.path, alias: top.alias, pipes: top.pipes });
    } else if (g.scope) {
      const alias = g.salias ? (g.salias.startsWith(baseAlias) ? g.salias : `${top.alias}.${g.salias}`) : top.alias;
      const seg = g.spath ? (g.spath.startsWith("/") ? g.spath : `/${g.spath}`) : "";
      stack.push({ kind: "scope", path: top.path + seg, alias, pipes: [...top.pipes] });
    } else if (g.pipe) {
      const names = [...g.plist.matchAll(/:(\w+)/g)].map((x) => x[1]);
      top.pipes.push(...names);
    } else if (g.plug) {
      if (currentPipeline && top.kind === "pipeline") pipelines[currentPipeline].push({ plug: g.pmod.split(".").pop(), opts: g.popts.trim() });
    } else if (g.verb) {
      const method = g.v.startsWith("match") ? "ANY" : g.v.toUpperCase();
      const controller = g.ctrl.includes(".") && g.ctrl.startsWith(baseAlias) ? g.ctrl : `${top.alias}.${g.ctrl}`;
      const path = (top.path + (g.vpath.startsWith("/") || !g.vpath ? g.vpath : `/${g.vpath}`)).replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
      routes.push({ method, path, controller, action: g.action, pipes: [...top.pipes] });
    } else if (g.open) {
      stack.push({ kind: "block", path: top.path, alias: top.alias, pipes: top.pipes });
    } else if (g.close) {
      const f = stack.pop();
      if (f?.kind === "pipeline") currentPipeline = null;
      if (!stack.length) stack.push({ kind: "root", path: "", alias: baseAlias, pipes: [] });
    }
  }
  return { pipelines, routes };
}

// ── Controllers: module → file, then the keys an action reads ────────────────────────────
function walkFiles(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (f.endsWith(".ex")) out.push(p);
  }
  return out;
}
const MODULE_FILE = {};
for (const f of walkFiles(join(ROOT, "lib"))) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/^defmodule\s+([\w.]+)\s+do/gm)) MODULE_FILE[m[1]] = f;
}

/** Each `def action(` clause of a module: its head (args) and body text. */
function clausesOf(file, action) {
  const src = stripComments(readFileSync(file, "utf8"));
  const out = [];
  const re = new RegExp(String.raw`^(\s*)def\s+${action}\s*\(`, "gm");
  for (const m of src.matchAll(re)) {
    const indent = m[1].length;
    // Head = up to the matching ")" before " do".
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    const head = src.slice(m.index + m[0].length, i - 1);
    // Body = until the next def/defp at the same indent (or end of module).
    const rest = src.slice(i);
    const next = new RegExp(String.raw`^\s{${indent}}(def|defp|defmacro)\s`, "m").exec(rest);
    out.push({ head, body: next ? rest.slice(0, next.index) : rest });
  }
  return out;
}

const PATH_PARAM = /:(\w+)/g;

/** Split a call's argument list at top-level commas. */
function splitArgs(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** `Foo` in a controller → the full module, via its `alias` lines (or a unique last-segment match). */
function resolveModule(file, short) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/^\s*alias\s+([\w.]+)(?:\.\{([^}]+)\})?(?:,\s*as:\s*(\w+))?/gm)) {
    if (m[2]) {
      for (const part of m[2].split(",").map((x) => x.trim())) if (part.split(".").pop() === short.split(".")[0]) return `${m[1]}.${part}${short.slice(short.split(".")[0].length)}`;
    } else if ((m[3] || m[1].split(".").pop()) === short.split(".")[0]) return `${m[1]}${short.slice(short.split(".")[0].length)}`;
  }
  if (MODULE_FILE[short]) return short;
  const hits = Object.keys(MODULE_FILE).filter((k) => k.endsWith(`.${short}`));
  return hits.length === 1 ? hits[0] : undefined;
}
const readsOf = (body, v) =>
  [...body.matchAll(new RegExp(String.raw`\b${v}\["([\w-]+)"\]|Map\.get\(\s*${v}\s*,\s*"([\w-]+)"|"([\w-]+)"\s*=>\s*\w+[^\n]*\}\s*=\s*${v}\b`, "g"))].map((r) => r[1] || r[2] || r[3]);
/** Keys read by functions the action hands `v` to, one call deep (Module.fun(…, v, …)). */
function followReads(file, body, v) {
  const keys = new Set();
  for (const c of body.matchAll(/\b([A-Z][\w.]*)\.(\w+)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    const args = splitArgs(c[3]);
    const pos = args.findIndex((a) => a === v);
    if (pos < 0) continue;
    const mod = resolveModule(file, c[1]);
    const target = mod && MODULE_FILE[mod];
    if (!target) continue;
    for (const { head, body: fb } of clausesOf(target, c[2])) {
      const arg = splitArgs(head)[pos];
      if (!arg) continue;
      const pv = /=\s*(\w+)\s*$/.exec(arg)?.[1] || /^(\w+)$/.exec(arg)?.[1];
      for (const k of [...arg.matchAll(/"([\w-]+)"\s*=>/g)].map((x) => x[1])) keys.add(k);
      if (pv && !pv.startsWith("_")) readsOf(fb, pv).forEach((k) => keys.add(k));
    }
  }
  return keys;
}
function bodyOf(controller, action, pathParams) {
  const file = MODULE_FILE[controller];
  if (!file) return null;
  const clauses = clausesOf(file, action);
  if (!clauses.length) return null;
  const fields = {}; // key → Set(sub) | null
  let required = null;
  for (const { head, body } of clauses) {
    // Second argument: `%{ "k" => var, ... } = params` | `params` | `_`.
    const arg = head.replace(/^\s*[\w_]+\s*,/, "");
    const pattern = /%\{([\s\S]*?)\}/.exec(arg)?.[1] || "";
    const bound = [...pattern.matchAll(/"([\w-]+)"\s*=>\s*(\w+)?/g)];
    const keys = new Set(bound.map((b) => b[1]));
    required = required ? new Set([...required].filter((k) => keys.has(k))) : keys;
    const paramsVar = /=\s*(\w+)\s*$/.exec(arg.trim())?.[1] || /^\s*(params|_params)\s*$/.exec(arg)?.[1];
    const touch = (k) => (fields[k] ??= null);
    keys.forEach(touch);
    if (paramsVar && !paramsVar.startsWith("_")) {
      for (const r of body.matchAll(new RegExp(String.raw`\b${paramsVar}\["([\w-]+)"\]|Map\.get\(\s*${paramsVar}\s*,\s*"([\w-]+)"`, "g"))) touch(r[1] || r[2]);
      followReads(file, body, paramsVar).forEach(touch);
    }
    for (const [, key, v] of bound) {
      if (!v || v.startsWith("_")) continue;
      for (const r of body.matchAll(new RegExp(String.raw`\b${v}\["([\w-]+)"\]|Map\.get\(\s*${v}\s*,\s*"([\w-]+)"`, "g"))) {
        const sub = r[1] || r[2];
        if (!(fields[key] instanceof Set)) fields[key] = new Set();
        fields[key].add(sub);
      }
    }
  }
  for (const p of pathParams) {
    delete fields[p];
    required?.delete(p);
  }
  const body = Object.fromEntries(Object.entries(fields).sort().map(([k, v]) => [k, v ? [...v].sort() : null]));
  return { required: [...(required || [])].sort(), body };
}

// ── Curated tools that already cover a route (api.ts method → tools calling it) ─────────
const SRC = new URL("../src/", import.meta.url).pathname;
const normPath = (p) => p.replace(/\$\{[^}]+\}/g, ":x").replace(/:\w+/g, ":x").replace(/\?.*$/, "").replace(/\/+$/, "");
const methodByRoute = {}; // "POST /api/v1/…/:x/…" → api.ts method names
{
  const apiSrc = readFileSync(join(SRC, "api.ts"), "utf8");
  const re = /^  (?:async\s+)?(\w+)\([^)]*\)[^{\n]*\{([\s\S]*?)^  \}/gm;
  for (const m of apiSrc.matchAll(re))
    for (const r of m[2].matchAll(/request\(\s*"(\w+)"\s*,\s*`([^`]+)`/g)) (methodByRoute[`${r[1]} ${normPath(r[2])}`] ??= new Set()).add(m[1]);
}
const toolsByMethod = {};
for (const f of readdirSync(join(SRC, "tools")).filter((f) => f.endsWith(".ts"))) {
  const src = readFileSync(join(SRC, "tools", f), "utf8");
  const parts = src.split(/server\.tool\(\s*/).slice(1);
  for (const part of parts) {
    const name = /^"([\w-]+)"/.exec(part)?.[1];
    if (!name) continue;
    for (const c of part.matchAll(/\bapi\.(\w+)\(/g)) (toolsByMethod[c[1]] ??= new Set()).add(name);
  }
}
const toolsFor = (method, path) => {
  const out = new Set();
  for (const m of methodByRoute[`${method} ${normPath(path)}`] || []) for (const t of toolsByMethod[m] || []) out.add(t);
  return [...out].sort();
};

// ── Assemble ────────────────────────────────────────────────────────────────────────────
const ops = [];
const seen = new Set();
let undescribed = 0;
for (const [file, alias] of ROUTERS) {
  const { pipelines, routes } = parseRouter(file, alias);
  for (const r of routes) {
    if (!r.pipes.includes("auth")) continue; // needs another credential (gateway key, end user, webhook…)
    const id = `${r.method.toLowerCase()}:${r.path}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pathParams = [...r.path.matchAll(PATH_PARAM)].map((m) => m[1]);
    const perms = [...new Set(r.pipes.flatMap((p) => (pipelines[p] || []).flatMap((x) => [...x.opts.matchAll(/"([a-z_]+)"/g)].map((y) => y[1]))))];
    const shape = bodyOf(r.controller, r.action, pathParams);
    if (!shape) undescribed++;
    ops.push({
      id,
      method: r.method,
      path: r.path,
      handler: `${r.controller.replace(/^BuilderxApiWeb\.(V1\.)?/, "")}.${r.action}`,
      ...(perms.length ? { perms } : {}),
      ...(shape && Object.keys(shape.body).length ? { params: shape.body } : {}),
      ...(shape?.required.length ? { required: shape.required } : {}),
      ...(toolsFor(r.method, r.path).length ? { tools: toolsFor(r.method, r.path) } : {}),
    });
  }
}
ops.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const meta = { generated_from: "builderx_api routers + controllers (static)", operations: ops.length, undescribed };
writeFileSync(OUT, `{"meta":${JSON.stringify(meta)},"ops":[\n${ops.map((o) => JSON.stringify(o)).join(",\n")}\n]}\n`);
console.error(`${ops.length} operations (${undescribed} without a readable action) → ${OUT.pathname}`);

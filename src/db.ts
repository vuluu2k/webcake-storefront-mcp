// Tiny JSON-file persistence (no native deps) for the saved connection config
// (token / session / site / api_url / confirm_mode).
//
// Stored under a stable home dir so it survives `npx` (ephemeral package cache) and
// container restarts. A flat JSON file instead of SQLite — keeps the package light
// and works in any runtime (Alpine, Docker `--ignore-scripts`, serverless) with no
// native binding to build. The API is synchronous to match the call sites.

import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = process.env.WEBCAKE_CONFIG_DIR || join(homedir(), ".webcake-storefront-mcp");
mkdirSync(CONFIG_DIR, { recursive: true });

const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  try {
    writeFileSync(file, JSON.stringify(data), "utf-8");
  } catch (e) {
    console.error("[db] write failed:", (e as Error)?.message ?? e);
  }
}

// ── Config (key/value) ───────────────────────────────────────────────────────
const config: Record<string, string> = readJson<Record<string, string>>(CONFIG_FILE, {});

/** Remote mode: each MCP session reads/writes ITS OWN config (its account's saved site,
 *  confirm mode…) instead of the server's file, so users never see each other's choices. */
export type ConfigScope = { values: Record<string, string>; persist?: (key: string, value: string | null) => void };
const scopeStore = new AsyncLocalStorage<ConfigScope>();
export function runWithConfigScope<T>(scope: ConfigScope, fn: () => T): T {
  return scopeStore.run(scope, fn);
}

export function getConfig(key: string): string | null {
  const values = scopeStore.getStore()?.values ?? config;
  return key in values ? values[key] : null;
}

export function setConfig(key: string, value: unknown): void {
  const scope = scopeStore.getStore();
  if (scope) {
    scope.values[key] = String(value);
    scope.persist?.(key, String(value));
    return;
  }
  config[key] = String(value);
  writeJson(CONFIG_FILE, config);
}

export function delConfig(key: string): void {
  const scope = scopeStore.getStore();
  if (scope) {
    delete scope.values[key];
    scope.persist?.(key, null);
    return;
  }
  delete config[key];
  writeJson(CONFIG_FILE, config);
}

export function getAllConfig(): Record<string, string> {
  return { ...(scopeStore.getStore()?.values ?? config) };
}

/** Re-read the config file — another process (a second IDE window) may have renewed the token. */
export function reloadConfig(): void {
  const fresh = readJson<Record<string, string>>(CONFIG_FILE, {});
  for (const k of Object.keys(config)) if (!(k in fresh)) delete config[k];
  Object.assign(config, fresh);
}

// ── Image upload cache (source URL/path → WebCake CDN URL, per site) ──────────
// Re-hosting the same stock photo / external image twice wastes an upload, so we
// remember the CDN URL the first time. Keyed by site because CDN URLs are per-site.
const IMAGE_CACHE_FILE = join(CONFIG_DIR, "image-cache.json");
const imageCache: Record<string, string> = readJson<Record<string, string>>(IMAGE_CACHE_FILE, {});

export function getCachedUpload(siteId: string, source: string): string | null {
  const k = `${siteId}::${source}`;
  return k in imageCache ? imageCache[k] : null;
}

export function setCachedUpload(siteId: string, source: string, cdnUrl: string): void {
  if (!siteId || !source || !cdnUrl) return;
  imageCache[`${siteId}::${source}`] = cdnUrl;
  writeJson(IMAGE_CACHE_FILE, imageCache);
}

// Page-draft cache moved to src/persistence/draft-cache.ts (Redis-or-memory,
// disposable + sliding TTL) — no longer a shared on-disk file.

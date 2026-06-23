// Tiny JSON-file persistence (no native deps) for: (1) the saved connection config
// (token / session / site / api_url / confirm_mode) and (2) the image-alt cache.
//
// Stored under a stable home dir so it survives `npx` (ephemeral package cache) and
// container restarts. Two flat JSON files instead of SQLite — keeps the package light
// and works in any runtime (Alpine, Docker `--ignore-scripts`, serverless) with no
// native binding to build. The API is synchronous to match the call sites.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = process.env.WEBCAKE_CONFIG_DIR || join(homedir(), ".webcake-storefront-mcp");
mkdirSync(CONFIG_DIR, { recursive: true });

const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const ALT_FILE = join(CONFIG_DIR, "image-alt-cache.json");

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

export function getConfig(key: string): string | null {
  return key in config ? config[key] : null;
}

export function setConfig(key: string, value: unknown): void {
  config[key] = String(value);
  writeJson(CONFIG_FILE, config);
}

export function delConfig(key: string): void {
  delete config[key];
  writeJson(CONFIG_FILE, config);
}

export function getAllConfig(): Record<string, string> {
  return { ...config };
}

// ── Image alt cache ──────────────────────────────────────────────────────────
interface AltRow {
  url_key: string;
  url: string;
  alt: string;
  source?: string;
  updated_at: number;
}

const altCache: Record<string, AltRow> = readJson<Record<string, AltRow>>(ALT_FILE, {});

export function getImageAlt(urlKey: string): AltRow | null {
  return altCache[urlKey] || null;
}

export function getImageAlts(urlKeys: string[]): Map<string, AltRow> {
  const out = new Map<string, AltRow>();
  for (const k of urlKeys) {
    const row = altCache[k];
    if (row) out.set(k, row);
  }
  return out;
}

export function setImageAlt({ url_key, url, alt, source = "ai" }: AltRow): void {
  altCache[url_key] = { url_key, url, alt, source, updated_at: Date.now() };
  writeJson(ALT_FILE, altCache);
}

export function setImageAlts(items: AltRow[]): void {
  for (const it of items) {
    altCache[it.url_key] = {
      url_key: it.url_key,
      url: it.url,
      alt: it.alt,
      source: it.source || "ai",
      updated_at: Date.now(),
    };
  }
  writeJson(ALT_FILE, altCache);
}

export function listImageAlts(limit = 100, offset = 0): AltRow[] {
  return Object.values(altCache)
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(offset, offset + limit);
}

export function countImageAlts(): number {
  return Object.keys(altCache).length;
}

// Tiny JSON-file persistence (no native deps) for the saved connection config
// (token / session / site / api_url / confirm_mode).
//
// Stored under a stable home dir so it survives `npx` (ephemeral package cache) and
// container restarts. A flat JSON file instead of SQLite — keeps the package light
// and works in any runtime (Alpine, Docker `--ignore-scripts`, serverless) with no
// native binding to build. The API is synchronous to match the call sites.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = process.env.WEBCAKE_CONFIG_DIR || join(homedir(), ".webcake-storefront-mcp");
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

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Persist in a stable home directory so saved config survives `npx` (where the
// package lives in an ephemeral cache dir) and rebuilds.
const CONFIG_DIR = process.env.WEBCAKE_CONFIG_DIR || join(homedir(), ".webcake-storefront-mcp");
mkdirSync(CONFIG_DIR, { recursive: true });
const DB_PATH = join(CONFIG_DIR, "webcake-mcp.db");

const db = new Database(DB_PATH);

// WAL mode for better concurrent reads
db.pragma("journal_mode = WAL");

// ── Schema ──

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Simple key-value helpers ──

const stmtGet = db.prepare("SELECT value FROM config WHERE key = ?");
const stmtSet = db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)");
const stmtDel = db.prepare("DELETE FROM config WHERE key = ?");
const stmtAll = db.prepare("SELECT key, value FROM config");

export function getConfig(key: string): string | null {
  const row = stmtGet.get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setConfig(key: string, value: unknown): void {
  stmtSet.run(key, String(value));
}

export function delConfig(key: string): void {
  stmtDel.run(key);
}

export function getAllConfig(): Record<string, string> {
  const rows = stmtAll.all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

// ── Image alt cache ──

db.exec(`
  CREATE TABLE IF NOT EXISTS image_alt_cache (
    url_key    TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    alt        TEXT NOT NULL,
    source     TEXT,
    updated_at INTEGER NOT NULL
  );
`);

interface AltRow {
  url_key: string;
  url: string;
  alt: string;
  source?: string;
  updated_at: number;
}

const stmtAltGet = db.prepare("SELECT url_key, url, alt, source, updated_at FROM image_alt_cache WHERE url_key = ?");
const stmtAltSet = db.prepare(`
  INSERT INTO image_alt_cache (url_key, url, alt, source, updated_at)
  VALUES (@url_key, @url, @alt, @source, @updated_at)
  ON CONFLICT(url_key) DO UPDATE SET
    url = excluded.url,
    alt = excluded.alt,
    source = excluded.source,
    updated_at = excluded.updated_at
`);
const stmtAltList = db.prepare("SELECT url_key, url, alt, source, updated_at FROM image_alt_cache ORDER BY updated_at DESC LIMIT ? OFFSET ?");
const stmtAltCount = db.prepare("SELECT COUNT(*) AS n FROM image_alt_cache");

export function getImageAlt(urlKey: string): AltRow | null {
  return (stmtAltGet.get(urlKey) as AltRow | undefined) || null;
}

export function getImageAlts(urlKeys: string[]): Map<string, AltRow> {
  const out = new Map<string, AltRow>();
  for (const k of urlKeys) {
    const row = stmtAltGet.get(k) as AltRow | undefined;
    if (row) out.set(k, row);
  }
  return out;
}

export function setImageAlt({ url_key, url, alt, source = "ai" }: AltRow): void {
  stmtAltSet.run({ url_key, url, alt, source, updated_at: Date.now() });
}

export const setImageAlts = db.transaction((items: AltRow[]) => {
  for (const it of items) {
    stmtAltSet.run({
      url_key: it.url_key,
      url: it.url,
      alt: it.alt,
      source: it.source || "ai",
      updated_at: Date.now(),
    });
  }
});

export function listImageAlts(limit = 100, offset = 0): AltRow[] {
  return stmtAltList.all(limit, offset) as AltRow[];
}

export function countImageAlts(): number {
  return (stmtAltCount.get() as { n: number }).n;
}

export default db;

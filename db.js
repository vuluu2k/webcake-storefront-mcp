import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "webcake-mcp.db");

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

export function getConfig(key) {
  const row = stmtGet.get(key);
  return row ? row.value : null;
}

export function setConfig(key, value) {
  stmtSet.run(key, String(value));
}

export function delConfig(key) {
  stmtDel.run(key);
}

export function getAllConfig() {
  const rows = stmtAll.all();
  const result = {};
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

export function getImageAlt(urlKey) {
  return stmtAltGet.get(urlKey) || null;
}

export function getImageAlts(urlKeys) {
  const out = new Map();
  for (const k of urlKeys) {
    const row = stmtAltGet.get(k);
    if (row) out.set(k, row);
  }
  return out;
}

export function setImageAlt({ url_key, url, alt, source = "ai" }) {
  stmtAltSet.run({ url_key, url, alt, source, updated_at: Date.now() });
}

export const setImageAlts = db.transaction((items) => {
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

export function listImageAlts(limit = 100, offset = 0) {
  return stmtAltList.all(limit, offset);
}

export function countImageAlts() {
  return stmtAltCount.get().n;
}

export default db;

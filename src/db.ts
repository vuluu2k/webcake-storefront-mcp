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

// ── Page-draft cache (durable, build-a-page-incrementally) ────────────────────
// An AI builds a page section-by-section into this LOCAL cache first (safe against
// timeouts / dropped turns), then commits it to the backend INCREMENTALLY. Every
// mutation is written to disk so a draft survives a crash / process exit, and a
// half-committed draft (page_id + committed_count set) can RESUME where it stopped.
export interface PageDraftMeta {
  name: string;
  slug: string;
  type?: string;
  is_homepage?: boolean;
  seo?: any;
}
export interface PageDraft {
  draft_id: string;
  site_id: string;
  meta: PageDraftMeta;
  sections: any[];
  page_id?: string;
  committed_count?: number;
  created_at: number;
  updated_at: number;
}
export interface PageDraftSummary {
  draft_id: string;
  name: string;
  slug: string;
  type?: string;
  sections: number;
  page_id?: string;
  committed_count?: number;
  updated_at: number;
}

const PAGE_DRAFTS_FILE = join(CONFIG_DIR, "page-drafts.json");
const pageDrafts: Record<string, PageDraft> = readJson<Record<string, PageDraft>>(PAGE_DRAFTS_FILE, {});

function persistDrafts(): void {
  writeJson(PAGE_DRAFTS_FILE, pageDrafts);
}

function randomDraftId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `DRAFT-${s}`;
}

export function createDraft(siteId: string, meta: PageDraftMeta): PageDraft {
  const now = Date.now();
  const draft: PageDraft = {
    draft_id: randomDraftId(),
    site_id: siteId,
    meta,
    sections: [],
    created_at: now,
    updated_at: now,
  };
  pageDrafts[draft.draft_id] = draft;
  persistDrafts();
  return draft;
}

export function getDraft(draftId: string): PageDraft | null {
  return draftId in pageDrafts ? pageDrafts[draftId] : null;
}

export function setDraft(draft: PageDraft): PageDraft {
  draft.updated_at = Date.now();
  pageDrafts[draft.draft_id] = draft;
  persistDrafts();
  return draft;
}

export function appendDraftSection(draftId: string, sectionNode: any): PageDraft | null {
  const draft = getDraft(draftId);
  if (!draft) return null;
  draft.sections.push(sectionNode);
  return setDraft(draft);
}

export function listDrafts(siteId: string): PageDraftSummary[] {
  return Object.values(pageDrafts)
    .filter((d) => d.site_id === siteId)
    .map((d) => ({
      draft_id: d.draft_id,
      name: d.meta.name,
      slug: d.meta.slug,
      type: d.meta.type,
      sections: d.sections.length,
      page_id: d.page_id,
      committed_count: d.committed_count,
      updated_at: d.updated_at,
    }));
}

export function delDraft(draftId: string): void {
  delete pageDrafts[draftId];
  persistDrafts();
}

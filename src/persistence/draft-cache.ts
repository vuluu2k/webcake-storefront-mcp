/**
 * Durable-enough page-draft store for the build-a-page-incrementally workflow.
 *
 * An AI builds a page section-by-section into this cache (safe against timeouts /
 * dropped turns), then commits it to the backend INCREMENTALLY. A half-committed
 * draft keeps its page_id + committed_count so commit_page_draft can RESUME.
 *
 * BACKEND: Redis when REDIS_URL/WEBCAKE_REDIS_URL is set (so drafts are shared
 * across all `serve` instances and survive a restart — the right place for the
 * remote shared host), else an in-memory Map (stdio / `npx` / offline). The cache
 * is DISPOSABLE either way — a lost draft (process restart, eviction, expiry) just
 * means the model re-sends the sections, never a failure. No credentials are
 * stored: only the source/meta. Persisting still uses the CALLER's own creds, and
 * draft_ids are random/unguessable.
 *
 * Bounded + TTL'd (SLIDING: every get/update refreshes the clock, so a draft being
 * actively worked on never expires mid-workflow). Redis does the sliding TTL via
 * PEXPIRE; the memory path sweeps on each touch.
 *
 * All functions are async (the Redis backend is async). Callers `await` them.
 */
import { randomUUID } from "node:crypto";
import { getRedis } from "./redis.js";

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
  created: number; // ms; refreshed on every set — sliding TTL clock
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

/** Draft lifetime — default 2 hours. Override via WEBCAKE_DRAFT_TTL_MS env. */
const TTL_MS = (() => {
  const v = parseInt(process.env.WEBCAKE_DRAFT_TTL_MS ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : 2 * 60 * 60 * 1000;
})();
const MAX_ENTRIES = 50;
const REDIS_PREFIX = "wcs:draft:";
const REDIS_IDX_PREFIX = "wcs:draftidx:"; // per-site SET of draft_ids → powers listDrafts

// ---- In-memory fallback (used when no REDIS_URL) ---------------------------
const store = new Map<string, PageDraft>();

function sweep(now: number): void {
  for (const [id, d] of store) if (now - d.created > TTL_MS) store.delete(id);
  while (store.size > MAX_ENTRIES) {
    let oldestId: string | undefined;
    let oldestTs = Infinity;
    for (const [id, d] of store) {
      if (d.created < oldestTs) {
        oldestTs = d.created;
        oldestId = id;
      }
    }
    if (oldestId) store.delete(oldestId);
    else break;
  }
}

function newId(): string {
  return `DRAFT-${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function summarize(d: PageDraft): PageDraftSummary {
  return {
    draft_id: d.draft_id,
    name: d.meta.name,
    slug: d.meta.slug,
    type: d.meta.type,
    sections: d.sections.length,
    page_id: d.page_id,
    committed_count: d.committed_count,
    updated_at: d.created,
  };
}

/** Create + persist a new empty draft, indexed under its site so listDrafts finds it. */
export async function createDraft(siteId: string, meta: PageDraftMeta): Promise<PageDraft> {
  const now = Date.now();
  const draft: PageDraft = { draft_id: newId(), site_id: siteId, meta, sections: [], created: now };
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(REDIS_PREFIX + draft.draft_id, JSON.stringify(draft), "PX", TTL_MS);
      await redis.sadd(REDIS_IDX_PREFIX + siteId, draft.draft_id);
      return draft;
    } catch (e: any) {
      console.error("[draft-cache] redis create failed, using memory:", e?.message ?? e);
    }
  }
  sweep(now);
  store.set(draft.draft_id, draft);
  return draft;
}

/** Fetch a live (non-expired) draft, or null if missing/expired. Slides the TTL on touch. */
export async function getDraft(draftId: string): Promise<PageDraft | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(REDIS_PREFIX + draftId);
      if (!raw) return null;
      await redis.pexpire(REDIS_PREFIX + draftId, TTL_MS); // slide the TTL on every touch
      return JSON.parse(raw) as PageDraft;
    } catch (e: any) {
      console.error("[draft-cache] redis get failed, using memory:", e?.message ?? e);
    }
  }
  const now = Date.now();
  sweep(now);
  const d = store.get(draftId);
  if (d) d.created = now; // slide the memory TTL on touch
  return d ?? null;
}

/** Persist a draft, refreshing its created clock (re-set with TTL). */
export async function setDraft(draft: PageDraft): Promise<void> {
  draft.created = Date.now();
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(REDIS_PREFIX + draft.draft_id, JSON.stringify(draft), "PX", TTL_MS);
      await redis.sadd(REDIS_IDX_PREFIX + draft.site_id, draft.draft_id);
      return;
    } catch (e: any) {
      console.error("[draft-cache] redis set failed, using memory:", e?.message ?? e);
    }
  }
  sweep(draft.created);
  store.set(draft.draft_id, draft);
}

/** Append one section to a draft and persist. Returns the updated draft, or null if missing. */
export async function appendDraftSection(draftId: string, sectionNode: any): Promise<PageDraft | null> {
  const draft = await getDraft(draftId);
  if (!draft) return null;
  draft.sections.push(sectionNode);
  await setDraft(draft);
  return draft;
}

/** Summaries of every live draft for a site. */
export async function listDrafts(siteId: string): Promise<PageDraftSummary[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const ids = await redis.smembers(REDIS_IDX_PREFIX + siteId);
      const out: PageDraftSummary[] = [];
      const stale: string[] = [];
      for (const id of ids) {
        const raw = await redis.get(REDIS_PREFIX + id);
        if (!raw) {
          stale.push(id); // expired/evicted — drop from the index
          continue;
        }
        out.push(summarize(JSON.parse(raw) as PageDraft));
      }
      if (stale.length) {
        try {
          await redis.srem(REDIS_IDX_PREFIX + siteId, ...stale);
        } catch {
          /* best-effort index cleanup */
        }
      }
      return out;
    } catch (e: any) {
      console.error("[draft-cache] redis list failed, using memory:", e?.message ?? e);
    }
  }
  const now = Date.now();
  sweep(now);
  const out: PageDraftSummary[] = [];
  for (const d of store.values()) if (d.site_id === siteId) out.push(summarize(d));
  return out;
}

/** Delete a draft + remove it from its site index (best-effort site lookup). */
export async function delDraft(draftId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      let siteId: string | undefined;
      const raw = await redis.get(REDIS_PREFIX + draftId);
      if (raw) {
        try {
          siteId = (JSON.parse(raw) as PageDraft).site_id;
        } catch {
          /* ignore malformed entry */
        }
      }
      await redis.del(REDIS_PREFIX + draftId);
      if (siteId) await redis.srem(REDIS_IDX_PREFIX + siteId, draftId);
      return;
    } catch (e: any) {
      console.error("[draft-cache] redis del failed, using memory:", e?.message ?? e);
    }
  }
  store.delete(draftId);
}

// Image-upload cache (source URL/path → WebCake CDN URL), keyed per site.
//
// WHERE IT LIVES:
//   - Remote (`serve`) with REDIS_URL set → Redis (shared across all requests/instances,
//     survives container restarts/redeploys; this is the right place for multi-user mode).
//   - stdio / npx / no Redis → a local JSON file (~/.webcake-storefront-mcp/image-cache.json)
//     via db.ts. Single-user, persists on the user's machine.
// Redis is tried first; on any Redis miss/error we fall back to the file store, so the
// cache degrades gracefully and never blocks an upload.
import { getRedis } from "./redis.js";
import { getCachedUpload as fileGet, setCachedUpload as fileSet } from "../db.js";

const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days — CDN urls are effectively permanent
const redisKey = (siteId: string, source: string) => `imgc:${siteId}:${source}`;

export async function getCachedUpload(siteId: string, source: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get(redisKey(siteId, source));
      if (v) return v;
    } catch {
      /* fall through to the file store */
    }
  }
  return fileGet(siteId, source);
}

export async function setCachedUpload(siteId: string, source: string, cdnUrl: string): Promise<void> {
  if (!siteId || !source || !cdnUrl) return;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(redisKey(siteId, source), cdnUrl, "PX", TTL_MS);
      return;
    } catch {
      /* fall through to the file store */
    }
  }
  fileSet(siteId, source, cdnUrl);
}

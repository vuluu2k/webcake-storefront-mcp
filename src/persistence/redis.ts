/**
 * Lazy, shared ioredis client used as a SHORT-TTL CACHE for OAuth access-token
 * lookups (access_token → {jwt,wsid}). Returns null when no REDIS_URL is
 * configured OR ioredis isn't installed — every caller then falls back to going
 * directly to Postgres (or the in-memory map), so stdio/`npx` users and the
 * offline `npm run smoke` gate keep working with ZERO infra.
 *
 * The cache is intentionally disposable: losing Redis (restart, eviction,
 * expiry) just adds one Postgres round-trip per /mcp request — never a failure.
 * We never block startup on the connection and tolerate command errors by
 * degrading to the source-of-truth store on a per-call basis.
 *
 * ioredis is an OPTIONAL, CJS dependency (see package.json), so we require it via
 * createRequire under ESM/Node16. `new Redis(url)` returns immediately and
 * connects in the background; commands queue until the socket is up.
 *
 * Configure with REDIS_URL (or WEBCAKE_REDIS_URL), e.g. redis://default:pw@host:6379/0
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** The minimal slice of the ioredis surface the OAuth cache + page-draft cache use. */
export type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, mode?: string, ttl?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  pexpire(key: string, ms: number): Promise<unknown>;
  // Set ops — power the per-site page-draft index (draft-cache.ts).
  sadd(key: string, ...members: string[]): Promise<unknown>;
  srem(key: string, ...members: string[]): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  on(ev: string, cb: (...a: unknown[]) => void): unknown;
};

let cached: RedisLike | null | undefined; // undefined = not yet resolved

function redactUrl(u: string): string {
  try {
    const x = new URL(u);
    if (x.password) x.password = "***";
    return x.toString();
  } catch {
    return "redis";
  }
}

/**
 * Returns the shared Redis client, or null if Redis isn't configured/available.
 * Memoized: resolves the connection (or its absence) exactly once per process.
 */
export function getRedis(): RedisLike | null {
  if (cached !== undefined) return cached;
  const url = process.env.REDIS_URL || process.env.WEBCAKE_REDIS_URL;
  if (!url) return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("ioredis") as { default?: new (url: string, opts: object) => RedisLike } & (new (url: string, opts: object) => RedisLike);
    const Redis = mod.default ?? mod;
    const client: RedisLike = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
      // Never let a connection blip crash the process — log and keep retrying.
      retryStrategy: (times: number) => Math.min(times * 200, 3000),
    });
    client.on("error", (e: unknown) => console.error("[redis] error:", (e as Error)?.message ?? e));
    console.error(`[redis] OAuth token cache: ${redactUrl(url)}`);
    cached = client;
  } catch (e: unknown) {
    console.error("[redis] unavailable, using direct store lookups:", (e as Error)?.message ?? e);
    cached = null;
  }
  return cached;
}

/** True when a Redis cache backend is configured (used for log/diagnostics). */
export function redisEnabled(): boolean {
  return getRedis() !== null;
}

/**
 * Per-ACCOUNT preferences for the remote server (the saved site, confirm mode). In stdio
 * these live in the local config file; on a shared server that file would be shared by
 * every user, so remote sessions keep them here instead, keyed by the JWT's account_id.
 * Postgres (durable, shared by every instance) → Redis → process memory.
 *
 * Only an allowlist is stored — never tokens or session ids.
 */
import { getPg } from "./postgres.js";
import { getRedis } from "./redis.js";

const KEYS = new Set(["site_id", "site_name", "site_domain", "confirm_mode"]);
const REDIS_PREFIX = "wc:sf:prefs:";
const mem = new Map<string, Record<string, string>>();

let tableReady: Promise<boolean> | undefined;
function ensureTable(): Promise<boolean> {
  const pool = getPg();
  if (!pool) return Promise.resolve(false);
  tableReady ??= pool
    .query(`CREATE TABLE IF NOT EXISTS mcp_account_prefs (account_id text PRIMARY KEY, prefs jsonb NOT NULL, updated_at bigint NOT NULL)`)
    .then(() => true)
    .catch((e) => {
      console.error("[prefs] table init failed, using redis/memory:", e?.message ?? e);
      return false;
    });
  return tableReady;
}

/** The account a WebCake JWT belongs to (payload.account_id), unverified — the backend verifies the token itself. */
export function accountOf(jwt: string | undefined): string | undefined {
  try {
    const id = JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString()).account_id;
    return typeof id === "string" && id ? id : undefined;
  } catch {
    return undefined;
  }
}

export async function loadPrefs(account: string): Promise<Record<string, string>> {
  try {
    if (await ensureTable()) {
      const { rows } = await getPg()!.query(`SELECT prefs FROM mcp_account_prefs WHERE account_id=$1`, [account]);
      return { ...((rows[0]?.prefs as Record<string, string>) ?? {}) };
    }
    const redis = getRedis();
    if (redis) return JSON.parse((await redis.get(REDIS_PREFIX + account)) || "{}");
  } catch (e) {
    console.error("[prefs] load failed:", (e as Error)?.message ?? e);
  }
  return { ...(mem.get(account) ?? {}) };
}

/** Persist one allowlisted key (null = delete). Fire-and-forget; never throws. */
export function savePref(account: string, key: string, value: string | null): void {
  if (!KEYS.has(key)) return;
  const patch = value === null ? {} : { [key]: value };
  (async () => {
    if (await ensureTable()) {
      // Merge in SQL so two instances writing different keys don't clobber each other.
      await getPg()!.query(
        `INSERT INTO mcp_account_prefs (account_id, prefs, updated_at) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (account_id) DO UPDATE SET prefs = (mcp_account_prefs.prefs - $4) || $2::jsonb, updated_at = $3`,
        [account, JSON.stringify(patch), Date.now(), key]
      );
      return;
    }
    const redis = getRedis();
    if (redis) {
      // ponytail: read-modify-write, last writer wins; Postgres path is the atomic one.
      const cur = JSON.parse((await redis.get(REDIS_PREFIX + account)) || "{}");
      if (value === null) delete cur[key];
      else cur[key] = value;
      await redis.set(REDIS_PREFIX + account, JSON.stringify(cur));
      return;
    }
    const cur = mem.get(account) ?? {};
    if (value === null) delete cur[key];
    else cur[key] = value;
    mem.set(account, cur);
  })().catch((e) => console.error("[prefs] save failed:", e?.message ?? e));
}

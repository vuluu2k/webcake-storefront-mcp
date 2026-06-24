import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

/**
 * Large-result cache — "cache first, then split-read".
 *
 * Some endpoints return payloads far larger than a single tool result can carry (a real
 * site's global_sections tree is >1MB). Instead of overflowing, a tool can hand its big
 * payload to `cacheLarge()`: small payloads pass straight through, large ones are stored
 * in a session cache (10-min TTL) and the tool returns a compact HANDLE — id + size +
 * preview — that the AI pages through with `read_cached_result(cache_id, offset, length)`.
 *
 * In-memory + per-session: no disk, cleared on server restart, pruned by TTL.
 */

interface Entry { text: string; label: string; created: number }

const _cache = new Map<string, Entry>();
let _seq = 0;
const TTL_MS = 10 * 60 * 1000;
const DEFAULT_THRESHOLD = 20000; // chars — comfortably under the tool-result token budget
const DEFAULT_CHUNK = 12000;

function prune(now: number): void {
  for (const [k, v] of _cache) if (now - v.created > TTL_MS) _cache.delete(k);
}

/**
 * Pass-through if small, otherwise cache and return a read handle.
 * @returns `{ cached:false, data }` or `{ cached:true, cache_id, total_chars, ... }`
 */
export function cacheLarge(label: string, data: any, threshold = DEFAULT_THRESHOLD): any {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  if (text.length <= threshold) return { cached: false, data };

  const now = Date.now();
  prune(now);
  const id = `cache-${++_seq}`;
  _cache.set(id, { text, label, created: now });
  return {
    cached: true,
    cache_id: id,
    label,
    total_chars: text.length,
    total_lines: text.split("\n").length,
    preview: text.slice(0, 1500),
    hint: `Large result cached (${text.length} chars). Read it in chunks with read_cached_result(cache_id="${id}", offset:0, length:${DEFAULT_CHUNK}). Expires in ${TTL_MS / 60000} min.`,
  };
}

/** Direct accessor for other modules (e.g. to peek a cached entry). */
export function getCached(id: string): Entry | undefined {
  return _cache.get(id);
}

export function registerResultCacheTools(server: McpServer, _api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "read_cached_result",
    `Read a slice of a large cached result produced by another tool (look for "cached":true + a cache_id in its output).
Page through with offset/length; the response reports next_offset + remaining_chars until done.`,
    {
      cache_id: z.string().describe('The cache_id returned by the producing tool (e.g. "cache-3")'),
      offset: z.number().default(0).describe("Start character offset (default 0)"),
      length: z.number().default(DEFAULT_CHUNK).describe(`Number of characters to return (default ${DEFAULT_CHUNK})`),
    },
    ({ cache_id, offset, length }) =>
      handle(async () => {
        const entry = _cache.get(cache_id);
        if (!entry) return { error: `Cache "${cache_id}" not found or expired. Re-run the producing tool.` };
        const start = Math.max(0, offset);
        const end = Math.min(entry.text.length, start + Math.max(1, length));
        const slice = entry.text.slice(start, end);
        const done = end >= entry.text.length;
        return {
          cache_id,
          label: entry.label,
          offset: start,
          returned_chars: slice.length,
          total_chars: entry.text.length,
          next_offset: done ? null : end,
          remaining_chars: entry.text.length - end,
          done,
          chunk: slice,
        };
      })
  );

  server.tool(
    "list_cached_results",
    "List the large results currently held in the session cache (id, label, size, age).",
    {},
    () =>
      handle(async () => {
        const now = Date.now();
        prune(now);
        return {
          count: _cache.size,
          cached: [..._cache.entries()].map(([id, e]) => ({
            cache_id: id,
            label: e.label,
            total_chars: e.text.length,
            age_seconds: Math.round((now - e.created) / 1000),
          })),
        };
      })
  );
}

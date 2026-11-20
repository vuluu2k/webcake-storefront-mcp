/**
 * Page reads for the tools: the per-page routes when the backend has them (one page + its version,
 * metadata without sources), else GET /pages. Every answer is checked for its shape before it is
 * trusted, so an older backend — or a stub — that answers something else falls back to GET /pages.
 */
import type { WebcakeCmsApi } from "../api.js";

const listOf = (r: any): any[] => (Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []);

/** Page metadata (no sources); GET /pages when the metadata list comes back empty or malformed. */
export async function pagesMeta(api: WebcakeCmsApi): Promise<any[]> {
  const meta = listOf(await (api as any).listPagesMeta?.().catch(() => null));
  return meta.length ? meta : listOf(await api.listPages());
}

/** One page in GET /pages' item shape (`source: { source: <raw> }`) and the version it was read at. */
export async function pageWithSource(api: WebcakeCmsApi, pageId: string): Promise<{ page: any; version?: string } | null> {
  const one: any = await (api as any).getPageSourceOne?.(pageId).catch((e: any) => (e?.status === 422 ? "missing" : Promise.reject(e)));
  if (one === "missing") return null;
  if (one && typeof one.raw === "string" && typeof one.version === "string") {
    const meta = (await pagesMeta(api)).find((p: any) => p && p.id === pageId);
    if (meta) return { page: { ...meta, source: { source: one.raw, custom_code: one.custom_code } }, version: one.version };
  }
  const page = listOf(await api.listPages()).find((p: any) => p && p.id === pageId);
  return page ? { page } : null;
}

/** Pages with sources for a scan: just `pageId` when given, else every page. */
export async function pagesWithSources(api: WebcakeCmsApi, pageId?: string): Promise<any[]> {
  if (!pageId) return listOf(await api.listPages());
  const got = await pageWithSource(api, pageId);
  return got ? [got.page] : [];
}

// The cross-source context a page write is judged in: the page's kind and every node id that lives
// in the site's global sources (popups, the cart drawer, other components). With it, an event
// target that exists nowhere and a popup_id that names no popup are errors instead of guesses.
import type { WebcakeCmsApi } from "../api.js";
import type { PageContext } from "../builder/page.js";
import { PAGE_TYPE_NUM } from "./builder.js";

const TTL = 60_000;
const cache = new Map<string, { at: number; ids: Set<string>; popups: Set<string> }>();

const listOf = (res: any) => (Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : null);
const parse = (v: any) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

/** Page kind name from a page record (numeric `type`, or already a name). */
export function kindOfPage(page: any): string | undefined {
  const t = page?.type;
  if (typeof t === "string" && t in PAGE_TYPE_NUM) return t;
  const n = Number(t);
  return Object.entries(PAGE_TYPE_NUM).find(([, v]) => v === n)?.[0];
}

/** Context for validatePage. If the global sources can't be read, only the kind is returned and the
 *  cross-source checks stay warnings (never block on missing knowledge). */
export async function loadPageContext(api: WebcakeCmsApi, kind?: string): Promise<PageContext> {
  const key = String((api as any).siteId || "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { kind, externalIds: hit.ids, popupIds: hit.popups };
  const [gs, cart] = await Promise.all([
    Promise.resolve().then(() => ((api as any).getAllGlobalSources ? (api as any).getAllGlobalSources() : (api as any).getGlobalSources?.({}))).catch(() => null),
    Promise.resolve().then(() => (api as any).getSourceCart?.()).catch(() => null),
  ]);
  const lists = [listOf(gs), listOf(cart)];
  if (lists.some((l) => l === null)) return { kind };
  const ids = new Set<string>();
  const popups = new Set<string>();
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n.sections)) return n.sections.forEach(walk);
    if (typeof n.id === "string") {
      ids.add(n.id);
      if (n.type === "popup") popups.add(n.id);
    }
    for (const c of Array.isArray(n.children) ? n.children : []) walk(c);
  };
  for (const item of lists.flat()) walk(parse(item?.source));
  cache.set(key, { at: Date.now(), ids, popups });
  return { kind, externalIds: ids, popupIds: popups };
}

/** Forget cached global sources (any global source write: a new popup must be targetable at once). */
export const forgetPageContext = () => cache.clear();

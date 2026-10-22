// Site plans (gói cước): read a site's subscription, count the account's sites by plan /
// custom domain / trash, list the plan catalog. All account-token endpoints (no super-admin).
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

const DAY = 86_400_000;
/** Storefront keeps serving on the default link this long after expiry (time_live_active_site). */
export const GRACE_DAYS = 15;
const DEFAULT_DOMAIN_SUFFIXES = ["webcake.me", "mywebcake.com", "storecake.net", "storecake.io"];
export const SITE_FILTERS = ["all", "removed"] as const;

export const PLAN_NOTES = [
  `After expiry the storefront keeps running on the default link for ${GRACE_DAYS} days.`,
  "A custom domain is removed right after the plan expires.",
  "A site with no plan on a default domain is blocked 10 minutes after published_at.",
];

/** Only "all" | "removed" are accepted — anything else makes the backend 500. */
export function normalizeSiteFilter(filter?: string): "all" | "removed" {
  const f = (filter ?? "all").trim().toLowerCase();
  if (f === "all" || f === "removed") return f;
  throw new Error(`Invalid filter "${filter}": use "all" (active sites) or "removed" (trash).`);
}

export function isDefaultDomain(domain?: string | null): boolean {
  const d = String(domain || "").trim().toLowerCase().replace(/\.$/, "");
  return DEFAULT_DOMAIN_SUFFIXES.some((s) => d === s || d.endsWith(`.${s}`));
}

/** A site is "published on its own domain" when its primary domain is a verified, live, non-default domain. */
export function hasCustomDomain(site: any): boolean {
  const pd = site?.primary_domain;
  return !!(pd?.domain && pd.is_verified && !pd.is_blocked && !pd.is_deleted && !isDefaultDomain(pd.domain));
}

/** Whitelist one subscription row — rows also carry stripe_client_secret, qr_data, virtual_account,
 *  infor_bill, phone_number, commissions and nested site/owner, none of which may leave this server. */
export function sanitizeSubscription(r: any) {
  return {
    plan_name: r?.package?.name ?? null,
    package_id: r?.package_id ?? null,
    duration: r?.duration ?? null,
    payment_amount: r?.payment_amount ?? null,
    currency: r?.currency ?? null,
    is_paid: !!r?.is_paid,
    is_activated: !!r?.is_activated,
    activated_at: r?.activated_at ?? null,
    expired_at: r?.expired_at ?? null,
    upgrade_from: r?.upgrade_from ?? null,
    inserted_at: r?.inserted_at ?? null,
  };
}

const ts = (v: any) => (v ? Date.parse(v) || 0 : 0);

/** Current plan of a site from its (sanitized) subscription rows. Active = paid && activated && not expired. */
export function summarizePlan(rows: ReturnType<typeof sanitizeSubscription>[], now = Date.now()) {
  const byExpiry = (a: any, b: any) => ts(b.expired_at) - ts(a.expired_at);
  const active = rows.filter((r) => r.is_paid && r.is_activated && ts(r.expired_at) > now).sort(byExpiry)[0];
  const lastPaid = rows.filter((r) => r.is_paid && r.is_activated).sort(byExpiry)[0];
  const latest = [...rows].sort((a, b) => ts(b.inserted_at) - ts(a.inserted_at))[0];

  let status: "active" | "expired" | "pending_payment" | "none";
  let row: any;
  if (active) [status, row] = ["active", active];
  else if (latest && !(latest.is_paid && latest.is_activated)) [status, row] = ["pending_payment", latest];
  else if (lastPaid) [status, row] = ["expired", lastPaid];
  else [status, row] = ["none", null];

  const exp = row ? ts(row.expired_at) : 0;
  const out: any = {
    plan_name: row?.plan_name ?? null,
    status,
    expired_at: row?.expired_at ?? null,
    days_left: status === "active" && exp ? Math.ceil((exp - now) / DAY) : null,
  };
  if (status === "expired" && exp) {
    out.grace_until = new Date(exp + GRACE_DAYS * DAY).toISOString();
    out.in_grace = now < exp + GRACE_DAYS * DAY;
  }
  if (status === "pending_payment" && lastPaid) out.last_expired_at = lastPaid.expired_at;
  return out;
}

const unwrapSubs = (res: any): any[] => {
  const s = res?.subscriptions ?? res?.data?.subscriptions;
  return Array.isArray(s?.data) ? s.data : [];
};

async function readSitePlan(api: WebcakeCmsApi, siteId: string) {
  try {
    return unwrapSubs(await api.getSiteSubscriptions(siteId)).map(sanitizeSubscription);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("API 404")) {
      throw new Error(`Site ${siteId} not found or deleted (in trash). The plan of a deleted site cannot be read — restore it first.`);
    }
    throw e;
  }
}

/** Run `fn` over items with at most `limit` in flight. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const unwrapSites = (res: any) => {
  const d = res?.data ?? res ?? {};
  return { sites: Array.isArray(d.sites) ? d.sites : [], total: Number(d.total_entries) || 0 };
};

export function registerSitePlanTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "get_site_subscription",
    `Read a site's plan (gói cước): the current plan_name, status (active | expired | pending_payment | none),
expired_at and days_left, plus the purchase history (package name, duration, amount, paid/activated, dates).
Active = paid && activated && expired_at in the future. No row = the site has no plan (free).
${PLAN_NOTES.join(" ")}
A site in trash cannot be read (backend 404).`,
    { site_id: z.string().optional().describe("Site id (default: current site)") },
    ({ site_id }) =>
      handle(async () => {
        const id = site_id || api.siteId;
        const rows = await readSitePlan(api, id);
        return { site_id: id, ...summarizePlan(rows), history: rows, notes: PLAN_NOTES };
      })
  );

  server.tool(
    "count_my_sites",
    `Count the account's PERSONAL sites: active total, deleted (in trash), active by plan (paid && activated && not expired)
with a per-plan breakdown, no plan, expired, pending payment, and sites on a verified custom domain.
Plans are read per site (≤5 in parallel, up to max_sites); beyond that the result says checked/total.
Notes: "published" is approximated by having a verified, non-blocked custom domain — published_at is set when the
site is CREATED, so it does not prove the site was published. Team sites (persona_or_team) are NOT included.`,
    { max_sites: z.number().int().min(1).max(500).default(200).describe("Max sites whose plan is read (default 200)") },
    ({ max_sites }) =>
      handle(async () => {
        const all: any[] = [];
        let total = 0;
        for (let page = 1; page <= 100; page++) {
          const r = unwrapSites(await api.listMySites({ page, limit: 100, filter: "all" }));
          total = r.total;
          all.push(...r.sites);
          if (!r.sites.length || all.length >= total) break;
        }
        const removed = unwrapSites(await api.listMySites({ page: 1, limit: 1, filter: "removed" })).total;

        const checked = all.slice(0, max_sites);
        const now = Date.now();
        const plans = await pool(checked, 5, (s: any) =>
          readSitePlan(api, s.id).then((rows) => summarizePlan(rows, now), () => null)
        );

        const by_plan_name: Record<string, number> = {};
        const count = { active: 0, expired: 0, pending_payment: 0, none: 0 };
        let errors = 0;
        for (const p of plans) {
          if (!p) { errors++; continue; }
          count[p.status as keyof typeof count]++;
          if (p.status === "active") by_plan_name[p.plan_name || "(unnamed)"] = (by_plan_name[p.plan_name || "(unnamed)"] || 0) + 1;
        }
        return {
          total_active_sites: total || all.length,
          deleted_sites: removed,
          active_by_plan: count.active,
          by_plan_name,
          no_plan: count.none,
          expired: count.expired,
          pending_payment: count.pending_payment,
          custom_domain_sites: all.filter(hasCustomDomain).length,
          checked: checked.length,
          total: total || all.length,
          ...(errors && { plan_read_errors: errors }),
          ...(checked.length < (total || all.length) && { partial: `Plans checked for ${checked.length}/${total} sites; raise max_sites for full coverage.` }),
          notes: [
            "Team sites are not included (personal sites only).",
            "custom_domain_sites = verified, not blocked/deleted, not *.webcake.me / *.mywebcake.com / *.storecake.net / *.storecake.io. published_at is set at creation, so it is not used.",
            ...PLAN_NOTES,
          ],
        };
      })
  );

  server.tool(
    "list_plans",
    "List the plan catalog (gói cước): id, name, description, attributes. Plan names are free text, not an enum.",
    {},
    () =>
      handle(async () => {
        const res: any = await api.listPackages();
        const list: any[] = res?.packages?.data ?? res?.data?.packages?.data ?? [];
        return list.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? null,
          package_attributes: p.package_attributes ?? [],
          is_hidden: !!p.is_hidden,
        }));
      })
  );
}

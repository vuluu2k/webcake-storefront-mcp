// Site plan tools: subscription summary, secret whitelist, filter validation, custom-domain detection,
// and count_my_sites over a stubbed fetch. Run: npm test. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebcakeCmsApi } from "../dist/api.js";
import { createServer } from "../dist/server.js";
import { summarizePlan, sanitizeSubscription, normalizeSiteFilter, hasCustomDomain, isDefaultDomain } from "../dist/tools/site-plans.js";

const NOW = Date.parse("2026-10-22T00:00:00Z");
const day = (n) => new Date(NOW + n * 86_400_000).toISOString();
const row = (o) => sanitizeSubscription({ package: { name: "PRO" }, is_paid: true, is_activated: true, inserted_at: day(-30), ...o });

test("summarizePlan: active / expired / pending_payment / none", () => {
  const active = summarizePlan([row({ expired_at: day(-40), inserted_at: day(-400) }), row({ expired_at: day(10) })], NOW);
  assert.equal(active.status, "active");
  assert.equal(active.plan_name, "PRO");
  assert.equal(active.days_left, 10);

  const expired = summarizePlan([row({ expired_at: day(-5) })], NOW);
  assert.equal(expired.status, "expired");
  assert.equal(expired.days_left, null);
  assert.equal(expired.in_grace, true);
  assert.equal(expired.grace_until, day(10));

  const pending = summarizePlan([row({ expired_at: day(-5) }), row({ package: { name: "STANDARD" }, is_paid: false, is_activated: false, expired_at: day(360), inserted_at: day(-1) })], NOW);
  assert.equal(pending.status, "pending_payment");
  assert.equal(pending.plan_name, "STANDARD");
  assert.equal(pending.last_expired_at, day(-5));

  assert.equal(summarizePlan([], NOW).status, "none");
  // Activated but never paid does not count as active.
  assert.notEqual(summarizePlan([row({ is_paid: false, expired_at: day(10) })], NOW).status, "active");
});

test("sanitizeSubscription strips payment secrets and nested site/owner", () => {
  const out = sanitizeSubscription({
    package: { name: "BASIC", package_attributes: [{ x: 1 }] }, duration: 12, payment_amount: 100, currency: "VND",
    stripe_client_secret: "pi_secret", qr_data: "QR", virtual_account: "VA", infor_bill: { tax: 1 }, phone_number: "0900",
    commission: 5, site: { id: "S" }, owner: { email: "a@b.c" },
  });
  const s = JSON.stringify(out);
  for (const k of ["stripe_client_secret", "pi_secret", "qr_data", "virtual_account", "infor_bill", "phone_number", "0900", "commission", "owner", "a@b.c"]) {
    assert.ok(!s.includes(k), `leaked ${k}`);
  }
  assert.equal(out.plan_name, "BASIC");
  assert.equal(out.payment_amount, 100);
});

test("normalizeSiteFilter accepts only all | removed", () => {
  assert.equal(normalizeSiteFilter(), "all");
  assert.equal(normalizeSiteFilter("removed"), "removed");
  assert.throws(() => normalizeSiteFilter("deleted"), /Invalid filter/);
});

test("custom-domain detection excludes default domains and unverified/blocked/deleted", () => {
  for (const d of ["shop.webcake.me", "a.mywebcake.com", "x.storecake.net", "y.storecake.io", "webcake.me"]) assert.ok(isDefaultDomain(d), d);
  assert.ok(!isDefaultDomain("mywebcake.me.example.com"));
  const pd = (o) => ({ primary_domain: { domain: "shop.vn", is_verified: true, is_blocked: false, is_deleted: false, ...o } });
  assert.ok(hasCustomDomain(pd({})));
  assert.ok(!hasCustomDomain(pd({ is_verified: false })));
  assert.ok(!hasCustomDomain(pd({ is_blocked: true })));
  assert.ok(!hasCustomDomain(pd({ is_deleted: true })));
  assert.ok(!hasCustomDomain(pd({ domain: "shop.webcake.me" })));
  assert.ok(!hasCustomDomain({}));
});

/** Real api with fetch stubbed by path + query. */
function stubFetch(reply) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const [status, body] = reply(u);
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
const call = async (s, name, args) => {
  const r = await s._registeredTools[name].handler(args ?? {}, {});
  return { isError: !!r.isError, text: r.content[0].text, json: (() => { try { return JSON.parse(r.content[0].text); } catch { return null; } })() };
};

test("count_my_sites paginates, reads plans, counts domains and trash", async () => {
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const sites = [
    { id: "A", primary_domain: { domain: "a.vn", is_verified: true } },
    { id: "B", primary_domain: { domain: "b.webcake.me", is_verified: true } },
    { id: "C" },
  ];
  const subs = {
    A: [{ package: { name: "PRO" }, is_paid: true, is_activated: true, expired_at: future, stripe_client_secret: "x" }],
    B: [{ package: { name: "BASIC" }, is_paid: true, is_activated: true, expired_at: "2020-01-01T00:00:00Z" }],
    C: [],
  };
  const { calls, restore } = stubFetch((u) => {
    if (u.pathname === "/api/v1/dashboard/site/all") {
      if (u.searchParams.get("filter") === "removed") return [200, { data: { sites: [{ id: "Z" }], total_entries: 4 } }];
      const page = Number(u.searchParams.get("page"));
      return [200, { data: { sites: page === 1 ? sites.slice(0, 2) : page === 2 ? sites.slice(2) : [], total_entries: 3 } }];
    }
    const m = u.pathname.match(/^\/api\/v1\/site\/(\w+)\/get_subsctription_package_by_site_id$/);
    if (m) return [200, { success: true, subscriptions: { data: subs[m[1]], total_entries: subs[m[1]].length } }];
    return [404, {}];
  });
  try {
    const api = new WebcakeCmsApi({ baseUrl: "https://api.test", token: "T", siteId: "A", sessionId: "W" });
    const s = createServer(api, { tools: "all" });
    const { json, isError } = await call(s, "count_my_sites", { max_sites: 200 });
    assert.ok(!isError, JSON.stringify(json));
    assert.equal(json.total_active_sites, 3);
    assert.equal(json.deleted_sites, 4);
    assert.equal(json.active_by_plan, 1);
    assert.deepEqual(json.by_plan_name, { PRO: 1 });
    assert.equal(json.expired, 1);
    assert.equal(json.no_plan, 1);
    assert.equal(json.custom_domain_sites, 1);
    assert.equal(json.checked, 3);
    assert.ok(!json.partial);
    assert.ok(calls.every((u) => u.pathname !== "/api/v1/dashboard/site/all" || ["all", "removed"].includes(u.searchParams.get("filter"))));

    const capped = (await call(s, "count_my_sites", { max_sites: 2 })).json;
    assert.equal(capped.checked, 2);
    assert.match(capped.partial, /2\/3/);
  } finally {
    restore();
  }
});

test("get_site_subscription whitelists rows and explains a deleted site", async () => {
  const { restore } = stubFetch((u) =>
    u.pathname.includes("/site/GONE/") ? [404, { message: "not found" }] : [200, { subscriptions: { data: [{ package: { name: "PRO" }, is_paid: true, is_activated: true, expired_at: "2099-01-01T00:00:00Z", qr_data: "QR", owner: { email: "o@x" } }] } }]
  );
  try {
    const s = createServer(new WebcakeCmsApi({ baseUrl: "https://api.test", token: "T", siteId: "S1", sessionId: "W" }), { tools: "all" });
    const ok = await call(s, "get_site_subscription", {});
    assert.equal(ok.json.status, "active");
    assert.equal(ok.json.site_id, "S1");
    assert.ok(!ok.text.includes("QR") && !ok.text.includes("o@x"));
    const gone = await call(s, "get_site_subscription", { site_id: "GONE" });
    assert.ok(gone.isError);
    assert.match(gone.text, /deleted/);
  } finally {
    restore();
  }
});

test("list_my_sites sends a valid filter and reports custom domains", async () => {
  const { calls, restore } = stubFetch(() => [200, { data: { sites: [{ id: "A", status: 1, site_slug: { slug: "a" }, published_at: "2026-01-01", primary_domain: { domain: "a.vn", is_verified: true } }], total_entries: 1 } }]);
  try {
    const s = createServer(new WebcakeCmsApi({ baseUrl: "https://api.test", token: "T", siteId: "A", sessionId: "W" }));
    const { json } = await call(s, "list_my_sites", { page: 1, limit: 20 });
    assert.equal(calls[0].searchParams.get("filter"), "all");
    assert.deepEqual(
      { slug: json.sites[0].slug, domain: json.sites[0].domain, has_custom_domain: json.sites[0].has_custom_domain, status: json.sites[0].status },
      { slug: "a", domain: "a.vn", has_custom_domain: true, status: 1 }
    );
    const bad = await call(s, "list_my_sites", { page: 1, limit: 20, filter: "deleted" });
    assert.ok(bad.isError);
  } finally {
    restore();
  }
});

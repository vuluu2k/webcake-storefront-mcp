import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.WEBCAKE_CONFIG_DIR = mkdtempSync(join(tmpdir(), "wc-auth-"));
const { WebcakeCmsApi, jwtExpired } = await import("../dist/api.js");
const { isDeadJwt, markJwtDead } = await import("../dist/auth/oauth-server.js");
const { resolveSettings } = await import("../dist/config.js");
const { setConfig } = await import("../dist/db.js");

const jwt = (expSec) => `h.${Buffer.from(JSON.stringify({ exp: expSec })).toString("base64url")}.s`;
const OLD = jwt(Math.floor(Date.now() / 1000) - 3600);
const NEW = jwt(Math.floor(Date.now() / 1000) + 3600);

function mockFetch(handler) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(init.headers.Authorization);
    return handler(init.headers.Authorization);
  };
  return seen;
}
const reply = (status, body) => new Response(body, { status });

test("jwtExpired đọc exp, token không phải JWT thì không coi là hết hạn", () => {
  assert.equal(jwtExpired(OLD), true);
  assert.equal(jwtExpired(NEW), false);
  assert.equal(jwtExpired("opaque"), false);
});

test("token hết hạn → gọi hook gia hạn trước, rồi gửi bằng token mới", async () => {
  const seen = mockFetch(() => reply(200, '{"ok":1}'));
  const api = new WebcakeCmsApi({ baseUrl: "http://x", token: OLD, siteId: "s" });
  let calls = 0;
  api.onAuthExpired = async () => (calls++, { token: NEW, sessionId: "w2" });
  assert.deepEqual(await api.request("GET", "/a"), { ok: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(seen, [`Bearer ${NEW}`]);
  assert.equal(api.sessionId, "w2");
});

test("backend 401 Unauthorized → gia hạn rồi thử lại đúng 1 lần", async () => {
  const seen = mockFetch((auth) => (auth === "Bearer opaque-old" ? reply(401, "Unauthorized") : reply(200, "{}")));
  const api = new WebcakeCmsApi({ baseUrl: "http://x", token: "opaque-old", siteId: "s" });
  api.onAuthExpired = async () => ({ token: "opaque-new" });
  await api.request("GET", "/a");
  assert.deepEqual(seen, ["Bearer opaque-old", "Bearer opaque-new"]);
});

test("gia hạn thất bại → lỗi rõ ràng bảo Kết nối lại", async () => {
  mockFetch(() => reply(401, "Unauthorized"));
  const api = new WebcakeCmsApi({ baseUrl: "http://x", token: "t", siteId: "s" });
  api.onAuthExpired = async () => null;
  await assert.rejects(api.request("GET", "/a"), /hết hạn.*Connect/);
});

test("401 của call dùng admin token riêng không mở Connect", async () => {
  mockFetch(() => reply(401, "Token not found"));
  const api = new WebcakeCmsApi({ baseUrl: "http://x", token: "t", siteId: "s" });
  let calls = 0;
  api.onAuthExpired = async () => (calls++, null);
  await assert.rejects(api.request("GET", "/a", { headers: { Authorization: "Bearer admin" } }), /API 401/);
  assert.equal(calls, 0);
});

test("OAuth: JWT hết hạn hoặc bị backend từ chối là token chết", () => {
  assert.equal(isDeadJwt(OLD), true);
  assert.equal(isDeadJwt(NEW), false);
  markJwtDead("revoked");
  assert.equal(isDeadJwt("revoked"), true);
});

test("token env hết hạn nhường token mới đã lưu sau khi gia hạn", () => {
  process.env.WEBCAKE_TOKEN = OLD;
  process.env.WEBCAKE_SESSION_ID = "w-old";
  setConfig("token", NEW);
  setConfig("session_id", "w-new");
  const s = resolveSettings();
  assert.equal(s.token, NEW);
  assert.equal(s.sessionId, "w-new");
  process.env.WEBCAKE_TOKEN = jwt(Math.floor(Date.now() / 1000) + 60_000);
  assert.equal(resolveSettings().token, process.env.WEBCAKE_TOKEN); // env còn hạn vẫn thắng
  delete process.env.WEBCAKE_TOKEN;
  delete process.env.WEBCAKE_SESSION_ID;
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.WEBCAKE_CONFIG_DIR = mkdtempSync(join(tmpdir(), "wc-auth-"));
const { WebcakeCmsApi, jwtExpired } = await import("../dist/api.js");
const oauth = await import("../dist/auth/oauth-server.js");
const { isDeadJwt, markJwtDead } = oauth;
const { resolveSettings } = await import("../dist/config.js");
const { setConfig, getConfig, runWithConfigScope } = await import("../dist/db.js");

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

test("OAuth: JWT hết hạn hoặc bị backend từ chối là token chết", async () => {
  assert.equal(await isDeadJwt(OLD), true);
  assert.equal(await isDeadJwt(NEW), false);
  await markJwtDead("revoked");
  assert.equal(await isDeadJwt("revoked"), true);
});

test("token chết → thu hồi luôn access/refresh OAuth bọc nó (mọi instance thấy qua store)", async () => {
  const live = jwt(Math.floor(Date.now() / 1000) + 7200);
  const { client } = await oauth.registerClient({ redirect_uris: ["http://localhost:9/cb"] });
  const verifier = "v".repeat(43);
  const st = await oauth.startAuthorize({
    client_id: client.client_id, redirect_uri: "http://localhost:9/cb", response_type: "code",
    code_challenge: oauth.s256(verifier), code_challenge_method: "S256", state: "x",
  });
  const done = await oauth.completeAuthorize(st.internalState, live, "w");
  const tok = await oauth.exchangeToken({ grant_type: "authorization_code", code: done.code, client_id: client.client_id, redirect_uri: "http://localhost:9/cb", code_verifier: verifier });
  assert.equal((await oauth.resolveAccessToken(tok.body.access_token))?.jwt, live);
  await markJwtDead(live);
  assert.equal(await oauth.resolveAccessToken(tok.body.access_token), undefined);
  const again = await oauth.exchangeToken({ grant_type: "refresh_token", refresh_token: tok.body.refresh_token, client_id: client.client_id });
  assert.equal(again.ok, false); // client phải mở lại Connect
});

test("connect thiếu wsid: chỉ nhận khi JWT tự mang session_id", async () => {
  const exp = Math.floor(Date.now() / 1000) + 7200;
  const bare = jwt(exp);
  const withSid = `h.${Buffer.from(JSON.stringify({ exp, session_id: "s1" })).toString("base64url")}.s`;
  const { client } = await oauth.registerClient({ redirect_uris: ["http://localhost:9/cb"] });
  const start = () => oauth.startAuthorize({
    client_id: client.client_id, redirect_uri: "http://localhost:9/cb", response_type: "code",
    code_challenge: oauth.s256("v".repeat(43)), code_challenge_method: "S256", state: "x",
  });
  assert.equal((await oauth.completeAuthorize((await start()).internalState, bare, "")).ok, false);
  assert.equal((await oauth.completeAuthorize((await start()).internalState, withSid, "")).ok, true);
  assert.equal((await oauth.completeAuthorize((await start()).internalState, bare, "w")).ok, true);
});

test("remote: mỗi session đọc/ghi cấu hình riêng, không đụng file chung của server", () => {
  setConfig("site_id", "server-site");
  const a = { values: { site_id: "site-A" } };
  const b = { values: {} };
  runWithConfigScope(a, () => setConfig("confirm_mode", "auto_apply"));
  assert.equal(runWithConfigScope(a, () => getConfig("site_id")), "site-A");
  assert.equal(runWithConfigScope(b, () => getConfig("site_id")), null);
  assert.equal(runWithConfigScope(b, () => getConfig("confirm_mode")), null);
  assert.equal(getConfig("confirm_mode"), null);
  assert.equal(getConfig("site_id"), "server-site");
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

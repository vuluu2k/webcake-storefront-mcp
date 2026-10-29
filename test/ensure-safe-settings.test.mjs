import { test } from "node:test";
import assert from "node:assert/strict";
import { WebcakeCmsApi } from "../dist/api.js";
import { BREAKPOINTS } from "../dist/builder/grid.js";

const api = new WebcakeCmsApi({ baseUrl: "http://x", token: "t", siteId: "s" });

test("điền breakpoints mặc định khi thiếu/rỗng", () => {
  assert.deepEqual(api.ensureSafeSettings({ a: 1 }).breakpoints, BREAKPOINTS);
  assert.deepEqual(api.ensureSafeSettings('{"breakpoints":{}}').breakpoints, BREAKPOINTS);
  assert.equal(api.ensureSafeSettings({ a: 1 }).a, 1);
});

test("giữ nguyên breakpoints hợp lệ", () => {
  const bp = { x: [0, 100] };
  assert.deepEqual(api.ensureSafeSettings({ breakpoints: bp }).breakpoints, bp);
});

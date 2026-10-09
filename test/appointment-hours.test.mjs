// Offline check: technician working hours are ordered/validated the way the booking check reads them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHours } from "../dist/tools/appointment.js";

const r = (s, e) => ({ start_time: s, end_time: e });

test("weekdays are ordered monday → sunday and missing days become days off", () => {
  const { config_weekdays: w } = normalizeHours({
    config_weekdays: [{ key: "sunday", is_active: true, configs: [r("09:00", "12:00")] }, { key: "monday", is_active: true, configs: [r("08:00", "17:00")] }],
  });
  assert.deepEqual(w.map((d) => d.key), ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  assert.equal(w[0].configs[0].end_time, "17:00");
  assert.deepEqual(w[1], { key: "tuesday", is_active: false, configs: [] });
  assert.equal(w[6].configs[0].start_time, "09:00");
});

test("date overrides get ids; bad times are rejected", () => {
  const { config_days: [d] } = normalizeHours({ config_days: [{ date: "2026-10-20", configs: [] }] });
  assert.ok(d.id && d.date === "2026-10-20");
  assert.throws(() => normalizeHours({ config_weekdays: [{ key: "monday", is_active: true, configs: [r("8h", "17h")] }] }));
});

test("fields without hours pass through untouched", () => {
  assert.deepEqual(normalizeHours({ name: "x" }), { name: "x" });
});

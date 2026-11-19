import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Appointment / calendar booking app (Enum.Application appointment = 6).
// Install first via install_app({ app: "appointment" }). Endpoints under /appointment/*.
// A booking calendar references a classify (service type), an employee (assignee) and an address.

// Working-hours shapes, as the dashboard's AppointmentConfigWeekdays / ModalConfigDay write them.
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:mm");
const timeRanges = z
  .array(z.object({ start_time: hhmm, end_time: hhmm }))
  .max(3)
  .describe('Up to 3 working ranges, e.g. [{ "start_time": "08:00", "end_time": "12:00" }]');
const weekdaysSchema = z
  .array(z.object({ key: z.enum(WEEKDAYS), is_active: z.boolean().describe("false = day off"), configs: timeRanges }))
  .max(7)
  .describe("Fixed weekly hours (\"Thiết lập thời gian làm việc cố định\"), one entry per weekday; a weekday left out is a day off.");
const daysSchema = z
  .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"), configs: timeRanges.describe("Ranges for that date; [] = day off") }))
  .describe("Per-date overrides (\"Điều chỉnh thời gian làm việc cụ thể\") for leave, overtime, holidays — replace the weekly hours on that date.");

/** Validate + order the weekly hours monday → sunday (the booking check indexes by position), and give per-date overrides the ids the dashboard expects. */
export function normalizeHours(f: any) {
  const out = { ...f };
  if (f.config_weekdays) {
    const week = weekdaysSchema.parse(f.config_weekdays);
    out.config_weekdays = WEEKDAYS.map((k) => week.find((d) => d.key === k) ?? { key: k, is_active: false, configs: [] });
  }
  if (f.config_days)
    out.config_days = daysSchema.parse(f.config_days).map((d: any) => ({
      id: randomUUID(),
      ...d,
      configs: d.configs.map((c: any) => ({ id: randomUUID(), ...c })),
    }));
  return out;
}

export function registerAppointmentTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const listShape = {
    page: z.number().optional().describe("Page number (default 1)"),
    limit: z.number().optional().describe("Items per page"),
    term: z.string().optional().describe("Search term"),
  };
  const unwrap = (res: any, key: string) => res?.data?.[key] ?? res?.[key] ?? res?.data ?? res;

  server.tool(
    "create_appointment_calendar",
    `Create a booking calendar = ONE employee's (technician's) working schedule. A calendar is per
employee, not per service: one employee has at most one calendar per site, tied to one address.
To set up staff schedules: employees, addresses and classifies (services) come first — api_find("appointment employee" / "appointment address" / "appointment classify") → api_get / api_call — then one calendar per employee with its own hours.
Same hours for many staff? Create one, then duplicate it (api_find "appointment calendar duplicate") and change assignee_id.`,
    {
      name: z.string().describe("Calendar title, e.g. the technician's name"),
      assignee_id: z.string().describe("Employee id (api_find 'appointment employee') — one calendar per employee"),
      appointment_address_id: z.string().describe("Address/location id (api_find 'appointment address')"),
      appointment_classifies: z.array(z.object({ id: z.string() })).optional().describe('Services this employee takes, e.g. [{ "id": "..." }]'),
      range_appointment: z.number().int().min(1).max(60).optional().describe("How many days ahead customers can book, 1–60 (default 7)"),
      duration_appointment: z.number().int().optional().describe("Appointment length in minutes; also the slot step (default 30)"),
      max_appointment_per_day_of_assignee: z.number().int().optional().describe("Max bookings per day for this employee"),
      max_appointment_per_day_of_customer: z.number().int().optional().describe("Max bookings per day for one customer"),
      config_weekdays: weekdaysSchema.optional().describe(`${weekdaysSchema.description} Omitted = every day 08:00–23:00, the dashboard default.`),
      config_days: daysSchema.optional(),
      timezone: z.number().optional().describe("Timezone offset (hours, default 0)"),
      google_calendar_id: z.string().optional().describe("Linked Google Calendar id"),
    },
    (fields) =>
      handle(async () => {
        const f: any = normalizeHours(fields);
        f.config_weekdays ??= WEEKDAYS.map((key) => ({
          key,
          is_active: true,
          configs: [
            { start_time: "08:00", end_time: "11:00" },
            { start_time: "11:00", end_time: "18:00" },
            { start_time: "18:00", end_time: "23:00" },
          ],
        }));
        return unwrap(await api.createAppointmentCalendar(f), "appointment_calendar");
      }),
  );

  server.tool(
    "update_appointment_calendar",
    `Update a booking calendar (an employee's schedule). Pass \`id\` plus any fields to change, same shape
as create_appointment_calendar. config_weekdays / config_days REPLACE the whole list — to add one
day-off, read the calendar (api_find "appointment calendar" → api_get), append, and send the full config_days.`,
    {
      id: z.string().describe("Calendar id"),
      fields: z.record(z.any()).describe("Fields to update (name, config_weekdays, config_days, assignee_id, appointment_classifies, …)"),
    },
    ({ id, fields }) =>
      handle(async () => unwrap(await api.updateAppointmentCalendar({ id, ...normalizeHours(fields) }), "appointment_calendar")),
  );

}

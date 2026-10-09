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

  // ── Calendars ──
  server.tool(
    "list_appointment_calendars",
    "List booking calendars (services with availability rules) for the current site.",
    listShape,
    (query) => handle(async () => unwrap(await api.listAppointmentCalendars(query), "appointment_calendars")),
  );

  server.tool(
    "create_appointment_calendar",
    `Create a booking calendar = ONE employee's (technician's) working schedule. A calendar is per
employee, not per service: one employee has at most one calendar per site, tied to one address.
To set up staff schedules: list/create_appointment_employee → list/create_appointment_address →
list/create_appointment_classify (services) → one calendar per employee with its own hours.
Same hours for many staff? Create one, then duplicate_appointment_calendars and change assignee_id.`,
    {
      name: z.string().describe("Calendar title, e.g. the technician's name"),
      assignee_id: z.string().describe("Employee id (list_appointment_employees) — one calendar per employee"),
      appointment_address_id: z.string().describe("Address/location id (list_appointment_addresses)"),
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
day-off, read the calendar (list_appointment_calendars), append, and send the full config_days.`,
    {
      id: z.string().describe("Calendar id"),
      fields: z.record(z.any()).describe("Fields to update (name, config_weekdays, config_days, assignee_id, appointment_classifies, …)"),
    },
    ({ id, fields }) =>
      handle(async () => unwrap(await api.updateAppointmentCalendar({ id, ...normalizeHours(fields) }), "appointment_calendar")),
  );

  server.tool(
    "delete_appointment_calendars",
    "Delete booking calendars by id.",
    { ids: z.array(z.string()).min(1).describe("Calendar ids") },
    ({ ids }) => handle(() => api.deleteAppointmentCalendars(ids)),
  );

  server.tool(
    "duplicate_appointment_calendars",
    "Duplicate booking calendars by id (creates copies).",
    { ids: z.array(z.string()).min(1).describe("Calendar ids to duplicate") },
    ({ ids }) => handle(() => api.duplicateAppointmentCalendars(ids)),
  );

  // ── Appointments (bookings) ──
  server.tool(
    "list_appointments",
    "List booked appointments for the current site.",
    listShape,
    (query) => handle(async () => unwrap(await api.listAppointments(query), "appointments")),
  );

  // ── Addresses (locations) ──
  server.tool(
    "list_appointment_addresses",
    "List appointment locations/addresses.",
    listShape,
    (query) => handle(async () => unwrap(await api.listAppointmentAddresses(query), "appointment_addresses")),
  );

  server.tool(
    "create_appointment_address",
    "Create an appointment location. Region ids are optional (Vietnamese geo ids).",
    {
      address: z.string().describe("Street / full address text"),
      province_id: z.string().optional().describe("Province geo id"),
      district_id: z.string().optional().describe("District geo id"),
      commune_id: z.string().optional().describe("Commune/ward geo id"),
    },
    (fields) => handle(async () => unwrap(await api.createAppointmentAddress(fields), "appointment_address")),
  );

  server.tool(
    "update_appointment_address",
    "Update an appointment location. Pass `id` plus fields to change.",
    {
      id: z.string().describe("Address id"),
      fields: z.record(z.any()).describe("Fields to update (address, province_id, district_id, commune_id)"),
    },
    ({ id, fields }) => handle(async () => unwrap(await api.updateAppointmentAddress({ id, ...fields }), "appointment_address")),
  );

  server.tool(
    "delete_appointment_addresses",
    "Delete appointment locations by id.",
    { ids: z.array(z.string()).min(1).describe("Address ids") },
    ({ ids }) => handle(() => api.deleteAppointmentAddresses(ids)),
  );

  // ── Classifies (service types) ──
  server.tool(
    "list_appointment_classifies",
    "List appointment classifies (service categories/types).",
    listShape,
    (query) => handle(async () => unwrap(await api.listAppointmentClassifies(query), "appointment_classifies")),
  );

  server.tool(
    "create_appointment_classify",
    "Create an appointment classify (service type).",
    {
      name: z.string().describe("Classify name"),
      description: z.string().optional().describe("Optional description"),
    },
    (fields) => handle(async () => unwrap(await api.createAppointmentClassify(fields), "appointment_classify")),
  );

  server.tool(
    "update_appointment_classify",
    "Update an appointment classify. Pass `id` plus fields to change.",
    {
      id: z.string().describe("Classify id"),
      fields: z.record(z.any()).describe("Fields to update (name, description)"),
    },
    ({ id, fields }) => handle(async () => unwrap(await api.updateAppointmentClassify({ id, ...fields }), "appointment_classify")),
  );

  server.tool(
    "delete_appointment_classifies",
    "Delete appointment classifies by id.",
    { ids: z.array(z.string()).min(1).describe("Classify ids") },
    ({ ids }) => handle(() => api.deleteAppointmentClassifies(ids)),
  );

  // ── Employees (assignees) ──
  server.tool(
    "list_appointment_employees",
    "List appointment employees (people that appointments can be assigned to).",
    listShape,
    (query) => handle(async () => unwrap(await api.listAppointmentEmployees(query), "appointment_employees")),
  );

  server.tool(
    "create_appointment_employee",
    "Create an appointment employee (assignee).",
    {
      full_name: z.string().describe("Employee full name"),
      email: z.string().optional().describe("Email"),
      phone_number: z.string().optional().describe("Phone number"),
      avatar: z.string().optional().describe("Avatar image URL"),
    },
    (fields) => handle(async () => unwrap(await api.createAppointmentEmployee(fields), "appointment_employee")),
  );

  server.tool(
    "update_appointment_employee",
    "Update an appointment employee. Pass `id` plus fields to change.",
    {
      id: z.string().describe("Employee id"),
      fields: z.record(z.any()).describe("Fields to update (full_name, email, phone_number, avatar)"),
    },
    ({ id, fields }) => handle(async () => unwrap(await api.updateAppointmentEmployee({ id, ...fields }), "appointment_employee")),
  );

  server.tool(
    "delete_appointment_employees",
    "Delete appointment employees by id.",
    { ids: z.array(z.string()).min(1).describe("Employee ids") },
    ({ ids }) => handle(() => api.deleteAppointmentEmployees(ids)),
  );
}

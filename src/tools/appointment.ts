import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Appointment / calendar booking app (Enum.Application appointment = 6).
// Install first via install_app({ app: "appointment" }). Endpoints under /appointment/*.
// A booking calendar references a classify (service type), an employee (assignee) and an address.

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
    `Create a booking calendar. \`config_weekdays\`/\`config_days\` describe availability windows.
\`appointment_classifies\` links service classifies by id ([{ "id": "..." }]). \`assignee_id\` = employee, \`appointment_address_id\` = location.`,
    {
      name: z.string().describe("Calendar / service name"),
      range_appointment: z.number().optional().describe("How many days ahead bookings open (default 7)"),
      duration_appointment: z.number().optional().describe("Slot length in minutes (default 30)"),
      max_appointment_per_day_of_assignee: z.number().optional().describe("Per-employee daily cap"),
      max_appointment_per_day_of_customer: z.number().optional().describe("Per-customer daily cap"),
      config_weekdays: z.array(z.record(z.any())).optional().describe("Weekly availability windows"),
      config_days: z.array(z.record(z.any())).optional().describe("Specific-date availability overrides"),
      timezone: z.number().optional().describe("Timezone offset (hours, default 0)"),
      assignee_id: z.string().optional().describe("Employee (assignee) id"),
      appointment_address_id: z.string().optional().describe("Address id (location)"),
      appointment_classifies: z.array(z.record(z.any())).optional().describe('Linked classifies, e.g. [{ "id": "..." }]'),
      google_calendar_id: z.string().optional().describe("Linked Google Calendar id"),
    },
    (fields) => handle(async () => unwrap(await api.createAppointmentCalendar(fields), "appointment_calendar")),
  );

  server.tool(
    "update_appointment_calendar",
    "Update a booking calendar. Pass `id` plus any fields to change (same shape as create).",
    {
      id: z.string().describe("Calendar id"),
      fields: z.record(z.any()).describe("Fields to update (name, config_weekdays, assignee_id, appointment_classifies, …)"),
    },
    ({ id, fields }) => handle(async () => unwrap(await api.updateAppointmentCalendar({ id, ...fields }), "appointment_calendar")),
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

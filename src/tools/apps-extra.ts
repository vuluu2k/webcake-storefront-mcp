import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Additional app modules: Product Design (device templates), Personal Product Design
// (per-variation print templates), and the Course app. Each requires its app installed.

export function registerAppsExtraTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const unwrap = (res: any, key?: string) => (key && (res?.data?.[key] ?? res?.[key])) ?? res?.data ?? res;

  // ── Product Design ──
  server.tool(
    "get_device_templates",
    "Get the device-template groups for the Product Design app.",
    {},
    () => handle(async () => unwrap(await api.getDeviceTemplates(), "group_device")),
  );
  server.tool(
    "create_products_from_device_templates",
    "Create products from selected device-template groups (Product Design app).",
    { groups: z.array(z.string()).min(1).describe("Device-template group identifiers") },
    ({ groups }) => handle(async () => unwrap(await api.createProductsByDeviceTemplate(groups), "device_templates")),
  );

  // ── Personal Product Design (PPD) ──
  server.tool(
    "list_ppd",
    "List Personal Product Design assignments (products enabled for personalization).",
    {
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      term: z.string().optional().describe("Search by product name"),
    },
    (query) => handle(async () => unwrap(await api.getAllPpd(query), "result")),
  );
  server.tool(
    "upsert_ppd",
    "Enable/update Personal Product Design for products (bulk).",
    { ppds: z.array(z.record(z.any())).min(1).describe("PPD entries, e.g. [{ product_id }]") },
    ({ ppds }) => handle(() => api.upsertPpd(ppds)),
  );
  server.tool(
    "remove_ppd",
    "Disable Personal Product Design for the given ids.",
    { ids: z.array(z.string()).min(1).describe("PPD ids") },
    ({ ids }) => handle(() => api.removePpd(ids)),
  );
  server.tool(
    "get_ppd_variation_template",
    "Get the per-variation print/design templates for a product (PPD app).",
    { product_id: z.string().describe("Product id") },
    ({ product_id }) => handle(async () => unwrap(await api.getProductVariationTemplate(product_id), "result")),
  );

  // ── Course app ──
  server.tool(
    "list_courses",
    "List courses (Course app).",
    {
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      term: z.string().optional().describe("Search term"),
    },
    (query) => handle(async () => unwrap(await api.listCourses(query))),
  );
  server.tool(
    "get_course",
    "Get a course by id (tracks, downloads, etc.).",
    { id: z.string().describe("Course id") },
    ({ id }) => handle(async () => unwrap(await api.getCourse(id))),
  );
  server.tool(
    "create_course",
    `Create a course linked to a product. \`tracks\` are lessons; \`file_downloads\` are attachments.
Note: video tracks trigger async HLS processing. A product can only link to one course.`,
    {
      name: z.string().describe("Course name"),
      product_id: z.string().describe("Linked product id"),
      description: z.string().optional().describe("Course description"),
      learn_time: z.number().optional().describe("Estimated learn time"),
      tracks: z.array(z.record(z.any())).optional().describe("Lesson tracks"),
      file_downloads: z.array(z.record(z.any())).optional().describe("Downloadable files"),
      video_demo: z.string().optional().describe("Demo video URL"),
    },
    (body) => handle(() => api.createCourse(body)),
  );
  server.tool(
    "update_course",
    "Update a course by id (partial). Pass `id` plus fields to change.",
    { id: z.string().describe("Course id"), fields: z.record(z.any()).describe("Fields to update") },
    ({ id, fields }) => handle(() => api.updateCourse(id, fields)),
  );
  server.tool(
    "delete_course",
    "Delete a course by id (also deletes its tracks).",
    { id: z.string().describe("Course id") },
    ({ id }) => handle(() => api.deleteCourse(id)),
  );
  server.tool(
    "delete_courses",
    "Delete multiple courses by id.",
    { ids: z.array(z.string()).min(1).describe("Course ids") },
    ({ ids }) => handle(() => api.deleteManyCourses(ids)),
  );
  server.tool(
    "get_course_members",
    "List members (enrolled customers) of a course.",
    {
      course_id: z.string().describe("Course id"),
      page: z.number().optional().describe("Page number"),
      limit: z.number().optional().describe("Items per page"),
      term: z.string().optional().describe("Search term"),
    },
    (query) => handle(async () => unwrap(await api.getCourseMembers(query))),
  );
}

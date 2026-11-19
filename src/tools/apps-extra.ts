import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Additional app modules: Product Design (device templates), Personal Product Design
// (per-variation print templates), and the Course app. Each requires its app installed.

export function registerAppsExtraTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const unwrap = (res: any, key?: string) => (key && (res?.data?.[key] ?? res?.[key])) ?? res?.data ?? res;

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
}

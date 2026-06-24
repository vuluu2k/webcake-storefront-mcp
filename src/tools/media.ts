import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// Media library (folders + content) and PWA manifest. Binary file upload uses
// multipart on the dashboard; here we expose listing, base64 upload, folder/content
// edits, capacity, trash, and PWA config — the parts that work over JSON.

export function registerMediaTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  const unwrap = (res: any, key?: string) => (key && (res?.data?.[key] ?? res?.[key])) ?? res?.data ?? res;
  const listShape = {
    folder_id: z.string().optional().describe("Folder id (omit for root)"),
    keyword: z.string().optional().describe("Search keyword"),
    is_trash: z.boolean().optional().describe("List trashed items"),
    page: z.number().optional().describe("Page number"),
    page_size: z.number().optional().describe("Items per page"),
    order: z.string().optional().describe("Sort order"),
  };

  server.tool(
    "list_media_folders",
    "List media-library folders (optionally under a parent folder).",
    { ...listShape, is_tree: z.boolean().optional().describe("Return the full folder tree") },
    (query) => handle(async () => unwrap(await api.listMediaFolders(query))),
  );
  server.tool(
    "list_media_content",
    "List media-library content (images/videos/files), optionally filtered by folder.",
    { ...listShape, media_types: z.array(z.string()).optional().describe("Filter by type, e.g. ['image']") },
    (query) => handle(async () => unwrap(await api.listMediaContent(query))),
  );
  server.tool(
    "list_media_all",
    "List folders and content together in one call.",
    listShape,
    (query) => handle(async () => unwrap(await api.listMediaAll(query))),
  );
  server.tool(
    "get_media_capacity",
    "Get media storage capacity/usage for the site.",
    {},
    () => handle(async () => unwrap(await api.getMediaCapacity())),
  );
  server.tool(
    "upload_media_base64",
    "Upload an image to the media library from a base64 data URI. Returns the CDN URL.",
    { base64: z.string().describe("Base64 data URI (data:image/...;base64,...)") },
    ({ base64 }) => handle(async () => unwrap(await api.uploadBase64Media(base64))),
  );
  server.tool(
    "update_media_folder",
    "Update a media folder (rename, move, or trash). Pass `id` plus fields.",
    {
      id: z.string().describe("Folder id"),
      name: z.string().optional().describe("New name"),
      folder_id: z.string().optional().describe("Move under this parent folder"),
      is_deleted: z.boolean().optional().describe("Move to trash"),
    },
    (body) => handle(async () => unwrap(await api.updateMediaFolder(body))),
  );
  server.tool(
    "update_media_content",
    "Update a media content item (rename, move, or trash). Pass `id` plus fields.",
    {
      id: z.string().describe("Content id"),
      name: z.string().optional().describe("New name"),
      folder_id: z.string().optional().describe("Move into this folder"),
      is_deleted: z.boolean().optional().describe("Move to trash"),
    },
    (body) => handle(async () => unwrap(await api.updateMediaContent(body))),
  );
  server.tool(
    "empty_media_trash",
    "Permanently delete all trashed media folders and content.",
    {},
    () => handle(() => api.emptyMediaTrash()),
  );

  // ── PWA ──
  server.tool(
    "get_pwa",
    "Get the site's PWA configuration (manifest + iOS icon).",
    {},
    () => handle(() => api.getPwa()),
  );
  server.tool(
    "update_pwa",
    "Update the PWA manifest (the full manifest object replaces the existing one).",
    {
      manifest: z.record(z.any()).describe("PWA manifest object (name, short_name, icons, display, …)"),
      ios_icon_url: z.string().optional().describe("iOS home-screen icon URL"),
    },
    (body) => handle(() => api.upsertPwa(body)),
  );
}

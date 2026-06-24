import { z } from "zod";
import { HTTP_FUNCTION_GUIDE } from "../guides.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

// ── HTTP function code parsing utilities ──

/**
 * Parse exported functions from http_function code.
 * Tracks braces properly, handles template literals and strings.
 */
function parseExportedFunctions(code: string): Array<{
  name: string;
  method: string;
  function_name: string;
  start_line: number;
  end_line: number;
  code: string;
}> {
  if (!code) return [];
  const lines = code.split("\n");
  const functions: Array<{
    name: string;
    method: string;
    function_name: string;
    start_line: number;
    end_line: number;
    code: string;
  }> = [];
  const exportRe = /^export\s+const\s+(\w+)\s*=/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(exportRe);
    if (!m) continue;

    const fullName = m[1];
    const underIdx = fullName.indexOf("_");
    const method = underIdx > 0 ? fullName.slice(0, underIdx) : "";
    const funcName = underIdx > 0 ? fullName.slice(underIdx + 1) : fullName;
    const startLine = i + 1;

    // Find end by tracking brace depth
    let depth = 0;
    let started = false;
    let endLine = startLine;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") { depth++; started = true; }
        if (ch === "}") depth--;
      }
      if (started && depth <= 0) { endLine = j + 1; break; }
      if (j === lines.length - 1) endLine = j + 1;
    }

    functions.push({
      name: fullName,
      method,
      function_name: funcName,
      start_line: startLine,
      end_line: endLine,
      code: lines.slice(i, endLine).join("\n"),
    });
  }
  return functions;
}

/** Extract import block (lines before first export) */
function extractImports(code: string): string {
  if (!code) return "";
  const lines = code.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^export\s/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Replace a function in the code by name, returns new full content */
function replaceFunctionByName(code: string, funcName: string, newCode: string): string {
  const funcs = parseExportedFunctions(code);
  const target = funcs.find((f) => f.name === funcName || f.function_name === funcName);
  if (!target) throw new Error(`Function "${funcName}" not found in file`);
  const lines = code.split("\n");
  const before = lines.slice(0, target.start_line - 1);
  const after = lines.slice(target.end_line);
  return [...before, newCode.trimEnd(), ...after].join("\n");
}

/** Remove a function from the code by name */
function removeFunctionByName(code: string, funcName: string): string {
  const funcs = parseExportedFunctions(code);
  const target = funcs.find((f) => f.name === funcName || f.function_name === funcName);
  if (!target) throw new Error(`Function "${funcName}" not found in file`);
  const lines = code.split("\n");
  let start = target.start_line - 1;
  while (start > 0 && lines[start - 1].trim() === "") start--;
  lines.splice(start, target.end_line - start);
  return lines.join("\n");
}

/** Build function overview result */
function buildOverviewResult(content: string, fileId: string | undefined, schemas: any[], includeGuide: boolean): any {
  const funcs = parseExportedFunctions(content);
  const imports = extractImports(content);
  const res: any = {
    file_id: fileId,
    total_lines: content.split("\n").length,
    imports: imports || undefined,
    functions: funcs.map((f) => ({
      name: f.name,
      method: f.method,
      function_name: f.function_name,
      start_line: f.start_line,
      end_line: f.end_line,
      lines: f.end_line - f.start_line + 1,
    })),
    collections: schemas,
    hint: "Use get_http_function_snippet to read a specific function, or set overview=false to get full file",
  };
  if (includeGuide) res.guide = HTTP_FUNCTION_GUIDE;
  return res;
}

/** Helper to extract content and file_id from API response */
function extractContent(httpFunc: any): { content: string; fileId: string | undefined } {
  const content = (httpFunc?.data?.content) || (httpFunc?.content) || "";
  const fileId = (httpFunc?.data?.id) || (httpFunc?.id) || undefined;
  return { content, fileId };
}

/** Helper to build collection schemas */
function buildSchemas(collections: any): any[] {
  const raw = collections?.data;
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return list.map((c: any) => ({
    name: c.name,
    table_name: c.table_name,
    fields: (c.schema || []).map((f: any) => ({
      name: f.name,
      type: f.type,
      is_required: f.is_required,
      reference: f.reference || undefined,
    })),
  }));
}

export function registerCmsFileTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool("list_cms_files", "List all CMS files (HTTP functions, cron jobs, ...) for the site", {}, () =>
    handle(() => api.listCmsFiles())
  );

  server.tool(
    "create_cms_file",
    `Create a new CMS file. Types: "http_function", "jobs_config", "default"`,
    {
      name: z.string().describe("File name"),
      content: z.string().describe("Code content (JavaScript or JSON)"),
      type: z.enum(["http_function", "jobs_config", "default"]).default("default").describe("File type"),
    },
    ({ name, content, type }) =>
      handle(() => api.createCmsFile({ name, content, type_create: "backend", type }))
  );

  server.tool(
    "update_cms_file",
    "Update the code content of an existing CMS file",
    {
      id: z.string().describe("CMS file ID"),
      content: z.string().describe("New code content"),
      name: z.string().optional().describe("Rename file"),
    },
    ({ id, content, name }) =>
      handle(() => api.updateCmsFile(id, { content, ...(name && { name }) }))
  );

  // ── HTTP function — token-optimized read/write ──

  server.tool(
    "get_http_function",
    `Get the main HTTP function file. Choose the right mode for your task:
- overview=true: function names + line ranges only, NO code body. Use for: browsing, understanding structure, finding which function to read.
- overview=false (DEFAULT): full code + collection schemas. Use for: writing new features, refactoring, understanding full context.
Tip: for small fixes, use overview first then get_http_function_snippet to read just that function.
Add include_guide=true on first call to get the coding guide`,
    {
      overview: z.boolean().default(false).describe("true=function list only, false=full code (default)"),
      include_guide: z.boolean().default(false).describe("Include coding guide (only needed once)"),
    },
    ({ overview, include_guide }) =>
      handle(async () => {
        const [httpFunc, collections] = await Promise.all([
          api.getHttpFunction(),
          api.listCollections({ limit: 100 }).catch(() => null),
        ]);
        const { content, fileId } = extractContent(httpFunc);
        const schemas = buildSchemas(collections);

        if (overview) return buildOverviewResult(content, fileId, schemas, include_guide);

        const res: any = { http_function: httpFunc, collections: schemas };
        if (include_guide) res.guide = HTTP_FUNCTION_GUIDE;
        return res;
      })
  );

  server.tool(
    "get_http_function_snippet",
    "Read specific function(s) by name. Much more token-efficient than reading the full file",
    {
      function_names: z.array(z.string()).describe("Function names (e.g. ['get_Products', 'post_CreateOrder'])"),
    },
    ({ function_names }) =>
      handle(async () => {
        const { content } = extractContent(await api.getHttpFunction());
        const allFuncs = parseExportedFunctions(content);
        const nameSet = new Set(function_names);
        const found = allFuncs.filter((f) => nameSet.has(f.name) || nameSet.has(f.function_name));
        const notFound = function_names.filter((n) => !found.some((f) => f.name === n || f.function_name === n));

        return {
          imports: extractImports(content) || undefined,
          functions: found.map((f) => ({
            name: f.name, method: f.method, function_name: f.function_name,
            start_line: f.start_line, end_line: f.end_line, code: f.code,
          })),
          not_found: notFound.length ? notFound : undefined,
        };
      })
  );

  server.tool(
    "edit_http_function",
    `Edit the HTTP function file by function name — best for targeted changes (fix a bug, rename, add one function).
For writing multiple new functions or major refactors, use update_http_function with full content instead.
Actions:
- "replace_function": replace an ENTIRE function by name with new code. Server finds function boundaries automatically.
- "add": append new function code at end of file.
- "remove": remove a function by name.
- "update_imports": replace the import block (lines before first export).
Returns updated function list after edit.`,
    {
      action: z.enum(["replace_function", "add", "remove", "update_imports"]).describe("Edit action"),
      function_name: z.string().optional().describe("Target function name (for replace_function and remove)"),
      code: z.string().optional().describe("New function code (for replace_function and add) or new import block (for update_imports)"),
    },
    ({ action, function_name, code }) =>
      handle(async () => {
        const httpFunc = await api.getHttpFunction();
        let { content, fileId } = extractContent(httpFunc);

        if (action === "replace_function") {
          if (!function_name) throw new Error("replace_function requires function_name");
          if (!code) throw new Error("replace_function requires code (the new function code)");
          content = replaceFunctionByName(content, function_name, code);
        } else if (action === "add") {
          if (!code) throw new Error("add requires code");
          content = content.trimEnd() + "\n\n" + code.trimEnd() + "\n";
        } else if (action === "remove") {
          if (!function_name) throw new Error("remove requires function_name");
          content = removeFunctionByName(content, function_name);
        } else if (action === "update_imports") {
          if (code == null) throw new Error("update_imports requires code (the new import block)");
          const oldImports = extractImports(content);
          if (oldImports) {
            content = content.replace(oldImports, code.trimEnd());
          } else {
            content = code.trimEnd() + "\n\n" + content;
          }
        }

        await api.createOrUpdateHttpFunction({ content });
        const schemas = buildSchemas(null);
        return buildOverviewResult(content, fileId, schemas, false);
      })
  );

  server.tool(
    "update_http_function",
    `Write the FULL HTTP function file content. Best for: writing new features, major refactors, or changes that touch multiple functions.
For small targeted edits (fix one function, add one function), use edit_http_function instead.
After update, auto-deploys to the bundle service`,
    {
      content: z.string().describe("Full JS code content"),
    },
    ({ content }) => handle(() => api.createOrUpdateHttpFunction({ content }))
  );

  server.tool(
    "run_function",
    `Run a deployed HTTP function. function_name excludes method prefix.
Example: "get_Products" → function_name="Products", method="GET"`,
    {
      function_name: z.string().describe("Function name without method prefix (e.g. 'Products')"),
      method: z.enum(["GET", "POST", "PUT", "PATCH"]).default("POST").describe("HTTP method"),
      params: z.record(z.any()).optional().describe("Parameters"),
    },
    ({ function_name, method, params }) =>
      handle(() => api.runFunction(function_name, method, params))
  );

  server.tool(
    "debug_function",
    "Run JS code in debug mode (without deploying). Returns execution result and console logs",
    {
      content: z.string().describe("JS code to debug"),
      function_name: z.string().describe("Function name to run"),
      params: z.record(z.any()).optional().describe("Test parameters"),
    },
    ({ content, function_name, params }) =>
      handle(() => api.debugFunction({ content, functionName: function_name, params }))
  );

  server.tool(
    "save_file_version",
    "Save a version snapshot of a CMS file for rollback",
    {
      cms_file_id: z.string().describe("CMS file ID"),
      content: z.string().describe("Content to save"),
      is_public: z.boolean().default(false).describe("Mark as public version"),
    },
    ({ cms_file_id, content, is_public }) =>
      // Backend reads `file_id` (it stores it as cms_file_id); a `cms_file_id` key alone is ignored.
      handle(() => api.saveFileVersion({ file_id: cms_file_id, content, is_public }))
  );

  server.tool(
    "get_file_versions",
    "View version history of a CMS file. Each version includes its saved content — to restore, pass that content back to update_http_function (the http_function file) or update_cms_file.",
    { cms_file_id: z.string().describe("CMS file ID") },
    ({ cms_file_id }) => handle(() => api.getFileVersions({ file_id: cms_file_id }))
  );

  server.tool(
    "toggle_debug_render",
    "Toggle debug render mode for a CMS file",
    { cms_file_id: z.string().describe("CMS file ID") },
    ({ cms_file_id }) => handle(() => api.toggleDebugRender({ cms_file_id }))
  );
}

// Installer: writes (or removes) this MCP server's entry in the config files of the
// supported IDEs. Flag-driven; falls back to a couple of interactive prompts on a TTY.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const SERVER_KEY = "webcake-storefront";

interface InstallOpts {
  uninstall: boolean;
  ides: string[];
  env?: string;
  token?: string;
  sessionId?: string;
  siteId?: string;
  apiUrl?: string;
  launch?: "npx" | "local";
}

interface LaunchSpec {
  command: string;
  args: string[];
}

function parseArgs(argv: string[]): InstallOpts {
  const o: InstallOpts = { uninstall: false, ides: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--uninstall") o.uninstall = true;
    else if (a === "--ide") o.ides.push(...(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--env") o.env = argv[++i];
    else if (a === "--token" || a === "--jwt") o.token = argv[++i];
    else if (a === "--session" || a === "--session-id" || a === "--wsid") o.sessionId = argv[++i];
    else if (a === "--site" || a === "--site-id") o.siteId = argv[++i];
    else if (a === "--api-url" || a === "--api-base") o.apiUrl = argv[++i];
    else if (a === "--npx") o.launch = "npx";
    else if (a === "--local") o.launch = "local";
  }
  return o;
}

const HOME = homedir();
const APP_SUPPORT = process.platform === "darwin" ? join(HOME, "Library", "Application Support") : join(HOME, ".config");

// IDE -> config file + whether it nests under "mcpServers" (vs "mcp").
const IDE_CONFIGS: Record<string, { path: string; key: string }> = {
  "claude-desktop": { path: join(APP_SUPPORT, "Claude", "claude_desktop_config.json"), key: "mcpServers" },
  "claude-code": { path: join(HOME, ".claude.json"), key: "mcpServers" },
  cursor: { path: join(HOME, ".cursor", "mcp.json"), key: "mcpServers" },
  windsurf: { path: join(HOME, ".codeium", "windsurf", "mcp_config.json"), key: "mcpServers" },
  vscode: { path: join(APP_SUPPORT, "Code", "User", "mcp.json"), key: "mcpServers" },
};

const ALL_IDES = Object.keys(IDE_CONFIGS);

function resolveLaunch(opts: InstallOpts): LaunchSpec {
  const self = fileURLToPath(import.meta.url);
  const ranViaNpx = self.includes("/_npx/") || self.includes("\\_npx\\");
  const useNpx = opts.launch === "npx" || (opts.launch !== "local" && ranViaNpx);
  if (useNpx) return { command: "npx", args: ["-y", "webcake-storefront-mcp"] };
  const entry = join(dirname(self), "index.js");
  return { command: "node", args: [entry] };
}

function buildEnv(opts: InstallOpts): Record<string, string> {
  const env: Record<string, string> = {};
  if (opts.env) env.WEBCAKE_ENV = opts.env;
  if (opts.apiUrl) env.WEBCAKE_API_URL = opts.apiUrl;
  if (opts.token) env.WEBCAKE_TOKEN = opts.token;
  if (opts.sessionId) env.WEBCAKE_SESSION_ID = opts.sessionId;
  if (opts.siteId) env.WEBCAKE_SITE_ID = opts.siteId;
  return env;
}

function readJson(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, any>;
  } catch {
    return {};
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function applyToIde(ide: string, opts: InstallOpts, launch: LaunchSpec, env: Record<string, string>): string {
  const cfg = IDE_CONFIGS[ide];
  if (!cfg) return `skip ${ide} (unknown)`;
  const json = readJson(cfg.path);
  const bag = (json[cfg.key] ||= {}) as Record<string, unknown>;

  if (opts.uninstall) {
    if (!(SERVER_KEY in bag)) return `${ide}: nothing to remove`;
    delete bag[SERVER_KEY];
    writeJson(cfg.path, json);
    return `${ide}: removed (${cfg.path})`;
  }

  bag[SERVER_KEY] = {
    command: launch.command,
    args: launch.args,
    ...(Object.keys(env).length ? { env } : {}),
  };
  writeJson(cfg.path, json);
  return `${ide}: configured (${cfg.path})`;
}

async function promptMissing(opts: InstallOpts): Promise<void> {
  if (!process.stdin.isTTY) return;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    if (!opts.ides.length) {
      const ans = (await rl.question(`IDE(s) [${ALL_IDES.join(", ")}, all]: `)).trim();
      opts.ides = ans === "all" || ans === "" ? ALL_IDES : ans.split(",").map((s) => s.trim());
    }
    if (!opts.uninstall && !opts.token && !process.env.WEBCAKE_TOKEN) {
      const t = (await rl.question("Token (paste JWT, or leave blank to set later): ")).trim();
      if (t) opts.token = t;
    }
    if (!opts.uninstall && !opts.siteId && !process.env.WEBCAKE_SITE_ID) {
      const s = (await rl.question("Site ID (optional): ")).trim();
      if (s) opts.siteId = s;
    }
  } finally {
    rl.close();
  }
}

export async function runInstaller(argv: string[]): Promise<void> {
  const opts = parseArgs(argv);
  await promptMissing(opts);

  let ides = opts.ides.length ? opts.ides : ALL_IDES;
  if (ides.includes("all")) ides = ALL_IDES;

  const launch = resolveLaunch(opts);
  const env = buildEnv(opts);

  console.error(opts.uninstall ? "Removing webcake-storefront MCP…" : "Configuring webcake-storefront MCP…");
  for (const ide of ides) console.error("  " + applyToIde(ide, opts, launch, env));
  if (!opts.uninstall) console.error("\nDone. Restart your IDE to pick up the new MCP server.");
}

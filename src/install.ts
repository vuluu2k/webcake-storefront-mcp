// Installer: writes (or removes) this MCP server's entry in the config files of the
// supported IDEs / agents. Flag-driven; falls back to a friendly numbered wizard on a
// TTY. Mirrors webcake-landing-mcp's installer (numbered choices, colours, multi-IDE).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { runLogin } from "./auth/login.js";

const NAME = "webcake-storefront";
const PKG = "webcake-storefront-mcp";
const HOME = homedir();
const PLAT = platform(); // 'darwin' | 'linux' | 'win32'
const APPDATA = process.env.APPDATA || join(HOME, "AppData", "Roaming");
const LOCALAPPDATA = process.env.LOCALAPPDATA || join(HOME, "AppData", "Local");

// ── tiny ANSI palette + log helpers (mirrors webcake-landing-mcp's installer) ──
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};
const log = (m = "", color = "") => console.log(`${color}${m}${c.reset}`);
const info = (m: string) => log(`  ${c.cyan}›${c.reset} ${m}`);
const ok = (m: string) => log(`  ${c.green}✓${c.reset} ${m}`);
const warn = (m: string) => log(`  ${c.yellow}!${c.reset} ${m}`);

/** One-shot prompt on stdout (fresh readline per question — simple + robust). */
function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

type Env = Record<string, string>;
type Launch = { command: string; args: string[] };

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

// ── arg parsing ──────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): InstallOpts {
  const o: InstallOpts = { uninstall: false, ides: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--uninstall" || a === "uninstall") o.uninstall = true;
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

// ── launch command (npx vs local node) ───────────────────────────────────────
function resolveLaunch(opts: InstallOpts): Launch {
  const self = fileURLToPath(import.meta.url);
  const ranViaNpx = self.includes("/_npx/") || self.includes("\\_npx\\");
  const useNpx = opts.launch === "npx" || (opts.launch !== "local" && ranViaNpx);
  if (useNpx) return { command: "npx", args: ["-y", PKG] };
  const entry = join(dirname(self), "index.js");
  return { command: process.execPath, args: [entry] };
}

function buildEnv(opts: InstallOpts): Env {
  const env: Env = {};
  if (opts.env) env.WEBCAKE_ENV = opts.env;
  if (opts.apiUrl) env.WEBCAKE_API_URL = opts.apiUrl;
  if (opts.token) env.WEBCAKE_TOKEN = opts.token;
  if (opts.sessionId) env.WEBCAKE_SESSION_ID = opts.sessionId;
  if (opts.siteId) env.WEBCAKE_SITE_ID = opts.siteId;
  return env;
}

// ── generic JSON config (Claude Desktop/Code, Cursor, Windsurf, VS Code, …) ───
function mergeJson(file: string, launch: Launch, env: Env): boolean {
  mkdirSync(dirname(file), { recursive: true });
  let cfg: any = {};
  if (existsSync(file)) {
    const raw = readFileSync(file, "utf8").trim();
    if (raw) {
      try {
        cfg = JSON.parse(raw);
      } catch (e: any) {
        warn(`Skip ${file} (invalid JSON: ${e.message})`);
        return false;
      }
    }
  }
  if (typeof cfg.mcpServers !== "object" || !cfg.mcpServers) cfg.mcpServers = {};
  cfg.mcpServers[NAME] = {
    command: launch.command,
    args: launch.args,
    ...(Object.keys(env).length ? { env } : {}),
  };
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  return true;
}

// ── OpenCode config (its own shape, not mcpServers) ──────────────────────────
// { "mcp": { "<name>": { "type": "local", "command": [cmd, ...args], "environment": {…} } } }
function mergeOpencodeJson(file: string, launch: Launch, env: Env): boolean {
  mkdirSync(dirname(file), { recursive: true });
  let cfg: any = {};
  if (existsSync(file)) {
    const raw = readFileSync(file, "utf8").trim();
    if (raw) {
      try {
        cfg = JSON.parse(raw);
      } catch (e: any) {
        warn(`Skip ${file} (invalid JSON: ${e.message})`);
        return false;
      }
    }
  }
  if (typeof cfg.mcp !== "object" || !cfg.mcp) cfg.mcp = {};
  cfg.mcp[NAME] = {
    type: "local",
    command: [launch.command, ...launch.args],
    enabled: true,
    ...(Object.keys(env).length ? { environment: env } : {}),
  };
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  return true;
}

// ── TOML config (Codex) ──────────────────────────────────────────────────────
function configureCodex(launch: Launch, env: Env) {
  const dir = join(HOME, ".codex");
  const cfg = join(dir, "config.toml");
  mkdirSync(dir, { recursive: true });
  const argsToml = launch.args.map((a) => `"${a}"`).join(", ");
  const envParts = Object.entries(env)
    .map(([k, v]) => `"${k}" = "${v}"`)
    .join(", ");
  const envLine = envParts ? `env = { ${envParts} }\n` : "";
  const block = `\n[mcp_servers.${NAME}]\ncommand = "${launch.command}"\nargs = [${argsToml}]\n${envLine}`;
  let content = existsSync(cfg) ? readFileSync(cfg, "utf8") : "# WebCake Storefront MCP\n";
  content = content.replace(new RegExp(`\\n?\\[mcp_servers\\.${NAME}\\][\\s\\S]*?(?=\\n\\[|$)`), "");
  content = content.trimEnd() + "\n" + block;
  writeFileSync(cfg, content);
}

// ── IDE config-file locations ────────────────────────────────────────────────
function claudeDesktopPath(): string {
  if (PLAT === "win32") {
    // Microsoft Store build is MSIX-sandboxed: it reads/writes config inside its
    // package container, NOT %APPDATA%\Claude. Detect that container first.
    const packages = join(LOCALAPPDATA, "Packages");
    if (existsSync(packages)) {
      try {
        const pkg = readdirSync(packages).find((n) => /^Claude_/i.test(n));
        if (pkg) return join(packages, pkg, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json");
      } catch {
        /* fall through to the Win32 default */
      }
    }
    return join(APPDATA, "Claude", "claude_desktop_config.json");
  }
  const mac = join(HOME, "Library", "Application Support", "Claude");
  const dir = existsSync(mac) ? mac : join(HOME, ".config", "Claude");
  return join(dir, "claude_desktop_config.json");
}
function vscodeUserDir(): string {
  if (PLAT === "win32") return join(APPDATA, "Code", "User");
  const mac = join(HOME, "Library", "Application Support", "Code", "User");
  if (existsSync(mac)) return mac;
  const lin = join(HOME, ".config", "Code", "User");
  if (existsSync(lin)) return lin;
  return join(HOME, ".vscode");
}
const vscodeUserPath = () => join(vscodeUserDir(), "mcp.json");
const cursorPath = () => join(HOME, ".cursor", "mcp.json");
const windsurfPath = () => join(HOME, ".codeium", "windsurf", "mcp_config.json");
const claudeJsonPath = () => join(HOME, ".claude.json");
const antigravityPath = () => join(HOME, ".gemini", "antigravity", "mcp_config.json");
const geminiPath = () => join(HOME, ".gemini", "settings.json");
const kiroPath = () => join(HOME, ".kiro", "settings", "mcp.json");
const clinePath = () =>
  join(vscodeUserDir(), "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
const opencodePath = () => join(HOME, ".config", "opencode", "opencode.json");

function hasClaudeCli(): boolean {
  const probe = spawnSync(PLAT === "win32" ? "where" : "which", ["claude"], { stdio: "ignore" });
  return probe.status === 0;
}

// ── per-IDE configure ────────────────────────────────────────────────────────
function configureClaudeCode(launch: Launch, env: Env) {
  info("Claude Code…");
  if (hasClaudeCli()) {
    spawnSync("claude", ["mcp", "remove", NAME], { stdio: "ignore" });
    const envFlags = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
    const r = spawnSync("claude", ["mcp", "add", NAME, ...envFlags, "--", launch.command, ...launch.args], {
      stdio: "inherit",
    });
    if (r.status === 0) {
      ok("Claude Code configured via CLI — verify: claude mcp list");
      return;
    }
    warn("claude CLI failed — falling back to ~/.claude.json");
  }
  if (mergeJson(claudeJsonPath(), launch, env)) ok(`Claude Code configured (${claudeJsonPath()})`);
}
function configureClaudeDesktop(launch: Launch, env: Env) {
  info("Claude Desktop…");
  if (mergeJson(claudeDesktopPath(), launch, env)) {
    ok(`Claude Desktop configured (${claudeDesktopPath()})`);
    warn("Restart Claude Desktop to load the server.");
  }
}
function configureCursor(launch: Launch, env: Env) {
  info("Cursor…");
  if (mergeJson(cursorPath(), launch, env)) ok(`Cursor configured (${cursorPath()})`);
}
function configureWindsurf(launch: Launch, env: Env) {
  info("Windsurf…");
  if (mergeJson(windsurfPath(), launch, env)) ok(`Windsurf configured (${windsurfPath()})`);
}
function configureAugment(launch: Launch, env: Env) {
  info("Augment / VS Code…");
  if (mergeJson(vscodeUserPath(), launch, env)) ok(`VS Code configured (${vscodeUserPath()})`);
}
function configureCodexIde(launch: Launch, env: Env) {
  info("Codex…");
  configureCodex(launch, env);
  ok(`Codex configured (${join(HOME, ".codex", "config.toml")}) — restart Codex.`);
}
function configureAntigravity(launch: Launch, env: Env) {
  info("Antigravity…");
  if (mergeJson(antigravityPath(), launch, env)) {
    ok(`Antigravity configured (${antigravityPath()})`);
    warn("In Antigravity: Agent Manager → Manage MCP Servers → Refresh (or restart).");
  }
}
function configureGemini(launch: Launch, env: Env) {
  info("Gemini CLI…");
  if (mergeJson(geminiPath(), launch, env)) ok(`Gemini CLI configured (${geminiPath()})`);
}
function configureCline(launch: Launch, env: Env) {
  info("Cline…");
  if (mergeJson(clinePath(), launch, env)) ok(`Cline configured (${clinePath()})`);
}
function configureKiro(launch: Launch, env: Env) {
  info("Kiro…");
  if (mergeJson(kiroPath(), launch, env)) ok(`Kiro configured (${kiroPath()})`);
}
function configureOpencode(launch: Launch, env: Env) {
  info("OpenCode…");
  if (mergeOpencodeJson(opencodePath(), launch, env)) ok(`OpenCode configured (${opencodePath()})`);
}

const CONFIGURATORS: Record<string, { label: string; run: (l: Launch, e: Env) => void }> = {
  "claude-desktop": { label: "Claude Desktop", run: configureClaudeDesktop },
  "claude-code": { label: "Claude Code (CLI)", run: configureClaudeCode },
  cursor: { label: "Cursor", run: configureCursor },
  windsurf: { label: "Windsurf", run: configureWindsurf },
  augment: { label: "Augment / VS Code", run: configureAugment },
  codex: { label: "Codex", run: configureCodexIde },
  antigravity: { label: "Antigravity", run: configureAntigravity },
  gemini: { label: "Gemini CLI", run: configureGemini },
  cline: { label: "Cline", run: configureCline },
  kiro: { label: "Kiro", run: configureKiro },
  opencode: { label: "OpenCode", run: configureOpencode },
};

// Numbered wizard order = insertion order of CONFIGURATORS.
const IDE_ORDER = Object.keys(CONFIGURATORS);

const IDE_ALIASES: Record<string, string> = {
  "claude-desktop": "claude-desktop",
  desktop: "claude-desktop",
  "claude-code": "claude-code",
  claude: "claude-code",
  code: "claude-code",
  cursor: "cursor",
  windsurf: "windsurf",
  augment: "augment",
  vscode: "augment",
  "vs-code": "augment",
  codex: "codex",
  antigravity: "antigravity",
  gemini: "gemini",
  "gemini-cli": "gemini",
  cline: "cline",
  kiro: "kiro",
  opencode: "opencode",
  all: "all",
};

function normalizeIdes(ides: string[]): string[] {
  const set = new Set<string>();
  for (const raw of ides) {
    const id = IDE_ALIASES[raw.trim().toLowerCase()];
    if (id === "all") return [...IDE_ORDER];
    if (id) set.add(id);
    else warn(`Unknown IDE: ${raw}`);
  }
  return [...set];
}

function runConfigure(ides: string[], launch: Launch, env: Env) {
  for (const id of ides) {
    const conf = CONFIGURATORS[id];
    if (conf) conf.run(launch, env);
    else warn(`Unknown IDE: ${id}`);
  }
}

// ── uninstall ────────────────────────────────────────────────────────────────
function removeFromJson(file: string) {
  if (!existsSync(file)) return;
  try {
    const cfg = JSON.parse(readFileSync(file, "utf8"));
    if (cfg.mcpServers && cfg.mcpServers[NAME]) {
      delete cfg.mcpServers[NAME];
      writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
      ok(`Cleaned ${file}`);
    }
  } catch {
    /* ignore unparseable files */
  }
}
function uninstall() {
  log(`\n${c.bold}  Removing ${PKG} from every IDE config${c.reset}\n`);
  if (hasClaudeCli()) spawnSync("claude", ["mcp", "remove", NAME], { stdio: "ignore" });
  [
    claudeJsonPath(),
    claudeDesktopPath(),
    join(HOME, ".config", "Claude", "claude_desktop_config.json"),
    cursorPath(),
    windsurfPath(),
    vscodeUserPath(),
    antigravityPath(),
    geminiPath(),
    clinePath(),
    kiroPath(),
  ].forEach(removeFromJson);
  // OpenCode keeps the server under its own `mcp` key, not `mcpServers`.
  const oc = opencodePath();
  if (existsSync(oc)) {
    try {
      const cfg = JSON.parse(readFileSync(oc, "utf8"));
      if (cfg.mcp && cfg.mcp[NAME]) {
        delete cfg.mcp[NAME];
        writeFileSync(oc, JSON.stringify(cfg, null, 2) + "\n");
        ok(`Cleaned ${oc}`);
      }
    } catch {
      /* ignore unparseable files */
    }
  }
  const codex = join(HOME, ".codex", "config.toml");
  if (existsSync(codex)) {
    let content = readFileSync(codex, "utf8");
    content = content.replace(new RegExp(`\\n?\\[mcp_servers\\.${NAME}\\][\\s\\S]*?(?=\\n\\[|$)`), "");
    writeFileSync(codex, content.trimEnd() + "\n");
    ok("Cleaned Codex config.toml");
  }
  log(`\n${c.green}${c.bold}  ✓ Removed. Restart your IDE.${c.reset}\n`);
}

/**
 * Interactive numbered wizard (TTY only): pick environment → authenticate (browser
 * login, recommended, or paste a token) → pick IDEs by number. Returns whether a
 * browser login completed (token then lives in the local config db, so it is NOT
 * written into the IDE env block) and a short auth note for the summary.
 */
async function promptInteractive(opts: InstallOpts): Promise<{ loggedIn: boolean; authNote: string }> {
  let loggedIn = false;
  let authNote = opts.token ? "token (from flag)" : "";
  if (!process.stdin.isTTY || !process.stdout.isTTY) return { loggedIn, authNote };

  // 1) Environment — one choice sets the API + app base URLs (default prod).
  if (!opts.env && !process.env.WEBCAKE_ENV) {
    log(`\n${c.bold}1) Environment${c.reset} ${c.gray}(sets the WebCake API + app URLs)${c.reset}`);
    log(`  ${c.bold}1${c.reset}) prod      ${c.gray}api.storefront.webcake.io${c.reset}  ${c.gray}(default)${c.reset}`);
    log(`  ${c.bold}2${c.reset}) staging   ${c.gray}api.staging.storecake.io${c.reset}`);
    log(`  ${c.bold}3${c.reset}) local     ${c.gray}localhost:24679${c.reset}`);
    const pick = (await ask(`  ${c.cyan}Select [1=prod, Enter to accept]:${c.reset} `)).trim();
    opts.env = ({ "1": "prod", "2": "staging", "3": "local" } as Record<string, string>)[pick] ?? "prod";
  }
  if (opts.env) process.env.WEBCAKE_ENV = opts.env; // so the login flow opens the right app

  // 2) Authentication — browser login (recommended), paste a token, or skip.
  if (!opts.token && !process.env.WEBCAKE_TOKEN) {
    log(`\n${c.bold}2) Connect your WebCake account${c.reset}`);
    log(`  ${c.bold}1${c.reset}) Log in via browser   ${c.gray}(recommended — opens WebCake, saves a token)${c.reset}`);
    log(`  ${c.bold}2${c.reset}) Paste a token manually`);
    log(`  ${c.bold}3${c.reset}) Skip for now         ${c.gray}(set credentials later with the login command)${c.reset}`);
    const choice = (await ask(`  ${c.cyan}Select [1]:${c.reset} `)).trim() || "1";
    if (choice === "1") {
      info("Opening your browser to log in…");
      try {
        await runLogin([]); // loopback browser flow → saves token + session to local config db
        loggedIn = true;
        authNote = "browser login (saved to local config)";
      } catch (e: any) {
        warn(`Login didn't complete (${e?.message ?? e}). Paste a token now, or run \`npx -y ${PKG} login\` later.`);
        const t = (await ask(`  ${c.cyan}Token (paste JWT, or Enter to skip):${c.reset} `)).trim();
        if (t) opts.token = t;
        const s = t ? (await ask(`  ${c.cyan}Session id (x-session-id):${c.reset} `)).trim() : "";
        if (s) opts.sessionId = s;
      }
    } else if (choice === "2") {
      const t = (await ask(`  ${c.cyan}Token (paste JWT):${c.reset} `)).trim();
      if (t) opts.token = t;
      const s = (await ask(`  ${c.cyan}Session id (x-session-id):${c.reset} `)).trim();
      if (s) opts.sessionId = s;
      authNote = opts.token ? "pasted token" : "none";
    }
  }
  if (!authNote) authNote = opts.token || process.env.WEBCAKE_TOKEN ? "token" : "none — log in later";

  // 3) IDEs to configure — numbered, comma-separated (e.g. 1,2 or the "All" number).
  if (!opts.ides.length) {
    log(`\n${c.bold}3) Which IDE(s) / agent(s) to configure?${c.reset}`);
    IDE_ORDER.forEach((id, i) => {
      const n = `${c.bold}${String(i + 1).padStart(2)}${c.reset}`;
      log(`  ${n}) ${CONFIGURATORS[id].label}`);
    });
    const allNum = IDE_ORDER.length + 1;
    log(`  ${c.bold}${String(allNum).padStart(2)}${c.reset}) ${c.green}All of the above${c.reset}     ${c.gray} 0) Skip${c.reset}`);
    const pick = await ask(`  ${c.cyan}Select (comma-separated, e.g. 1,2):${c.reset} `);
    const picks = pick.split(",").map((s) => s.trim()).filter(Boolean);
    if (picks.includes(String(allNum))) opts.ides = [...IDE_ORDER];
    else opts.ides = picks.map((n) => IDE_ORDER[Number(n) - 1]).filter(Boolean);
  } else {
    opts.ides = normalizeIdes(opts.ides);
  }
  // Site is chosen at runtime — use the list_my_sites / switch_site tools in chat.
  return { loggedIn, authNote };
}

export async function runInstaller(argv: string[]): Promise<void> {
  const opts = parseArgs(argv);

  log(`\n${c.magenta}${c.bold}  WebCake Storefront MCP${c.reset} ${c.gray}— installer${c.reset}`);
  log(`${c.gray}  Build sites, pages, products & orders on WebCake from a prompt.${c.reset}`);

  if (opts.uninstall) return uninstall();

  const { loggedIn, authNote } = await promptInteractive(opts);

  // Normalize IDE selection (expands "all", resolves aliases). The wizard already
  // yields canonical keys; this also covers the flag-driven / non-TTY path where
  // promptInteractive returns early without touching opts.ides.
  const ides = normalizeIdes(opts.ides);
  if (!ides.length) {
    if (!process.stdin.isTTY) {
      warn("No --ide given (or not a TTY). Nothing to configure.");
      log(`${c.gray}  Try: npx -y ${PKG} install --ide all${c.reset}\n`);
    } else {
      warn("No IDE selected — nothing to configure.");
    }
    return;
  }

  const launch = resolveLaunch(opts);
  const env = buildEnv(opts);

  log(`\n${c.bold}Writing config${c.reset} ${c.gray}(launch: ${launch.command} ${launch.args.join(" ")})${c.reset}`);
  runConfigure(ides, launch, env);

  log(`\n${c.green}${c.bold}  ✓ Done.${c.reset}`);
  log(`  ${c.gray}Environment : ${opts.env || process.env.WEBCAKE_ENV || "prod"}${c.reset}`);
  log(`  ${c.gray}Auth        : ${authNote}${c.reset}`);
  if (loggedIn) log(`  ${c.gray}Token saved to local config (not written into IDE files).${c.reset}`);
  log(`  ${c.cyan}Restart your IDE, then ask the AI to build a storefront page.${c.reset}\n`);
}

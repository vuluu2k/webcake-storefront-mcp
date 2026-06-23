#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { makeApi, resolveSettings } from "./config.js";

const HELP = `webcake-storefront-mcp — MCP server for the WebCake/StoreCake storefront builder

Usage: npx -y webcake-storefront-mcp [command] [options]

Commands:
  (none)             start the stdio MCP server (use this in IDE configs)
  install            configure the server in your IDE(s) — interactive or via flags
  uninstall          remove the server from your IDE configs
  login              grab your token via the browser (saved to the local config db)
  serve [--port N]   run the remote Streamable-HTTP server (default 8787; or PORT env)
  help, --help, -h   show this help

Global options:
  --env <local|staging|prod>   pick the API + app base URLs (default prod)
`;

/** Read a global `--env <name>` / `--env=<name>` flag and expose it via WEBCAKE_ENV
 * so every subcommand (stdio, install, login, serve) resolves the same endpoints. */
function applyEnvFlag(argv: string[]): void {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--env" && argv[i + 1]) process.env.WEBCAKE_ENV = argv[i + 1];
    else if (a.startsWith("--env=")) process.env.WEBCAKE_ENV = a.slice("--env=".length);
  }
}

async function main(): Promise<void> {
  applyEnvFlag(process.argv);
  const sub = process.argv[2];

  if (sub === "help" || sub === "--help" || sub === "-h") {
    process.stdout.write(HELP);
    return;
  }

  if (sub === "install" || sub === "uninstall") {
    const { runInstaller } = await import("./install.js");
    const rest = sub === "uninstall" ? ["--uninstall", ...process.argv.slice(3)] : process.argv.slice(3);
    await runInstaller(rest);
    return;
  }

  if (sub === "login") {
    const { runLogin } = await import("./auth/login.js");
    await runLogin(process.argv.slice(3));
    return;
  }

  if (sub === "serve" || sub === "http" || sub === "serve-http") {
    const { startHttpServer } = await import("./http.js");
    const flagIdx = process.argv.indexOf("--port");
    const raw = (flagIdx !== -1 ? process.argv[flagIdx + 1] : undefined) ?? process.env.PORT;
    const port = Number(raw);
    await startHttpServer(Number.isFinite(port) && port > 0 ? port : 8787);
    return;
  }

  // Default: stdio MCP server.
  const settings = resolveSettings();
  if (!settings.apiUrl) {
    console.error("Required: WEBCAKE_API_URL (env var or saved via `login` / update_auth tool).");
    console.error("Run `npx -y webcake-storefront-mcp install` to set things up.");
    process.exit(1);
  }

  const api = makeApi();
  const server = createServer(api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[webcake-storefront] MCP server ready on stdio.");
}

main().catch((err) => {
  console.error("[webcake-storefront] fatal:", err);
  process.exit(1);
});

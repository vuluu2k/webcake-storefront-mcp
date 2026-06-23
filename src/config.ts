// Central resolution of connection settings for every entry path (stdio, install,
// login, remote HTTP). Precedence: explicit overrides > environment variables >
// saved config in the local SQLite db.

import { WebcakeCmsApi } from "./api.js";
import { getSavedConfig } from "./tools/context.js";

export type EnvName = "local" | "prod";

export interface EnvPreset {
  apiUrl: string;
  /** Base URL of the builder web app that hosts the /mcp-connect login page. */
  appUrl: string;
}

export const ENVIRONMENTS: Record<EnvName, EnvPreset> = {
  local: { apiUrl: "http://localhost:4000", appUrl: "http://localhost:5173" },
  prod: { apiUrl: "https://api.storecake.io", appUrl: "https://builder.webcake.io" },
};

export function resolveEnv(name: string | undefined): EnvPreset | undefined {
  if (!name) return undefined;
  return ENVIRONMENTS[name as EnvName];
}

export interface Overrides {
  apiUrl?: string;
  token?: string;
  siteId?: string;
  sessionId?: string;
  appUrl?: string;
  env?: string;
}

export interface Settings {
  apiUrl: string;
  appUrl: string;
  token: string;
  siteId: string;
  sessionId: string;
  env?: string;
}

/** Resolve effective settings from overrides, env vars, and the saved local config. */
export function resolveSettings(overrides: Overrides = {}): Settings {
  const saved = getSavedConfig();
  const preset = resolveEnv(overrides.env ?? process.env.WEBCAKE_ENV);

  const apiUrl =
    overrides.apiUrl || process.env.WEBCAKE_API_URL || saved.api_url || preset?.apiUrl || "";
  const appUrl =
    overrides.appUrl || process.env.WEBCAKE_APP_URL || preset?.appUrl || ENVIRONMENTS.prod.appUrl;
  const token = overrides.token || process.env.WEBCAKE_TOKEN || saved.token || "";
  const siteId = overrides.siteId || process.env.WEBCAKE_SITE_ID || saved.site_id || "";
  const sessionId =
    overrides.sessionId || process.env.WEBCAKE_SESSION_ID || saved.session_id || "";

  return { apiUrl, appUrl, token, siteId, sessionId, env: overrides.env ?? process.env.WEBCAKE_ENV };
}

/** Build a WebcakeCmsApi client from resolved settings. */
export function makeApi(overrides: Overrides = {}): WebcakeCmsApi {
  const s = resolveSettings(overrides);
  return new WebcakeCmsApi({
    baseUrl: s.apiUrl,
    token: s.token,
    siteId: s.siteId,
    sessionId: s.sessionId,
  });
}

// Central resolution of connection settings for every entry path (stdio, install,
// login, remote HTTP). Precedence: explicit overrides > environment variables >
// saved config in the local SQLite db.

import { WebcakeCmsApi } from "./api.js";
import { getSavedConfig } from "./tools/context.js";

export type EnvName = "local" | "staging" | "prod";

/** How a site's public preview URL is built when it has no custom domain:
 *  - path: `${base}/${siteId}` (local/staging share one host)
 *  - subdomain: `https://${site.site_slug.slug}.${suffix}` (prod: per-site subdomain in DB) */
export type PreviewRule = { kind: "path"; base: string } | { kind: "subdomain"; suffix: string };

export interface EnvPreset {
  /** Backend API base the MCP calls. */
  apiUrl: string;
  /** Builder web app base that hosts the /mcp-storefront login page. */
  appUrl: string;
  /** Rule for building the published-site preview URL. */
  preview: PreviewRule;
}

// Per-environment endpoints so you can switch with `--env <name>` / WEBCAKE_ENV
// instead of setting WEBCAKE_API_URL / WEBCAKE_APP_URL by hand. Default is prod.
export const ENVIRONMENTS: Record<EnvName, EnvPreset> = {
  local: {
    apiUrl: "http://localhost:24679",
    appUrl: "http://localhost:5173",
    preview: { kind: "path", base: "http://demo.localhost:24679" },
  },
  staging: {
    apiUrl: "https://api.staging.storecake.io",
    appUrl: "https://staging.webcake.io",
    preview: { kind: "path", base: "https://staging2.webcake.me" },
  },
  prod: {
    apiUrl: "https://api.storefront.webcake.io",
    appUrl: "https://webcake.io",
    preview: { kind: "subdomain", suffix: "webcake.me" },
  },
};

export const DEFAULT_ENV: EnvName = "prod";

/** Map a resolved API base back to its named environment (so the preview rule can be
 *  picked without threading the env around). Falls back to the default env. */
export function envFromApiUrl(apiUrl: string): EnvName {
  const normalized = (apiUrl || "").replace(/\/$/, "");
  for (const [name, p] of Object.entries(ENVIRONMENTS)) {
    if (p.apiUrl === normalized) return name as EnvName;
  }
  return DEFAULT_ENV;
}

/** Resolve a site's public preview/live URL: a custom domain if set, otherwise the
 *  per-environment rule. Returns null if it can't be determined. */
export async function resolvePreviewUrl(api: WebcakeCmsApi): Promise<string | null> {
  let site: any;
  try {
    const res = await api.getSite();
    site = (res && res.data) || res;
  } catch {
    return null;
  }
  if (!site) return null;

  const custom = site.primary_domain && site.primary_domain.domain;
  if (custom) return `https://${custom}`;

  const rule = ENVIRONMENTS[envFromApiUrl(api.baseUrl)].preview;
  if (rule.kind === "subdomain") {
    const slug = site.site_slug && site.site_slug.slug;
    return slug ? `https://${slug}.${rule.suffix}` : null;
  }
  return `${rule.base}/${api.siteId}`;
}

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

/** Resolve effective settings from overrides, env vars, named env preset, and saved config.
 *
 * Precedence for the URLs: explicit override → explicit env var → named-env preset
 * (only when WEBCAKE_ENV / --env is set) → saved config (from `login`) → prod default.
 * So with zero config you hit prod; `--env local` flips to localhost for testing; an
 * explicit WEBCAKE_API_URL still wins; and a logged-in saved URL is respected. */
export function resolveSettings(overrides: Overrides = {}): Settings {
  const saved = getSavedConfig();
  const envName = overrides.env ?? process.env.WEBCAKE_ENV;
  const preset = resolveEnv(envName); // undefined unless an env was explicitly named

  const apiUrl =
    overrides.apiUrl ||
    process.env.WEBCAKE_API_URL ||
    preset?.apiUrl ||
    saved.api_url ||
    ENVIRONMENTS[DEFAULT_ENV].apiUrl;
  const appUrl =
    overrides.appUrl ||
    process.env.WEBCAKE_APP_URL ||
    preset?.appUrl ||
    ENVIRONMENTS[DEFAULT_ENV].appUrl;
  const token = overrides.token || process.env.WEBCAKE_TOKEN || saved.token || "";
  const siteId = overrides.siteId || process.env.WEBCAKE_SITE_ID || saved.site_id || "";
  const sessionId =
    overrides.sessionId || process.env.WEBCAKE_SESSION_ID || saved.session_id || "";

  return { apiUrl, appUrl, token, siteId, sessionId, env: envName };
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

/**
 * A THIN OAuth 2.1 Authorization Server, embedded in the MCP server itself.
 *
 * Ported from webcake-landing-mcp with one key adaptation: the credential is a
 * PAIR (jwt + wsid) instead of a single `ljwt`. The consent page is the
 * storefront's /mcp-storefront (not /mcp-connect), and the /oauth/callback
 * receives both `token` (jwt) and `wsid` from the SPA. Both are stored against
 * the authorization code and carried through to the access token so the HTTP
 * layer can inject BOTH x-webcake-jwt AND x-webcake-session-id headers.
 *
 * Store: in-memory only (no Postgres dependency in the storefront MCP). For a
 * multi-instance deploy, replace with a shared store behind the same interface.
 */
import { randomBytes, createHash } from "node:crypto";

// ---- TTLs ------------------------------------------------------------------
const TEN_MIN = 10 * 60 * 1000;
const ACCESS_TTL = Number(process.env.WEBCAKE_OAUTH_ACCESS_TTL_MS) || 60 * 60 * 1000; // 1h
const REFRESH_TTL = Number(process.env.WEBCAKE_OAUTH_REFRESH_TTL_MS) || 30 * 24 * 60 * 60 * 1000; // 30d
const CODE_TTL = TEN_MIN;
const PENDING_TTL = TEN_MIN;

// ---- Records ---------------------------------------------------------------
export type OAuthClient = {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  created_at: number;
};

/** A started /authorize request, parked while the user logs in via /mcp-storefront. */
type PendingAuth = {
  client_id: string;
  redirect_uri: string; // the CLIENT's (Claude/ChatGPT) callback
  code_challenge: string;
  state?: string; // the CLIENT's state, echoed back verbatim
  scope?: string;
  expiresAt: number;
};

/** Storefront credential pair — both jwt AND wsid are required. */
export type StorefrontCred = { jwt: string; wsid: string };

/** An issued authorization code, exchanged once at /token. */
type AuthCode = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope?: string;
  cred: StorefrontCred;
  expiresAt: number;
};

type AccessToken = { cred: StorefrontCred; scope?: string; expiresAt: number };
type RefreshToken = { cred: StorefrontCred; client_id: string; scope?: string; expiresAt: number };

function now(): number {
  return Date.now();
}

function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// ---- In-memory store -------------------------------------------------------
class MemoryStore {
  private clients = new Map<string, OAuthClient>();
  private pending = new Map<string, PendingAuth>();
  private codes = new Map<string, AuthCode>();
  private access = new Map<string, AccessToken>();
  private refresh = new Map<string, RefreshToken>();

  private sweep(): void {
    const t = now();
    for (const [k, v] of this.pending) if (v.expiresAt < t) this.pending.delete(k);
    for (const [k, v] of this.codes) if (v.expiresAt < t) this.codes.delete(k);
    for (const [k, v] of this.access) if (v.expiresAt < t) this.access.delete(k);
    for (const [k, v] of this.refresh) if (v.expiresAt < t) this.refresh.delete(k);
  }

  putClient(c: OAuthClient): void { this.clients.set(c.client_id, c); }
  getClient(id: string): OAuthClient | undefined { return this.clients.get(id); }

  putPending(state: string, p: PendingAuth): void { this.sweep(); this.pending.set(state, p); }
  takePending(state: string): PendingAuth | undefined {
    this.sweep();
    const p = this.pending.get(state);
    this.pending.delete(state);
    return p && p.expiresAt >= now() ? p : undefined;
  }

  putCode(code: string, c: AuthCode): void { this.codes.set(code, c); }
  takeCode(code: string): AuthCode | undefined {
    this.sweep();
    const c = this.codes.get(code);
    this.codes.delete(code);
    return c && c.expiresAt >= now() ? c : undefined;
  }

  putAccess(t: string, a: AccessToken): void { this.access.set(t, a); }
  getAccess(t: string): AccessToken | undefined {
    const a = this.access.get(t);
    if (a && a.expiresAt < now()) { this.access.delete(t); return undefined; }
    return a;
  }

  putRefresh(t: string, r: RefreshToken): void { this.refresh.set(t, r); }
  takeRefresh(t: string): RefreshToken | undefined {
    this.sweep();
    const r = this.refresh.get(t);
    this.refresh.delete(t);
    return r && r.expiresAt >= now() ? r : undefined;
  }

  revoke(t: string): void { this.access.delete(t); this.refresh.delete(t); }
}

const store = new MemoryStore();

// ---- PKCE ------------------------------------------------------------------
export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const a = s256(verifier);
  if (a.length !== challenge.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ challenge.charCodeAt(i);
  return diff === 0;
}

// ---- Dynamic Client Registration -------------------------------------------
export type RegisterRequest = { redirect_uris?: unknown; client_name?: unknown; [k: string]: unknown };

export type RegisterResult =
  | { ok: true; client: OAuthClient }
  | { ok: false; error: string; error_description: string };

export function registerClient(body: RegisterRequest): RegisterResult {
  const uris = Array.isArray(body?.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
    : [];
  if (uris.length === 0) {
    return { ok: false, error: "invalid_redirect_uri", error_description: "redirect_uris must contain at least one absolute http(s) URI." };
  }
  const client: OAuthClient = {
    client_id: token(16),
    client_name: typeof body?.client_name === "string" ? body.client_name : undefined,
    redirect_uris: uris,
    created_at: now(),
  };
  store.putClient(client);
  return { ok: true, client };
}

export function getClient(clientId: string | undefined | null): OAuthClient | undefined {
  if (!clientId) return undefined;
  return store.getClient(clientId);
}

// ---- Authorize -------------------------------------------------------------
export type StartAuthorizeParams = {
  client_id?: string | null;
  redirect_uri?: string | null;
  response_type?: string | null;
  code_challenge?: string | null;
  code_challenge_method?: string | null;
  state?: string | null;
  scope?: string | null;
};

export type StartAuthorizeResult =
  | { ok: true; internalState: string }
  | { ok: false; error: string; error_description: string; redirectable: boolean };

export function startAuthorize(p: StartAuthorizeParams): StartAuthorizeResult {
  const client = p.client_id ? store.getClient(p.client_id) : undefined;
  if (!client) {
    return { ok: false, error: "invalid_client", error_description: "Unknown client_id. Register first via /register.", redirectable: false };
  }
  if (!p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) {
    return { ok: false, error: "invalid_request", error_description: "redirect_uri does not match a registered URI.", redirectable: false };
  }
  if (p.response_type !== "code") {
    return { ok: false, error: "unsupported_response_type", error_description: "Only response_type=code is supported.", redirectable: true };
  }
  if (!p.code_challenge || (p.code_challenge_method ?? "").toUpperCase() !== "S256") {
    return { ok: false, error: "invalid_request", error_description: "PKCE with code_challenge_method=S256 is required.", redirectable: true };
  }
  const internalState = token(24);
  store.putPending(internalState, {
    client_id: client.client_id,
    redirect_uri: p.redirect_uri,
    code_challenge: p.code_challenge,
    state: p.state ?? undefined,
    scope: p.scope ?? undefined,
    expiresAt: now() + PENDING_TTL,
  });
  return { ok: true, internalState };
}

export type CompleteAuthorizeResult =
  | { ok: true; redirectUri: string; code: string; state?: string }
  | { ok: false; error: string; error_description: string };

/**
 * The consent page (/mcp-storefront) bounced back with the user's jwt + wsid and our
 * internalState. Mint a one-time authorization code bound to that credential pair.
 */
export function completeAuthorize(
  internalState: string | undefined | null,
  jwt: string | undefined | null,
  wsid: string | undefined | null
): CompleteAuthorizeResult {
  const p = internalState ? store.takePending(internalState) : undefined;
  if (!p) {
    return { ok: false, error: "invalid_request", error_description: "Authorization session expired or unknown — restart the connection." };
  }
  if (!jwt) {
    return { ok: false, error: "access_denied", error_description: "No WebCake token returned from login." };
  }
  const code = token(32);
  store.putCode(code, {
    client_id: p.client_id,
    redirect_uri: p.redirect_uri,
    code_challenge: p.code_challenge,
    scope: p.scope,
    cred: { jwt, wsid: wsid ?? "" },
    expiresAt: now() + CODE_TTL,
  });
  return { ok: true, redirectUri: p.redirect_uri, code, state: p.state };
}

// ---- Token endpoint --------------------------------------------------------
export type TokenParams = {
  grant_type?: string | null;
  code?: string | null;
  redirect_uri?: string | null;
  client_id?: string | null;
  code_verifier?: string | null;
  refresh_token?: string | null;
};

export type TokenSuccess = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope?: string;
};
export type TokenResult =
  | { ok: true; body: TokenSuccess }
  | { ok: false; status: number; error: string; error_description: string };

function issueTokens(cred: StorefrontCred, client_id: string, scope: string | undefined): TokenSuccess {
  const access = token(32);
  const refresh = token(32);
  store.putAccess(access, { cred, scope, expiresAt: now() + ACCESS_TTL });
  store.putRefresh(refresh, { cred, client_id, scope, expiresAt: now() + REFRESH_TTL });
  return { access_token: access, token_type: "Bearer", expires_in: Math.floor(ACCESS_TTL / 1000), refresh_token: refresh, scope };
}

export function exchangeToken(p: TokenParams): TokenResult {
  if (p.grant_type === "authorization_code") {
    const c = p.code ? store.takeCode(p.code) : undefined;
    if (!c) {
      return { ok: false, status: 400, error: "invalid_grant", error_description: "Unknown or expired authorization code." };
    }
    if (c.client_id !== p.client_id) {
      return { ok: false, status: 400, error: "invalid_grant", error_description: "client_id does not match the authorization code." };
    }
    if (c.redirect_uri !== p.redirect_uri) {
      return { ok: false, status: 400, error: "invalid_grant", error_description: "redirect_uri does not match the authorization request." };
    }
    if (!p.code_verifier || !verifyPkce(p.code_verifier, c.code_challenge)) {
      return { ok: false, status: 400, error: "invalid_grant", error_description: "PKCE verification failed." };
    }
    return { ok: true, body: issueTokens(c.cred, c.client_id, c.scope) };
  }
  if (p.grant_type === "refresh_token") {
    const r = p.refresh_token ? store.takeRefresh(p.refresh_token) : undefined;
    if (!r) {
      return { ok: false, status: 400, error: "invalid_grant", error_description: "Unknown or expired refresh token." };
    }
    return { ok: true, body: issueTokens(r.cred, r.client_id, r.scope) };
  }
  return { ok: false, status: 400, error: "unsupported_grant_type", error_description: "grant_type must be authorization_code or refresh_token." };
}

// ---- Resource-server side: resolve a Bearer access token to the cred pair --
/** Returns the { jwt, wsid } for a valid, unexpired access token, else undefined. */
export function resolveAccessToken(accessToken: string | undefined | null): StorefrontCred | undefined {
  if (!accessToken) return undefined;
  return store.getAccess(accessToken)?.cred;
}

/** Revoke an access or refresh token (best-effort; for /revoke). */
export function revokeToken(t: string | undefined | null): void {
  if (!t) return;
  store.revoke(t);
}

// ---- Metadata documents (RFC 8414 / RFC 9728) ------------------------------
export function authServerMetadata(issuer: string): Record<string, unknown> {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    revocation_endpoint: `${issuer}/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["storefront:read", "storefront:write"],
  };
}

export function protectedResourceMetadata(resource: string, issuer: string): Record<string, unknown> {
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: ["storefront:read", "storefront:write"],
    bearer_methods_supported: ["header"],
  };
}

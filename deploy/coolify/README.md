# Deploying webcake-storefront-mcp on Coolify

This directory contains everything needed to deploy the WebCake Storefront MCP server
as a Docker Compose stack on [Coolify](https://coolify.io), with Postgres (durable OAuth
token store) and Redis (access-token cache) included.

## What you get

- `/mcp` — Streamable-HTTP MCP endpoint (multi-user, per-request credentials)
- `/health` — health probe (returns `{"ok":true}`)
- `/.well-known/oauth-authorization-server` — OAuth 2.1 AS metadata
- `/.well-known/oauth-protected-resource` — OAuth 2.1 resource metadata
- `/register`, `/authorize`, `/token`, `/revoke` — full OAuth 2.1 + PKCE flow
- `/`, `/privacy`, `/terms` — landing + legal pages

## Step-by-step Coolify deployment

### 1. Add a new resource

In the Coolify dashboard: **+ New** → **Docker Compose** → connect your repo.

### 2. Set the Compose location

| Setting | Value |
|---|---|
| Base Directory | `/` |
| Docker Compose Location | `/deploy/coolify/docker-compose.yml` |

### 3. Add a domain

In the `webcake-mcp` service settings, add your domain, e.g.:

```
store.toolvn.io.vn
```

Coolify injects this as `SERVICE_FQDN_MCP` and Traefik handles TLS via Let's Encrypt.

Your MCP endpoint will be: `https://store.toolvn.io.vn/mcp`

### 4. Set environment variables (Coolify UI → Environment Variables)

Coolify auto-generates `SERVICE_USER_POSTGRES` and `SERVICE_PASSWORD_POSTGRES`.
The compose file wires those into both the Postgres container and `DATABASE_URL`.

You only need to add extras like:

```
WEBCAKE_API_URL=https://api.storecake.io
WEBCAKE_APP_URL=https://builder.storecake.io
MONGO_URI=mongodb+srv://...       # optional: image-alt cache
PEXELS_API_KEY=...                # optional: image search
```

See `.env.example` for the full list.

### 5. Deploy

Click **Deploy**. Coolify builds the image (runs `npm run build && npm run smoke`
inside Docker — a broken build fails the deploy), starts Postgres + Redis, then
starts the MCP server.

### 6. Configure a client (Claude Desktop / Cursor / etc.)

**OAuth flow (recommended — Claude.ai connectors):**

Point the client at `https://store.toolvn.io.vn/mcp`. The server advertises OAuth
metadata at `/.well-known/oauth-authorization-server`. The client registers, gets
redirected to `/mcp-storefront` on the builder app for login, and receives an
opaque Bearer access token. The server resolves the token to `{jwt, wsid}` and
injects both headers automatically.

**Per-request headers (Claude Code / Cursor / direct API):**

```json
{
  "mcpServers": {
    "webcake-storefront": {
      "url": "https://store.toolvn.io.vn/mcp",
      "headers": {
        "x-webcake-jwt": "<your-jwt>",
        "x-webcake-session-id": "<your-wsid>",
        "x-webcake-site-id": "<your-site-id>"
      }
    }
  }
}
```

Or via query params (for clients that can't set custom headers):

```
https://store.toolvn.io.vn/mcp?jwt=<jwt>&session_id=<wsid>&site_id=<site_id>
```

## How the credential pair maps to the schema

The storefront credential is a **pair** `{ jwt, wsid }` — not a single token.

- **`jwt`** — the user's WebCake JWT (authentication + authorisation).
- **`wsid`** — the WebCake workspace/session ID (identifies the storefront context).

In Postgres these are stored as two columns (`jwt text NOT NULL, wsid text`) in
`oauth_codes`, `oauth_access_tokens`, and `oauth_refresh_tokens`. When a Bearer
token arrives at `/mcp`, the server resolves it to `{jwt, wsid}` and injects both
as `x-webcake-jwt` and `x-webcake-session-id` request headers.

**Redis role:** Redis caches `access_token → {jwt, wsid}` with a slightly shorter
TTL than the token itself, so each `/mcp` request is a sub-millisecond Redis GET
rather than a Postgres query. On a Redis miss (or when Redis is absent) the server
falls back to Postgres. Redis is disposable — losing it never loses data, only
causes a brief spike in Postgres queries.

## Persistence + fallback behaviour

| Scenario | OAuth store | Token cache |
|---|---|---|
| `DATABASE_URL` + `REDIS_URL` set | Postgres (durable) | Redis (fast) |
| `DATABASE_URL` only | Postgres | in-process (miss = Postgres) |
| Neither set (local / npx / CI) | in-memory Map | in-memory Map |

All three scenarios work — in-memory is the default when no env vars are set, which
is how `npm run build` and `npm run smoke` run in CI with zero infrastructure.

## Local development (without Coolify)

See `docker-compose.dev.yml` in the repo root for a local Postgres + Redis setup.

```bash
docker compose -f docker-compose.dev.yml up -d
export DATABASE_URL=postgres://webcake:webcake@localhost:5432/webcake_storefront
export REDIS_URL=redis://localhost:6379
npm run build && node dist/index.js serve --port 8787
```

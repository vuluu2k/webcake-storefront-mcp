# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that exposes WebCake CMS features as tools for AI agents. It acts as a bridge between AI IDEs (Claude Desktop, Claude Code, Cursor, Windsurf, Augment) and the WebCake/StoreCake CMS backend API.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (src/ → dist/) + copy assets. REQUIRED before running.
npm start            # Run the built stdio MCP server (node dist/index.js)
npm run serve        # Run the remote Streamable-HTTP server (node dist/index.js serve)
npm run dev          # tsc --watch

# CLI subcommands (also available via `npx -y webcake-storefront-mcp <cmd>`):
node dist/index.js              # stdio MCP server (default; use in IDE configs)
node dist/index.js install      # write MCP config into IDEs (Claude Desktop/Code, Cursor, Windsurf, VSCode)
node dist/index.js login        # browser login → saves token to ~/.webcake-storefront-mcp/ db
node dist/index.js serve --port 8787   # remote Streamable-HTTP MCP
```

This is a **TypeScript** project (strict). All source lives in `src/` and compiles to `dist/`; the published `bin` is `dist/index.js`. The server runs over stdio by default (for IDE configs) and can also run as a remote Streamable-HTTP server via `serve`. Config (token/site/api_url) is read from env vars or a SQLite db at `~/.webcake-storefront-mcp/` (survives `npx`).

## Environment Variables

Required (auth):
- `WEBCAKE_TOKEN` — storefront JWT Bearer token (the builder's `jwt` cookie / `store_jwt`)
- `WEBCAKE_SESSION_ID` — session id, sent as the `x-session-id` header (the builder's `wsid` cookie)

The **site is not set from env** — it's chosen at runtime via the `list_my_sites` + `switch_site` tools (persisted to the local db, restored next session). `WEBCAKE_SITE_ID` still works as an optional override if you want to pin a site, and remote mode can pass `x-webcake-site-id` / `?site_id=` per request.

Endpoints come from a **named environment** so you don't set base URLs by hand:
- `WEBCAKE_ENV` (or `--env`) = `local` | `staging` | `prod` — **default `prod`**. Presets live in `src/config.ts` (`ENVIRONMENTS`):
  - local → api `http://localhost:24679`, app `http://localhost:5173`, preview `http://demo.localhost:24679/<siteId>`
  - staging → api `https://api.staging.storecake.io`, app `https://staging.webcake.io`, preview `https://staging2.webcake.me/<siteId>`
  - prod → api `https://api.storefront.webcake.io`, app `https://webcake.io`, preview `https://<site_slug.slug>.webcake.me`
- **Preview URL** (`resolvePreviewUrl` in config.ts): a site's custom domain (`primary_domain.domain`) wins; otherwise the per-env rule above (prod = per-site subdomain from the DB `site_slug.slug`; local/staging = `${base}/<siteId>`). Surfaced by `publish_site`.
- `WEBCAKE_API_URL` / `WEBCAKE_APP_URL` — optional explicit overrides (win over the preset). Per-request overrides in remote mode: `x-webcake-env` / `x-webcake-api-url` headers or `?env=` / `?api_url=` query.

So with `--env prod` (the default) you only need token + session (+ site). `--env local` flips everything to localhost for testing.

Optional, configured server-side (e.g. on the VPS running `serve`): `PEXELS_API_KEY` (search_images), `MONGO_URI` (image-alt cache).

CMS-file / HTTP-function endpoints additionally require a CMS admin token + CMS API key, which are auto-fetched at runtime via `api.fetchCmsTokens()` (no manual config) and bundled into those request bodies.

## Architecture

```
src/                — TypeScript source (strict); compiles to dist/
  index.ts          — CLI dispatcher: stdio server (default) + install / uninstall / login / serve subcommands
  server.ts         — createServer(api): builds McpServer, registers every tool module, exposes Handle type
  config.ts         — env presets + resolveSettings() + makeApi() (overrides > env > saved db)
  install.ts        — writes MCP config into IDE config files (Claude Desktop/Code, Cursor, Windsurf, VSCode)
  auth/login.ts     — loopback browser login → builderx_spa /mcp-storefront → saves token + session_id to the local db
  http.ts           — remote Streamable-HTTP transport; per-session JWT/site via headers or ?query
  db.ts             — SQLite (better-sqlite3) at ~/.webcake-storefront-mcp/; config + image-alt cache
  api.ts            — WebcakeCmsApi class: all HTTP calls to the WebCake/StoreCake backend
  mongo.ts          — optional MongoDB sync for the image-alt cache (MONGO_URI)
  guides.ts         — embedded HTTP_FUNCTION_GUIDE / CUSTOM_CODE_GUIDE strings
  builder/          — Page-authoring engine for the BuilderX storefront component model
    factory.ts      — Verbatim port of builderx_spa/src/common/factory.js (~132 create* fns);
                      source of truth for valid component nodes. Only lodash/index imports swapped for shims.
    catalog.ts      — Auto-built type→factory registry + curated category/summary metadata
    page.ts         — Page skeleton, grid-layout composition (stackChildren/buildSection), re-id, validatePage
    guide.ts        — BUILD_GUIDE: the grid model, breakpoints, forms/data, build workflow
  tools/            — one register*Tools(server, api, handle) per file (~101 tools total):
    cms-files, pages, collections, articles, customers, automation, products, orders,
    site-style, apps, promotions, combos, global-sources, images, context,
    builder (get_build_guide, list_elements, new_section, build_page…), builder-extras
    (search_images, upload_image, publish_site, ingest_html/ingest_url)
scripts/copy-assets.mjs — post-tsc: chmod +x dist/index.js
```

### BuilderX page model (for builder/ and tools/builder*.js)

A page's content is `{ sections: [ <node>, ... ] }`. A node is `{ id, type, specials, runtime:{style,config}, children?, events?, bindings? }`. Layout is **CSS grid** (runtime.config grid/columns/rows + per-child columnStart/End, rowStart/End, constraintX/Y) — NOT absolute top/left. Responsive overrides go in per-node `bp1`/`tablet`/`laptop` keys. The factory functions are ported from the builderx_spa Vue app and are the authoritative shape; always build nodes via the factory, never hand-write. Page creation calls `api.createPage` then `api.updatePageSource`; publishing is **site-level** (`api.publishSite`).

### Key Patterns

- **Tool registration**: Each `src/tools/*.ts` file exports a `register*Tools(server, api, handle)` function. `server` is the McpServer instance, `api` is the WebcakeCmsApi client, `handle` wraps async calls with error handling. All are wired in `src/server.ts`.
- **Unified error handling**: The `handle()` wrapper in `src/server.ts` catches all errors and returns `{ isError: true }` MCP responses.
- **TypeScript**: strict mode, ES2022 + Node16 modules. Relative imports must keep the `.js` extension (Node16 resolution) even though sources are `.ts`. Dynamic CMS data is typically typed `any`.
- **Schema validation**: All tool inputs validated with `zod` schemas passed directly to `server.tool()`.
- **API client**: `WebcakeCmsApi` uses native `fetch` with a 15-second timeout (`AbortController`). Every request sends `Authorization: Bearer <token>` and `x-session-id: <sessionId>`. CMS-file/HTTP-function mutations also lazily call `fetchCmsTokens()` and bundle the admin token + CMS API key into the body.
- **Guide injection**: `get_http_function` and `get_site_custom_code` tools return embedded guides alongside data, teaching the AI agent the WebCake coding conventions (function naming, SDK usage, available globals).

### HTTP Function Convention (backend code on WebCake)

Functions follow `export const [method]_[FunctionName]` naming — e.g. `get_Products`, `post_CreateOrder`. The `webcake-data` SDK (`DBConnection`) is the built-in database layer. See `guides.js` for full reference.

## Dependencies

Only two runtime dependencies:
- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `zod` — Input validation schemas

ES modules (`"type": "module"` in package.json). Node.js required.

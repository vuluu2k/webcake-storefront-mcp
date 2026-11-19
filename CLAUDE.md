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
node dist/index.js install      # no questions: prod, browser Connect, every detected IDE (--dev: wizard with env choice)
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

Optional, configured server-side (e.g. on the VPS running `serve`): `PEXELS_API_KEY` (search_images).

CMS-file / HTTP-function endpoints additionally require a CMS admin token + CMS API key, which are auto-fetched at runtime via `api.fetchCmsTokens()` (no manual config) and bundled into those request bodies.

## Architecture

```
src/                — TypeScript source (strict); compiles to dist/
  index.ts          — CLI dispatcher: stdio server (default) + install / uninstall / login / serve subcommands
  server.ts         — createServer(api): builds McpServer, registers every tool module, exposes Handle type
  config.ts         — env presets + resolveSettings() + makeApi() (overrides > env > saved db)
  install.ts        — merges MCP config into every detected IDE's file (keeps a backup; VS Code uses `servers`)
  web-guide.ts      — marketing page at GET /; web-guide-scene.ts holds the liquid-glass CSS + three.js scene (same file in webcake-landing-mcp)
  auth/login.ts     — loopback browser login → builderx_spa /mcp-storefront → saves token + session_id to the local db
  http.ts           — remote Streamable-HTTP transport; per-session JWT/site via headers or ?query
  db.ts             — JSON files at ~/.webcake-storefront-mcp/; config + image-alt cache
  api.ts            — WebcakeCmsApi class: all HTTP calls to the WebCake/StoreCake backend
  guides.ts         — embedded HTTP_FUNCTION_GUIDE / CUSTOM_CODE_GUIDE strings
  builder/          — Page-authoring engine for the BuilderX storefront component model
    factory.ts      — Verbatim port of builderx_spa/src/common/factory.js (~132 create* fns);
                      source of truth for valid component nodes. Only lodash/index imports swapped for shims.
    catalog.ts      — Auto-built type→factory registry + curated category/summary metadata
    page.ts         — Page skeleton, grid-layout composition (stackChildren/buildSection), re-id, validatePage
    guide.ts        — BUILD_GUIDE: the grid model, breakpoints, forms/data, build workflow
  tools/            — one register*Tools(server, api, handle) per file (~155 tools, exposed as 40 — see families.ts):
    cms-files, pages, collections, articles, customers, automation, products, orders,
    site-style, apps, promotions, combos, global-sources, images, context,
    builder (get_build_guide, list_elements, new_section, build_page…), builder-extras
    (search_images, upload_images, publish_site, ingest_html/ingest_url),
    reviews, appointment, affiliate, catalog-extras (brands/tags/ribbons/materials…),
    site-config (domains/SEO/shipping/utms/fonts/settings), marketing (email/contacts/
    subscribers/employees/insight), multilingual, media (library+pwa), apps-extra
    (product_design/ppd/course), sale-channels (sitemap/partner-feeds)
    registry.ts     — tool-group manifest + search gateway. Captures every register*Tools
                      via a collector, registers only CORE groups natively, exposes the rest
                      through list_tool_groups / search_tools / invoke_tool (progressive
                      disclosure). families.ts folds each domain's tools into ONE native tool
                      whose `action` = the old tool name (page, product, compose, builder_ref…);
                      retired-tools.json maps tools folded into the API gateway → their route.
scripts/copy-assets.mjs — post-tsc: chmod +x dist/index.js
```

### BuilderX page model (for builder/ and tools/builder*.js)

A page's content is `{ sections: [ <node>, ... ] }`. A node is `{ id, type, specials, runtime:{style,config}, children?, events?, bindings? }`. Layout is **CSS grid** (runtime.config grid/columns/rows + per-child columnStart/End, rowStart/End, constraintX/Y) — NOT absolute top/left. Responsive overrides go in per-node `bp1`/`tablet`/`laptop` keys. The factory functions are ported from the builderx_spa Vue app and are the authoritative shape; always build nodes via the factory, never hand-write. Page creation calls `api.createPage` then `api.updatePageSource`; publishing is **site-level** (`api.publishSite`).

### Key Patterns

- **Tool registration**: Each `src/tools/*.ts` file exports a `register*Tools(server, api, handle)` function. `server` is the McpServer instance, `api` is the WebcakeCmsApi client, `handle` wraps async calls with error handling. They are NOT called directly in `server.ts` anymore — `src/tools/registry.ts` (`installTools`) groups every module, registers only the CORE groups natively, and exposes the rest via the **search gateway** (`search_tools`/`invoke_tool`). Which groups load natively is controlled by `WEBCAKE_TOOLS` (env) or `ServerOptions.tools` / per-request `?tools=` / `x-webcake-tools` (forms: `all` | `core,marketing` | `+marketing,-store`). A new tool module just needs an entry in `registry.ts`'s `MODULES`/`GROUPS`.
- **Unified error handling**: The `handle()` wrapper in `src/server.ts` catches all errors and returns `{ isError: true }` MCP responses.
- **TypeScript**: strict mode, ES2022 + Node16 modules. Relative imports must keep the `.js` extension (Node16 resolution) even though sources are `.ts`. Dynamic CMS data is typically typed `any`.
- **Schema validation**: All tool inputs validated with `zod` schemas passed directly to `server.tool()`.
- **API client**: `WebcakeCmsApi` uses native `fetch` with a 15-second timeout (`AbortController`). Every request sends `Authorization: Bearer <token>` and `x-session-id: <sessionId>`. CMS-file/HTTP-function mutations also lazily call `fetchCmsTokens()` and bundle the admin token + CMS API key into the body.
- **Native first**: `src/builder/native-first.ts` holds the policy every custom-code path shares: the need → element table and ladder (injected into `BUILD_GUIDE`, `CUSTOM_CODE_GUIDE` and block messages) and the budgets. `update_site_custom_code` / `append_site_custom_code` / `update_page_source.custom_code` go through `checkSiteCode` + `codeGuard` (over budget or UI/data in code → refused unless `native_gap` names the gap; shrinking always passes). Page and global-source writers go through `checkNativeContent` (placeholder JSON, `custom_css` + embed volume). A new tool that writes code or page source must call one of these. A special feature = CMS app: collection + HTTP function + native UI + a small glue script.
- **Per-page custom code**: `page.settings.custom_code` = the site's four slots for ONE page (`builder/page-code.ts` + `tools/page-code.ts`; family `site_code` actions `get_page_custom_code` / `update_page_custom_code`; `build_page.custom_code`; `update_page_source.custom_code` routes there). Rendered by builderx_api `PageUtils.get_page_custom_code` (branch `feat/page-custom-code`) right after each site slot, JS in its own `<script data-page-custom-code>`; settings ride along on publish. `writePageCode` is the single writer: JS compiled with `vm.Script` (never run), CSS braces, `#ids` checked against the page, native-first + shrink guards. `page_source.custom_code` (editor DevMode) is stored but never rendered.
- **Element schema + validation**: `src/builder/element-schema.ts` builds each element's schema from real data — keys/value types/code-like values mined from published pages (`element-keys.generated.json`, regenerate with `npm run build && npm run mine-elements`, read-only with the `login` token), the curated tables in `attributes.ts`, and the factory skeleton. `validatePage` reports every problem as `[CODE] #id (type) where: problem → fix` (errors block saves; warnings collapsed per code, `summary.by_code`). UNKNOWN_KEY fires only for a key NO element carries (invented/misspelled); enums are enforced only where the curated list and real pages agree. Two more mined sources feed it: `renderer-keys.generated.json` (`npm run mine-renderer`: static read of builderx_api `lib/qwik` + `assets/render` — per type the keys the HTML/CSS builders read, fallback defaults, compared values, and every key mentioned on the render side) and `editor-keys.generated.json` (`npm run mine-editor`, after mine-renderer: builderx_spa editor panels — label, control, select options per type). `get_element` shows `keys` (`keyReference`: one line per rendered key, style config folded per part); a key no render code mentions → `no_effect` + NO_EFFECT warning; editor options become an enforced enum only when they cover every value seen on real pages. Native tools use `z.object(shape).strict()`: unknown tool arguments are refused.
- **Clone a page** (`builder/clone.ts` + `tools/clone.ts`, family `clone`): `captureInPage` runs inside the rendered source page (playwright-core + local Chrome when available — optional dep, `CHROME_PATH` overrides; else `get_clone_script` for the agent's own browser) and reduces it to a small tree read from GEOMETRY (bands of side-by-side boxes = rows), not from flex/grid CSS. `snapshotToSource` maps it onto `buildSection`/`buildFromSpec`: rows get column widths from the child positions (space-between survives) and each child is aligned in its column; small-item rows (menus) stay rows on phones. Renderer facts it relies on: a form's fields are styled from the FORM's style + `config.backgroundInput`; contact/lead forms are `subscribe` (`customer_data` hides for visitors); `.ql-editor a` forces links blue → a whole-text link becomes text + `open_link`; `link_target` is the URL, `link_target_url` the window; translucent paint is laid over the source page colour; section `style.background` is emitted raw (`url(...) <colour>`). Responsive is MEASURED, not guessed: `capturePage` re-probes every row's column count at 1100/768/390 (`probeColumns`, by DOM path key) → `collapse` per bp. Small pieces / clusters get `max-c` columns (`rowChildren({hug})`, texts `widthUnit:"auto"` — the factory text is 230px), stacks use content-sized rows (`autoRows`), large desktop gutters shrink on bp3/bp4, `<details>` → `collapse` (summary in `specials.name`) > `collapse-content`, small pictures keep px width. The source is parked in the result cache and `build_page({ source: "cache:clone-N" })` reads it. No embed/custom code is produced; skips and approximations are listed in `notes`. CSS for a written page_source is only built by the site `/save` (`syncPageAfterWrite`).
- **Fewer, bigger tools (sbuilder-style)**: no per-entity CRUD tools. A one-call CRUD wrapper is NOT a tool — that route is reached through `api_find` / `api_get` / `api_call`. A tool exists only for a flow or an invariant the raw route can't give (validation, merge, secrets whitelist, native-first, CMS tokens). A new tool of an existing domain goes into its family in `families.ts` (test: core ≤ 45 native tools).
- **API gateway** (`tools/api-gateway.ts`, core group): `api_find` / `api_get` / `api_call` reach every builderx_api route the storefront JWT can call, from `src/api-catalog.generated.json` — regenerate with `npm run gen-api` (static read of the Phoenix routers + controllers, one call hop for params; `BUILDERX_API_DIR` defaults to `../builderx_api`). Hybrid by design: a non-GET to a route a dedicated tool covers is REFUSED and names the tool (the tool holds the guards); writes default to `dry_run`; site delete / owner transfer are denied. New logic-bearing flows still get a dedicated tool; thin one-call wrappers can retire in favour of the gateway.
- **Remote = multi-user, multi-instance**: `http.ts` runs each MCP session inside `runWithConfigScope` (db.ts, AsyncLocalStorage), so `getConfig`/`setConfig` there read/write that session's account prefs (`persistence/prefs.ts`: site/confirm mode, Postgres → Redis → memory, written only after `/@me` accepts the token) — never the server's config file. Unknown `mcp-session-id` → 404 so clients re-initialize. Token expiry: `api.onAuthExpired` (stdio: browser Connect with a cross-process lock; remote: `markJwtDead` → Redis flag + OAuth tokens revoked in the store → next request 401s into Connect).
- **Guide injection**: `get_http_function` and `get_site_custom_code` tools return embedded guides alongside data, teaching the AI agent the WebCake coding conventions (function naming, SDK usage, available globals).

### HTTP Function Convention (backend code on WebCake)

Functions follow `export const [method]_[FunctionName]` naming — e.g. `get_Products`, `post_CreateOrder`. The `webcake-data` SDK (`DBConnection`) is the built-in database layer. See `guides.js` for full reference.

## Clone fidelity

`npm run fidelity` (dev machine only: local builderx_api in Docker + Chrome) clones every `test/fidelity/fixtures/*.html` (or URLs passed as args), writes it into a scratch homepage (`FIDELITY_SITE` / `FIDELITY_PAGE`, backed up and restored), rebuilds its CSS like `/save`, and scores source vs clone at 1440/768/390 (text found, x/width error, order, pixel diff, height ratio) against `test/fidelity/baseline.json` (`-- --save` to update). Run it before and after any change to `builder/clone.ts` or the layout helpers.

## Dependencies

Runtime dependencies:
- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `zod` — Input validation schemas
- `zod-to-json-schema` — converts tool zod shapes to JSON Schema for the `search_tools` gateway
- `node-html-parser` / `sharp` — HTML ingest + image processing

ES modules (`"type": "module"` in package.json). Node.js required.

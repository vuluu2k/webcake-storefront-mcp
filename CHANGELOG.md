# Changelog

**English** · [Tiếng Việt](./CHANGELOG.vi.md)

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [1.2.0] - 2026-06-23

### Added
- `upload_images` replaces `upload_image` with batch support (1–20 sources per call), parallel uploads, and a `dry_run` mode that previews what would be processed without uploading.
- `upload_images` accepts local file paths (absolute, `~/`, `file://`) in stdio mode so images on the user's machine can be uploaded directly to the site CDN.
- `build_page` now accepts a `type` enum (`main`, `store`, `member`, `blog`, `custom`, `error`, `maintain`) and automatically enables the matching site data-source flag (`use_store`, `use_member`, `use_blog`, `use_error`, `use_maintain`) before creating the page, so product, customer, and blog bindings resolve on first load.
- `get_build_guide` now includes a "Page types & data sources" section documenting the page kind enum, `PAGE_TYPE` numeric values, required data-source flags, and binding names for each special page type.

### Changed
- `build_page`'s `type` parameter is now a typed enum instead of a free string; the dry-run response includes new `page_type_num` and `will_enable_feature` fields, and the success response includes `page_type` and `data_source`.
- References to `upload_image` in `ingest_html` and `ingest_url` hints have been updated to `upload_images`.
- `set_image_alts` no longer auto-caches generated alt text between runs; the `cached_alt` field has been removed from `list_image_alts` output.

### Removed
- `upload_image` (singular) has been replaced by the new `upload_images` batch tool.
- `get_cached_image_alts`, `save_image_alts_cache`, `list_image_alts_cache`, `sync_image_alts_to_mongo`, and `sync_image_alts_from_mongo` tools have been removed along with the local image-alt cache and MongoDB sync layer.

## [1.1.4] - 2026-06-23

### Added
- The remote landing page served by the `serve` command now includes a "What's new" section that renders a version timeline loaded from a build-time `changelog.json` (generated from CHANGELOG.md and CHANGELOG.vi.md), with the current version shown as a pill badge in the hero bar and a nav link added to the page navigation.

## [1.1.3] - 2026-06-23

### Changed
- The `install` command's interactive wizard now runs a three-step flow: environment selection (`prod` / `staging` / `local`), authentication, then IDE configuration.
- During `install`, the authentication step now offers a recommended browser-login path (credentials saved to the local config file, not injected into IDE environment blocks) alongside the existing manual token + session ID paste option.
- The remote landing page's "Way ②" now directs users to `webcake.io/mcp-remote-store` to retrieve a personal pre-authenticated connector link instead of displaying a static MCP endpoint URL, and adds a security note that the personal link contains login credentials.

## [1.1.2] - 2026-06-23

### Fixed
- The server no longer crashes at startup in container environments built with `npm ci --ignore-scripts`; the `better-sqlite3` native SQLite module has been replaced with plain JSON file persistence (`config.json` and `image-alt-cache.json`) stored in `~/.webcake-storefront-mcp/`.

### Changed
- The landing page served by the `serve` command has been recolored from violet/indigo to teal-green (`#108B67`).
- The landing page no longer displays npm version, download, and license shields.io badges, and the footer no longer includes links to npm or the `/health` endpoint.
- The descriptions of `get_cached_image_alts`, `sync_image_alts_to_mongo`, and `sync_image_alts_from_mongo` now refer to the "local cache" instead of "local SQLite cache" to reflect the storage migration.

## [1.1.1] - 2026-06-23

### Added
- The `serve` command's OAuth token store now optionally uses Postgres (via `DATABASE_URL`) for durable persistence across restarts and shared state across multiple instances behind a load balancer, and Redis (via `REDIS_URL`) for caching access-token lookups; both are optional and the server falls back to in-memory when neither is configured.
- The landing page served at `/` by the `serve` command now supports bilingual content (Vietnamese and English) selectable via the `?lang=en` query parameter.

### Changed
- The landing page at `/` has been redesigned with simplified, non-technical copy and an updated violet/indigo color palette.

## [1.1.0] - 2026-06-23

### Added
- The `serve` (remote Streamable-HTTP) mode now embeds a full OAuth 2.1 Authorization Server at `/authorize`, `/token`, `/revoke`, `/register`, and `/.well-known/oauth-authorization-server`, allowing the claude.ai Connector Directory to authenticate via a browser-based PKCE consent flow without pre-sharing credentials.
- The `serve` command now serves a marketing landing page at `/` (HTML for browsers and known crawlers, JSON for programmatic clients) plus a favicon at `/favicon.svg` and `/favicon.ico`.
- Self-hosted Privacy Policy page at `/privacy` (also `/privacy-policy`) and Terms of Service page at `/terms` (also `/tos`), suitable for Claude Connectors Directory submissions.
- A `/health` endpoint is now served by `serve` mode (JSON response for uptime probes, landing HTML for browsers).

### Changed
- Unauthenticated requests to `/mcp` in `serve` mode now receive a `401 WWW-Authenticate` challenge by default, triggering the OAuth flow in supported clients such as claude.ai; set `WEBCAKE_OAUTH=0` to disable enforcement and retain the previous header/query-param-only auth behavior.
- OAuth redirect URIs are now constructed using `X-Forwarded-Proto` and `X-Forwarded-Host` headers when present, enabling correct operation behind a reverse proxy.

## [1.0.3] - 2026-06-23

### Added
- MIT license (Copyright vuluu2k) added to the package.

### Fixed
- The server no longer exits at startup when `WEBCAKE_API_URL` is not set; the API base URL defaults to the `prod` preset and can be overridden with `WEBCAKE_API_URL` or `WEBCAKE_ENV`.

## [1.0.2] - 2026-06-23

### Changed
- The `install` command no longer prompts for a Site ID; it now prompts for the Session ID (`WEBCAKE_SESSION_ID`) instead, since the active site is chosen at runtime via `list_my_sites` and `switch_site`.
- `WEBCAKE_SITE_ID` is no longer required at startup; on first interaction the server instructs the AI to call `list_my_sites` and `switch_site` if no site has been selected yet, and the choice is persisted across sessions.

## [1.0.1] - 2026-06-23

### Added
- Named environment presets (`local`, `staging`, `prod`) selectable via `--env` flag or `WEBCAKE_ENV` variable, defaulting to `prod` so `WEBCAKE_API_URL` no longer needs to be set manually.
- `staging` environment preset added with endpoints `api.staging.storecake.io` / `staging.webcake.io`.
- `publish_site` now returns a `preview_url` field: the site's custom domain if configured, otherwise a per-environment subdomain (prod) or path-based URL (local/staging).
- `login` now captures and persists the `wsid` session ID alongside the bearer token so `WEBCAKE_SESSION_ID` is populated automatically after connecting.

### Changed
- `login` command now opens the `/mcp-storefront` handoff page instead of `/mcp-connect`.
- Production API endpoint updated from `api.storecake.io` to `api.storefront.webcake.io`; app URL updated from `builder.webcake.io` to `webcake.io`.

### Removed
- Knowledge-management tools `sync_knowledge`, `list_knowledge`, `get_knowledge`, `create_knowledge`, `update_knowledge`, and `delete_knowledge` have been removed.

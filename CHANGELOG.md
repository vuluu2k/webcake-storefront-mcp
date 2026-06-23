# Changelog

**English** · [Tiếng Việt](./CHANGELOG.vi.md)

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
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

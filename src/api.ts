import { buildSection, finalizeForRender } from "./builder/page.js";
import { BREAKPOINTS } from "./builder/grid.js";

const DEFAULT_TIMEOUT = 15000;
/** Stamped on every site and page this MCP server creates (backend columns `sites.by_ai`
 *  and `pages.by_ai`), so the builder can flag AI-authored work. Mirrors the landing-page convention. */
export const BY_AI_MARKER = "mcp";

interface ApiInit {
  baseUrl: string;
  token: string;
  siteId: string;
  sessionId?: string;
}

interface RequestOpts {
  body?: unknown;
  query?: Record<string, unknown>;
  timeout?: number;
  headers?: Record<string, string>;
}

const SETTINGS_READ_ERR = "Không đọc được site settings, huỷ lưu để tránh ghi đè rỗng";

const listOf = (r: any): any[] => (Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []);
const parseMaybe = (v: any) => (typeof v === "string" ? (v ? JSON.parse(v) : null) : v ?? null);
const globalsOf = (src: any): any[] => (src?.sections || []).filter((s: any) => s && s.specials && s.specials.global);
/** Key-order-independent JSON, so a re-serialised but equal node doesn't count as an edit. */
const canon = (v: any) =>
  JSON.stringify(v ?? null, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

export class WebcakeCmsApi {
  /** Parse (if string) and guarantee settings.breakpoints is a usable object — an empty/missing
   *  breakpoints would make the backend compile CSS without media queries. */
  private ensureSafeSettings(s: any): Record<string, any> {
    const obj: any = typeof s === "string" ? JSON.parse(s) : s && typeof s === "object" ? { ...s } : {};
    const bp = obj.breakpoints;
    const valid =
      bp && typeof bp === "object" && !Array.isArray(bp) &&
      Object.values(bp).some((v: any) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number"));
    if (!valid) obj.breakpoints = { ...BREAKPOINTS };
    return obj;
  }
  private async readSettingsOrThrow(): Promise<Record<string, any>> {
    try {
      return await this.getSiteSettings();
    } catch (e: any) {
      throw new Error(`${SETTINGS_READ_ERR}: ${e?.message || e}`);
    }
  }
  baseUrl: string;
  token: string;
  siteId: string;
  sessionId: string;
  private _adminToken: string | null;
  private _cmsApiKey: string | null;
  private _siteBps: Promise<any> | null = null; // cached site.settings (breakpoints, defaultGrid)

  constructor({ baseUrl, token, siteId, sessionId }: ApiInit) {
    this.baseUrl = (baseUrl || "").replace(/\/$/, "");
    this.token = token;
    this.siteId = siteId;
    this.sessionId = sessionId || "";
    this._adminToken = null;
    this._cmsApiKey = null;
  }

  // CMS file / HTTP-function endpoints require an extra admin token + CMS API key
  // bundled into the body. Fetched lazily and cached; reset on token/site switch.
  async fetchCmsTokens(): Promise<void> {
    if (this._adminToken && this._cmsApiKey) return;

    const [adminRes, apiKeyRes] = await Promise.all([
      this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/token`),
      this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/api_key`),
    ]);

    this._adminToken = (adminRes && adminRes.data && adminRes.data.key) || null;
    this._cmsApiKey = (apiKeyRes && apiKeyRes.data && apiKeyRes.data.key) || null;
  }

  getBundleParams(): { token: string | null; x_cms_api_key: string | null } {
    return { token: this._adminToken, x_cms_api_key: this._cmsApiKey };
  }

  async request(method: string, path: string, { body, query, timeout, headers: extraHeaders }: RequestOpts = {}): Promise<any> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
      ...(this.sessionId && { "x-session-id": this.sessionId }),
      ...(extraHeaders || {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || DEFAULT_TIMEOUT);

    let res: Response;
    let json: any;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      // Read the body under the same timer — clearing it after the headers left a stalled body unbounded.
      json = await res.json().catch((e) => {
        if (controller.signal.aborted) throw e; // timed out mid-body: an error, not an empty success
        return null;
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const msg = (json && json.message) || (json && json.error) || res.statusText;
      throw new Error(`API ${res.status}: ${msg}`);
    }
    return json;
  }

  // ── Account & Sites ──
  getMe() {
    return this.request("GET", `/api/v1/@me`);
  }
  /** Personal sites only (persona_or_team==0). `filter` must be "all" (status 1) or "removed"
   *  (trash, status 0) — any other value makes the backend 500. */
  listMySites(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/all`, { query });
  }
  /** Plan purchase history of one site, `{ subscriptions: { data[], total_entries } }`.
   *  The path's misspelling is the real route. Rows carry payment secrets — whitelist before
   *  returning. 404 for a site in trash (SitePlug requires status 1). */
  getSiteSubscriptions(siteId = this.siteId, query: any = { page: 1, limit: 100 }) {
    return this.request("GET", `/api/v1/site/${siteId}/get_subsctription_package_by_site_id`, { query });
  }
  /** Plan catalog `{ packages: { data[] } }` (names are free text, no enum). */
  listPackages(query: any = { page: 1, limit: 100 }) {
    return this.request("GET", `/api/v1/site/${this.siteId}/get_packages`, { query });
  }
  /** Create a brand-new personal site. The backend seeds sample categories/products/blog
   *  but NO pages. Returns { data: { site: { id, site_slug:{slug}, ... } } }.
   *  Fails with 403 when the account's site quota is reached (free plan: 4 sites). */
  createSite(params: { name: string; slug: string }) {
    return this.request("POST", `/api/v1/dashboard/site/create`, {
      body: { ...params, by_ai: BY_AI_MARKER },
      timeout: 60000,
    });
  }
  /** Create a NEW site from a marketplace TEMPLATE by its theme id — the dedicated
   *  "use this template" API. Clones the template's pages, global sections, cart, popups,
   *  styles and fonts into a fresh account-owned site. Body: { id: <theme_id>, name, slug }.
   *  Returns { data: { site: { id, ... } } }. (403 if the free 4-site quota is reached, prod.) */
  importStoreToTheme(params: { id: string; name: string; slug?: string }) {
    return this.request("POST", `/api/v1/dashboard/site/import_store_to_theme`, {
      body: { ...params, by_ai: BY_AI_MARKER },
      timeout: 120000,
    });
  }
  getSiteInfo() {
    return this.request("GET", `/api/v1/site/${this.siteId}/`);
  }
  /** Switch to a different site (in-memory, no restart needed) */
  switchSite(siteId: string) {
    this.siteId = siteId;
    this._adminToken = null;
    this._cmsApiKey = null;
    this._siteBps = null;
  }
  // ── Section template library (designer-made blocks behind the editor's template picker) ──
  listTemplateCategories() {
    return this.request("GET", `/api/v1/templates/categories`);
  }
  /** Templates (each { id, name, thumbnail, source: JSON string of ONE node, usually a SECTION }).
   *  Query: id = category id (omit for all), term, page, limit. */
  listTemplates(query: { id?: string; term?: string; page?: number; limit?: number } = {}) {
    return this.request("GET", `/api/v1/templates`, { query });
  }
  /** The site's breakpoints ({ bpN: [minW, maxW] } from settings, which may be a JSON string),
   *  or null when unset/unreadable — callers then use the standard four. Cached per site. */
  getSiteBreakpoints(): Promise<Record<string, [number, number]> | null> {
    return this.siteLayout().then((s) => s?.breakpoints || null);
  }
  /** The site's section grid per breakpoint (settings.defaultGrid): the editor builds every new
   *  section from it (editor.js addBlankSection), so generated sections must too. */
  getSiteDefaultGrid(): Promise<Record<string, any> | null> {
    return this.siteLayout().then((s) => s?.defaultGrid || null);
  }
  private siteLayout(): Promise<any> {
    this._siteBps ??= this.getSite()
      .then((res: any) => {
        const site = res?.data ?? res;
        return (typeof site?.settings === "string" ? JSON.parse(site.settings || "{}") : site?.settings) || null;
      })
      .catch(() => {
        this._siteBps = null; // don't cache a failed lookup — retry on the next save
        return null;
      });
    return this._siteBps;
  }
  /** Update auth token (in-memory) */
  switchToken(token: string) {
    this.token = token;
    this._adminToken = null;
    this._cmsApiKey = null;
  }
  /** Update session ID */
  switchSession(sessionId: string) {
    this.sessionId = sessionId;
  }

  // ── CMS Files ──
  listCmsFiles() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/cms_files`);
  }
  async createCmsFile(params: any) {
    await this.fetchCmsTokens();
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files`, {
      body: { ...params, ...this.getBundleParams() },
    });
  }
  async updateCmsFile(id: string, params: any) {
    await this.fetchCmsTokens();
    return this.request("PATCH", `/api/v1/dashboard/site/${this.siteId}/cms_files/${id}`, {
      body: { ...params, ...this.getBundleParams() },
    });
  }
  getHttpFunction() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/cms_files/http_function`);
  }
  async createOrUpdateHttpFunction(params: any) {
    await this.fetchCmsTokens();
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files/http_function`, {
      body: { ...params, ...this.getBundleParams() },
    });
  }
  debugFunction(params: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files/debug`, { body: params });
  }
  runFunction(functionName: string, method: string, params: any) {
    return this.request(method, `/api/v1/${this.siteId}/_functions/${functionName}`, { body: params });
  }
  saveFileVersion(params: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files/save_version_file`, { body: params });
  }
  getFileVersions(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/cms_files/version_file`, { query });
  }
  toggleDebugRender(params: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files/toggle_is_debug_render`, { body: params });
  }

  // ── Pages ──
  listPages() {
    return this.request("GET", `/api/v1/site/${this.siteId}/pages`);
  }
  /** Create a page. The backend creates the page AND its source in one call, so `source`
   *  is REQUIRED and must be a JSON string (stringified here if an object is passed).
   *  `slug`/`is_homepage` are NOT applied at create — set them afterwards via updatePage.
   *  Every page born here is AI-authored, so we stamp `by_ai` (persisted to `pages.by_ai`)
   *  and the builder shows an "AI" tag next to the page name. */
  async createPage(params: any, opts?: { timeout?: number }) {
    const body: any = { ...params };
    if (body.source != null && typeof body.source !== "string") body.source = JSON.stringify(body.source);
    // The editor never saves an empty page: it creates one blank grid section to drop into
    // (editor.js createPage). An empty `sections` opened with nothing to drop elements on.
    if (body.source == null)
      body.source = JSON.stringify(
        finalizeForRender({ sections: [buildSection([])] }, await this.getSiteBreakpoints(), await this.getSiteDefaultGrid()),
      );
    if (body.by_ai == null) body.by_ai = BY_AI_MARKER;
    return this.request("POST", `/api/v1/site/${this.siteId}/page`, { body, timeout: opts?.timeout });
  }
  updatePage(pageId: string, params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/${pageId}/update_page`, { body: params });
  }
  /** Write a page source, then re-save it through /save like the editor (CSS + global sections,
   *  see syncPageAfterWrite). The source is already stored when the sync runs, so a sync failure
   *  says so instead of reading as a lost write. `sync:false` skips the /save, for intermediate
   *  writes of a batch whose last write syncs (each sync rebuilds the page CSS). */
  async updatePageSource(pageId: string, params: any, opts?: { timeout?: number; sync?: boolean }) {
    const sync = params && params.source != null && opts?.sync !== false;
    const src = sync ? (typeof params.source === "string" ? JSON.parse(params.source) : params.source) : null;
    // With a global section on the page, keep the sources as they were BEFORE this write: only a
    // global node this write actually changed may be pushed to the other pages.
    const before = src && globalsOf(src).length ? listOf(await this.listPages()) : null;
    const res = await this.request("POST", `/api/v1/site/${this.siteId}/${pageId}/update_page_source`, { body: params, timeout: opts?.timeout });
    if (sync) {
      await this.syncPageAfterWrite(pageId, src, before).catch((e: any) => {
        throw new Error(`Page source SAVED, but rebuilding its CSS / syncing global sections via /save failed: ${e?.message || e}. Retry the same write.`);
      });
    }
    return res;
  }
  deletePage(params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/delete_page`, { body: params });
  }
  getPageVersions(pageId: string) {
    return this.request("GET", `/api/v1/site/${this.siteId}/page_versions/${pageId}`);
  }
  listPageContents(query?: any) {
    return this.request("GET", `/api/v1/site/${this.siteId}/page_contents`, { query });
  }
  /** One page's translation in one language: { content: { [elementId]: {...} } } ({} when none yet). Read-only. */
  getPageContent(page_id: string, lang: string) {
    return this.request("POST", `/api/v1/site/${this.siteId}/page_contents/page_content`, { body: { page_id, lang } });
  }
  /** Upsert one page translation (matched by page_id + language_code) — the editor's multilingual save. */
  updatePageContent({ page_id, language_code, content, meta_tags }: { page_id: string; language_code: string; content: any; meta_tags?: any[] }) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/multilingual/update_page_contents`, {
      body: { pages: [{ contents: [{ page_id, language_code, content, meta_tags, site_id: this.siteId }] }] },
    });
  }
  listGlobalSections() {
    return this.request("GET", `/api/v1/site/${this.siteId}/global_sections`);
  }
  /** The cart drawer + popups, as the editor sends them with every save and publish
   *  (PagePublish.vue: `global_sources: cart.source.concat(popup.popups)`). /save builds the
   *  cart CSS only from these, and /publish copies them into the LIVE global sources: sending []
   *  left popups and the cart unpublished and dropped the cart CSS. `source` goes as an object
   *  (the backend Jason.encode!s it). */
  async globalSourcesForSave(): Promise<any[]> {
    const list = (r: any) => (Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []);
    const [cart, popups] = await Promise.all([this.getSourceCart(), this.getGlobalSources({ component: "popup" })]);
    return [...list(cart), ...list(popups)].map((g: any) => ({
      ...g,
      source: typeof g.source === "string" ? JSON.parse(g.source) : g.source,
    }));
  }
  /** POST /save or /publish with the body the editor sends (PagePublish.vue savePage):
   *  current site settings (or /save nulls them), the cart + popups, and the given pages /
   *  global sections. /publish is /save plus the live copy (site_controller.ex `publish` →
   *  `save(is_publish: true)`), so one call builds each page's CSS and publishes it. Every /save
   *  also stamps site.published_at, which opens the 10-minute draft preview. */
  private async siteSave(
    path: "save" | "publish",
    { pages = [], global_sections = [], changes = {}, domain }: { pages?: any[]; global_sections?: any[]; changes?: Record<string, number>; domain?: string },
  ) {
    const [settings, global_sources] = await Promise.all([this.readSettingsOrThrow(), this.globalSourcesForSave()]);
    return this.request("POST", `/api/v1/site/${this.siteId}/${path}`, {
      body: {
        settings: JSON.stringify(this.ensureSafeSettings(settings)),
        pages,
        changes,
        global_sources,
        global_sections,
        page_contents: [],
        ...(domain ? { domain } : {}),
      },
      timeout: 120000,
    });
  }
  /** A /save with no pages: stamps site.published_at, which (re)opens the draft preview window
   *  (PreviewExpire: 10 min after published_at on prod) without changing any content. */
  refreshDraftPreview() {
    return this.siteSave("save", {});
  }
  /** /save every page (as the editor's save does): popups and the cart drawer are compiled into
   *  each page's app_css (Qwik gets `popups` + `source_cart`), so after one changes, every page's
   *  CSS must be rebuilt or the new popup/cart renders unstyled until some page is saved. */
  async resaveAllPages() {
    const pages = listOf(await this.listPages())
      .filter((p: any) => p && p.source && p.source.source != null && p.source.source !== "")
      .map((p: any) => ({ id: p.id, source: typeof p.source.source === "string" ? p.source.source : JSON.stringify(p.source.source) }));
    return this.siteSave("save", { pages });
  }
  /** A popup/cart write landed; rebuild every page's CSS. If that fails the write is still saved,
   *  so say so: retrying a create would duplicate the popup. */
  private async afterGlobalSourceWrite(res: any) {
    await this.resaveAllPages().catch((e: any) => {
      const id = res?.data?.id ?? res?.id;
      throw new Error(`Global source SAVED${id ? ` (id ${id})` : ""} — do not create it again — but rebuilding the pages' CSS via /save failed: ${e?.message || e}. Any page save or publish_site rebuilds it.`);
    });
  }
  /** Drop a deleted page from every global section's `pages` list, as the editor does on delete
   *  (globalSection.js removeGlobalSectionOfPage). */
  async unlinkPageFromGlobalSections(pageId: string) {
    const stale = listOf(await this.listGlobalSections()).filter((r: any) => (r.pages || []).includes(pageId));
    if (!stale.length) return 0;
    await this.siteSave("save", {
      global_sections: stale.map((r: any) => ({
        section_id: r.section_id, name: r.name, type: r.type, status: "update",
        pages: r.pages.filter((id: string) => id !== pageId), section: parseMaybe(r.section), contents: [],
      })),
    });
    return stale.length;
  }
  /** Upsert/delete global sections (Header/Footer/reusable blocks) through /save, like the
   *  editor. Each entry carries `status` ("new"|"update"|"delete") and is matched by
   *  (site_id, section_id); `section` is an OBJECT. Pass `pages` (each { id, source } with source
   *  a JSON STRING) to embed the node in page sources in the same atomic save. */
  saveGlobalSections({ global_sections = [], pages = [], changes }: { global_sections?: any[]; pages?: any[]; changes?: any } = {}) {
    return this.siteSave("save", { global_sections, pages, changes: changes || {} });
  }
  /** After a page's source is written: re-save it through /save the way the editor does, so
   *  (1) its compiled CSS (app_css) is rebuilt — update_page_source never builds it, and the
   *  draft preview renders page.source.app_css; (2) a global header/footer/section edited on
   *  this page reaches its GlobalSection record and every other page that embeds it — the
   *  editor's updateGlobalSections(), without which the edit stays on one page and the editor
   *  later replaces it with the stale record.
   *  A global node is pushed only when THIS write changed it (vs `pagesBefore`) and it differs
   *  from the record: a write carrying an older copy of the header must not revert the newer
   *  one site-wide. `changes` stays {}: a version row per write (and per popup) is noise; publish
   *  versions every page. */
  async syncPageAfterWrite(pageId: string, src: any, pagesBefore: any[] | null = null) {
    const changed: any[] = [];
    const globals = globalsOf(src);
    if (globals.length && pagesBefore) {
      const prev = pagesBefore.find((p) => p && p.id === pageId);
      const prevSrc = parseMaybe(prev?.source?.source);
      const prevNode = (id: string) => (prevSrc?.sections || []).find((s: any) => s && s.id === id);
      const res: any = await this.listGlobalSections();
      const records = listOf(res);
      for (const node of globals) {
        const rec = records.find((r) => r.section_id === node.id);
        if (!rec || canon(prevNode(node.id)) === canon(node) || canon(parseMaybe(rec.section)) === canon(node)) continue;
        changed.push({ section_id: rec.section_id, name: rec.name, type: rec.type, pages: rec.pages || [], status: "update", section: node, contents: [] });
      }
    }
    const pages: any[] = [{ id: pageId, source: JSON.stringify(src) }];
    if (changed.length) {
      const byId = new Map(changed.map((g) => [g.section_id, g.section]));
      for (const p of pagesBefore || []) {
        if (!p || p.id === pageId) continue;
        const other = parseMaybe(p.source?.source);
        if (!other || !(other.sections || []).some((s: any) => s && byId.has(s.id))) continue;
        other.sections = other.sections.map((s: any) => (s && byId.has(s.id) ? byId.get(s.id) : s));
        pages.push({ id: p.id, source: JSON.stringify(other) });
      }
    }
    await this.siteSave("save", { pages, global_sections: changed });
    return { rebuilt_pages: pages.length, global_sections_synced: changed.length };
  }
  getSite() {
    return this.request("GET", `/api/v1/site/${this.siteId}/`);
  }
  /** Publish the site live, like the editor's "Xuất bản" (PagePublish.vue): every page with its
   *  saved source as `{ id, source, type, slug, is_homepage, settings }`. Sending no pages made
   *  the backend publish nothing. /publish runs the whole /save first, so CSS is built here; the
   *  old separate rebuild doubled the work and the page-version history. */
  async publishSite(params: { domain?: string } = {}) {
    const res: any = await this.listPages();
    const pages = ((res && res.data) || res || [])
      .filter((p: any) => p && p.source && p.source.source != null && p.source.source !== "")
      .map((p: any) => ({
        id: p.id,
        source: typeof p.source.source === "string" ? p.source.source : JSON.stringify(p.source.source),
        type: p.type,
        slug: p.slug,
        is_homepage: p.is_homepage === true,
        settings: JSON.stringify(p.settings || {}),
      }));
    const changes = Object.fromEntries(pages.map((p: any) => [p.id, 1]));
    return this.siteSave("publish", { pages, changes, domain: params.domain });
  }
  uploadImageBase64({ base64, content_type }: { base64?: string; content_type?: string } = {}) {
    return this.request("POST", `/api/v1/site/${this.siteId}/media/content/b64`, {
      body: { base64, content_type },
      timeout: 60000,
    });
  }
  async getSiteSettingField(field: string): Promise<any> {
    const siteRes = await this.request("GET", `/api/v1/site/${this.siteId}/`, { timeout: 60000 });
    const raw = (siteRes && siteRes.data && siteRes.data.settings) || "";
    if (typeof raw === "object") return raw[field] || "";
    const needle = `"${field}":`;
    const idx = raw.indexOf(needle);
    if (idx === -1) return "";
    let vStart = idx + needle.length;
    while (vStart < raw.length && raw[vStart] === " ") vStart++;
    if (raw[vStart] !== '"') return "";
    let vEnd = vStart + 1;
    while (vEnd < raw.length) {
      if (raw[vEnd] === "\\") { vEnd += 2; continue; }
      if (raw[vEnd] === '"') { vEnd++; break; }
      vEnd++;
    }
    try { return JSON.parse(raw.slice(vStart, vEnd)); } catch { return ""; }
  }
  async updateSiteSettings(newSettings: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/update_site`, { body: { settings: this.ensureSafeSettings(newSettings) }, timeout: 60000 });
  }
  /** Read the full site.settings object (parsed). Empty object if unset/unparseable. */
  async getSiteSettings(): Promise<Record<string, any>> {
    const siteRes = await this.request("GET", `/api/v1/site/${this.siteId}/`, { timeout: 60000 });
    const raw = (siteRes && siteRes.data && siteRes.data.settings) || "";
    if (raw && typeof raw === "object") return raw as Record<string, any>;
    if (typeof raw === "string" && raw.trim()) {
      try { return JSON.parse(raw); } catch { throw new Error(`${SETTINGS_READ_ERR} (settings không phải JSON hợp lệ)`); }
    }
    return {};
  }
  /** Ensure a site data-source flag (use_store/use_member/use_blog/use_error/use_maintain)
   *  is enabled so special pages' bindings resolve. Merges into existing settings;
   *  no-op if already on. */
  async enableSiteFeature(flag: string): Promise<{ changed: boolean; flag: string }> {
    const settings = await this.getSiteSettings();
    if (settings[flag] === true) return { changed: false, flag };
    await this.updateSiteSettings({ ...settings, [flag]: true });
    return { changed: true, flag };
  }

  // ── Collections ──
  listCollections(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections`, { query });
  }
  getCollection(id: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/${id}`);
  }
  /** Header carrying the CMS api key — collection-data endpoints (records) need it on top of
   *  the dashboard JWT (without it they 401). Fetches the key once and caches it. */
  private async cmsApiHeader(): Promise<Record<string, string>> {
    await this.fetchCmsTokens();
    return this._cmsApiKey ? { "x-cms-api-key": this._cmsApiKey } : {};
  }
  /** Query a collection's records. Needs the CMS api-key header (else 401). The records
   *  endpoint accepts page/limit plus `where` (a filter object/JSON) and `order_by`. */
  async queryCollectionRecords(tableName: string, query?: any) {
    const headers = await this.cmsApiHeader();
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/collections/${tableName}/records`, { query, headers });
  }
  /** Create a collection (TABLE). VERIFIED body: { name, table_name } — the table starts with
   *  only the system columns (id/inserted_at/updated_at/creator_id). Add custom columns after
   *  with updateCollectionSchema(). (Sending a schema in the create body 500s.) */
  async createCollection(params: { name: string; table_name: string }) {
    const headers = await this.cmsApiHeader();
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/db_collections`, { body: params, headers, timeout: 60000 });
  }
  /** Get one collection by id (includes its full `schema`). */
  async getCollectionById(id: string) {
    const headers = await this.cmsApiHeader();
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/${id}`, { headers });
  }
  /** Add/edit columns: PATCH the collection's FULL schema array. NOTE: this REPLACES the schema,
   *  so it MUST include the existing system columns + your custom ones. Each custom column =
   *  { name, type, display_name?, create_type:"custom", is_required?, is_unique? }. */
  async updateCollectionSchema(id: string, schema: any[]) {
    const headers = await this.cmsApiHeader();
    return this.request("PATCH", `/api/v1/dashboard/site/${this.siteId}/db_collections/${id}`, { body: { schema }, headers, timeout: 60000 });
  }
  /** Delete a collection (table) by id. */
  async deleteCollection(id: string) {
    const headers = await this.cmsApiHeader();
    return this.request("DELETE", `/api/v1/dashboard/site/${this.siteId}/db_collections/${id}`, { headers });
  }

  // ── Blog Articles ──
  // NOTE: the `/api/v1/cms_function/:site_id/blog/article/*` routes are NOT usable from here.
  // They sit behind builderx_api's CmsFunctionAuth plug, which requires the per-site CMS *admin*
  // token (api_cms_keys, plug_type "admin_cms") as the Bearer — a storefront/session JWT always
  // gets 401 "Token not found". Everything below therefore uses the same dashboard blog API the
  // builder UI calls with the session JWT, except article detail, which has no dashboard route
  // and uses the public read route.

  /** List articles (dashboard). Query: page, limit, term (searches name + slug).
   *  Response: { success, articles: { data: [...], total_entries, page, limit, term } }. */
  listArticles(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/blog/articles/all`, { query });
  }
  /** Articles filed under ONE blog category. Query: page, limit, article_id?, category_ids?.
   *  Response: { data: { articles: [...] } }. */
  listArticlesByCategory(categoryId: string, query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/blog/articles/${categoryId}`, { query });
  }
  /** Article detail (full content). Public read route — the dashboard API has no GET-by-id.
   *  Response: { success, data: {...article} }; 422 "Article not found!" when missing/removed. */
  getArticle(id: string) {
    return this.request("GET", `/view/${this.siteId}/article/${id}`);
  }
  /** Update an article through the dashboard command pipeline — same command shape as create
   *  (name_article / summary_article / content_article / image_article / set_article_custom_slug /
   *  set_article_visible / set_article_tags / bulk_add_category_to_article …). Each command's
   *  `data.id` is the article id. Commands run in order, so slug commands must follow name ones. */
  updateBlogArticle(commands: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/blog/articles/update`, {
      body: { site_id: this.siteId, commands },
      timeout: 60000,
    });
  }
  /** Soft-delete articles (sets is_removed) via the dashboard command pipeline. */
  deleteArticles(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/blog/articles/delete`, {
      body: { site_id: this.siteId, commands: [{ name: "bulk_delete_article", data: { ids } }] },
      timeout: 60000,
    });
  }
  /** Delete a single article. */
  deleteArticle(id: string) {
    return this.deleteArticles([id]);
  }
  /** Create a blog/article category. Command-based: pass a `commands` array whose entries
   *  each carry a caller-generated `data.id` (the new category id). Response is generic. */
  createBlogCategory(commands: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/blog/categories/create`, {
      body: { site_id: this.siteId, commands },
      timeout: 60000,
    });
  }
  /** All blog categories (dashboard; includes meta_tags). */
  listBlogCategories() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/blog/categories/all`);
  }
  /** Update blog categories — same command pipeline as create (name_category / description_category /
   *  image_category / set_category_custom_slug / set_category_seo …), each with data.id. */
  updateBlogCategory(commands: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/blog/categories/update`, {
      body: { site_id: this.siteId, commands },
      timeout: 60000,
    });
  }
  /** Create a blog article via the dashboard command pipeline (supports category linkage,
   *  images, summary, content). Caller generates the article id in each command's data.id. */
  createBlogArticle(commands: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/blog/articles/create`, {
      body: { site_id: this.siteId, commands },
      timeout: 60000,
    });
  }

  // ── Products ──
  listProducts(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/all`, { query });
  }
  getProduct(id: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/${id}`);
  }
  searchProducts(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/search`, { query });
  }
  listCategories() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/categories/all`);
  }
  getProductsByCategory(categoryId: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/categories/products`, { query: { category_id: categoryId } });
  }
  /** Create a product. Body wraps fields in `product_params`; the backend generates the
   *  id/slug and sets is_published. Pass variations (price/stock per SKU) + categories. */
  createProduct(productParams: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/create`, {
      body: { site_id: this.siteId, product_params: productParams },
      timeout: 60000,
    });
  }
  /** Update a product. Body wraps fields in `product_params` and identifies the product by
   *  product_params.product_id. */
  updateProduct(productParams: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/update`, {
      body: { site_id: this.siteId, product_params: productParams },
      timeout: 60000,
    });
  }
  /** Product "Cài đặt SEO" (spec set_product_seo). The backend ALWAYS writes custom_slug into
   *  slug, so pass the product's current slug or it is wiped. */
  setProductSeo(id: string, meta_tags: any[], custom_slug: string | null) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/update_product`, {
      body: { site_id: this.siteId, id, meta_tags, custom_slug, spec: "set_product_seo" },
    });
  }
  /** Delete products by id. Body: { site_id, ids }. */
  removeProducts(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/remove`, {
      body: { site_id: this.siteId, ids },
      timeout: 60000,
    });
  }
  /** Publish/unpublish products. Body: { site_id, data: [{ product_id, is_published }] }. */
  setProductsPublished(data: Array<{ product_id: string; is_published: boolean }>) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/published`, {
      body: { site_id: this.siteId, data },
    });
  }
  /** Create a product category. Command-based: pass a `commands` array whose entries each
   *  carry a caller-generated `data.id` (the new category id). Response is generic. */
  createProductCategory(commands: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/categories/create`, {
      body: { site_id: this.siteId, commands },
      timeout: 60000,
    });
  }
  /** Update a product category — command-based (name_category / image_category /
   *  multi_description / set_category_visible), each command's data.id = the category id. */
  updateProductCategory(commands: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/categories/update`, {
      body: { site_id: this.siteId, commands },
      timeout: 60000,
    });
  }
  /** Delete product categories — command bulk_delete_category with data.ids. */
  deleteProductCategory(commands: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/categories/delete`, {
      body: { site_id: this.siteId, commands },
      timeout: 60000,
    });
  }

  // ── Orders ──
  listOrders(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/orders/all`, { query });
  }
  getOrder(orderId: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/orders/${orderId}`);
  }
  countOrdersByStatus() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/orders/count_by_status`);
  }

  // ── Site Style / Themes ──
  listThemes() {
    return this.request("GET", `/api/v1/site/${this.siteId}/themes`);
  }
  /**
   * Semantic search over the theme marketplace embeddings (bge-m3, cosine similarity).
   * Returns { results: [[theme_embedding_record, score], ...] }.
   */
  semanticSearchThemes(query: any) {
    return this.request("POST", `/api/v1/ai/semantic_search`, { body: { query }, timeout: 45000 });
  }

  // ── Applications ──
  listApps() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/subcriptions/all`);
  }
  getApp(type: string | number) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/subcriptions/get_app`, { query: { type } });
  }
  /** Install (register) an application on the site. type = Enum.Application value
   *  (e.g. automation=2, send_email=7). Body: { site_id, type, is_active }. */
  registerApp(type: number, is_active = true) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/subcriptions/register`, {
      body: { site_id: this.siteId, type, is_active },
    });
  }

  // ── Promotions ──
  /** `{ success, data[], total_entries }`, 15 rows/page by default; accepts term + is_activated
   *  (search_promotions uses this too — the dedicated get_promotions_advance endpoint 404s on prod). */
  listPromotions(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/all`, { query });
  }
  getPromotion(id: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/get_promotion`, { query: { id } });
  }
  getPromotionItems(id: string, query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/get_items`, { query: { id, ...query } });
  }
  getActivePromotions() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/get_promotions_actived`);
  }

  // ── Combos ──
  listCombos(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/combo_product/all`, { query });
  }
  getComboItems(comboProductId: string, query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/combo_product/items`, { query: { combo_product_id: comboProductId, ...query } });
  }

  // ── Customers ──
  /** List/search customers. Real shape: { customers: { data:[…], total_entries } }. Accepts
   *  page/limit and a `term` keyword (name/phone/email). Endpoint is /customer/all (singular). */
  listCustomers(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/customer/all`, { query });
  }
  /** /api/v1/cms_function/:site_id/* sits behind builderx_api's CmsFunctionAuth plug, which only
   *  accepts the site's CMS admin token (db_collections/token) as the Bearer — the session JWT 401s. */
  private async cmsFunction(method: string, path: string, body?: any) {
    await this.fetchCmsTokens();
    if (!this._adminToken) throw new Error("This site has no CMS admin token, so cms_function routes are unavailable.");
    return this.request(method, `/api/v1/cms_function/${this.siteId}${path}`, {
      body,
      headers: { Authorization: `Bearer ${this._adminToken}` },
    });
  }
  findCustomerById(id: string) {
    return this.cmsFunction("GET", `/customer/identity/${encodeURIComponent(id)}`);
  }
  findCustomerByPhone(phone: string) {
    return this.cmsFunction("GET", `/customer/phone/${encodeURIComponent(phone)}`);
  }
  findCustomerByEmail(email: string) {
    return this.cmsFunction("GET", `/customer/email/${encodeURIComponent(email)}`);
  }

  // ── Global Sources (cart, popup, overview, etc.) ──
  getSourceCart() {
    return this.request("GET", `/api/v1/site/${this.siteId}/cart/get_source_cart`);
  }
  async createSourceCart(params: any) {
    const res = await this.request("POST", `/api/v1/site/${this.siteId}/cart/create_source_cart`, { body: params });
    await this.afterGlobalSourceWrite(res);
    return res;
  }
  async updateSourceCart(params: any) {
    const res = await this.request("POST", `/api/v1/site/${this.siteId}/cart/update_source_cart`, { body: params });
    await this.afterGlobalSourceWrite(res);
    return res;
  }
  getGlobalSources(query?: any) {
    return this.request("GET", `/api/v1/site/${this.siteId}/global_source/`, { query });
  }
  async createGlobalSource(params: any) {
    const res = await this.request("POST", `/api/v1/site/${this.siteId}/global_source/create`, { body: params });
    await this.afterGlobalSourceWrite(res);
    return res;
  }
  async updateGlobalSource(params: any) {
    const res = await this.request("POST", `/api/v1/site/${this.siteId}/global_source/update`, { body: params });
    await this.afterGlobalSourceWrite(res);
    return res;
  }
  async deleteGlobalSource(params: any) {
    const res = await this.request("POST", `/api/v1/site/${this.siteId}/global_source/delete`, { body: params });
    // A deleted popup's CSS stays compiled into every page until they are re-saved.
    await this.resaveAllPages().catch((e: any) => {
      throw new Error(`Global source DELETED, but rebuilding the pages' CSS via /save failed: ${e?.message || e}. Any page save or publish_site rebuilds it.`);
    });
    return res;
  }
  getGlobalSourceContents(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/multilingual/global_source_contents`, { query });
  }
  updateGlobalSourceContents(params: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/multilingual/update_global_source_contents`, { body: params });
  }

  // ── Automation ──
  /** List the site's automations (id, name, rule/trigger, status). Use this to find the
   *  automation_id to pass to send_mail. Returns { data: [...], total_entries, ... }. */
  listAutomations(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/automations/all`, { query });
  }
  createAutomation(automationAttrs: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/automations/create`, {
      body: { automation_attrs: { ...automationAttrs, site_id: this.siteId } },
    });
  }
  updateAutomation(automationAttrs: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/automations/update`, {
      body: { automation_attrs: automationAttrs },
    });
  }
  deleteAutomations(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/automations/delete`, { body: { ids } });
  }
  sendMail(params: any) {
    return this.cmsFunction("POST", "/application/automation/send_mail", params);
  }

  // ── App lifecycle (applications/subcriptions) ──
  /** Uninstall an app by its subscription id (the `id` from list_apps / get_app). */
  uninstallApp(id: string) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/subcriptions/uninstall_app`, { body: { id } });
  }
  /** Update an installed app's settings. `attrs` is merged onto the subscription (e.g. { settings: {...}, status }). */
  updateApp(id: string, attrs: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/subcriptions/update_app`, { body: { id, attrs } });
  }
  /** Update the product-review app's settings (shop_info, display options…). */
  updateAppReview(id: string, settings: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/subcriptions/update_app_review`, { body: { id, settings } });
  }

  // ── Product reviews (product_review app) ──
  listReviews(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/product_reviews/all_review_admin`, { query });
  }
  getReview(reviewId: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/product_reviews/${reviewId}`);
  }
  getReviewProducts(reviewId: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/product_reviews/products`, { query: { review_id: reviewId } });
  }
  /** Create or update a review/reply. `body` is the review payload (id, customer_info, rating, title,
   *  comment, images, parent_id, apply_to, categories, permission, is_shop, product_reviews…). */
  createOrUpdateReview(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/product_reviews/create_or_update`, { body });
  }
  removeReviews(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/product_reviews/remove`, { body: { ids } });
  }
  /** Approve/hide reviews. `payload` typically { ids, permission } (permission 0=approved, 1=pending…). */
  updateReviewStatus(payload: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/product_reviews/update_status`, { body: payload });
  }

  // ── Appointment app ──
  listAppointmentCalendars(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/appointment/appointment_calendars`, { query });
  }
  createAppointmentCalendar(appointment_calendar: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/create_appointment_calendar`, { body: { appointment_calendar } });
  }
  updateAppointmentCalendar(appointment_calendar: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/update_appointment_calendar`, { body: { appointment_calendar } });
  }
  deleteAppointmentCalendars(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/delete_appointment_calendars`, { body: { ids } });
  }
  duplicateAppointmentCalendars(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/duplicate_appointment_calendars`, { body: { ids } });
  }
  listAppointments(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/appointment/appointments`, { query });
  }
  listAppointmentAddresses(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/appointment/appointment_addresses`, { query });
  }
  createAppointmentAddress(appointment_address: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/create_appointment_address`, { body: { appointment_address } });
  }
  updateAppointmentAddress(appointment_address: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/update_appointment_address`, { body: { appointment_address } });
  }
  deleteAppointmentAddresses(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/delete_appointment_addresses`, { body: { ids } });
  }
  listAppointmentClassifies(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/appointment/appointment_classifies`, { query });
  }
  createAppointmentClassify(appointment_classify: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/create_appointment_classify`, { body: { appointment_classify } });
  }
  updateAppointmentClassify(appointment_classify: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/update_appointment_classify`, { body: { appointment_classify } });
  }
  deleteAppointmentClassifies(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/delete_appointment_classifies`, { body: { ids } });
  }
  listAppointmentEmployees(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/appointment/appointment_employees`, { query });
  }
  createAppointmentEmployee(appointment_employee: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/create_appointment_employee`, { body: { appointment_employee } });
  }
  updateAppointmentEmployee(appointment_employee: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/update_appointment_employee`, { body: { appointment_employee } });
  }
  deleteAppointmentEmployees(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/appointment/delete_appointment_employees`, { body: { ids } });
  }

  // ── Affiliate app ──
  getProgramAffiliates() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/affiliate/program_affiliates`);
  }
  getProductAffiliates(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/affiliate/product_affiliates`, { query });
  }
  getOrderAffiliates(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/affiliate/order_affiliates`, { query });
  }
  getAccountAffiliates(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/affiliate/account_affiliates`, { query });
  }
  getPayoutAffiliates(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/affiliate/payout_affiliates`, { query });
  }
  getAffiliateStatistic() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/affiliate/statistic`);
  }
  upsertOrderProgramAffiliate(payload: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/affiliate/upsert_order_program_affiliate`, { body: payload });
  }
  upsertProductProgramAffiliate(payload: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/affiliate/upsert_product_program_affiliate`, { body: payload });
  }
  upsertProductAffiliate(payload: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/affiliate/upsert_product_affiliate`, { body: payload });
  }
  deleteProductAffiliates(payload: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/affiliate/delete_product_affiliates`, { body: payload });
  }
  updatePayoutAffiliateStatus(payload: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/affiliate/update_status_payout_affiliate`, { body: payload });
  }
  deleteAccountAffiliates(payload: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/affiliate/delete_account_affiliates`, { body: payload });
  }
  updateAccountAffiliate(payload: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/affiliate/update_account_affiliate`, { body: payload });
  }

  // ── Catalog extras (brands / suppliers / tags / ribbons / materials / variations) ──
  listProductBrands() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/product_brands/all`);
  }
  upsertProductBrand(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/product_brands/create_or_update`, { body });
  }
  listProductSuppliers() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/product_suppliers/all`);
  }
  upsertProductSupplier(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/product_suppliers/create_or_update`, { body });
  }
  listProductTags(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/product_tags/all`, { query });
  }
  upsertProductTag(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/product_tags/create_or_update`, { body });
  }
  listRibbons() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/ribbons/all`);
  }
  upsertRibbon(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/ribbons/create_or_update`, { body });
  }
  listMaterials() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/materials/all`);
  }
  upsertMaterial(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/products/materials/create_or_update`, { body });
  }
  getVariation(variationId: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/variation/${variationId}`);
  }
  getProductMeasurement() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/settings/product_measurement`);
  }
  updateProductMeasurement(product_measurement: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/settings/product_measurement/update`, { body: { product_measurement } });
  }
  listBlockPhoneNumbers(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/settings/block_phone_number/all`, { query });
  }
  upsertBlockPhoneCustomers(phone_numbers: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/settings/block_phone_number/upsert_block_phone_customers`, { body: { phone_numbers } });
  }
  removeAllBlockPhoneCustomers() {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/settings/block_phone_number/remove_all_block_phone_customers`, { body: {} });
  }
  getPriceContacts(type?: number) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/settings/price_contact/get`, { query: { type } });
  }
  updatePriceContact(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/settings/price_contact/update`, { body });
  }
  getCategoryById(categoryId: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/categories/${categoryId}`);
  }

  // ── Site config (domains / redirects / shipping / utms / logs / filters / settings / fonts) ──
  listDomains(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/domains/all`, { query });
  }
  createDomain(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/domains/create`, { body });
  }
  updateDomain(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/domains/update`, { body });
  }
  verifyDomain(domain_id: string) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/domains/verify`, { body: { domain_id } });
  }
  deleteDomain(domain_id: string) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/domains/delete`, { body: { domain_id } });
  }
  checkDomain(domain: string) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/domains/check_domain`, { body: { domain } });
  }
  listRedirectUrls(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/seos/redirect_urls/all`, { query });
  }
  createRedirectUrl(redirect_url: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/seos/redirect_urls/create`, { body: { redirect_url } });
  }
  updateRedirectUrl(redirect_url: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/seos/redirect_urls/update`, { body: { redirect_url } });
  }
  deleteRedirectUrls(redirect_url_ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/seos/redirect_urls/delete`, { body: { redirect_url_ids } });
  }
  getShipping() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/settings/shipping`);
  }
  updateShipping(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/settings/shipping/update`, { body });
  }
  listSiteUtms(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/site_utms/all`, { query });
  }
  createSiteUtm(site_utm: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/site_utms/create`, { body: { site_utm } });
  }
  updateSiteUtm(site_utm: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/site_utms/update`, { body: { site_utm } });
  }
  deleteSiteUtms(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/site_utms/delete`, { body: { ids } });
  }
  listSystemLogs(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/system_logs/all`, { query });
  }
  listSavedFilters(table_key: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/saved_filters/`, { query: { table_key } });
  }
  createSavedFilter(saved_filter: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/saved_filters/create`, { body: { saved_filter } });
  }
  updateSavedFilter(id: string, saved_filter: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/saved_filters/${id}/update`, { body: { saved_filter } });
  }
  deleteSavedFilter(id: string) {
    return this.request("DELETE", `/api/v1/dashboard/site/${this.siteId}/saved_filters/${id}`);
  }
  /** Raw /update_site call. `body` top-level keys replace; a nested `settings` key is merged server-side. */
  updateSiteRaw(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/update_site`, { body });
  }
  updateSiteName(name: string) {
    return this.request("POST", `/api/v1/site/${this.siteId}/update_site_name`, { body: { name } });
  }
  updateSiteSlug(slug: string) {
    return this.request("POST", `/api/v1/site/${this.siteId}/update_slug_name`, { body: { slug } });
  }
  loadFonts() {
    return this.request("GET", `/api/v1/site/${this.siteId}/load_fonts`);
  }
  removeFont(id: string) {
    return this.request("DELETE", `/api/v1/site/${this.siteId}/remove_font`, { body: { id } });
  }
  loadFontGroups() {
    return this.request("GET", `/api/v1/site/${this.siteId}/load_font_groups`);
  }
  createFontGroup(body: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/create_font_group`, { body: { ...body, site_id: this.siteId } });
  }
  removeFontGroup(id: string) {
    return this.request("DELETE", `/api/v1/site/${this.siteId}/remove_font_groups`, { body: { id, site_id: this.siteId } });
  }
  listApiKeys(query?: any) {
    return this.request("GET", `/api/v1/site/${this.siteId}/api_keys/all`, { query });
  }
  listPublishHistories(query?: any) {
    return this.request("GET", `/api/v1/site/${this.siteId}/publish_histories`, { query });
  }

  // ── Marketing / CRM / team ──
  getSendEmail() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/send_email/all`);
  }
  saveSendEmail(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/send_email/save`, { body });
  }
  listContacts(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/contact/all`, { query });
  }
  createContact(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/contact/create`, { body: { ...body, site_id: this.siteId } });
  }
  deleteContacts(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/contact/delete`, { body: { ids } });
  }
  listSubscribers(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/subscriber/all`, { query });
  }
  createSubscriber(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/subscriber/create`, { body });
  }
  deleteSubscribers(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/subscriber/delete`, { body: { ids } });
  }
  listEmployees() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/settings/employee/all`);
  }
  inviteEmployee(email: string) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/settings/employee/invite`, { body: { email } });
  }
  updateEmployeePermissions(site_permission: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/settings/employee/change_permissions`, { body: { site_permission } });
  }
  deleteEmployees(site_permission_ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/settings/employee/delete_employees`, { body: { site_permission_ids } });
  }
  listInvitations() {
    return this.request("GET", `/api/v1/dashboard/site/invitations/all`);
  }
  acceptInvitation(invitation_id: string) {
    return this.request("POST", `/api/v1/dashboard/site/invitations/accept`, { body: { invitation_id } });
  }
  refuseInvitation(invitation_id: string) {
    return this.request("POST", `/api/v1/dashboard/site/invitations/refuse`, { body: { invitation_id } });
  }
  listCustomerTags() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/customer/customer_tags`);
  }
  upsertCustomerTag(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/customer/upsert_customer_tag`, { body: { ...body, site_id: this.siteId } });
  }
  assignCustomerTags(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/customer/update_tags_for_multiple_customers`, { body: { ...body, site_id: this.siteId } });
  }
  getInsightToday() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/insight/today`);
  }
  getInsight(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/insight/all`, { query });
  }
  listNotifications() {
    return this.request("GET", `/api/v1/dashboard/site/notifications/all`);
  }
  markNotificationRead(notification_id: string) {
    return this.request("POST", `/api/v1/dashboard/site/notifications/mark_as_read`, { body: { notification_id } });
  }

  // ── Multilingual / translations ──
  mlAddLanguages(languages: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/multilingual/add_multiple_language`, { body: { languages } });
  }
  mlChangeDefault(language_code: string) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/multilingual/change_language_default`, { body: { language_code } });
  }
  mlGetTranslations(resource: string, query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/multilingual/${resource}`, { query });
  }
  mlSaveTranslations(action: string, body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/multilingual/${action}`, { body });
  }
  mlTranslateJson(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/multilingual/translate_json`, { body });
  }

  // ── Media library + PWA ──
  listMediaFolders(query?: any) {
    return this.request("GET", `/api/v1/site/${this.siteId}/media/folder`, { query });
  }
  listMediaContent(query?: any) {
    return this.request("GET", `/api/v1/site/${this.siteId}/media/content`, { query });
  }
  listMediaAll(query?: any) {
    return this.request("GET", `/api/v1/site/${this.siteId}/media/all`, { query });
  }
  getMediaCapacity() {
    return this.request("GET", `/api/v1/site/${this.siteId}/media/capacity`);
  }
  emptyMediaTrash() {
    return this.request("POST", `/api/v1/site/${this.siteId}/media/empty_trash`, { body: {} });
  }
  uploadBase64Media(base64: string) {
    return this.request("POST", `/api/v1/site/${this.siteId}/media/content/b64`, { body: { base64 }, timeout: 60000 });
  }
  updateMediaFolder(body: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/media/folder/update`, { body });
  }
  updateMediaContent(body: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/media/content/update`, { body });
  }
  getPwa() {
    return this.request("GET", `/api/v1/site/${this.siteId}/pwa`);
  }
  upsertPwa(body: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/pwa/upsert`, { body });
  }

  // ── Apps: product design / personal product design / course ──
  getDeviceTemplates() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/product_design/get_group_device_tempalte`);
  }
  createProductsByDeviceTemplate(groups: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/product_design/create_product_by_device_template`, { body: { groups, site_id: this.siteId } });
  }
  getAllPpd(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/personal_product_design/get_all_ppd`, { query });
  }
  upsertPpd(ppds: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/personal_product_design/upsert_ppd`, { body: { ppds, site_id: this.siteId } });
  }
  removePpd(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/applications/personal_product_design/remove_ppd`, { body: { ids, site_id: this.siteId } });
  }
  getProductVariationTemplate(product_id: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/personal_product_design/get_product_variation_template`, { query: { product_id } });
  }
  listCourses(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/course-app`, { query });
  }
  getCourse(id: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/course-app/${id}`);
  }
  createCourse(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/course-app`, { body: { ...body, site_id: this.siteId } });
  }
  updateCourse(id: string, body: any) {
    return this.request("PATCH", `/api/v1/dashboard/site/${this.siteId}/course-app/${id}`, { body });
  }
  deleteCourse(id: string) {
    return this.request("DELETE", `/api/v1/dashboard/site/${this.siteId}/course-app/${id}`);
  }
  deleteManyCourses(ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/course-app/delete_many`, { body: { ids, site_id: this.siteId } });
  }
  getCourseMembers(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/course-app/members`, { query });
  }

  // ── Sale channels: partner feeds + catalogs ──
  listPartnerFeeds(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/sale_channels/partner_feeds/all`, { query });
  }
  createPartnerFeed(body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/sale_channels/partner_feeds/create`, { body });
  }
  updatePartnerFeed(partnerFeedId: string, body: any) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/sale_channels/partner_feeds/${partnerFeedId}/update`, { body });
  }
  deletePartnerFeeds(partner_feed_ids: string[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/sale_channels/partner_feeds/delete`, { body: { partner_feed_ids } });
  }
  listPartnerFeedProducts(partnerFeedId: string, query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/sale_channels/partner_feeds/${partnerFeedId}/products/all`, { query });
  }
  syncPartnerFeed(partnerFeedId: string) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/sale_channels/partner_feeds/${partnerFeedId}/products/sync`, { body: { partner_feed_id: partnerFeedId } });
  }
  listGoogleMerchants(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/sale_channels/google/merchants`, { query });
  }
}

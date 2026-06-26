const DEFAULT_TIMEOUT = 15000;

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

export class WebcakeCmsApi {
  baseUrl: string;
  token: string;
  siteId: string;
  sessionId: string;
  private _adminToken: string | null;
  private _cmsApiKey: string | null;

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
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const json: any = await res.json().catch(() => null);
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
  listMySites(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/all`, { query });
  }
  /** Create a brand-new personal site. The backend seeds sample categories/products/blog
   *  but NO pages. Returns { data: { site: { id, site_slug:{slug}, ... } } }.
   *  Fails with 403 when the account's site quota is reached (free plan: 4 sites). */
  createSite(params: { name: string; slug: string }) {
    return this.request("POST", `/api/v1/dashboard/site/create`, { body: params, timeout: 60000 });
  }
  /** Create a NEW site from a marketplace TEMPLATE by its theme id — the dedicated
   *  "use this template" API. Clones the template's pages, global sections, cart, popups,
   *  styles and fonts into a fresh account-owned site. Body: { id: <theme_id>, name, slug }.
   *  Returns { data: { site: { id, ... } } }. (403 if the free 4-site quota is reached, prod.) */
  importStoreToTheme(params: { id: string; name: string; slug?: string }) {
    return this.request("POST", `/api/v1/dashboard/site/import_store_to_theme`, { body: params, timeout: 120000 });
  }
  getSiteInfo() {
    return this.request("GET", `/api/v1/site/${this.siteId}/`);
  }
  /** Switch to a different site (in-memory, no restart needed) */
  switchSite(siteId: string) {
    this.siteId = siteId;
    this._adminToken = null;
    this._cmsApiKey = null;
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
   *  `slug`/`is_homepage` are NOT applied at create — set them afterwards via updatePage. */
  createPage(params: any) {
    const body: any = { ...params };
    if (body.source != null && typeof body.source !== "string") body.source = JSON.stringify(body.source);
    if (body.source == null) body.source = JSON.stringify({ sections: [] });
    return this.request("POST", `/api/v1/site/${this.siteId}/page`, { body });
  }
  updatePage(pageId: string, params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/${pageId}/update_page`, { body: params });
  }
  updatePageSource(pageId: string, params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/${pageId}/update_page_source`, { body: params });
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
  updatePageContent(params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/page_contents/page_content`, { body: params });
  }
  listGlobalSections() {
    return this.request("GET", `/api/v1/site/${this.siteId}/global_sections`);
  }
  /** Upsert/delete global sections (Header/Footer/reusable blocks) via the site /save
   *  pipeline — the SAME endpoint the builder uses. Each entry carries a `status`
   *  ("new"|"update"|"delete") and is matched by (site_id, section_id). `section` is sent
   *  as an OBJECT (backend Jason.encode!s it). Optionally pass `pages` (each { id, source }
   *  with source a JSON STRING) to embed the section node into page sources in the same
   *  atomic save — required for a header/footer to actually render. `settings` MUST be the
   *  current site settings (string) or /save would null them; we fetch them when omitted. */
  async saveGlobalSections({ global_sections = [], pages = [], settings, changes }: { global_sections?: any[]; pages?: any[]; settings?: any; changes?: any } = {}) {
    let s = settings;
    if (s === undefined) s = await this.getSiteSettings().catch(() => ({}));
    const settingsStr = typeof s === "string" ? s : JSON.stringify(s || {});
    return this.request("POST", `/api/v1/site/${this.siteId}/save`, {
      body: {
        settings: settingsStr,
        global_sources: [],
        page_contents: [],
        changes: changes || {},
        pages,
        global_sections,
      },
      timeout: 120000,
    });
  }
  getSite() {
    return this.request("GET", `/api/v1/site/${this.siteId}/`);
  }
  saveSite(params: any = {}) {
    return this.request("POST", `/api/v1/site/${this.siteId}/save`, { body: params, timeout: 60000 });
  }
  /** Rebuild every page's compiled CSS (page_source.app_css) by replaying the builder's
   *  /save pipeline — the ONLY path that regenerates the storefront's dynamic CSS. The
   *  backend builds CSS per page in `params["pages"]` from that page's `source`; /publish
   *  does NOT do this, so a site changed only through the MCP renders with stale/empty CSS
   *  until this runs. Sends each page's CURRENT saved source (stringified) + current
   *  settings; empty global arrays leave globals/popups untouched. */
  async rebuildSiteCss(settings?: any): Promise<{ rebuilt: number }> {
    const res: any = await this.listPages();
    const list = (res && res.data) || res || [];
    const pages = (Array.isArray(list) ? list : [])
      .map((p: any) => {
        const src = p && p.source && p.source.source;
        if (src == null || src === "") return null;
        return {
          id: p.id,
          source: typeof src === "string" ? src : JSON.stringify(src),
          settings: JSON.stringify(p.settings || {}),
          custom_code: p.custom_code || {},
        };
      })
      .filter(Boolean);
    if (!pages.length) return { rebuilt: 0 };
    let s = settings;
    if (s === undefined) s = await this.getSiteSettings().catch(() => ({}));
    const settingsStr = typeof s === "string" ? s : JSON.stringify(s || {});
    const changes: Record<string, number> = {};
    for (const p of pages as any[]) changes[p.id] = 1;
    await this.request("POST", `/api/v1/site/${this.siteId}/save`, {
      body: { pages, settings: settingsStr, changes, global_sources: [], global_sections: [], page_contents: [] },
      timeout: 120000,
    });
    return { rebuilt: pages.length };
  }
  /** Publish the site live. /publish snapshots the pages in the body into the LIVE version —
   *  exactly like the builder's "Xuất bản" button (PagePublish.vue): it POSTs every page as
   *  `{ source, id, type, slug, is_homepage, settings }` plus a `changes` map. Sending NO
   *  pages (the old behaviour) made the backend publish nothing, so the storefront stayed on
   *  "Trang chưa có giao diện hoặc chưa xuất bản" and every page kept is_build=false.
   *  We also (a) keep the CURRENT site.settings so /publish doesn't null the theme + data-source
   *  flags (use_store/use_blog/…), and (b) rebuild each page's compiled CSS first (rebuildSiteCss),
   *  because /publish alone does not regenerate the storefront's dynamic CSS.
   *  Global header/footer are already embedded inside each page's source, so they publish with
   *  the page; the global_* arrays stay empty (empty = leave server-side globals untouched). */
  async publishSite(params: any = {}) {
    let settings = params.settings;
    if (settings === undefined) {
      settings = await this.getSiteSettings().catch(() => ({}));
    }
    // The save pipeline stores site.settings as a JSON STRING — an object body is
    // rejected (422). Stringify unless the caller already passed a string.
    const settingsStr = typeof settings === "string" ? settings : JSON.stringify(settings || {});

    // Collect every page WITH its saved source so the backend has something to publish.
    let pages = params.pages;
    let changes = params.changes;
    if (!Array.isArray(pages)) {
      const res: any = await this.listPages();
      const list = (res && res.data) || res || [];
      pages = (Array.isArray(list) ? list : [])
        .map((p: any) => {
          const src = p && p.source && p.source.source;
          if (src == null || src === "") return null;
          return {
            id: p.id,
            source: typeof src === "string" ? src : JSON.stringify(src),
            type: p.type,
            slug: p.slug,
            is_homepage: p.is_homepage === true,
            settings: JSON.stringify(p.settings || {}),
          };
        })
        .filter(Boolean);
    }
    if (changes === undefined) {
      changes = {} as Record<string, number>;
      for (const p of pages as any[]) changes[p.id] = 1;
    }

    // Regenerate compiled CSS for every page before publishing (no-op-safe on failure).
    await this.rebuildSiteCss(settingsStr).catch(() => {});
    return this.request("POST", `/api/v1/site/${this.siteId}/publish`, {
      body: {
        pages,
        changes,
        global_sources: [],
        global_sections: [],
        page_contents: [],
        ...params,
        settings: settingsStr,
      },
      timeout: 120000,
    });
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
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/update_site`, { body: { settings: newSettings }, timeout: 60000 });
  }
  /** Read the full site.settings object (parsed). Empty object if unset/unparseable. */
  async getSiteSettings(): Promise<Record<string, any>> {
    const siteRes = await this.request("GET", `/api/v1/site/${this.siteId}/`, { timeout: 60000 });
    const raw = (siteRes && siteRes.data && siteRes.data.settings) || "";
    if (raw && typeof raw === "object") return raw as Record<string, any>;
    if (typeof raw === "string" && raw.trim()) {
      try { return JSON.parse(raw); } catch { return {}; }
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
  listArticles(query?: any) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/blog/article/all`, { query });
  }
  getArticle(id: string) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/blog/article/${id}`);
  }
  createArticle(params: any) {
    return this.request("POST", `/api/v1/cms_function/${this.siteId}/blog/article`, { body: params });
  }
  updateArticle(id: string, params: any) {
    return this.request("PATCH", `/api/v1/cms_function/${this.siteId}/blog/article/${id}`, { body: params });
  }
  deleteArticle(id: string) {
    return this.request("DELETE", `/api/v1/cms_function/${this.siteId}/blog/article/${id}`);
  }
  /** Create a blog/article category. Command-based: pass a `commands` array whose entries
   *  each carry a caller-generated `data.id` (the new category id). Response is generic. */
  createBlogCategory(commands: any[]) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/blog/categories/create`, {
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
  /** Search/list promotions. The dedicated get_promotions_advance endpoint 404s on prod, so
   *  this uses the same /all list endpoint (which accepts a query); the tool filters the
   *  returned page client-side for type/status/keyword. */
  searchPromotions(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/all`, { query });
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
  findCustomerById(id: string) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/customer/identity/${id}`);
  }
  findCustomerByPhone(phone: string) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/customer/phone/${phone}`);
  }
  findCustomerByEmail(email: string) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/customer/email/${email}`);
  }

  // ── Global Sources (cart, popup, overview, etc.) ──
  getSourceCart() {
    return this.request("GET", `/api/v1/site/${this.siteId}/cart/get_source_cart`);
  }
  createSourceCart(params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/cart/create_source_cart`, { body: params });
  }
  updateSourceCart(params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/cart/update_source_cart`, { body: params });
  }
  getGlobalSources(query?: any) {
    return this.request("GET", `/api/v1/site/${this.siteId}/global_source/`, { query });
  }
  createGlobalSource(params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/global_source/create`, { body: params });
  }
  updateGlobalSource(params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/global_source/update`, { body: params });
  }
  deleteGlobalSource(params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/global_source/delete`, { body: params });
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
    return this.request("POST", `/api/v1/cms_function/${this.siteId}/application/automation/send_mail`, { body: params });
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

  // ── Sale channels: sitemap + partner feeds + catalogs ──
  sitemapSync(kind: string) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/sale_channels/sitemap/sync_${kind}`, { body: {} });
  }
  sitemapRebuild(type?: string) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/sale_channels/sitemap/rebuild`, { body: { type } });
  }
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

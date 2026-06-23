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

  async request(method: string, path: string, { body, query, timeout }: RequestOpts = {}): Promise<any> {
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
  createPage(params: any) {
    return this.request("POST", `/api/v1/site/${this.siteId}/page`, { body: params });
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
  getSite() {
    return this.request("GET", `/api/v1/site/${this.siteId}/`);
  }
  saveSite(params: any = {}) {
    return this.request("POST", `/api/v1/site/${this.siteId}/save`, { body: params, timeout: 60000 });
  }
  publishSite(params: any = {}) {
    return this.request("POST", `/api/v1/site/${this.siteId}/publish`, { body: params, timeout: 60000 });
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
  queryCollectionRecords(tableName: string, query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/collections/${tableName}/records`, { query });
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
  getApp(type: string) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/subcriptions/get_app`, { query: { type } });
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
  searchPromotions(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/get_promotions_advance`, { query });
  }

  // ── Combos ──
  listCombos(query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/combo_product/all`, { query });
  }
  getComboItems(comboProductId: string, query?: any) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/combo_product/items`, { query: { combo_product_id: comboProductId, ...query } });
  }

  // ── Customers ──
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
  sendMail(params: any) {
    return this.request("POST", `/api/v1/cms_function/${this.siteId}/application/automation/send_mail`, { body: params });
  }
}

const DEFAULT_TIMEOUT = 15000;

export class WebcakeCmsApi {
  constructor({ baseUrl, token, siteId, sessionId }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
    this.siteId = siteId;
    this.sessionId = sessionId || "";
    this._adminToken = null;
    this._cmsApiKey = null;
  }

  async fetchCmsTokens() {
    if (this._adminToken && this._cmsApiKey) return;

    const [adminRes, apiKeyRes] = await Promise.all([
      this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/token`),
      this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/api_key`),
    ]);

    this._adminToken = (adminRes && adminRes.data && adminRes.data.key) || null;
    this._cmsApiKey = (apiKeyRes && apiKeyRes.data && apiKeyRes.data.key) || null;
  }

  getBundleParams() {
    return { token: this._adminToken, x_cms_api_key: this._cmsApiKey };
  }

  async request(method, path, { body, query, timeout } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null) url.searchParams.set(k, v);
      }
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
      ...(this.sessionId && { "x-session-id": this.sessionId }),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || DEFAULT_TIMEOUT);

    let res;
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

    const json = await res.json().catch(() => null);
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

  listMySites(query) {
    return this.request("GET", `/api/v1/dashboard/site/all`, { query });
  }

  getSiteInfo() {
    return this.request("GET", `/api/v1/site/${this.siteId}/`);
  }

  /** Switch to a different site (in-memory, no restart needed) */
  switchSite(siteId) {
    this.siteId = siteId;
    // Reset CMS tokens since they're site-specific
    this._adminToken = null;
    this._cmsApiKey = null;
  }

  /** Update auth token (in-memory) */
  switchToken(token) {
    this.token = token;
    this._adminToken = null;
    this._cmsApiKey = null;
  }

  /** Update session ID */
  switchSession(sessionId) {
    this.sessionId = sessionId;
  }

  // ── CMS Files ──

  listCmsFiles() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/cms_files`);
  }

  async createCmsFile(params) {
    await this.fetchCmsTokens();
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files`, {
      body: { ...params, ...this.getBundleParams() },
    });
  }

  async updateCmsFile(id, params) {
    await this.fetchCmsTokens();
    return this.request("PATCH", `/api/v1/dashboard/site/${this.siteId}/cms_files/${id}`, {
      body: { ...params, ...this.getBundleParams() },
    });
  }

  getHttpFunction() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/cms_files/http_function`);
  }

  async createOrUpdateHttpFunction(params) {
    await this.fetchCmsTokens();
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files/http_function`, {
      body: { ...params, ...this.getBundleParams() },
    });
  }

  debugFunction(params) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files/debug`, { body: params });
  }

  runFunction(functionName, method, params) {
    return this.request(method, `/api/v1/${this.siteId}/_functions/${functionName}`, { body: params });
  }

  saveFileVersion(params) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files/save_version_file`, { body: params });
  }

  getFileVersions(query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/cms_files/version_file`, { query });
  }

  toggleDebugRender(params) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/cms_files/toggle_is_debug_render`, { body: params });
  }

  // ── Pages ──

  listPages() {
    return this.request("GET", `/api/v1/site/${this.siteId}/pages`);
  }

  createPage(params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/page`, { body: params });
  }

  updatePage(pageId, params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/${pageId}/update_page`, { body: params });
  }

  updatePageSource(pageId, params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/${pageId}/update_page_source`, { body: params });
  }

  deletePage(params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/delete_page`, { body: params });
  }

  getPageVersions(pageId) {
    return this.request("GET", `/api/v1/site/${this.siteId}/page_versions/${pageId}`);
  }

  listPageContents(query) {
    return this.request("GET", `/api/v1/site/${this.siteId}/page_contents`, { query });
  }

  updatePageContent(params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/page_contents/page_content`, { body: params });
  }

  listGlobalSections() {
    return this.request("GET", `/api/v1/site/${this.siteId}/global_sections`);
  }

  getSite() {
    return this.request("GET", `/api/v1/site/${this.siteId}/`);
  }

  async getSiteSettingField(field) {
    const siteRes = await this.request("GET", `/api/v1/site/${this.siteId}/`, { timeout: 60000 });
    const raw = (siteRes && siteRes.data && siteRes.data.settings) || "";
    if (typeof raw === "object") return raw[field] || "";
    // Extract field value from JSON string without parsing the entire 88MB+ object
    const needle = `"${field}":`;
    const idx = raw.indexOf(needle);
    if (idx === -1) return "";
    let vStart = idx + needle.length;
    while (vStart < raw.length && raw[vStart] === " ") vStart++;
    if (raw[vStart] !== '"') return "";
    // Read JSON string value respecting escapes
    let vEnd = vStart + 1;
    while (vEnd < raw.length) {
      if (raw[vEnd] === "\\") { vEnd += 2; continue; }
      if (raw[vEnd] === '"') { vEnd++; break; }
      vEnd++;
    }
    try { return JSON.parse(raw.slice(vStart, vEnd)); } catch { return ""; }
  }

  async updateSiteSettings(newSettings) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/update_site`, { body: { settings: newSettings }, timeout: 60000 });
  }

  // ── Collections ──

  listCollections(query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections`, { query });
  }

  getCollection(id) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/${id}`);
  }

  queryCollectionRecords(tableName, query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/db_collections/collections/${tableName}/records`, { query });
  }

  // ── Blog Articles ──

  listArticles(query) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/blog/article/all`, { query });
  }

  getArticle(id) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/blog/article/${id}`);
  }

  createArticle(params) {
    return this.request("POST", `/api/v1/cms_function/${this.siteId}/blog/article`, { body: params });
  }

  updateArticle(id, params) {
    return this.request("PATCH", `/api/v1/cms_function/${this.siteId}/blog/article/${id}`, { body: params });
  }

  deleteArticle(id) {
    return this.request("DELETE", `/api/v1/cms_function/${this.siteId}/blog/article/${id}`);
  }

  // ── Products ──

  listProducts(query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/all`, { query });
  }

  getProduct(id) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/${id}`);
  }

  searchProducts(query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/products/search`, { query });
  }

  listCategories() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/categories/all`);
  }

  getProductsByCategory(categoryId) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/categories/products`, { query: { category_id: categoryId } });
  }

  // ── Orders ──

  listOrders(query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/orders/all`, { query });
  }

  getOrder(orderId) {
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
  semanticSearchThemes(query) {
    return this.request("POST", `/api/v1/ai/semantic_search`, {
      body: { query },
      timeout: 45000,
    });
  }

  // ── Applications ──

  listApps() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/subcriptions/all`);
  }

  getApp(type) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/applications/subcriptions/get_app`, { query: { type } });
  }

  // ── Promotions ──

  listPromotions(query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/all`, { query });
  }

  getPromotion(id) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/get_promotion`, { query: { id } });
  }

  getPromotionItems(id, query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/get_items`, { query: { id, ...query } });
  }

  getActivePromotions() {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/get_promotions_actived`);
  }

  searchPromotions(query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/promotion_advance/get_promotions_advance`, { query });
  }

  // ── Combos ──

  listCombos(query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/combo_product/all`, { query });
  }

  getComboItems(comboProductId, query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/combo_product/items`, { query: { combo_product_id: comboProductId, ...query } });
  }

  // ── Customers ──

  findCustomerById(id) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/customer/identity/${id}`);
  }

  findCustomerByPhone(phone) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/customer/phone/${phone}`);
  }

  findCustomerByEmail(email) {
    return this.request("GET", `/api/v1/cms_function/${this.siteId}/customer/email/${email}`);
  }

  // ── Global Sources (cart, popup, overview, etc.) ──

  getSourceCart() {
    return this.request("GET", `/api/v1/site/${this.siteId}/cart/get_source_cart`);
  }

  createSourceCart(params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/cart/create_source_cart`, { body: params });
  }

  updateSourceCart(params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/cart/update_source_cart`, { body: params });
  }

  getGlobalSources(query) {
    return this.request("GET", `/api/v1/site/${this.siteId}/global_source/`, { query });
  }

  createGlobalSource(params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/global_source/create`, { body: params });
  }

  updateGlobalSource(params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/global_source/update`, { body: params });
  }

  deleteGlobalSource(params) {
    return this.request("POST", `/api/v1/site/${this.siteId}/global_source/delete`, { body: params });
  }

  getGlobalSourceContents(query) {
    return this.request("GET", `/api/v1/dashboard/site/${this.siteId}/multilingual/global_source_contents`, { query });
  }

  updateGlobalSourceContents(params) {
    return this.request("POST", `/api/v1/dashboard/site/${this.siteId}/multilingual/update_global_source_contents`, { body: params });
  }

  // ── Automation ──

  sendMail(params) {
    return this.request("POST", `/api/v1/cms_function/${this.siteId}/application/automation/send_mail`, { body: params });
  }
}

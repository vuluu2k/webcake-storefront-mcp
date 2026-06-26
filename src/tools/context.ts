import { z } from "zod";
import { getConfig, setConfig } from "../db.js";
import { resolvePreviewUrl } from "../config.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

/** Read all saved credentials from the local config file for startup */
export function getSavedConfig() {
  return {
    token: getConfig("token") || "",
    session_id: getConfig("session_id") || "",
    site_id: getConfig("site_id") || "",
    api_url: getConfig("api_url") || "",
  };
}

/**
 * Get confirm mode for update operations.
 * - "always_confirm" (default): dry_run=true, AI must show diff and ask user before applying
 * - "auto_apply": dry_run=false, changes apply immediately without confirmation
 */
export function getConfirmMode() {
  return getConfig("confirm_mode") || "always_confirm";
}

/**
 * Best-effort deletion of the backend's auto-seeded sample data on a freshly created site so
 * the AI starts from an EMPTY, on-theme store. The api client MUST already target the new site.
 * Never throws — a failed cleanup must not fail site creation; each step is wrapped in try/catch
 * and reports how many records it removed. Keeps the non-deletable default "All" category.
 */
async function clearSeedData(api: WebcakeCmsApi): Promise<{ products: number; categories: number; articles: number }> {
  const result = { products: 0, categories: 0, articles: 0 };

  // Products — list then bulk-remove (same methods list_products / delete_product use).
  try {
    const res: any = await api.listProducts({ page: 1, limit: 200 });
    const products = (res && (res.products || res.data)) || res || [];
    const ids = (Array.isArray(products) ? products : []).map((p: any) => p.id).filter(Boolean);
    if (ids.length) {
      await api.removeProducts(ids);
      result.products = ids.length;
    }
  } catch { /* best-effort */ }

  // Product categories — delete every NON-default one (the default "All" has is_default:true
  // and cannot be deleted). Same command shape delete_product_category uses.
  try {
    const res: any = await api.listCategories();
    const cats = (res && (res.data || res.categories || res.list)) || res || [];
    const ids = (Array.isArray(cats) ? cats : [])
      .filter((c: any) => !c.is_default)
      .map((c: any) => c.id)
      .filter(Boolean);
    if (ids.length) {
      await api.deleteProductCategory([{ name: "bulk_delete_category", data: { ids } }]);
      result.categories = ids.length;
    }
  } catch { /* best-effort */ }

  // Blog articles — list then delete one by one (best-effort; blog cleanup must never fail site creation).
  try {
    const res: any = await api.listArticles({ page: 1, limit: 200 });
    const articles = (res && res.data) || res || [];
    const ids = (Array.isArray(articles) ? articles : []).map((a: any) => a.id).filter(Boolean);
    for (const id of ids) {
      try {
        await api.deleteArticle(id);
        result.articles++;
      } catch { /* skip the ones that fail */ }
    }
  } catch { /* best-effort */ }

  return result;
}

// ── Tools ──

export function registerContextTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "get_intake_guide",
    "Get the INTAKE questionnaire + build flow to run BEFORE creating a new site/store/page. Call this at the start of any fresh build: ask the user this one short batch (plain words, with defaults), restate the plan, get a yes, THEN build. Skip only for tiny edits, data questions, or when the user already gave the brief / says 'just do it'.",
    {},
    () =>
      handle(async () => ({
        how_to_use:
          "Ask these as ONE friendly batch in the user's language (Vietnamese = full diacritics). Talk like a shop-website consultant to a non-designer: plain words and visual outcomes, no jargon. Offer the defaults so they can answer fast or just say 'theo gợi ý'. Then restate the plan (shop name + pages + colour/tone + main CTA) and WAIT for confirmation before building. Never invent or silently placeholder real data — ask for it; only placeholder what the user explicitly skips and tell them what to fill in.",
        questions: [
          { key: "business", ask: "Bạn bán gì? Kể 3–6 sản phẩm tiêu biểu kèm giá (và giá gốc nếu có khuyến mãi).", why: "Tạo danh mục + sản phẩm thật để lưới sản phẩm hiển thị đúng.", required: true },
          { key: "brand", ask: "Tên shop/thương hiệu là gì? Có logo hay slogan không?", default: "Dùng tên bạn cung cấp; chưa có logo thì để chữ.", required: true },
          { key: "look", ask: "Bạn thích tông màu / phong cách nào? (ví dụ: nâu ấm cà phê, pastel nhẹ nhàng, tối hiện đại)", default: "Gợi ý một tông hợp ngành hàng để bạn duyệt.", required: false },
          { key: "pages", ask: "Cần những trang nào? Mặc định: Trang chủ + Cửa hàng (danh mục, chi tiết SP, giỏ hàng, thanh toán, cảm ơn). Thêm Giới thiệu / Blog / Liên hệ?", default: "Trang chủ + bộ trang cửa hàng chuẩn.", required: false },
          { key: "contact", ask: "Thông tin liên hệ thật: hotline/Zalo, địa chỉ, email, giờ mở cửa — và nút hành động chính (Mua ngay / Gọi đặt / Nhắn Zalo)?", why: "Hiển thị ở header/footer/CTA — không bịa.", required: true },
          { key: "promo", ask: "Có khuyến mãi hay điểm bán hàng nổi bật để làm CTA không? (ví dụ: giảm 10% đơn đầu, freeship từ 300k)", default: "Bỏ qua nếu chưa có.", required: false },
        ],
        recommended_flow: [
          "create_site (tên + slug) → tự chuyển sang site mới VÀ tự dọn sạch dữ liệu mẫu (không còn sản phẩm/danh mục mẫu) → site trống, sạch theo đúng chủ đề",
          "create_product_category + create_product cho từng sản phẩm (ảnh từ search_images/upload_images trước)",
          "get_build_guide → KHOÁ design system (bảng màu theme, type scale, spacing 8px, 1 nút, 1 card) trước khi dựng",
          "build_page trang chủ (type:'main', is_homepage:true): tự soạn từ elements (new_section/new_row/new_element) — hero ảnh thật, lưới sản phẩm, câu chuyện/USP, social proof, CTA",
          "Soạn TỪNG trang cửa hàng từ elements (KHÔNG có khung mẫu): danh mục (banner+breadcrumb+grid-product), chi tiết SP (2 cột gallery|thông tin + mô tả + liên quan), giỏ hàng, thanh toán, cảm ơn — cùng bảng màu/header/footer",
          "create_global_section type:'header' / type:'footer' (tự soạn từ elements) → dùng chung mọi trang",
          "publish_site (cũng rebuild CSS storefront)",
        ],
        notes: "Sau khi build xong, QA trên builder editor (app_base/editor/:site_id) hoặc storefront đã publish; publish_site sẽ rebuild CSS để hết tình trạng trang thiếu style.",
      }))
  );
  server.tool(
    "get_current_context",
    "Show current connection context: which site_id, API URL, session, and account info. Call this first to confirm you're working on the right site",
    {},
    () =>
      handle(async () => {
        const [me, site] = await Promise.all([
          api.getMe().catch(() => null),
          api.getSiteInfo().catch(() => null),
        ]);

        return {
          api_url: api.baseUrl,
          site_id: api.siteId,
          session_id: api.sessionId || null,
          site_name: (site as any)?.data?.name || null,
          site_domain: (site as any)?.data?.domain || (site as any)?.data?.sub_domain || null,
          account: (me as any)?.data
            ? {
                id: (me as any).data.id,
                email: (me as any).data.email,
                name: [(me as any).data.first_name, (me as any).data.last_name].filter(Boolean).join(" ") || null,
              }
            : null,
          confirm_mode: getConfirmMode(),
          hint: "Use list_my_sites to see all sites, switch_site to change site. Use toggle_confirm_mode to switch between 'always_confirm' (safe) and 'auto_apply' (fast).",
        };
      })
  );

  server.tool(
    "list_my_sites",
    "List all sites accessible by the current account. Use this to find a site_id before switching",
    {
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(20).describe("Items per page"),
      term: z.string().optional().describe("Search by site name"),
    },
    ({ page, limit, term }) =>
      handle(async () => {
        const res = await api.listMySites({ page, limit, ...(term && { term }) });
        const raw = (res as any)?.data?.sites || (res as any)?.data || [];
        const list: any[] = Array.isArray(raw) ? raw : [];
        const sites = list.map((s: any) => ({
          id: s.id,
          name: s.name,
          domain: s.domain || s.sub_domain || null,
          is_current: s.id === api.siteId,
        }));
        return {
          current_site_id: api.siteId,
          sites,
          total: (res as any)?.data?.total_entries || sites.length,
          page,
        };
      })
  );

  server.tool(
    "create_site",
    `Create a brand-new storefront site for the current account, then (by default) switch to it
and return an EMPTY, CLEAN site (no sample products/categories) ready for element composition.
The backend auto-seeds off-theme sample products + categories (and a sample blog); by default
this tool DELETES that seed right after creating the site (keep the non-deletable default "All"
category) so you start from a blank, on-theme store. Pass keep_seed:true to keep the sample data.
The site has NO pages — after this, compose a homepage from elements: get_build_guide →
new_section/new_element → build_page (type:'main', is_homepage:true).
Note: free accounts are limited to 4 sites (creation fails with a quota error past that).`,
    {
      name: z.string().describe("Display name of the new site, e.g. 'My Coffee Shop'"),
      slug: z
        .string()
        .describe("URL-safe site slug (lowercase letters, digits, hyphens), e.g. 'my-coffee-shop'. Becomes the preview subdomain and must be unique."),
      switch_to: z
        .boolean()
        .default(true)
        .describe("Switch the session to the new site after creating it (saved for next session). Default true."),
      keep_seed: z
        .boolean()
        .default(false)
        .describe("Keep the backend's sample products/categories/blog instead of auto-deleting them. Default false = start from a clean, empty site."),
    },
    ({ name, slug, switch_to, keep_seed }) =>
      handle(async () => {
        let res: any;
        try {
          res = await api.createSite({ name, slug });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("403")) {
            throw new Error(
              "Cannot create site: your account's site quota is reached (free plan allows up to 4 sites). Delete an unused site or upgrade your plan, then retry."
            );
          }
          throw new Error(`Site creation failed: ${msg}. Check the slug is unique and URL-safe (lowercase, hyphens).`);
        }

        const site = res?.data?.site || res?.data || res?.site || res;
        const newId = site?.id;
        if (!newId) {
          throw new Error("Site was not created (no id returned by the backend).");
        }
        const createdSlug = site?.site_slug?.slug || slug;

        const previousSiteId = api.siteId;

        // Cleaning the backend's auto-seed (sample products/categories/blog) requires the api
        // client to target the NEW site, so switch first. We restore the previous site at the
        // end if the caller asked NOT to switch.
        api.switchSite(newId);

        let seed_cleared: { products: number; categories: number; articles: number } | null = null;
        if (!keep_seed) {
          seed_cleared = await clearSeedData(api);
        }

        let switched = false;
        let previewUrl: string | null = null;
        if (switch_to) {
          setConfig("site_id", newId);
          setConfig("site_name", site?.name || name);
          setConfig("site_domain", createdSlug || "");
          switched = true;
          previewUrl = await resolvePreviewUrl(api).catch(() => null);
        } else {
          // Caller wants to stay on their current site — undo the temporary switch.
          api.switchSite(previousSiteId);
        }

        return {
          success: true,
          site_id: newId,
          name: site?.name || name,
          slug: createdSlug,
          switched,
          ...(switched ? { current_site_id: api.siteId, previous_site_id: previousSiteId } : {}),
          ...(seed_cleared ? { seed_cleared } : { seed_kept: true }),
          preview_url: previewUrl,
          next_step:
            (keep_seed
              ? "New site KEPT its sample products/categories/blog and has NO pages. "
              : "New site is EMPTY and clean (sample products/categories removed) and has NO pages. ") +
            "Compose a homepage from elements with build_page (type:'main', is_homepage:true), then add store/member/blog pages as needed. Publish site-level with publish_site.",
        };
      })
  );

  server.tool(
    "switch_site",
    `Switch to a different site by site_id. All subsequent tool calls will target the new site.
The choice is saved to local database — next session will auto-connect to this site.
Use list_my_sites first to find the site_id`,
    {
      site_id: z.string().describe("The site ID to switch to"),
    },
    ({ site_id }) =>
      handle(async () => {
        const oldSiteId = api.siteId;
        api.switchSite(site_id);

        // Verify the new site is accessible
        const site = await api.getSiteInfo().catch(() => null);
        if (!(site as any)?.data) {
          api.switchSite(oldSiteId);
          throw new Error(`Cannot access site "${site_id}". Check the ID or your permissions.`);
        }

        // Persist for next session
        setConfig("site_id", api.siteId);
        setConfig("site_name", (site as any).data.name || "");
        setConfig("site_domain", (site as any).data.domain || (site as any).data.sub_domain || "");

        return {
          switched: true,
          saved: true,
          previous_site_id: oldSiteId,
          current_site_id: api.siteId,
          site_name: (site as any).data.name,
          site_domain: (site as any).data.domain || (site as any).data.sub_domain || null,
        };
      })
  );

  server.tool(
    "update_auth",
    `Update authentication credentials. All values are saved to local database — next session auto-restores them.
Get token and session_id from browser DevTools → Network tab → copy from any API request headers`,
    {
      token: z.string().optional().describe("JWT Bearer token (from Authorization header)"),
      session_id: z.string().optional().describe("Session ID (from x-session-id header)"),
      api_url: z.string().optional().describe("API base URL (e.g. https://api.storecake.io)"),
    },
    ({ token, session_id, api_url }) =>
      handle(async () => {
        if (!token && !session_id && !api_url) {
          throw new Error("Provide at least one of: token, session_id, api_url");
        }

        const oldToken = api.token;
        const oldSessionId = api.sessionId;
        const oldBaseUrl = api.baseUrl;

        if (api_url) api.baseUrl = api_url.replace(/\/$/, "");
        if (token) api.switchToken(token);
        if (session_id) api.switchSession(session_id);

        // Verify credentials work
        const me = await api.getMe().catch(() => null);
        if (!(me as any)?.data) {
          // Rollback
          if (token) api.switchToken(oldToken);
          if (session_id) api.switchSession(oldSessionId);
          if (api_url) api.baseUrl = oldBaseUrl;
          throw new Error("Authentication failed — credentials were NOT changed. Make sure token and session_id are both correct.");
        }

        // Persist all to the local config file
        if (token) setConfig("token", token);
        if (session_id) setConfig("session_id", session_id);
        if (api_url) setConfig("api_url", api.baseUrl);

        return {
          updated: true,
          saved: true,
          account: {
            id: (me as any).data.id,
            email: (me as any).data.email,
            name: [(me as any).data.first_name, (me as any).data.last_name].filter(Boolean).join(" ") || null,
          },
          current_site_id: api.siteId,
        };
      })
  );

  server.tool(
    "toggle_confirm_mode",
    `Toggle update confirmation mode. Controls whether update tools ask for user confirmation before saving.
- "always_confirm" (default): Shows diff first, requires user approval before saving. Safer.
- "auto_apply": Applies changes immediately without preview. Faster but riskier.
Current mode is saved to database and persists across sessions.

Call this tool when the user says things like:
→ "tự động xác nhận" / "auto confirm" / "không cần hỏi" / "don't ask" / "apply directly" → mode: "auto_apply"
→ "hỏi trước khi lưu" / "luôn hỏi" / "always ask" / "confirm before saving" / "xác nhận trước" → mode: "always_confirm"`,
    {
      mode: z.enum(["always_confirm", "auto_apply"]).describe('Set to "always_confirm" (safe) or "auto_apply" (fast). Map user intent: "tự động"/"auto"/"không cần hỏi" → auto_apply, "hỏi lại"/"confirm"/"luôn hỏi" → always_confirm'),
    },
    ({ mode }) =>
      handle(async () => {
        setConfig("confirm_mode", mode);
        return {
          confirm_mode: mode,
          saved: true,
          description: mode === "always_confirm"
            ? "Update tools will now preview changes (dry_run) and require your confirmation before saving."
            : "Update tools will now apply changes immediately without preview. Use with caution.",
        };
      })
  );
}

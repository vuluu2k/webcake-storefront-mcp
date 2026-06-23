/**
 * Marketing landing page for the WebCake Storefront MCP connector.
 *
 * Served at GET / when the client sends Accept: text/html or is a known bot UA.
 * Programmatic requests (healthcheck probes, MCP clients) still get JSON.
 *
 * Bilingual (vi/en): every string lives in META / T / FAQ dictionaries and
 * guideHtml(origin, lang) renders one language. http.ts picks the language from
 * ?lang= (falling back to vi); a toggle in the header links to the other language.
 *
 * Full SEO <head>: description, canonical, Open Graph, Twitter Card, JSON-LD for
 * SoftwareApplication + WebSite + FAQPage so links unfurl nicely and the page
 * can be indexed. ogImageSvg() is served at /og.svg; /og.png if you rasterize it.
 *
 * Self-contained (inline CSS + JS, no external fonts/trackers) so it loads instantly.
 */

const MCP_REMOTE_URL = "https://store.toolvn.io.vn/mcp";
const INSTALL_CMD = "npx -y webcake-storefront-mcp install";
const INSTALL_ALL_CMD =
  "npx -y webcake-storefront-mcp install --ide all --token &lt;TOKEN&gt; --session &lt;SESSION&gt;";
const GITHUB_URL = "https://github.com/vuluu2k/webcake-storefront-mcp";
const NPM_URL = "https://www.npmjs.com/package/webcake-storefront-mcp";
const DOCS_URL = `${GITHUB_URL}#readme`;

// ── Brand icon SVG (self-contained, no import needed) ────────────────────────
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="url(#sg)"/>
  <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#3FBB57"/>
    <stop offset="100%" stop-color="#108B67"/>
  </linearGradient></defs>
  <text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="17" fill="white">S</text>
  <circle cx="24" cy="9" r="4" fill="#FFD591"/>
</svg>`;

// ── i18n: Lang type + helpers ─────────────────────────────────────────────────
export type Lang = "vi" | "en";
export const LANGS: Lang[] = ["vi", "en"];
export function normalizeLang(input: string | undefined | null): Lang {
  return input === "en" ? "en" : "vi";
}

// ── Inline icon set (Lucide-style, MIT, stroke icons) ────────────────────────
const ICONS: Record<string, string> = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  brain:
    '<path d="M12 5a3 3 0 1 0-5.997.142 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.142 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>',
  wand: '<path d="m9.5 14.5 5-5"/><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
  check2:
    '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  shield:
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  ticket:
    '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 11v2"/><path d="M13 17v2"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  newspaper:
    '<path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  github:
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  package:
    '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  clock:
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  server:
    '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
  window:
    '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20"/><path d="M6 6.5h.01"/><path d="M9 6.5h.01"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  terminal:
    '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  layers:
    '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
};

function icon(name: string): string {
  return `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}
function tile(name: string): string {
  return `<span class="ic">${icon(name)}</span>`;
}

// ── i18n: per-language SEO metadata ──────────────────────────────────────────
const META: Record<
  Lang,
  { title: string; desc: string; keywords: string; locale: string }
> = {
  vi: {
    title: "WebCake Storefront MCP — AI tự dựng trang storefront WebCake cho bạn",
    desc: "Mô tả trang bằng lời — AI tự dựng, kiểm tra và xuất bản thẳng lên storefront WebCake/StoreCake. ~101 tool MCP cho Claude, Cursor, Windsurf và mọi client MCP.",
    keywords:
      "WebCake, StoreCake, storefront, MCP, Model Context Protocol, AI, Claude, Cursor, Windsurf, tạo trang bằng AI, BuilderX, no-code, bán hàng online",
    locale: "vi_VN",
  },
  en: {
    title: "WebCake Storefront MCP — let AI build WebCake store pages for you",
    desc: "Describe a store page in plain words — AI builds it, validates it, and publishes it to your WebCake/StoreCake storefront. ~101 MCP tools for Claude, Cursor, Windsurf and any MCP client.",
    keywords:
      "WebCake, StoreCake, storefront, MCP, Model Context Protocol, AI, Claude, Cursor, Windsurf, AI page builder, BuilderX, no-code, e-commerce",
    locale: "en_US",
  },
};

// ── i18n: FAQ (also powers FAQPage JSON-LD) ──────────────────────────────────
const FAQ: Record<Lang, Array<{ q: string; a: string }>> = {
  vi: [
    {
      q: "WebCake Storefront MCP là gì?",
      a: "Là một MCP server giúp AI (Claude, Cursor…) tự dựng trang storefront WebCake/StoreCake từ một câu mô tả, tự kiểm tra rồi lưu vào site của bạn. AI nắm toàn bộ mô hình component BuilderX — bạn chỉ cần mô tả và xem lại.",
    },
    {
      q: "Tôi có cần biết lập trình không?",
      a: "Không. Bạn chỉ cần mô tả trang bằng lời trong ứng dụng AI. Mọi phần kỹ thuật — dựng JSON, kiểm tra cấu trúc, gọi API — đều do công cụ lo.",
    },
    {
      q: "Có miễn phí không?",
      a: "Có. Công cụ miễn phí, mã nguồn mở (MIT). Bạn chỉ cần tài khoản WebCake/StoreCake để lưu và xuất bản trang.",
    },
    {
      q: "Dùng được với ứng dụng nào?",
      a: "Claude Desktop, Claude Code, Claude.ai (qua Connectors), Cursor, Windsurf, VS Code, Augment — và bất kỳ client nào hỗ trợ chuẩn MCP.",
    },
    {
      q: "Thông tin của tôi có an toàn không?",
      a: "Có. Mọi thay đổi đều dry-run trước, chắc chắn rồi mới lưu thật. Token đăng nhập chỉ truyền qua HTTPS và không bao giờ bị log hay lưu lại phía server.",
    },
  ],
  en: [
    {
      q: "What is WebCake Storefront MCP?",
      a: "It's an MCP server that lets AI (Claude, Cursor…) build WebCake/StoreCake store pages from a single description, check the result, then save it to your site. The AI knows the full BuilderX component model — you just describe and review.",
    },
    {
      q: "Do I need to know how to code?",
      a: "No. Just describe the page in plain words inside your AI app. Every technical step — JSON assembly, structure validation, API calls — is handled by the tool.",
    },
    {
      q: "Is it free?",
      a: "Yes. The tool is free and open-source (MIT). You only need a WebCake/StoreCake account to save and publish pages.",
    },
    {
      q: "Which apps work with it?",
      a: "Claude Desktop, Claude Code, Claude.ai (via Connectors), Cursor, Windsurf, VS Code, Augment — and any client that supports the MCP standard.",
    },
    {
      q: "Is my information safe?",
      a: "Yes. Every change is dry-run first, confirmed before it touches your site. Your login token is only sent over HTTPS and is never logged or stored server-side.",
    },
  ],
};

// ── i18n: UI strings ──────────────────────────────────────────────────────────
type Strings = {
  sub: string;
  running: string;
  leadPre: string;
  leadGrad: string;
  leadPost: string;
  ctaStart: string;
  ctaStar: string;
  flowH2: string;
  flow: Array<{ icon: string; t: string; s: string }>;
  flowCap: string;
  howH2: string;
  how: Array<{ icon: string; t: string; d: string }>;
  buildH2: string;
  uses: Array<{ icon: string; t: string; e: string }>;
  connectH2: string;
  m1Tag: string;
  m1Sub: string;
  m1Steps: string[];
  m1Note: string;
  m2Tag: string;
  m2Sub: string;
  m2Steps: string[];
  m2Note: string;
  toolsH2: string;
  toolsSub: string;
  toolGroups: Array<{ icon: string; t: string; d: string }>;
  promptH2: string;
  promptSub: string;
  promptEx: string;
  faqH2: string;
  starH2: string;
  starP: string;
  starBtn: string;
  footGuide: string;
  switchLabel: string;
  nav: Array<{ href: string; label: string }>;
};

const T: Record<Lang, Strings> = {
  vi: {
    sub: "Để AI tự dựng & xuất bản trang storefront WebCake/StoreCake cho bạn, chỉ bằng lời nói",
    running: "Đang hoạt động",
    leadPre:
      "Bạn mô tả trang bằng lời, AI (Claude, Cursor…) tự dựng, kiểm tra và ",
    leadGrad: "xuất bản thẳng lên storefront WebCake",
    leadPost:
      " của bạn. Không kéo-thả, không tự viết JSON, không học schema.",
    ctaStart: "Bắt đầu kết nối",
    ctaStar: "Tặng sao trên GitHub",
    flowH2: "Mọi thứ diễn ra thế nào",
    flow: [
      { icon: "bulb", t: "Bạn", s: "ý tưởng của bạn" },
      { icon: "brain", t: "Trợ lý AI", s: "Claude · Cursor · Windsurf…" },
      { icon: "server", t: "Storefront MCP", s: "cầu nối thông minh" },
      { icon: "window", t: "WebCake / StoreCake", s: "trang web thật" },
    ],
    flowCap:
      "Bạn nói ý tưởng → AI học mô hình BuilderX từ MCP → ráp + kiểm tra cấu trúc trang → lưu & xuất bản thật trên site. Bạn nhận link preview, mở lên xem, chỉnh nếu thích.",
    howH2: "Vì sao đáng tin",
    how: [
      {
        icon: "layers",
        t: "Nắm mô hình component thật",
        d: "Cung cấp 130+ loại component BuilderX (text, ảnh, nút, form, lưới sản phẩm, giỏ hàng, đếm ngược…) port thẳng từ factory của builder — đúng y hình dạng editor tạo ra.",
      },
      {
        icon: "check2",
        t: "Kiểm tra trước khi lưu",
        d: "validate_page bắt id trùng, lưới hỏng, form thiếu tên trường, event trỏ sai — trước khi bất kỳ thứ gì được lưu xuống site của bạn.",
      },
      {
        icon: "shield",
        t: "Mặc định an toàn",
        d: "Mọi ghi đều dry-run trước — xem chính xác thay đổi, site không bị đụng tới cho tới khi bạn xác nhận.",
      },
      {
        icon: "edit",
        t: "Sửa chính xác từng element",
        d: "Nói \"đổi nút CTA sang xanh\" thì nó chỉ sửa đúng element đó — mọi id, style, block khác giữ nguyên không đụng.",
      },
    ],
    buildH2: "Bạn có thể dựng gì",
    uses: [
      {
        icon: "cart",
        t: "Trang sản phẩm",
        e: '"Trang một sản phẩm cho serum dưỡng da — gallery, giá, form đặt hàng có giỏ."',
      },
      {
        icon: "window",
        t: "Trang chủ shop",
        e: '"Trang chủ — banner hero, lưới sản phẩm nổi bật, form đăng ký nhận tin."',
      },
      {
        icon: "flame",
        t: "Flash sale",
        e: '"Trang flash-sale — đếm ngược lớn, lưới sản phẩm giảm giá, nút Mua dính."',
      },
      {
        icon: "ticket",
        t: "Sự kiện / webinar",
        e: '"Trang đăng ký — đếm ngược, agenda, form đăng ký."',
      },
      {
        icon: "mail",
        t: "Thiệp mời",
        e: '"Thiệp cưới — tên, ngày, bản đồ, form RSVP."',
      },
      {
        icon: "newspaper",
        t: "Blog / nội dung",
        e: '"Trang blog với bài nổi bật và ô đăng ký nhận tin."',
      },
      {
        icon: "link",
        t: "Link-in-bio",
        e: '"Link-in-bio — avatar, bio ngắn, 5 nút liên kết, mạng xã hội."',
      },
      {
        icon: "flame",
        t: "Bất cứ trang nào",
        e: '"…rồi \"đổi CTA sang xanh\" hay \"thêm tính năng thứ 4\" — chỉ sửa đúng block đó."',
      },
    ],
    connectH2: "Kết nối — chọn 1 trong 2 cách",
    m1Tag: "Cách ① · Cài trên máy của bạn (npx)",
    m1Sub:
      "Phù hợp khi bạn tự dùng và muốn chủ động. Cần Node.js 18+ (miễn phí). Một lệnh cấu hình IDE:",
    m1Steps: [
      "<b>Cài Node.js 18+</b> (miễn phí) nếu máy chưa có — tải tại <b>nodejs.org</b>.",
      "<b>Mở Terminal</b>, dán lệnh dưới đây và nhấn Enter:<pre>" + INSTALL_CMD + "</pre>",
      '<b>Làm theo hướng dẫn:</b> chọn IDE (Claude, Cursor, Windsurf…) → đăng nhập WebCake → token + session được lưu tự động.',
      '<b>Mở lại ứng dụng AI.</b> Thấy <code class="inl">webcake-storefront</code> xuất hiện là kết nối thành công.',
    ],
    m1Note: "Cài cho tất cả IDE cùng lúc — dán token + session vào lệnh này:",
    m2Tag: "Cách ② · Remote URL — không cần cài gì",
    m2Sub:
      "Phù hợp khi dùng claude.ai trên web, dùng theo nhóm, hoặc không muốn cài gì trên máy. OAuth chạy tự động.",
    m2Steps: [
      '<b>Copy URL remote</b> bên dưới (đã có sẵn trong trang):<a class="btn" href="{REMOTE}">{REMOTE} {ARROW}</a>',
      '<b>Mở Connectors trong ứng dụng:</b><br>• claude.ai: <i>Settings → Connectors → Add custom connector</i><br>• Cursor / Claude Code: mở file <code class="inl">.mcp.json</code>',
      "<b>Dán URL</b> vừa copy — OAuth sẽ mở trình duyệt để bạn đăng nhập tự động:<pre>{REMOTE}</pre>",
      "<b>Bấm Add</b> (hoặc lưu file). Biểu tượng WebCake chuyển xanh là dùng được. Site được chọn ngay trong chat bằng <code class=\"inl\">switch_site</code>.",
    ],
    m2Note:
      "Token + session chỉ cần đặt một lần phía server; site được chọn ngay trong chat với switch_site — không cần WEBCAKE_SITE_ID cứng.",
    toolsH2: "~101 tool — 7 nhóm chức năng",
    toolsSub:
      "Nhóm dựng trang hoạt động không cần backend; mọi thứ đọc/ghi site cần token + session.",
    toolGroups: [
      {
        icon: "layers",
        t: "Dựng trang",
        d: "get_build_guide · list_elements · get_element · new_element · new_section · new_page_skeleton · validate_page · build_page · add_section",
      },
      {
        icon: "window",
        t: "Trang & code",
        d: "list_pages · get_page_source · search_page_elements · update_page_element(s) · create_page · update_page · update_page_source · CSS/JS tùy chỉnh · global sections · publish_site",
      },
      {
        icon: "cart",
        t: "Thương mại",
        d: "products · orders · collections · promotions · combos · customers",
      },
      {
        icon: "newspaper",
        t: "Nội dung & media",
        d: "blog articles · themes · apps · search_images (Pexels) · upload_image · ingest_html · ingest_url",
      },
      {
        icon: "server",
        t: "Backend code",
        d: "get_http_function · edit_http_function · run_function · debug_function · list_cms_files",
      },
      {
        icon: "terminal",
        t: "Context & auth",
        d: "get_current_context · list_my_sites · switch_site · update_auth · toggle_confirm_mode",
      },
      {
        icon: "mail",
        t: "Automation",
        d: "send_mail — gửi email giao dịch qua automation API của WebCake",
      },
    ],
    promptH2: "Kết nối xong, chỉ cần nói",
    promptSub:
      "Dán prompt gợi ý này vào AI để bắt đầu:",
    promptEx:
      "Dựng trang storefront WebCake cho <thương hiệu/sản phẩm>. Dùng webcake-storefront MCP:\ngọi get_build_guide, list_elements, dựng các section với new_section,\nvalidate_page cho đến khi không còn lỗi, rồi build_page (dry-run trước) và publish_site.",
    faqH2: "Câu hỏi thường gặp",
    starH2: "Thấy hữu ích? Tặng dự án một ngôi sao nhé",
    starP:
      "Đây là dự án miễn phí, mã nguồn mở — mỗi ngôi sao là một lời động viên để dự án tiếp tục phát triển và giúp nhiều người tìm ra nó hơn.",
    starBtn: "Tặng sao trên GitHub",
    footGuide: "Tài liệu",
    switchLabel: "English",
    nav: [
      { href: "#flow", label: "Cách hoạt động" },
      { href: "#how", label: "Vì sao tin" },
      { href: "#build", label: "Tạo được gì" },
      { href: "#connect", label: "Kết nối" },
      { href: "#tools", label: "Công cụ" },
      { href: "#faq", label: "Hỏi đáp" },
    ],
  },
  en: {
    sub: "Let AI build & publish WebCake/StoreCake store pages for you, just by talking to it",
    running: "Up and running",
    leadPre:
      "Describe a store page in plain words — AI (Claude, Cursor…) builds it, validates it, and ",
    leadGrad: "publishes it straight to your WebCake storefront",
    leadPost:
      ". No drag-and-drop, no hand-writing JSON, no learning the schema.",
    ctaStart: "Get connected",
    ctaStar: "Star on GitHub",
    flowH2: "How it all works",
    flow: [
      { icon: "bulb", t: "You", s: "your idea" },
      { icon: "brain", t: "AI assistant", s: "Claude · Cursor · Windsurf…" },
      { icon: "server", t: "Storefront MCP", s: "the smart bridge" },
      { icon: "window", t: "WebCake / StoreCake", s: "a real live page" },
    ],
    flowCap:
      "You describe your idea → the AI learns the BuilderX model from the MCP → assembles + validates the page structure → saves and publishes for real on your site. You get a preview link, open it, tweak if you like.",
    howH2: "Why it's reliable",
    how: [
      {
        icon: "layers",
        t: "Knows the real component model",
        d: "Serves 130+ BuilderX component types (text, image, button, form, product grid, cart, countdown…) ported straight from the builder's own factory — the exact shapes the editor produces.",
      },
      {
        icon: "check2",
        t: "Validates before saving",
        d: "validate_page catches duplicate ids, broken grids, form fields without names, invalid event targets — before anything touches your site.",
      },
      {
        icon: "shield",
        t: "Safe by default",
        d: "Every write is dry-run first — preview the exact change, nothing touches your site until you confirm.",
      },
      {
        icon: "edit",
        t: "Surgical edits",
        d: "Ask for one change (\"make the CTA green\") and it edits only that element — every other id, style, and block stays exactly as it was.",
      },
    ],
    buildH2: "What you can build",
    uses: [
      {
        icon: "cart",
        t: "Product page",
        e: '"A one-product page for my skincare serum — gallery, price, an order form with cart."',
      },
      {
        icon: "window",
        t: "Storefront home",
        e: '"A homepage — hero banner, featured product grid, a newsletter form."',
      },
      {
        icon: "flame",
        t: "Flash sale",
        e: '"A flash-sale page — big countdown, discounted product grid, a sticky Buy button."',
      },
      {
        icon: "ticket",
        t: "Event / webinar",
        e: '"A registration page — countdown, agenda, a sign-up form."',
      },
      {
        icon: "mail",
        t: "Invitation",
        e: '"A wedding invite — names, date, a map, an RSVP form."',
      },
      {
        icon: "newspaper",
        t: "Blog / content",
        e: '"A blog index with featured posts and a subscribe box."',
      },
      {
        icon: "link",
        t: "Link-in-bio",
        e: '"A link-in-bio — avatar, short bio, 5 link buttons, socials."',
      },
      {
        icon: "flame",
        t: "Anything, really",
        e: '"…then \"make the CTA green\" or \"add a 4th feature\" — it edits only that block."',
      },
    ],
    connectH2: "Connect — pick one of two ways",
    m1Tag: "Way ① · Install on your machine (npx)",
    m1Sub:
      "Best when it's just for you and you want full control. Needs Node.js 18+ (free). One command configures your IDE:",
    m1Steps: [
      "<b>Install Node.js 18+</b> (free) if you don't have it — get it at <b>nodejs.org</b>.",
      "<b>Open a terminal</b>, paste the command below, and press Enter:<pre>" + INSTALL_CMD + "</pre>",
      "<b>Follow the prompts:</b> pick your IDE(s) (Claude, Cursor, Windsurf…) → sign in to WebCake → token + session are saved automatically.",
      '<b>Reopen your AI app.</b> When you see <code class="inl">webcake-storefront</code> listed, you\'re connected.',
    ],
    m1Note: "Configure every IDE at once — paste your token + session into:",
    m2Tag: "Way ② · Remote URL — nothing to install",
    m2Sub:
      "Best for claude.ai on the web, teams, or when you can't install software. OAuth runs automatically.",
    m2Steps: [
      '<b>Copy the remote URL</b> below:<a class="btn" href="{REMOTE}">{REMOTE} {ARROW}</a>',
      '<b>Open Connectors in your app:</b><br>• claude.ai: <i>Settings → Connectors → Add custom connector</i><br>• Cursor / Claude Code: open <code class="inl">.mcp.json</code>',
      "<b>Paste the URL</b> — OAuth will open your browser to sign in automatically:<pre>{REMOTE}</pre>",
      "<b>Hit Add</b> (or save the file). When the WebCake icon turns green, you're connected. Pick your site in chat with <code class=\"inl\">switch_site</code>.",
    ],
    m2Note:
      "Token + session are set once on the server; the site is chosen in chat with switch_site — no WEBCAKE_SITE_ID needed up front.",
    toolsH2: "~101 tools — 7 groups",
    toolsSub:
      "The build + catalog group works with zero config; everything that reads or writes your site needs a token + session.",
    toolGroups: [
      {
        icon: "layers",
        t: "Build a page",
        d: "get_build_guide · list_elements · get_element · new_element · new_section · new_page_skeleton · validate_page · build_page · add_section",
      },
      {
        icon: "window",
        t: "Pages & code",
        d: "list_pages · get_page_source · search_page_elements · update_page_element(s) · create_page · update_page · update_page_source · custom CSS/JS · global sections · publish_site",
      },
      {
        icon: "cart",
        t: "Commerce",
        d: "products · orders · collections · promotions · combos · customers",
      },
      {
        icon: "newspaper",
        t: "Content & media",
        d: "blog articles · themes · apps · search_images (Pexels) · upload_image · ingest_html · ingest_url",
      },
      {
        icon: "server",
        t: "Backend code",
        d: "get_http_function · edit_http_function · run_function · debug_function · list_cms_files",
      },
      {
        icon: "terminal",
        t: "Context & auth",
        d: "get_current_context · list_my_sites · switch_site · update_auth · toggle_confirm_mode",
      },
      {
        icon: "mail",
        t: "Automation",
        d: "send_mail — send transactional email via the WebCake automation API",
      },
    ],
    promptH2: "Once connected, just say",
    promptSub: "Paste this suggested prompt to get started:",
    promptEx:
      "Build me a WebCake storefront page for <brand/offer>. Use the webcake-storefront MCP:\ncall get_build_guide, list_elements, build the sections with new_section,\nvalidate_page until zero errors, then build_page (dry-run first) and publish_site.",
    faqH2: "FAQ",
    starH2: "Find it useful? Give the project a star",
    starP:
      "It's a free, open-source project — every star is a little encouragement to keep it growing and helps more people find it.",
    starBtn: "Star on GitHub",
    footGuide: "Docs",
    switchLabel: "Tiếng Việt",
    nav: [
      { href: "#flow", label: "How it works" },
      { href: "#how", label: "Why trust it" },
      { href: "#build", label: "What you build" },
      { href: "#connect", label: "Connect" },
      { href: "#tools", label: "Tools" },
      { href: "#faq", label: "FAQ" },
    ],
  },
};

function steps(items: string[]): string {
  return items
    .map(
      (body, i) =>
        `<li><span class="n">${i + 1}</span><div class="body">${body}</div></li>`,
    )
    .join("\n      ");
}

export function guideHtml(origin: string, lang: Lang = "vi"): string {
  const L = normalizeLang(lang);
  const t = T[L];
  const m = META[L];
  const faq = FAQ[L];
  const endpoint = `${origin}/mcp`;
  const ogImage = `${origin}/og.svg`;
  const otherLang: Lang = L === "vi" ? "en" : "vi";
  const otherHref = otherLang === "en" ? "?lang=en" : "?lang=vi";
  const canonical = `${origin}/${L === "en" ? "?lang=en" : ""}`;
  const selfPath = L === "en" ? "?lang=en" : "/";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "WebCake Storefront MCP",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Windows, macOS, Linux",
        description: m.desc,
        url: canonical,
        image: ogImage,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        author: {
          "@type": "Organization",
          name: "WebCake",
          url: "https://webcake.io",
        },
        softwareHelp: DOCS_URL,
        installUrl: NPM_URL,
      },
      {
        "@type": "WebSite",
        name: "WebCake Storefront MCP",
        url: `${origin}/`,
        inLanguage: L,
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  const jsonLdScript = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  const fill = (s: string) =>
    s
      .replaceAll("{REMOTE}", MCP_REMOTE_URL)
      .replaceAll("{ENDPOINT}", endpoint)
      .replaceAll("{ARROW}", icon("arrow"));

  return `<!doctype html>
<html lang="${L}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script>(function(){document.documentElement.classList.add('js');try{var t=localStorage.getItem('wc-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}try{if('scrollRestoration' in history)history.scrollRestoration='manual';}catch(e){}})();</script>
<title>${m.title}</title>
<meta name="description" content="${m.desc}">
<meta name="keywords" content="${m.keywords}">
<meta name="author" content="WebCake">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#1DB954">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="vi" href="${origin}/">
<link rel="alternate" hreflang="en" href="${origin}/?lang=en">
<link rel="alternate" hreflang="x-default" href="${origin}/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="WebCake Storefront MCP">
<meta property="og:title" content="${m.title}">
<meta property="og:description" content="${m.desc}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:type" content="image/svg+xml">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${m.title}">
<meta property="og:locale" content="${META[L].locale}">
<meta property="og:locale:alternate" content="${META[otherLang].locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${m.title}">
<meta name="twitter:description" content="${m.desc}">
<meta name="twitter:image" content="${ogImage}">
<meta name="twitter:image:alt" content="${m.title}">
<script type="application/ld+json">${jsonLdScript}</script>
<style>
  :root{--g:#1DB954;--g7:#178f43;--ink:#11231b;--mut:#5e6d65;--bg:#f5f9f7;--card:#ffffff;
    --line:rgba(16,40,30,.09);--shadow:0 1px 2px rgba(16,40,30,.05),0 6px 20px -12px rgba(16,40,30,.18);--code:#0e1714;
    --ic-fg:#178f43;--btn-hover:#178f43;--navbg:rgba(245,249,247,.82)}
  @media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#e8f0ec;--mut:#9aaba2;--bg:#0b110e;--card:#141b17;
    --line:rgba(255,255,255,.07);--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -14px rgba(0,0,0,.7);--code:#070f0b;--g7:#5ee08a;--ic-fg:#6fe79a;--btn-hover:#21c264;--navbg:rgba(11,17,14,.82)}}
  :root[data-theme="dark"]{--ink:#e8f0ec;--mut:#9aaba2;--bg:#0b110e;--card:#141b17;
    --line:rgba(255,255,255,.07);--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -14px rgba(0,0,0,.7);--code:#070f0b;--g7:#5ee08a;--ic-fg:#6fe79a;--btn-hover:#21c264;--navbg:rgba(11,17,14,.82)}
  *{box-sizing:border-box}
  html{scroll-behavior:auto}
  html.smooth{scroll-behavior:smooth}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);
    background:var(--bg);line-height:1.62;overflow-x:hidden}
  .blobs{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
  .blobs b{position:absolute;border-radius:50%;filter:blur(90px);opacity:.16;will-change:transform}
  .blobs b:nth-child(1){width:560px;height:560px;right:-160px;top:-180px;background:radial-gradient(circle,#1DB954,transparent 70%);animation:drift1 40s ease-in-out infinite}
  .blobs b:nth-child(2){width:440px;height:440px;left:-160px;bottom:-160px;background:radial-gradient(circle,#16b89a,transparent 70%);animation:drift2 48s ease-in-out infinite}
  @keyframes drift1{50%{transform:translate(-50px,60px)}}
  @keyframes drift2{50%{transform:translate(40px,-50px)}}
  .wrap{max-width:900px;margin:0 auto;padding:48px 20px 72px}
  a{color:inherit}
  .i{width:1.1em;height:1.1em;flex:0 0 auto;vertical-align:-.15em}
  .glass{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);
    transition:box-shadow .2s ease,border-color .2s ease}
  header{display:flex;align-items:center;gap:14px;margin-bottom:14px}
  header .logo{width:50px;height:50px;border-radius:14px;overflow:hidden;flex:0 0 auto;
    box-shadow:0 6px 16px -4px rgba(29,185,84,.4)}
  header .logo svg{width:100%;height:100%;display:block}
  .hgrow{flex:1 1 auto;min-width:0}
  .controls{margin-left:auto;flex:0 0 auto;display:flex;align-items:center;gap:8px}
  .langsw{font-size:.82rem;font-weight:700;color:var(--g7);text-decoration:none;white-space:nowrap;
    border:1px solid var(--line);background:var(--card);padding:7px 12px;border-radius:999px;display:inline-flex;align-items:center;gap:6px}
  .langsw:hover{border-color:var(--g)}
  .iconbtn{width:36px;height:36px;flex:0 0 auto;display:grid;place-items:center;cursor:pointer;color:var(--g7);
    border:1px solid var(--line);background:var(--card);border-radius:10px;transition:border-color .15s ease,color .15s ease}
  .iconbtn:hover{border-color:var(--g)}
  .iconbtn svg{width:17px;height:17px}
  h1{font-size:1.78rem;margin:0;font-weight:800;letter-spacing:-.02em}
  .sub{color:var(--mut);margin:3px 0 0;font-size:.98rem}
  .lead{font-size:1.16rem;margin:20px 0 18px;max-width:60ch}
  .lead b{color:var(--ink)}
  .grad{background:linear-gradient(95deg,#1DB954,#16b89a 60%,#37d979);-webkit-background-clip:text;background-clip:text;color:transparent;
    background-size:200% auto;animation:shim 7s linear infinite}
  @keyframes shim{to{background-position:200% center}}
  .pill{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;font-size:.82rem;font-weight:600;
    color:var(--g7);background:rgba(29,185,84,.10);border:1px solid var(--line)}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--g);box-shadow:0 0 0 0 rgba(29,185,84,.5);animation:pulse 2s infinite}
  @keyframes pulse{70%{box-shadow:0 0 0 7px rgba(29,185,84,0)}100%{box-shadow:0 0 0 0 rgba(29,185,84,0)}}
  h2{font-size:1.32rem;margin:46px 0 16px;font-weight:800;letter-spacing:-.01em;scroll-margin-top:72px}
  .ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;flex:0 0 auto;color:var(--ic-fg);
    background:rgba(29,185,84,.11);border:1px solid var(--line);transition:transform .2s ease}
  .ic .i{width:22px;height:22px}
  .grid{display:grid;gap:16px;grid-template-columns:1fr 1fr}
  .grid-3{display:grid;gap:16px;grid-template-columns:1fr 1fr 1fr}
  @media(max-width:720px){.grid,.grid-3{grid-template-columns:1fr}}
  .card{padding:22px}
  .card .ic{margin-bottom:14px}
  .card h3{margin:0 0 6px;font-size:1.04rem}
  .card p{color:var(--mut);font-size:.93rem;margin:0}
  .tag{display:inline-flex;align-items:center;gap:9px;font-size:.82rem;font-weight:800;color:var(--g7);
    text-transform:uppercase;letter-spacing:.04em;flex-wrap:wrap}
  .tag .ic{width:30px;height:30px;border-radius:9px}
  .tag .ic .i{width:16px;height:16px}
  pre{margin:0;background:var(--code);color:#e8f0ec;border-radius:11px;padding:12px 14px;overflow-x:auto;
    border:1px solid rgba(255,255,255,.06);font:600 .82rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  .codewrap{position:relative}
  .codewrap pre{padding-right:46px}
  .copy{position:absolute;top:8px;right:8px;width:30px;height:30px;display:grid;place-items:center;cursor:pointer;
    border:1px solid rgba(255,255,255,.15);border-radius:8px;background:rgba(255,255,255,.06);color:#cfe9d8;
    transition:background .15s ease,color .15s ease,border-color .15s ease}
  .copy:hover{background:rgba(255,255,255,.13);color:#fff}
  .copy svg{width:15px;height:15px}
  .copy.done{color:#5ee08a;border-color:rgba(94,224,138,.55)}
  .feat{list-style:none;padding:0;margin:0;display:grid;gap:12px}
  .feat li{display:flex;gap:13px;align-items:center;font-size:.97rem;padding:13px 16px}
  .feat li b{color:var(--ink)}
  .cta-row{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0 6px}
  .flow{display:flex;align-items:flex-start;gap:0;padding:24px 18px 18px;overflow-x:auto}
  .flow .node{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;width:104px}
  .flow .node .ic{width:54px;height:54px;border-radius:16px}
  .flow .node .ic .i{width:27px;height:27px}
  .flow .node b{font-size:.93rem}
  .flow .node span{font-size:.75rem;color:var(--mut)}
  .flow .wire{flex:1 1 auto;min-width:30px;position:relative;height:2px;margin-top:27px;
    background:linear-gradient(90deg,var(--line),rgba(29,185,84,.45),var(--line))}
  .flow .wire .pkt{position:absolute;top:50%;left:0;width:9px;height:9px;margin:-5px 0 0 -4px;border-radius:50%;
    background:var(--g);box-shadow:0 0 9px 1px rgba(29,185,84,.7)}
  .flow .wire::after{content:"";position:absolute;right:-1px;top:50%;width:7px;height:7px;margin-top:-4px;
    border-top:2px solid var(--g7);border-right:2px solid var(--g7);transform:rotate(45deg)}
  .flow-cap{color:var(--mut);font-size:.9rem;margin:2px 2px 0;max-width:68ch}
  @media(prefers-reduced-motion:no-preference){
    .flow .wire .pkt{animation:pkt 2.4s ease-in-out infinite}
    @keyframes pkt{0%{left:0;opacity:0}12%{opacity:1}88%{opacity:1}100%{left:100%;opacity:0}}
    .flow .node .ic{animation:nodepop 2.4s ease-in-out infinite}
  }
  @media(prefers-reduced-motion:reduce){.flow .wire .pkt{display:none}}
  @keyframes nodepop{0%,100%{box-shadow:none}50%{box-shadow:0 0 0 4px rgba(29,185,84,.12)}}
  .btn{display:inline-flex;align-items:center;gap:9px;padding:11px 19px;border-radius:11px;cursor:pointer;
    background:var(--g);color:#fff;text-decoration:none;font-weight:700;font-size:.93rem;
    box-shadow:0 4px 12px -4px rgba(29,185,84,.5);transition:transform .15s ease,background .15s ease}
  .btn .i{width:18px;height:18px}
  .btn:hover{transform:translateY(-1px);background:var(--btn-hover)}
  .btn.ghost{background:var(--card);color:var(--ink);border:1px solid var(--line);box-shadow:none}
  .btn.ghost:hover{border-color:var(--g);background:var(--card)}
  .nav{position:sticky;top:0;z-index:60;display:flex;gap:6px;align-items:center;overflow-x:auto;
    margin:18px -20px 6px;padding:9px 20px;background:var(--navbg);border-bottom:1px solid var(--line);
    backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);scrollbar-width:none}
  .nav::-webkit-scrollbar{display:none}
  .nav a{flex:0 0 auto;font-size:.84rem;font-weight:600;color:var(--mut);text-decoration:none;
    padding:7px 13px;border-radius:999px;white-space:nowrap;transition:color .15s ease,background .15s ease}
  .nav a:hover{color:var(--g7);background:rgba(29,185,84,.10)}
  .nav a.active{color:var(--g7);background:rgba(29,185,84,.13)}
  .uses{display:grid;gap:14px;grid-template-columns:1fr 1fr;padding:0;margin:0;list-style:none}
  @media(max-width:640px){.uses{grid-template-columns:1fr}}
  .uses li{display:flex;gap:13px;padding:16px 18px;align-items:flex-start;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
  .uses li:hover{transform:translateY(-3px);border-color:rgba(29,185,84,.4);box-shadow:0 10px 26px -14px rgba(16,40,30,.4)}
  .uses b{display:block;font-size:.96rem;margin-bottom:2px}
  .uses span{color:var(--mut);font-size:.88rem}
  .card{transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
  .card:hover{transform:translateY(-3px);box-shadow:0 10px 26px -14px rgba(16,40,30,.4)}
  .card:hover,.method:hover{border-color:rgba(29,185,84,.32)}
  .method{margin-bottom:16px;padding:24px}
  .method>.tag{margin-bottom:4px}
  .msub{color:var(--mut);font-size:.92rem;margin:.5rem 0 1.2rem}
  .steps{list-style:none;margin:0;padding:0;display:grid;gap:18px;position:relative}
  .steps li{display:flex;gap:14px;align-items:flex-start;position:relative}
  .steps li:not(:last-child)::after{content:"";position:absolute;left:13px;top:30px;bottom:-18px;width:2px;background:var(--line)}
  .steps .n{flex:0 0 auto;width:28px;height:28px;border-radius:50%;color:var(--ic-fg);
    background:rgba(29,185,84,.12);border:1px solid var(--line);
    font:800 .85rem/1 system-ui;display:flex;align-items:center;justify-content:center}
  .steps .body{flex:1;min-width:0;font-size:.95rem}
  .steps .body pre{margin-top:9px}
  .steps .body .btn{display:flex;width:fit-content;margin-top:10px}
  code.inl{background:rgba(29,185,84,.13);color:var(--g7);padding:1px 6px;border-radius:6px;font-size:.85em;font-weight:600;
    overflow-wrap:anywhere;word-break:break-word}
  .note{font-size:.86rem;color:var(--mut);margin-top:10px}
  .note + pre,.note + .codewrap{margin-top:9px}
  .tip{margin-top:16px;background:rgba(29,185,84,.06);border:1px solid var(--line);border-radius:12px;padding:13px 15px}
  .tip .note{margin:0}
  details{padding:2px 18px;margin-bottom:11px}
  details summary{cursor:pointer;font-weight:600;padding:15px 0;list-style:none;display:flex;align-items:center;gap:10px}
  details summary::-webkit-details-marker{display:none}
  details summary::after{content:"";margin-left:auto;width:9px;height:9px;border-right:2.5px solid var(--g7);
    border-bottom:2.5px solid var(--g7);transform:rotate(45deg);transition:transform .25s ease}
  details[open] summary::after{transform:rotate(-135deg)}
  details p{color:var(--mut);font-size:.92rem;margin:0 0 16px;padding-left:0}
  .star{margin-top:48px;text-align:center;padding:38px 24px;overflow:hidden;position:relative}
  .star::before{content:"";position:absolute;inset:-40% 0 auto;height:70%;
    background:radial-gradient(closest-side,rgba(29,185,84,.10),transparent);pointer-events:none}
  .star h2{margin:0 0 6px;position:relative;display:inline-flex;align-items:center;gap:9px;justify-content:center}
  .star h2 .i{color:var(--g7)}
  .star p{color:var(--mut);max-width:48ch;margin:0 auto 18px;position:relative}
  .star .btn{position:relative}
  footer{margin-top:42px;padding:20px 22px;color:var(--mut);font-size:.86rem;
    display:flex;gap:18px;flex-wrap:wrap;align-items:center}
  footer a{color:var(--g7);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
  footer a:hover{text-decoration:underline}
  .badges{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 4px}
  .badges img{height:20px;border-radius:4px}
  @media(max-width:640px){
    .wrap{padding:30px 15px 56px}
    header{flex-wrap:wrap;gap:12px}
    .hgrow{order:2;flex:1 1 100%}
    h1{font-size:1.4rem}
    h2{font-size:1.2rem;margin:34px 0 14px}
    .lead{font-size:1.05rem}
    .method{padding:18px 15px}
    .card{padding:18px}
    .tip{padding:11px 12px}
    .langsw{padding:6px 10px}
    .uses li,.feat li{padding:14px}
    .flow{flex-direction:column;align-items:stretch;overflow:visible;padding:16px}
    .flow .node{flex-direction:row;width:auto;align-items:center;gap:13px;text-align:left}
    .flow .node .ic{width:44px;height:44px;border-radius:13px}
    .flow .node .ic .i{width:22px;height:22px}
    .flow .node b{font-size:.95rem}
    .flow .node span{font-size:.8rem}
    .flow .wire{flex:0 0 auto;width:2px;height:20px;min-width:0;margin:3px 0 3px 21px;
      background:linear-gradient(var(--line),var(--g))}
    .flow .wire::after{content:none}
    .flow .wire .pkt{display:none}
  }
  @media(prefers-reduced-motion:no-preference){
    .js .reveal{opacity:0;transform:translateY(24px);
      transition:opacity .6s ease,transform .6s cubic-bezier(.2,.7,.2,1)}
    .js .reveal.in{opacity:1;transform:none}
    .hero-in{animation:rise2 .8s cubic-bezier(.2,.7,.2,1) both}
    @keyframes rise2{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
  }
</style></head>
<body>
<div class="blobs"><b></b><b></b></div>
<div class="wrap">

  <header class="hero-in">
    <span class="logo">${ICON_SVG}</span>
    <div class="hgrow">
      <h1>WebCake Storefront MCP</h1>
      <p class="sub">${t.sub}</p>
    </div>
    <div class="controls">
      <button class="iconbtn" id="theme" type="button" aria-label="Toggle theme" title="Theme">${icon("moon")}</button>
      <a class="langsw" href="${otherHref}" hreflang="${otherLang}" rel="alternate">${icon("globe")} ${t.switchLabel}</a>
    </div>
  </header>

  <p class="hero-in" style="display:flex;gap:9px;flex-wrap:wrap"><span class="pill"><span class="dot"></span> ${t.running}</span><span class="pill">~101 tools</span></p>

  <p class="lead hero-in">${t.leadPre}<b class="grad">${t.leadGrad}</b>${t.leadPost}</p>

  <div class="cta-row hero-in">
    <a class="btn" href="#connect">${icon("rocket")} ${t.ctaStart}</a>
    <a class="btn ghost" href="${GITHUB_URL}">${icon("star")} ${t.ctaStar}</a>
  </div>

  <div class="badges hero-in">
    <a href="${NPM_URL}" target="_blank" rel="noopener"><img src="https://img.shields.io/npm/v/webcake-storefront-mcp?label=npm&color=108B67" alt="npm version"></a>
    <a href="${NPM_URL}" target="_blank" rel="noopener"><img src="https://img.shields.io/npm/dm/webcake-storefront-mcp?color=3FBB57" alt="npm downloads"></a>
    <a href="${GITHUB_URL}/blob/main/LICENSE" target="_blank" rel="noopener"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
    <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener"><img src="https://img.shields.io/badge/Model_Context_Protocol-server-6E56CF" alt="MCP server"></a>
  </div>

  <nav class="nav" aria-label="${L === "en" ? "Sections" : "Mục lục"}">
    ${t.nav.map((n) => `<a href="${n.href}">${n.label}</a>`).join("\n    ")}
  </nav>

  <h2 id="flow" class="reveal">${t.flowH2}</h2>
  <div class="glass flow reveal">
    ${t.flow
      .map(
        (n, i) =>
          `<div class="node"><span class="ic" style="animation-delay:${(i * 0.8).toFixed(1)}s">${icon(n.icon)}</span><b>${n.t}</b><span>${n.s}</span></div>` +
          (i < t.flow.length - 1
            ? `<div class="wire"><i class="pkt" style="animation-delay:${(i * 0.8).toFixed(1)}s"></i></div>`
            : ""),
      )
      .join("\n    ")}
  </div>
  <p class="flow-cap reveal">${t.flowCap}</p>

  <h2 id="how" class="reveal">${t.howH2}</h2>
  <div class="grid">
    ${t.how
      .map(
        (h) =>
          `<div class="glass card reveal">${tile(h.icon)}<h3>${h.t}</h3><p>${h.d}</p></div>`,
      )
      .join("\n    ")}
  </div>

  <h2 id="build" class="reveal">${t.buildH2}</h2>
  <ul class="uses">
    ${t.uses
      .map(
        (u) =>
          `<li class="glass reveal">${tile(u.icon)}<div><b>${u.t}</b><span>${u.e}</span></div></li>`,
      )
      .join("\n    ")}
  </ul>

  <h2 id="connect" class="reveal">${t.connectH2}</h2>

  <div class="glass card method reveal">
    <span class="tag">${tile("terminal")} ${t.m1Tag}</span>
    <p class="msub">${t.m1Sub}</p>
    <ol class="steps">
      ${steps(t.m1Steps.map(fill))}
    </ol>
    <div class="tip"><p class="note">${t.m1Note}</p><pre>${INSTALL_ALL_CMD}</pre></div>
  </div>

  <div class="glass card method reveal">
    <span class="tag">${tile("link")} ${t.m2Tag}</span>
    <p class="msub">${t.m2Sub}</p>
    <ol class="steps">
      ${steps(t.m2Steps.map(fill))}
    </ol>
    <p class="note">${t.m2Note}</p>
  </div>

  <h2 id="tools" class="reveal">${t.toolsH2}</h2>
  <p class="flow-cap reveal" style="margin-bottom:16px">${t.toolsSub}</p>
  <div class="grid-3">
    ${t.toolGroups
      .map(
        (g) =>
          `<div class="glass card reveal">${tile(g.icon)}<h3>${g.t}</h3><p>${g.d}</p></div>`,
      )
      .join("\n    ")}
  </div>

  <h2 class="reveal">${t.promptH2}</h2>
  <p class="flow-cap reveal" style="margin-bottom:12px">${t.promptSub}</p>
  <ul class="feat">
    <li class="glass reveal">${tile("wand")} <span><pre style="background:transparent;color:inherit;border:none;padding:0;font-size:.88rem;white-space:pre-wrap">${t.promptEx}</pre></span></li>
  </ul>

  <h2 id="faq" class="reveal">${t.faqH2}</h2>
  ${faq.map((f) => `<details class="glass reveal"><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n  ")}

  <div class="glass star reveal">
    <h2>${icon("star")} ${t.starH2}</h2>
    <p>${t.starP}</p>
    <a class="btn" href="${GITHUB_URL}">${icon("github")} ${t.starBtn}</a>
  </div>

  <footer class="glass">
    <span>Endpoint: <code class="inl">${endpoint}</code></span>
    <a href="${DOCS_URL}">${icon("book")} ${t.footGuide}</a>
    <a href="${GITHUB_URL}">${icon("github")} GitHub</a>
    <a href="${NPM_URL}">${icon("package")} npm</a>
    <a href="${selfPath === "/" ? "/health" : "/health"}">Health</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </footer>

</div>
<script>
(function(){
  var COPY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var DONE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  function copyText(t){
    if(navigator.clipboard&&navigator.clipboard.writeText){return navigator.clipboard.writeText(t);}
    return new Promise(function(res,rej){try{var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);res();}catch(e){rej(e);}});
  }
  document.querySelectorAll('pre').forEach(function(pre){
    var w=document.createElement('div');w.className='codewrap';
    pre.parentNode.insertBefore(w,pre);w.appendChild(pre);
    var b=document.createElement('button');b.type='button';b.className='copy';b.title='Copy';b.setAttribute('aria-label','Copy');b.innerHTML=COPY;
    b.addEventListener('click',function(){
      copyText(pre.innerText).then(function(){b.classList.add('done');b.innerHTML=DONE;setTimeout(function(){b.classList.remove('done');b.innerHTML=COPY;},1400);}).catch(function(){});
    });
    w.appendChild(b);
  });

  var SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  var MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  var html=document.documentElement,tBtn=document.getElementById('theme');
  function effective(){return html.getAttribute('data-theme')||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}
  function paint(){if(tBtn)tBtn.innerHTML=effective()==='dark'?SUN:MOON;}
  paint();
  if(tBtn)tBtn.addEventListener('click',function(){var next=effective()==='dark'?'light':'dark';html.setAttribute('data-theme',next);try{localStorage.setItem('wc-theme',next);}catch(e){}paint();});

  var SKEY='wc-scroll:'+location.pathname+location.search;
  try{var y=sessionStorage.getItem(SKEY);if(y!==null)window.scrollTo(0,parseFloat(y)||0);}catch(e){}
  function saveScroll(){try{sessionStorage.setItem(SKEY,String(window.scrollY));}catch(e){}}
  window.addEventListener('beforeunload',saveScroll);
  window.addEventListener('pagehide',saveScroll);

  var reveals=[].slice.call(document.querySelectorAll('.reveal'));
  if(window.IntersectionObserver&&reveals.length){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}});
    },{rootMargin:'0px 0px -8% 0px'});
    reveals.forEach(function(el){io.observe(el);});
  }else{
    reveals.forEach(function(el){el.classList.add('in');});
  }

  window.addEventListener('load',function(){requestAnimationFrame(function(){html.classList.add('smooth');});});

  var navLinks={};
  document.querySelectorAll('.nav a').forEach(function(a){navLinks[a.getAttribute('href').slice(1)]=a;});
  var spySecs=[].slice.call(document.querySelectorAll('h2[id]'));
  var spyTick=false;
  function spy(){
    spyTick=false;var cur=null;
    spySecs.forEach(function(s){if(s.getBoundingClientRect().top<=96)cur=s.id;});
    Object.keys(navLinks).forEach(function(id){navLinks[id].classList.toggle('active',id===cur);});
  }
  if(spySecs.length&&Object.keys(navLinks).length){
    window.addEventListener('scroll',function(){if(!spyTick){spyTick=true;requestAnimationFrame(spy);}},{passive:true});
    spy();
  }
})();
</script>
</body></html>`;
}

/**
 * Social card SVG — 1200x630 for og:image / twitter:image.
 * Served at /og.svg by http.ts.
 */
export function ogImageSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0d1411"/><stop offset="1" stop-color="#102a1c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(960 70) rotate(130) scale(620)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1DB954" stop-opacity="0.40"/><stop offset="1" stop-color="#1DB954" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(90 96)">
    <svg x="0" y="0" width="80" height="80" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="url(#sg2)"/>
      <defs><linearGradient id="sg2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#3FBB57"/>
        <stop offset="100%" stop-color="#108B67"/>
      </linearGradient></defs>
      <text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="17" fill="white">S</text>
      <circle cx="24" cy="9" r="4" fill="#FFD591"/>
    </svg>
    <text x="100" y="42" fill="#ffffff" font-size="40" font-weight="800" letter-spacing="-1">WebCake Storefront MCP</text>
    <text x="100" y="74" fill="#7fe0a0" font-size="22" font-weight="600">Model Context Protocol · AI storefront builder · ~101 tools</text>
  </g>
  <text x="90" y="300" fill="#ffffff" font-size="64" font-weight="800" letter-spacing="-2">Describe a store page —</text>
  <text x="90" y="380" fill="#ffffff" font-size="64" font-weight="800" letter-spacing="-2">AI builds it, validates it,</text>
  <text x="90" y="460" fill="#1DB954" font-size="64" font-weight="800" letter-spacing="-2">publishes it.</text>
  <text x="90" y="534" fill="#9fb1a8" font-size="28" font-weight="500">BuilderX component model · dry-run safe · surgical edits</text>
  <g transform="translate(90 560)">
    <rect width="540" height="52" rx="12" fill="#1DB954"/>
    <text x="270" y="34" fill="#ffffff" font-size="22" font-weight="700" text-anchor="middle">npx -y webcake-storefront-mcp install</text>
  </g>
  <text x="1110" y="600" fill="#5b6b63" font-size="22" font-weight="600" text-anchor="end">github.com/vuluu2k/webcake-storefront-mcp</text>
</svg>`;
}

/**
 * Favicon SVG — the branded "S" mark with yellow dot.
 * Served at /favicon.svg and /favicon.ico by http.ts.
 */
export function faviconSvg(): string {
  return ICON_SVG;
}

/**
 * landingHtml(origin, lang?) — kept for backward compatibility.
 * Delegates to the bilingual guideHtml().
 */
export function landingHtml(origin = "", lang?: Lang): string {
  return guideHtml(origin, normalizeLang(lang));
}

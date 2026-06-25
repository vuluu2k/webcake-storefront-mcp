// High-level, palette-aware PAGE & CHROME templates.
//
// The low-level builders (new_section/new_element/new_row -> buildSection/buildRow/
// buildElement) are flexible but leave the AI to hand-compose every node, so generated
// store pages end up bare. These templates encode the per-page recipes from the BUILD_GUIDE
// as ready-to-save `{ sections: [...] }` sources that already look like a real shop:
// styled headings, breadcrumbs, 2-column product detail, styled product-grid cards, trust
// badges, an order summary, and a designed header/footer.
//
// Everything is built through buildSection/buildRow so the output is the same runtime shape
// the builder emits; finalizeForRender() (called by the tools) expands it to bp1..bp4.
//
// Colours use the site theme CSS vars by default (var(--color_02) accent, var(--color_00)
// text) so a generated site matches whatever palette the theme already defines; callers can
// override any slot via a Palette object.

import { buildSection, walk } from "./page.js";
import { normalizeEvents } from "./events.js";

export interface Palette {
  /** Primary brand / accent — buttons, prices, active links. */
  accent?: string;
  /** Text on top of the accent colour (button labels). */
  onAccent?: string;
  /** Headings + body text. */
  text?: string;
  /** Secondary / muted text. */
  muted?: string;
  /** Page / card background. */
  surface?: string;
  /** Alternating band background (gives sections rhythm). */
  surfaceAlt?: string;
  /** Hairline borders (cards, dividers, inputs). */
  border?: string;
}

const DEFAULT_PALETTE: Required<Palette> = {
  accent: "var(--color_02)",
  onAccent: "#ffffff",
  text: "var(--color_00)",
  muted: "#6b7280",
  surface: "#ffffff",
  surfaceAlt: "#f7f5f2",
  border: "#e8e3dc",
};

export function resolvePalette(p: Palette = {}): Required<Palette> {
  return { ...DEFAULT_PALETTE, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null)) };
}

// ---------------------------------------------------------------------------
// small spec helpers (return element specs for buildSection/buildRow children)
// ---------------------------------------------------------------------------

const heading = (text: string, opts: { tag?: string; size?: number; weight?: number; color?: string; align?: string } = {}) => ({
  type: "text",
  opts: {
    text,
    specials: { tag: opts.tag || "h2" },
    style: {
      fontSize: `${opts.size ?? 30}px`,
      fontWeight: String(opts.weight ?? 700),
      color: opts.color,
      textAlign: opts.align,
      lineHeight: "1.25",
    },
  },
});

const paragraph = (text: string, p: Required<Palette>, opts: { size?: number; align?: string; color?: string } = {}) => ({
  type: "text",
  opts: {
    text,
    style: {
      fontSize: `${opts.size ?? 16}px`,
      fontWeight: "400",
      color: opts.color || p.muted,
      textAlign: opts.align,
      lineHeight: "1.6",
    },
  },
});

/** Accent CTA button. `navTo` is a slug sentinel the scaffolder resolves to a real
 *  open_page event once all pages exist (see wireNavigation). The sentinel rides INSIDE an
 *  events entry because the button factory keeps opts.events but drops arbitrary specials. */
const cta = (text: string, p: Required<Palette>, opts: { navTo?: string; events?: any[]; height?: number; full?: boolean } = {}) => ({
  type: "button",
  opts: {
    text,
    ...(opts.events || opts.navTo ? { events: [...(opts.events || []), ...(opts.navTo ? [{ action: "open_page", _navTo: opts.navTo }] : [])] } : {}),
    style: {
      background: p.accent,
      color: p.onAccent,
      borderRadius: "10px",
      height: opts.height ?? 50,
      fontWeight: "600",
      fontSize: "16px",
      paddingLeft: "28px",
      paddingRight: "28px",
      ...(opts.full ? { width: "100%" } : {}),
      textAlign: "center",
    },
  },
});

const outlineBtn = (text: string, p: Required<Palette>, opts: { navTo?: string; height?: number } = {}) => ({
  type: "button",
  opts: {
    text,
    ...(opts.navTo ? { events: [{ action: "open_page", _navTo: opts.navTo }] } : {}),
    style: {
      background: "transparent",
      color: p.accent,
      border: `1px solid ${p.accent}`,
      borderRadius: "10px",
      height: opts.height ?? 48,
      fontWeight: "600",
      fontSize: "15px",
      paddingLeft: "24px",
      paddingRight: "24px",
      textAlign: "center",
    },
  },
});

/** A small "icon + label" trust badge (free shipping, authentic, support…). */
const trustBadge = (icon: string, label: string, p: Required<Palette>) => ({
  type: "container",
  layout: "row",
  columnGap: 10,
  colWidths: [{ unit: "px", absValue: 30 }, { unit: "fr", value: 1 }],
  collapse: { bp4: 2 },
  children: [
    { type: "text", opts: { text: icon, style: { fontSize: "22px", lineHeight: "1.2" } } },
    { type: "text", opts: { text: label, style: { fontSize: "13px", fontWeight: "600", color: p.text, lineHeight: "1.3" } } },
  ],
});

/** A styled product grid card config that looks like a real shop, not a bare list. */
const productGrid = (p: Required<Palette>, columns = 4) => ({
  type: "grid-product",
  opts: {
    config: {
      columns,
      image_ratio: "1/1",
      img_object_fit: "cover",
      gap_column: 24,
      gap_row: 32,
      cardBorderRadius: 14,
      cardBoxShadow: "0 6px 22px rgba(0,0,0,0.06)",
      cardPadding: 12,
      cardBackground: p.surface,
      productNameColor: p.text,
      productPriceColor: p.accent,
      showAddToCart: true,
    },
  },
});

/** Dataset text bound to a product field (name/price/description). */
const productField = (field: string, style: any) => ({
  type: "text-dataset",
  opts: {
    bindings: [{ id: "BINDING" + Math.random().toString(36).slice(2, 8), name: "product", target: `product::${field}` }],
    style,
  },
});

const sectionStyle = (p: Required<Palette>, bg?: string, padY = 64) => ({
  style: { background: bg, paddingTop: padY, paddingBottom: padY, paddingLeft: 20, paddingRight: 20 },
});

// ---------------------------------------------------------------------------
// STORE PAGE templates -> { sections: [...] }
// ---------------------------------------------------------------------------

export function categoryPageSource(p: Required<Palette>, opts: { title?: string; subtitle?: string } = {}) {
  const banner = buildSection(
    [
      { type: "breadcrumb", opts: { style: { fontSize: "13px", color: p.muted } } },
      heading(opts.title || "Tất cả sản phẩm", { tag: "h1", size: 40, color: p.text, align: "center" }),
      paragraph(opts.subtitle || "Khám phá bộ sưu tập của chúng tôi", p, { align: "center", size: 17 }),
    ],
    { ...sectionStyle(p, p.surfaceAlt, 56), rowGap: 12 },
  );
  const grid = buildSection([productGrid(p, 4)], sectionStyle(p, p.surface, 56));
  return { sections: [banner, grid] };
}

export function productPageSource(p: Required<Palette>) {
  const breadcrumbRow = buildSection(
    [{ type: "breadcrumb", opts: { style: { fontSize: "13px", color: p.muted } } }],
    { ...sectionStyle(p, p.surface, 24) },
  );

  const infoColumn = {
    type: "container",
    children: [
      productField("product_name", { fontSize: "30px", fontWeight: "700", color: p.text, lineHeight: "1.25" }),
      productField("product_price", { fontSize: "26px", fontWeight: "700", color: p.accent }),
      productField("product_description", { fontSize: "15px", fontWeight: "400", color: p.muted, lineHeight: "1.6" }),
      { type: "quantity-input", opts: { style: { borderColor: p.border, borderRadius: "8px" } } },
      cta("Thêm vào giỏ", p, { full: true, height: 52, events: [{ action: "add_to_cart", open_page: "cart" }] }),
      {
        type: "container",
        layout: "row",
        columnGap: 16,
        collapse: { bp4: 1 },
        children: [
          trustBadge("🚚", "Miễn phí giao hàng", p),
          trustBadge("✅", "Hàng chính hãng", p),
          trustBadge("↩️", "Đổi trả 7 ngày", p),
        ],
      },
    ],
  };

  const detail = buildSection(
    [
      {
        type: "container",
        layout: "row",
        columnGap: 48,
        colWidths: [{ unit: "fr", value: 1 }, { unit: "fr", value: 1 }],
        collapse: { bp3: 1, bp4: 1 },
        children: [{ type: "product-gallery", opts: { style: { borderRadius: "14px" } } }, infoColumn],
      },
    ],
    sectionStyle(p, p.surface, 32),
  );

  const related = buildSection(
    [heading("Sản phẩm liên quan", { tag: "h2", size: 26, color: p.text, align: "center" }), productGrid(p, 4)],
    { ...sectionStyle(p, p.surfaceAlt, 56), rowGap: 24 },
  );

  return { sections: [breadcrumbRow, detail, related] };
}

export function cartPageSource(p: Required<Palette>) {
  const summary = {
    type: "container",
    opts: { style: { background: p.surfaceAlt, borderRadius: "14px", padding: "24px", border: `1px solid ${p.border}` } },
    children: [
      heading("Tóm tắt đơn hàng", { tag: "h3", size: 20, color: p.text }),
      paragraph("Phí vận chuyển và mã giảm giá sẽ được tính ở bước thanh toán.", p, { size: 14 }),
      cta("Tiến hành thanh toán", p, { full: true, height: 52, navTo: "checkout" }),
      outlineBtn("Tiếp tục mua sắm", p, { navTo: "home" }),
    ],
  };
  const body = buildSection(
    [
      heading("Giỏ hàng của bạn", { tag: "h1", size: 34, color: p.text }),
      {
        type: "container",
        layout: "row",
        columnGap: 40,
        colWidths: [{ unit: "fr", value: 2 }, { unit: "fr", value: 1 }],
        collapse: { bp3: 1, bp4: 1 },
        children: [{ type: "cart-items", opts: {} }, summary],
      },
    ],
    { ...sectionStyle(p, p.surface, 48), rowGap: 24 },
  );
  return { sections: [body] };
}

export function checkoutPageSource(p: Required<Palette>) {
  const form = {
    type: "form",
    opts: { specials: { type: "form_order" }, style: { background: p.surface } },
    children: [
      { type: "input", opts: { specials: { field_name: "full_name", label: "Họ và tên", placeholder: "Nguyễn Văn A", required: true, show_label: true }, style: { borderColor: p.border, borderRadius: "8px" } } },
      { type: "phone-number", opts: { specials: { field_name: "phone_number", label: "Số điện thoại", required: true, show_label: true }, style: { borderColor: p.border, borderRadius: "8px" } } },
      { type: "address", opts: { specials: { field_name: "address", label: "Địa chỉ nhận hàng", show_label: true }, style: { borderColor: p.border, borderRadius: "8px" } } },
      { type: "text-area", opts: { specials: { field_name: "note", label: "Ghi chú", show_label: true }, style: { borderColor: p.border, borderRadius: "8px" } } },
      { type: "submit-button", opts: { text: "Đặt hàng", style: { background: p.accent, color: p.onAccent, borderRadius: "10px", height: 52, fontWeight: "600", width: "100%", textAlign: "center" } } },
    ],
  };
  const summary = {
    type: "container",
    opts: { style: { background: p.surfaceAlt, borderRadius: "14px", padding: "24px", border: `1px solid ${p.border}` } },
    children: [heading("Đơn hàng của bạn", { tag: "h3", size: 20, color: p.text }), { type: "cart-items", opts: {} }],
  };
  const body = buildSection(
    [
      heading("Thanh toán", { tag: "h1", size: 34, color: p.text }),
      {
        type: "container",
        layout: "row",
        columnGap: 40,
        colWidths: [{ unit: "fr", value: 3 }, { unit: "fr", value: 2 }],
        collapse: { bp3: 1, bp4: 1 },
        children: [form, summary],
      },
    ],
    { ...sectionStyle(p, p.surface, 48), rowGap: 24 },
  );
  return { sections: [body] };
}

export function thankYouPageSource(p: Required<Palette>) {
  const body = buildSection(
    [
      heading("🎉", { tag: "h2", size: 56, align: "center" }),
      heading("Cảm ơn bạn đã đặt hàng!", { tag: "h1", size: 34, color: p.text, align: "center" }),
      paragraph("Chúng tôi đã nhận được đơn hàng của bạn và sẽ liên hệ xác nhận trong thời gian sớm nhất.", p, { align: "center", size: 17 }),
      { type: "order-items", opts: {} },
      cta("Tiếp tục mua sắm", p, { navTo: "home" }),
    ],
    { ...sectionStyle(p, p.surface, 64), rowGap: 18 },
  );
  return { sections: [body] };
}

// ---------------------------------------------------------------------------
// HEADER / FOOTER chrome (designed global sections)
// ---------------------------------------------------------------------------

export interface NavLink {
  label: string;
  /** slug sentinel resolved to an open_page event by the scaffolder, or 'home'. */
  navTo?: string;
  /** external url (open_link) */
  url?: string;
}

export function headerSection(opts: { brand?: string; links?: NavLink[]; palette?: Palette; cta?: string } = {}) {
  const p = resolvePalette(opts.palette);
  const links = opts.links && opts.links.length ? opts.links : [
    { label: "Trang chủ", navTo: "home" },
    { label: "Sản phẩm", navTo: "collections" },
    { label: "Giỏ hàng", navTo: "cart" },
  ];
  const logo = { type: "text", opts: { text: opts.brand || "Shop", specials: { tag: "h2" }, style: { fontSize: "24px", fontWeight: "800", color: p.text } } };
  const nav = {
    type: "container",
    layout: "row",
    columnGap: 28,
    collapse: { bp4: 3 },
    children: links.map((l) => ({
      type: "text",
      opts: {
        text: l.label,
        ...(l.navTo || l.url ? { specials: { ...(l.navTo ? { _navTo: l.navTo } : {}), ...(l.url ? { _navUrl: l.url } : {}) } } : {}),
        style: { fontSize: "15px", fontWeight: "600", color: p.text, cursor: "pointer" },
      },
    })),
  };
  const actions = {
    type: "container",
    layout: "row",
    columnGap: 16,
    colWidths: [{ unit: "px", absValue: 32 }, { unit: "max-c" } as any],
    collapse: { bp4: 2 },
    children: [
      { type: "cart-icon", opts: { config: { color: p.text }, style: { width: 26, height: 26 } } },
      cta(opts.cta || "Đặt mua ngay", p, { navTo: "collections", height: 44 }),
    ],
  };
  return buildSection(
    [
      {
        type: "container",
        layout: "row",
        columnGap: 24,
        colWidths: [{ unit: "max-c" } as any, { unit: "fr", value: 1 }, { unit: "max-c" } as any],
        collapse: { bp4: 1 },
        children: [logo, nav, actions],
      },
    ],
    { style: { background: p.surface, paddingTop: 16, paddingBottom: 16, paddingLeft: 20, paddingRight: 20, borderBottom: `1px solid ${p.border}` } },
  );
}

export function footerSection(opts: { brand?: string; tagline?: string; columns?: { title: string; links: string[] }[]; contact?: { phone?: string; email?: string; address?: string }; palette?: Palette } = {}) {
  const p = resolvePalette(opts.palette);
  const brandCol = {
    type: "container",
    children: [
      { type: "text", opts: { text: opts.brand || "Shop", specials: { tag: "h3" }, style: { fontSize: "20px", fontWeight: "800", color: "#fff" } } },
      { type: "text", opts: { text: opts.tagline || "Cảm ơn bạn đã ghé thăm cửa hàng.", style: { fontSize: "14px", color: "rgba(255,255,255,0.7)", lineHeight: "1.6" } } },
    ],
  };
  const linkCols = (opts.columns && opts.columns.length ? opts.columns : [
    { title: "Cửa hàng", links: ["Trang chủ", "Sản phẩm", "Giỏ hàng"] },
    { title: "Hỗ trợ", links: ["Chính sách đổi trả", "Giao hàng", "Liên hệ"] },
  ]).map((col) => ({
    type: "container",
    children: [
      { type: "text", opts: { text: col.title, style: { fontSize: "15px", fontWeight: "700", color: "#fff" } } },
      ...col.links.map((t) => ({ type: "text", opts: { text: t, style: { fontSize: "14px", color: "rgba(255,255,255,0.7)", lineHeight: "2" } } })),
    ],
  }));
  const c = opts.contact || {};
  const contactCol = {
    type: "container",
    children: [
      { type: "text", opts: { text: "Liên hệ", style: { fontSize: "15px", fontWeight: "700", color: "#fff" } } },
      ...(c.phone ? [{ type: "text", opts: { text: `📞 ${c.phone}`, style: { fontSize: "14px", color: "rgba(255,255,255,0.7)", lineHeight: "2" } } }] : []),
      ...(c.email ? [{ type: "text", opts: { text: `✉️ ${c.email}`, style: { fontSize: "14px", color: "rgba(255,255,255,0.7)", lineHeight: "2" } } }] : []),
      ...(c.address ? [{ type: "text", opts: { text: `📍 ${c.address}`, style: { fontSize: "14px", color: "rgba(255,255,255,0.7)", lineHeight: "1.6" } } }] : []),
    ],
  };
  const topRow = {
    type: "container",
    layout: "row",
    columnGap: 40,
    colWidths: [{ unit: "fr", value: 2 }, { unit: "fr", value: 1 }, { unit: "fr", value: 1 }, { unit: "fr", value: 1 }],
    collapse: { bp3: 2, bp4: 1 },
    children: [brandCol, ...linkCols, contactCol],
  };
  const copyright = { type: "text", opts: { text: `© ${opts.brand || "Shop"}. All rights reserved.`, style: { fontSize: "13px", color: "rgba(255,255,255,0.5)", textAlign: "center" } } };
  return buildSection([topRow, copyright], {
    style: { background: "#1c1917", paddingTop: 56, paddingBottom: 32, paddingLeft: 20, paddingRight: 20 },
    rowGap: 32,
  });
}

// ---------------------------------------------------------------------------
// registry the scaffolder iterates
// ---------------------------------------------------------------------------

/**
 * Resolve the `_navTo` / `_navUrl` sentinels the templates leave on buttons/links into real
 * open_page / open_link events, now that every page exists and we know its id. `slugToId`
 * maps a page slug (e.g. "checkout", "cart", "collections") to its page id; the special
 * slug "home" maps to the homepage id. Returns the number of nodes wired so the caller can
 * skip re-saving an unchanged page. Run on the raw source BEFORE finalizeForRender.
 */
export function wireNavigation(source: any, slugToId: Record<string, string>): number {
  let wired = 0;
  const resolve = (slug: string) => slugToId[slug] || slugToId[slug.replace(/^\//, "")];
  walk(source, (node: any) => {
    // (a) text links carry the sentinel in specials (the text factory keeps it).
    const sp = node && node.specials;
    if (sp && sp._navTo) {
      const id = resolve(sp._navTo);
      if (id) { node.events = normalizeEvents([{ action: "open_page", open_page_id: id }], node.type); wired++; }
      delete sp._navTo;
    }
    if (sp && sp._navUrl) {
      node.events = normalizeEvents([{ action: "open_link", link_target: sp._navUrl, link_target_url: sp._navUrl }], node.type);
      delete sp._navUrl;
      wired++;
    }
    // (b) buttons carry the sentinel inside an events entry (the button factory keeps events
    //     but drops arbitrary specials). Resolve _navTo -> open_page_id in place; drop the
    //     event entirely if its target page doesn't exist so we never emit a dead open_page.
    if (Array.isArray(node && node.events) && node.events.length) {
      node.events = node.events
        .map((e: any) => {
          if (e && e._navTo) {
            const id = resolve(e._navTo);
            const { _navTo, ...rest } = e;
            if (!id) return null;
            wired++;
            return { ...rest, open_page_id: id };
          }
          return e;
        })
        .filter(Boolean);
    }
  });
  return wired;
}

export const STORE_PAGE_TEMPLATES: Array<{ name: string; slug: string; build: (p: Required<Palette>) => any }> = [
  { name: "Category Page", slug: "collections", build: categoryPageSource },
  { name: "Product Page", slug: "products", build: productPageSource },
  { name: "Cart Page", slug: "cart", build: cartPageSource },
  { name: "Checkout Page", slug: "checkout", build: checkoutPageSource },
  { name: "Thank You Page", slug: "complete", build: thankYouPageSource },
];

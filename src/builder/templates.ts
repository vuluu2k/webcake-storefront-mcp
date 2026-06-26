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
import { buildElement } from "./catalog.js";
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

// Slots map onto the site theme's 5×5 colour matrix, surfaced as CSS vars var(--color_RC)
// (R=row, C=col). Row 0 is greyscale (00=white … 04=black); row 2 is the BRAND row. Using
// var(--color_00) for text was a bug — that's WHITE (invisible on the white surface).
const DEFAULT_PALETTE: Required<Palette> = {
  accent: "var(--color_20)", // brand primary (row 2)
  onAccent: "var(--color_00)", // white — label on the accent button
  text: "var(--color_04)", // black — headings + body
  muted: "var(--color_03)", // dark grey — secondary text
  surface: "var(--color_00)", // white — page/card background
  surfaceAlt: "var(--color_01)", // light grey — alternating band
  border: "var(--color_01)", // hairline borders
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

/** A product-grid card config matching real designer templates. grid-product self-renders
 *  image + name + price; the factory now ships the real designer defaults (image_ratio 4/5,
 *  products_per_load 36, gap_column 30/gap_row 15, bold price, show original/discount price),
 *  so here we only set the column count + the price accent colour from the palette. */
const productGrid = (p: Required<Palette>, columns = 4) => ({
  type: "grid-product",
  opts: {
    config: {
      columns,
      productPriceColor: p.accent,
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
  // form_order config keys mirror real designer templates: input background, placeholder
  // colour, label colour/gap, input padding. The success event (eventName defaults to
  // "success" for a form) redirects to the Thank-you page once it exists (navTo sentinel).
  const fieldStyle = { borderColor: p.border, borderRadius: "8px" };
  const formConfig = {
    backgroundInput: "#ffffff",
    placeholderColor: p.muted,
    labelColor: p.text,
    labelMarginBottom: 8,
    textPadding: 15,
    columnGap: 15,
    rowGap: 15,
  };
  const form = {
    type: "form",
    opts: {
      specials: { type: "form_order" },
      config: formConfig,
      events: [{ action: "open_page", _navTo: "complete" }],
      style: { background: p.surface },
    },
    children: [
      { type: "input", opts: { specials: { field_name: "full_name", label: "Họ và tên", placeholder: "Nguyễn Văn A", required: true, show_label: true }, config: formConfig, style: fieldStyle } },
      { type: "phone-number", opts: { specials: { field_name: "phone_number", label: "Số điện thoại", placeholder: "09xx xxx xxx", required: true, show_label: true }, config: formConfig, style: fieldStyle } },
      { type: "email", opts: { specials: { field_name: "email", label: "Email", placeholder: "email@example.com", show_label: true }, config: formConfig, style: fieldStyle } },
      { type: "address", opts: { specials: { field_name: "address", label: "Địa chỉ nhận hàng", show_label: true }, config: formConfig, style: fieldStyle } },
      { type: "text-area", opts: { specials: { field_name: "note", label: "Ghi chú", placeholder: "Ghi chú cho đơn hàng (tuỳ chọn)", show_label: true }, config: formConfig, style: fieldStyle } },
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
  // Real designer templates use a `menu` of `menu-item`s, NOT text links — and a menu-item's
  // navigation lives in its SPECIALS (linkType/linkPage/pageId), not events. We build the
  // items directly (via buildElement, so buildFromSpec doesn't grid-stack the menu) and leave
  // a _navTo sentinel that wireNavigation resolves into linkType:"page" + page ids.
  const menuItems = links.map((l) =>
    buildElement("menu-item", {
      specials: { name: l.label, ...(l.navTo ? { _navTo: l.navTo } : {}), ...(l.url ? { _navUrl: l.url } : {}) },
    }),
  );
  const nav = {
    type: "menu",
    opts: {
      specials: { type: "horizontal", sync: false, fullField: false },
      config: { showArrow: true, textColor: p.text, colorHover: p.accent, "--padX": "15px", justifyContent: "center", fontSize: "15px", fontWeight: "600" },
      children: menuItems,
    },
  };
  const actions = {
    type: "container",
    layout: "row",
    columnGap: 16,
    colWidths: [{ unit: "px", absValue: 32 }, { unit: "max-c" } as any],
    collapse: { bp4: 2 },
    children: [
      { type: "cart-icon", opts: { style: { width: 26, height: 26, color: p.text } } },
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
  const isMenuItem = (t: string) => t === "menu-item" || t === "menu-anchor-item";
  walk(source, (node: any) => {
    // (a) elements carry the sentinel in specials (text/menu-item factories keep specials).
    const sp = node && node.specials;
    if (sp && sp._navTo) {
      const id = resolve(sp._navTo);
      if (id) {
        // A menu-item navigates via SPECIALS (linkType/linkPage/pageId), like real templates;
        // every other element navigates via an events open_page entry.
        if (isMenuItem(node.type)) { sp.linkType = "page"; sp.linkPage = id; sp.pageId = id; }
        else node.events = normalizeEvents([{ action: "open_page", open_page_id: id }], node.type);
        wired++;
      }
      delete sp._navTo;
    }
    if (sp && sp._navUrl) {
      if (isMenuItem(node.type)) { sp.linkType = "custom"; sp.isCustom = true; sp.link = sp._navUrl; }
      else node.events = normalizeEvents([{ action: "open_link", link_target: sp._navUrl, link_target_url: sp._navUrl }], node.type);
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

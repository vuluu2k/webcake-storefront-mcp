// Native-first policy. Pages are meant to be edited by dragging elements on the BuilderX canvas;
// UI written in custom code doesn't exist on that canvas, so the shop owner can't touch it and
// every visit pays for it. This module holds what an AI must try before code (taught by the build
// guide, the custom-code guide and the block messages) and the checks every code writer goes through.

/** Everyday storefront needs → the catalog elements that already do them. test/native-first keeps
 *  every name here honest against the catalog. */
export const NATIVE_ALTERNATIVES: { need: string; elements: string[]; note?: string }[] = [
  { need: "Banners, text, images, cards, sections", elements: ["section", "container", "text", "image", "button", "rectangle"] },
  { need: "Header, footer, menus", elements: ["menu", "member-bar", "dropdown"], note: "save as a global section" },
  { need: "Product lists, category tiles", elements: ["grid-product", "slider-product", "grid-category", "slider-category"] },
  { need: "Category filters and sorting", elements: ["checkbox-group", "color-group", "two-point-range", "radio-group", "tags", "dropdown"], note: "specials.filter_elements drives the grid" },
  { need: "Product detail", elements: ["product-gallery", "product-image-carousel", "attr", "quantity-input", "product-review", "masonry-review"] },
  { need: "Cart, including a slide-out cart", elements: ["cart-icon", "cart-items", "cart-droppable", "cart-items-empty", "bonus-items"] },
  { need: "Checkout", elements: ["form", "address", "payment", "delivery-method", "order-items", "coupon"], note: "form.specials.type = form_order" },
  { need: "Login, signup, account", elements: ["form", "member-bar", "order-history", "customer-address", "reward-point"], note: "form_login / form_signup / order_tracking" },
  { need: "Wishlist", elements: ["favorite-icon", "wishlist", "wishlist-container", "wishlist-item", "wishlist-empty"] },
  { need: "Search", elements: ["search-form", "search-droppable", "input-search"] },
  { need: "Promotions, flash sale, countdown", elements: ["flash-sale", "countdown", "promotions", "promotions-short", "coupon", "lucky-wheel"] },
  { need: "Sliders, tabs, accordions, galleries", elements: ["swiper", "carousel", "tabs", "collapse", "gallery"] },
  { need: "Popups, size charts", elements: ["popup", "table"], note: "open with an open_popup event" },
  { need: "Video, maps", elements: ["video", "googlemap"] },
  { need: "Blog", elements: ["post-list", "slider-post", "grid-blog"] },
];

export const SITE_CODE_FIELDS = ["code_before_head", "code_before_body", "code_custom_javascript", "code_custom_css"] as const;
const SCRIPT_FIELDS = ["code_before_head", "code_before_body", "code_custom_javascript"];
const CSS_FIELDS = ["code_custom_css"];

/** Site-wide, in chars. Above `soft` a write must name its native gap; crossing `hard` is refused. */
export const CODE_BUDGET = {
  script: { soft: 30_000, hard: 100_000 },
  css: { soft: 20_000, hard: 50_000 },
};
/** custom_css + embed code across one page or global source. */
export const NODE_CODE_BUDGET = { soft: 10_000, hard: 30_000 };

export const NATIVE_FIRST_GUIDE = `## NATIVE FIRST — elements on the canvas before any code
Pages are edited by dragging elements on the canvas. UI written in code is not on that canvas: the
shop owner can't edit it, it is missing from the page HTML until scripts run, and it loads on every
page. Go down this list and stop at the FIRST step that works:
1. A NATIVE ELEMENT — list_elements / get_element (table below).
2. THE ELEMENT'S OWN SETTINGS — runtime.style/config, responsive overrides, events (hover, click,
   open_popup, filter…), bindings (live product/cart/order/post data), runtime.config.animation,
   position:"sticky"/"pinned". Most "this needs CSS/JS" ideas stop here.
3. AN EXISTING APP — list_apps / install_app (product_review, appointment, affiliates, course, automation…).
4. ONLY for a feature none of the above can do (a size advisor, mix & match, a custom quiz…) —
   custom code COMBINED WITH THE CMS APP, so it stays small:
   a. install_app "cms".
   b. DATA goes in a collection (create_collection), never hard-coded in a script.
   c. LOGIC goes in an HTTP function (edit_http_function action "add" + webcake-data, test with run_function).
   d. UI stays NATIVE elements, marked with specials.custom_class.
   e. Custom code is only the glue: load webcake-fn once in code_before_head
      (<script src="https://cdn.jsdelivr.net/npm/webcake-fn/dist/webcake-fn.umd.min.js"></script>),
      then read through it and write into those native elements:
      api.get_SizeAdvice({ height }).then((r) => {
        document.querySelector(".size-result p").textContent = r.size;
      });
5. Third-party snippets (tracking, chat, a widget): the smallest code_before_head / embed that works.
   A visual detail no style property can do: a few lines of CSS on a custom_class.

Never: render a page, section, product card, cart or checkout from JavaScript; put placeholder JSON in
text elements for a script to fill; copy product data into code (use products + bindings); or capture a
design as HTML. A reference design (Stitch, Figma, canvas, another site) is a visual brief: rebuild it
with elements (ingest_html → new_section) and accept small differences. If a design can't be matched
natively, tell the user what differs instead of switching to code.

Which element for which need:
${NATIVE_ALTERNATIVES.map((a) => `- ${a.need}: ${a.elements.join(", ")}${a.note ? ` (${a.note})` : ""}`).join("\n")}

Limits: site scripts ${CODE_BUDGET.script.soft / 1000}k chars, site CSS ${CODE_BUDGET.css.soft / 1000}k chars. Above that, a write is refused unless
it names the gap in native_gap (scripts ${CODE_BUDGET.script.hard / 1000}k / CSS ${CODE_BUDGET.css.hard / 1000}k is refused outright; a site already past that may only
shrink or swap code: no write may grow it, publish_site refuses to publish it). validate_page also refuses new placeholder JSON in text and more than
${NODE_CODE_BUDGET.hard / 1000}k chars of custom_css + embed code on one page. Content already on a page never blocks an unrelated save.`;

const SMELLS = [
  {
    kind: "script",
    limit: 20,
    re: /<(?:div|section|article|ul|li|table|img|a|h[1-6]|p|button|form|input|span)[\s>]/gi,
    label: "HTML tags in scripts",
    fix: "build this UI with native elements",
  },
  {
    kind: "script",
    limit: 15,
    re: /\.innerHTML\b|insertAdjacentHTML|createElement\(/g,
    label: "DOM-building calls",
    fix: "scripts should write into native elements, not create the UI",
  },
  {
    kind: "script",
    limit: 200,
    re: /"[\w-]+"\s*:/g,
    label: "JSON keys in scripts",
    fix: "move this data to products + bindings or a CMS collection",
  },
  {
    kind: "script",
    limit: 0,
    re: /<!doctype\s|<html[\s>]|<body[\s>]/gi,
    label: "HTML document tags in scripts",
    fix: "rebuild that page from native elements",
  },
  {
    kind: "css",
    limit: 30,
    re: /!important/g,
    label: "!important rules",
    fix: "set runtime.style/config on the elements instead of overriding them",
  },
];
const PASTED_DOCUMENT = /^\s*(?:<!doctype\s|<html[\s>])/i;

const joined = (values: Record<string, any>, fields: string[]) => fields.map((f) => String(values[f] || "")).filter(Boolean).join("\n");
// HTML comments don't count: snippets ship with notes like "paste after the opening <body> tag".
const count = (text: string, re: RegExp) => (text.replace(/<!--[\s\S]*?-->/g, "").match(re) || []).length;

/** How much of the budget a site's code uses (for reads, so an agent sees it before writing). */
export function codeUsage(values: Record<string, any>) {
  const script = joined(values, SCRIPT_FIELDS).length;
  const css = joined(values, CSS_FIELDS).length;
  return {
    script: { used: script, budget: CODE_BUDGET.script.soft },
    css: { used: css, budget: CODE_BUDGET.css.soft },
    over_budget: script > CODE_BUDGET.script.soft || css > CODE_BUDGET.css.soft,
  };
}

/** Judge a write by what it ADDS: shrinking or swapping code on an already-large site always passes,
 *  so a site can move off custom code step by step. Past the ceiling nothing may grow: small fixes
 *  used to be allowed and ratcheted a site to 90k chars of CSS, which then failed to publish. */
export function checkSiteCode(before: Record<string, any>, changes: Record<string, any>) {
  const after = { ...before, ...changes };
  const hard: string[] = [];
  const soft: string[] = [];
  const texts = (kind: "script" | "css") => {
    const fields = kind === "script" ? SCRIPT_FIELDS : CSS_FIELDS;
    return { old: joined(before, fields), now: joined(after, fields) };
  };

  for (const kind of ["script", "css"] as const) {
    const { old, now } = texts(kind);
    if (now.length <= old.length) continue;
    const { soft: softLimit, hard: hardLimit } = CODE_BUDGET[kind];
    if (now.length > hardLimit)
      hard.push(`Site ${kind} would reach ${now.length} chars (ceiling ${hardLimit}). That is an app, not a snippet: move UI to native elements, data to a collection, logic to an HTTP function.`);
    else if (now.length > softLimit) soft.push(`Site ${kind} would reach ${now.length} chars (budget ${softLimit}).`);
  }
  for (const [field, value] of Object.entries(changes)) {
    if (PASTED_DOCUMENT.test(String(value || "")) && !PASTED_DOCUMENT.test(String(before[field] || "")))
      hard.push(`${field} is a whole HTML page. Rebuild it from native elements (ingest_html → new_section).`);
  }
  for (const s of SMELLS) {
    const { old, now } = texts(s.kind as "script" | "css");
    const found = count(now, s.re);
    if (found > s.limit && found > count(old, s.re)) soft.push(`${found} ${s.label} (limit ${s.limit}): ${s.fix}.`);
  }
  return { hard, soft };
}

/** Turn a check into the tool's refusal, or null when the write may proceed. */
export function codeGuard(check: { hard: string[]; soft: string[] }, nativeGap?: string) {
  if (check.hard.length)
    return { error: "BLOCKED: custom code refused. Not saved.", reasons: check.hard, native_first: NATIVE_FIRST_GUIDE };
  if (check.soft.length && !nativeGap)
    return {
      error: "BLOCKED: this looks like UI or data that belongs in native elements or the CMS. Not saved.",
      reasons: check.soft,
      native_first: NATIVE_FIRST_GUIDE,
      if_truly_no_native_way: "Tell the user why, then call again with native_gap: the need, the elements/apps you checked, and what each one lacks.",
    };
  return null;
}

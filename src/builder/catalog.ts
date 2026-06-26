// Catalog / registry layer over builder/factory.js.
//
// The factory functions are the source of truth for a valid BuilderX component node.
// Here we (1) build a type -> factory map automatically by probing every exported
// create* function, (2) attach curated, human-readable metadata (category + summary)
// so an AI agent can understand the palette, and (3) expose helpers the MCP tools use.

import * as F from "./factory.js";
import { describeAttributes } from "./attributes.js";
import { normalizeBindings } from "./bindings.js";
import { normalizeEvents } from "./events.js";

// Probe every factory once with safe default opts to learn the type string it produces
// and whether it is a container (has a children array). Calling with {children:[]} is
// safe for all 132 factories (verified) — none throw.
const FACTORY_BY_TYPE: Record<string, any> = {};
const CONTAINER_TYPES = new Set();
const ALL_TYPES: string[] = [];

for (const [name, fn] of Object.entries(F as Record<string, any>)) {
  if (typeof fn !== "function" || !name.startsWith("create")) continue;
  let node;
  try {
    node = fn({ children: [] });
  } catch {
    continue;
  }
  if (!node || !node.type) continue;
  if (!FACTORY_BY_TYPE[node.type]) {
    FACTORY_BY_TYPE[node.type] = fn;
    ALL_TYPES.push(node.type);
    if (Array.isArray(node.children)) CONTAINER_TYPES.add(node.type);
  }
}
ALL_TYPES.sort();

// ── Curated categorisation ───────────────────────────────────────────────────
// Maps each known type to a category. Types not listed fall back to "other".
const CATEGORY_MEMBERS = {
  layout: [
    "section", "container", "row", "slide", "carousel", "swiper", "collapse",
    "collapse-item", "collapse-content", "tabs", "custom-layout", "question-container",
    "layout-dataset",
  ],
  content: [
    "text", "text-dataset", "image", "image-dataset", "video", "video-dataset",
    "rectangle", "rectangle-dataset", "line", "gallery", "list-ordered", "embed",
    "googlemap", "breadcrumb", "tags", "countdown", "table", "agency", "calendar",
    "calendar-content",
  ],
  button: [
    "button", "submit-button", "paypal-button", "button-login-google",
    "button-login-facebook", "current-location",
  ],
  form: [
    "form", "input", "email", "phone-number", "retype-phone-number", "password",
    "retype-password", "current-password", "text-area", "select", "group-select",
    "checkbox", "checkbox-group", "checkbox-item", "radio", "radio-group", "address",
    "detect-address", "postal-code", "country", "input-file", "input-number",
    "input-date", "input-search", "input-product-note", "otp-input", "rating-input",
    "two-point-range", "identity", "search-form", "search-droppable", "color-group",
    "switch",
  ],
  commerce: [
    "grid-product", "slider-product", "product-gallery", "product-image-carousel",
    "cart-items", "cart-icon", "cart-droppable", "cart-items-empty", "quantity-input",
    "attr", "payment", "delivery-method", "order-items", "order-history", "coupon",
    "product-overlay", "product-review", "masonry-review", "empty-product-layout",
    "bonus-items", "flash-sale", "promotions", "promotions-short", "grid-category",
    "slider-category", "number-step", "warehouse", "warehouse-dataset",
    "customer-address", "reward-point", "referral-code", "lucky-wheel", "tee-form",
    "wishlist", "favorite-icon",
  ],
  navigation: [
    "menu", "menu-item", "menu-anchor-item", "submenu", "menu-droppable", "member-bar",
    "member-dropdown", "dropdown", "dropdown-content", "language-menu",
  ],
  blog: [
    "post-list", "slider-post", "grid-blog", "slider-blog", "post-overlay",
    "blog-overlay",
  ],
  marketing: [
    "notify", "popup", "auto-number", "random-number", "user-point-log",
  ],
  course: [
    "lesson-sidebar", "lesson-items", "next-lesson-droppable", "list-lesson-droppable",
  ],
};

const CATEGORY_BY_TYPE: Record<string, string> = {};
for (const [cat, members] of Object.entries(CATEGORY_MEMBERS)) {
  for (const t of members) CATEGORY_BY_TYPE[t] = cat;
}

// Short one-line summaries for the most commonly authored types. Types without an
// entry get an auto summary. get_element returns a live skeleton anyway, so this only
// needs to help the agent pick the right type.
const SUMMARY: Record<string, string> = {
  section: "Top-level band/row container. Every page is a stack of sections. Holds children in a CSS grid.",
  container: "Generic grid/flex box to group elements and position them together.",
  row: "Simple horizontal row wrapper.",
  text: "Rich text block (headings, paragraphs). Content in specials.text, tag in specials.tag.",
  "text-dataset": "Text bound to a dataset field (product name, price...). Uses bindings[].",
  image: "Static image. URL goes in runtime.config.src.",
  "image-dataset": "Image bound to a dataset field. Uses bindings[].",
  video: "Video player. specials.src + specials.thumbnail.",
  rectangle: "Coloured box / shape, useful as a background or divider.",
  line: "Separator line.",
  button: "Clickable button. Label in specials.text, actions in events[].",
  "submit-button": "Form submit button.",
  gallery: "Image gallery/lightbox. Images in specials.media[].",
  carousel: "Auto/paginated carousel of slides.",
  slide: "A single slide inside a carousel.",
  form: "Form wrapper. Put input fields as children. specials.type selects form behaviour.",
  input: "Text input field. specials.field_name, placeholder, label, required.",
  email: "Email input field.",
  "phone-number": "Phone number input field.",
  "text-area": "Multi-line text input.",
  select: "Dropdown select.",
  checkbox: "Single checkbox.",
  radio: "Radio button.",
  address: "Address input.",
  "grid-product": "Product grid (lists products from the store).",
  "slider-product": "Product slider/carousel.",
  "cart-items": "Shopping cart line items.",
  "cart-icon": "Cart icon with item count.",
  "quantity-input": "Quantity stepper for products.",
  payment: "Payment methods block.",
  "delivery-method": "Shipping/delivery options block.",
  "order-items": "Order summary line items.",
  coupon: "Coupon / discount code input.",
  menu: "Navigation menu container.",
  "menu-item": "A single navigation menu link.",
  countdown: "Countdown timer.",
  embed: "Raw HTML / iframe embed.",
  googlemap: "Google Maps iframe embed.",
  popup: "Modal/overlay popup container.",
  notify: "Notification / alert banner.",
  tabs: "Tabbed content container.",
  collapse: "Accordion / collapsible panel.",
  breadcrumb: "Breadcrumb navigation trail.",
};

function describeType(type: string) {
  return {
    type,
    category: CATEGORY_BY_TYPE[type] || "other",
    container: CONTAINER_TYPES.has(type),
    summary: SUMMARY[type] || `BuilderX "${type}" element.`,
  };
}

/** Build a fresh, structurally-valid node of the given type using the real factory. */
export function buildElement(type: string, opts: any = {}) {
  const fn = FACTORY_BY_TYPE[type];
  if (!fn) {
    const err = new Error(`Unknown element type "${type}". Use list_elements to see valid types.`);
    (err as any).code = "UNKNOWN_TYPE";
    throw err;
  }
  // Guarantee children-using factories never throw on a missing children array.
  const node = fn({ children: [], ...opts });
  // Some factories ignore opts.bindings/events — attach them so any element the AI passes
  // them to gets them — then normalize so each binding/event has a valid id (+ name/eventName).
  if (opts.bindings && !node.bindings) node.bindings = opts.bindings;
  if (opts.events && !node.events) node.events = opts.events;
  // Responsive CASCADE overrides: sparse per-breakpoint diffs ({ bp2|bp3|bp4: { style?, config? } }).
  // Stashed on runtime.responsive; finalizeForRender cascades them bp1→bp4 (each smaller
  // breakpoint inherits the resolved larger one, then applies its own diff).
  if (opts.responsive && typeof opts.responsive === "object") {
    node.runtime = node.runtime || {};
    node.runtime.responsive = opts.responsive;
  }
  if (Array.isArray(node.bindings) && node.bindings.length) node.bindings = normalizeBindings(node.bindings);
  if (Array.isArray(node.events) && node.events.length) node.events = normalizeEvents(node.events, node.type);
  return node;
}

export function isKnownType(type: string) {
  return Boolean(FACTORY_BY_TYPE[type]);
}

export function listElements() {
  const categories: Record<string, any[]> = {};
  for (const type of ALL_TYPES) {
    const d = describeType(type);
    (categories[d.category] ||= []).push({
      type: d.type,
      container: d.container,
      summary: d.summary,
    });
  }
  return { total: ALL_TYPES.length, categories };
}

export function getElement(type: string) {
  if (!isKnownType(type)) {
    return {
      error: `Unknown type "${type}"`,
      valid_types: ALL_TYPES,
    };
  }
  const d = describeType(type);
  // A live skeleton straight from the factory = authoritative shape for this type.
  const skeleton = buildElement(type, {});
  // Curated + skeleton-derived attribute reference so the agent knows the meaningful keys.
  const attributes = describeAttributes(type, skeleton);
  return { ...d, attributes, skeleton };
}

export const ELEMENT_TYPES = ALL_TYPES;
export const CONTAINER_TYPE_SET = CONTAINER_TYPES;

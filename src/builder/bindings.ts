// Authoritative BINDINGS catalog + helpers for the BuilderX component model.
//
// A dataset element (text-dataset, image-dataset, …) and the children of a repeater
// (grid-product, cart-items, post-list, …) pull LIVE data via a `bindings` array. Each
// binding is a FLAT object:
//   { id, name, target, ...metadata }
// - name   = the dataset/source ("product", "cart_item", "order", "post", …)
// - target = "<name>::<field>" (e.g. "product::product_price")
// Source of truth: builderx_spa/src/composable/bind.js (runtime resolver),
// builderx_spa/src/components/editor/traits/{BindingSetting,ConnectData}.vue (the field
// menus), builderx_api/assets/render/*-binding.js (storefront resolve). A binding only
// resolves on a page whose `type` enables the dataset (product/cart → use_store, etc).
// This module mirrors that so the MCP can MINT, VALIDATE and TEACH valid bindings.

import { randomString } from "./factory.js";

export interface BindingDataset {
  name: string;
  fields: string[];
  summary: string;
  page_type?: "store" | "member" | "blog" | "any";
  repeater_parents?: string[]; // when these are the parent, children bind per-item to this dataset
}

// Curated to the fields an AI realistically uses, lifted verbatim from the editor field
// menus. (The full lists run longer; these cover storefront page building.)
export const BINDING_DATASETS: Record<string, BindingDataset> = {
  product: {
    name: "product",
    page_type: "store",
    repeater_parents: ["grid-product", "slider-product", "custom-layout", "layout-dataset"],
    summary: "A product (detail page, or per-item inside a product grid/slider).",
    fields: [
      "product::product_name", "product::product_price", "product::product_original_price",
      "product::product_image", "product::product_url", "product::short_description",
      "product::product_categories", "product::brand_name", "product::product_tag",
      "product::product_remain_quantity", "product::total_sold_web", "product::rating_point",
      "product::rating_count", "product::variation_sku", "product::product_wholesale_price",
      "product::discount_price_from_original_price", "product::preorder_text", "product::product_note",
    ],
  },
  "product-overlay": {
    name: "product-overlay",
    page_type: "store",
    repeater_parents: ["grid-product", "slider-product"],
    summary: "Sale/discount badge overlaid on a product card.",
    fields: ["product-overlay::product_sale", "product-overlay::product_discount", "product-overlay::product_total_sold", "product-overlay::product_url"],
  },
  cart_item: {
    name: "cart_item",
    page_type: "store",
    repeater_parents: ["cart-items"],
    summary: "A line item in the cart, plus cart totals.",
    fields: [
      "cart_item::cart_item_image", "cart_item::cart_item_name", "cart_item::cart_item_price",
      "cart_item::cart_item_original_price", "cart_item::cart_item_subtotal", "cart_item::cart_item_total_price",
      "cart_item::cart_item_total_quantity", "cart_item::cart_item_prod_attr", "cart_item::sku",
      "cart_item::cart_total_price", "cart_item::cart_total_tax", "cart_item::cart_shipping_fee",
      "cart_item::cart_promotion_discount", "cart_item::subtotal_before_discount", "cart_item::product_note",
    ],
  },
  order: {
    name: "order",
    page_type: "store",
    summary: "The order summary (checkout / thank-you page).",
    fields: [
      "order::order_full_name", "order::order_phone_number", "order::order_email", "order::address",
      "order::order_payment_method", "order::shipping_fee", "order::subtotal", "order::total_price",
      "order::total_tax", "order::code_order", "order::order_status", "order::payment_status",
      "order::order_quantity", "order::order_date", "order::order_coupon", "order::order_promotion_discount",
    ],
  },
  order_item: {
    name: "order_item",
    page_type: "store",
    repeater_parents: ["order-items"],
    summary: "A line item inside an order summary.",
    fields: [
      "order_item::product_name", "order_item::product_price", "order_item::original_price",
      "order_item::product_image", "order_item::product_attrs", "order_item::product_quantity",
      "order_item::items_sum_up_price", "order_item::tag_bonus", "order_item::preorder_text",
    ],
  },
  post: {
    name: "post",
    page_type: "blog",
    repeater_parents: ["post-list", "slider-post", "grid-blog", "slider-blog"],
    summary: "A blog article/post (list item or detail).",
    fields: [
      "post::post_title", "post::post_description", "post::post_content", "post::post_image",
      "post::post_publish_date", "post::category_name", "post::category_description", "post::category_image",
      "post::post_creator", "post::tag_article", "post::total_views",
    ],
  },
  category: {
    name: "category",
    page_type: "store",
    repeater_parents: ["grid-category", "slider-category"],
    summary: "A product category (per-item inside a category grid/slider).",
    fields: ["category::category_name", "category::category_image", "category::category_description"],
  },
  customer: {
    name: "customer",
    page_type: "member",
    summary: "The logged-in customer profile + loyalty.",
    fields: [
      "customer::profile_avatar", "customer::profile_name", "customer::phone_number", "customer::email",
      "customer::gender", "customer::birthday", "customer::order_count", "customer::purchased_amount",
      "customer::pos_reward_point", "customer::pos_reward_point_level", "customer::pos_level_discount",
    ],
  },
  customer_address: {
    name: "customer_address",
    page_type: "member",
    repeater_parents: ["customer-address"],
    summary: "A saved customer address (member page).",
    fields: [
      "customer_address::full_name", "customer_address::first_name", "customer_address::last_name",
      "customer_address::phone_number", "customer_address::address", "customer_address::province",
      "customer_address::district", "customer_address::commune", "customer_address::pdc", "customer_address::is_default",
    ],
  },
  bonus_item: {
    name: "bonus_item",
    page_type: "store",
    repeater_parents: ["bonus-items"],
    summary: "A combo/gift item (promotion bonus).",
    fields: [
      "bonus_item::bonus_item_name", "bonus_item::bonus_item_price", "bonus_item::bonus_item_original_price",
      "bonus_item::bonus_item_image", "bonus_item::bonus_item_prod_attr", "bonus_item::bonus_item_quantity",
      "bonus_item::tag_bonus", "bonus_item::combo_name", "bonus_item::sku",
    ],
  },
  promotion_item: {
    name: "promotion_item",
    page_type: "store",
    repeater_parents: ["promotions", "promotions-short"],
    summary: "A promotion in a promotions list.",
    fields: ["promotion_item::name", "promotion_item::code", "promotion_item::image", "promotion_item::description", "promotion_item::end_date"],
  },
  attr: {
    name: "attr",
    page_type: "store",
    summary: "A product attribute (variation axis) name/value.",
    fields: ["attr::attr_name", "attr::attr_value"],
  },
  form: {
    name: "form",
    page_type: "any",
    summary: "Computed form values (coupon price, reward points).",
    fields: ["form::coupon_price", "form::send_value", "form::total_reward_point", "form::use_reward_point", "form::remaining_reward_point", "form::submit_errors"],
  },
  general_info: {
    name: "general_info",
    page_type: "any",
    summary: "Page / site info.",
    fields: ["general_info::page_name", "general_info::site_name", "general_info::menu_title"],
  },
};

// Build fast lookups.
const ALL_TARGETS = new Set<string>();
const NAME_SET = new Set<string>();
for (const ds of Object.values(BINDING_DATASETS)) {
  NAME_SET.add(ds.name);
  for (const f of ds.fields) ALL_TARGETS.add(f);
}

// Repeater parent type → the PRIMARY dataset its children bind to per-item. First write
// wins so the primary dataset (product) claims grid-product over secondary overlays.
export const REPEATER_CONTEXT: Record<string, string> = {};
for (const ds of Object.values(BINDING_DATASETS)) {
  for (const p of ds.repeater_parents || []) if (!REPEATER_CONTEXT[p]) REPEATER_CONTEXT[p] = ds.name;
}

export function isKnownBindingName(name: string): boolean {
  return NAME_SET.has(name);
}
export function isKnownBindingTarget(target: string): boolean {
  return ALL_TARGETS.has(target);
}

/**
 * Mint a structurally-valid binding. Accepts either a full target ("product::product_price")
 * or a name + field, plus any extra metadata (show_tax, separator, name_style, …).
 *   makeBinding("product::product_price", { show_tax: true })
 *   makeBinding({ name: "cart_item", field: "cart_item_name" })
 */
export function makeBinding(spec: any, extra: Record<string, any> = {}): any {
  let name: string | undefined;
  let target: string | undefined;
  if (typeof spec === "string") {
    target = spec;
    name = spec.includes("::") ? spec.split("::")[0] : spec;
  } else if (spec && typeof spec === "object") {
    name = spec.name;
    target = spec.target || (spec.name && spec.field ? `${spec.name}::${spec.field}` : undefined);
    if (!name && target && target.includes("::")) name = target.split("::")[0];
    const { id, name: _n, target: _t, field: _f, ...rest } = spec;
    extra = { ...rest, ...extra };
    if (id) extra.id = id;
  }
  if (!name) throw new Error("Binding needs a name or a 'name::field' target.");
  const { id: keepId, ...meta } = extra;
  return { id: keepId || `BINDING-${randomString(6)}`, name, ...(target ? { target } : {}), ...meta };
}

/** Ensure every binding in an array has an id + a name (mint where missing). */
export function normalizeBindings(bindings: any[]): any[] {
  if (!Array.isArray(bindings)) return bindings;
  return bindings.map((b) => {
    if (!b || typeof b !== "object") return b;
    if (b.id && b.name) return b; // already well-formed
    return makeBinding(b);
  });
}

/** Validate one element's bindings against the catalog. */
export function validateBindings(node: any): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const where = node?.id || node?.type || "?";
  for (const b of node?.bindings || []) {
    if (!b || typeof b !== "object") {
      warnings.push(`Binding on "${where}" is not an object.`);
      continue;
    }
    if (!b.name) {
      warnings.push(`Binding on "${where}" has no name (dataset).`);
    } else if (!isKnownBindingName(b.name)) {
      warnings.push(`Binding on "${where}" has unknown dataset "${b.name}" (see list_bindings).`);
    }
    if (b.target) {
      if (!/^[a-z_-]+::.+/i.test(b.target)) {
        warnings.push(`Binding on "${where}" target "${b.target}" is not "name::field" shaped.`);
      } else if (!isKnownBindingTarget(b.target)) {
        warnings.push(`Binding on "${where}" target "${b.target}" is not a known field (see list_bindings).`);
      }
    }
  }
  return { errors, warnings };
}

/** Catalog for the list_bindings discovery tool. */
export function describeBindingsCatalog() {
  return {
    note: "Dataset elements (text-dataset/image-dataset/…) and children of a repeater (grid-product, cart-items, post-list…) carry bindings:[{ id, name, target }]. Build via new_element opts.bindings (ids auto-minted) — e.g. new_element('text-dataset',{ bindings:[{ target:'product::product_price', show_tax:true }] }). A target only resolves on a page whose type enables its dataset (store→use_store, member→use_member, blog→use_blog) — build_page handles the flag.",
    page_type_required: { store: ["product", "product-overlay", "cart_item", "order", "order_item", "category", "bonus_item", "promotion_item", "attr"], member: ["customer", "customer_address"], blog: ["post"], any: ["form", "general_info"] },
    repeater_context: REPEATER_CONTEXT,
    datasets: Object.values(BINDING_DATASETS).map((ds) => ({
      name: ds.name,
      page_type: ds.page_type,
      summary: ds.summary,
      ...(ds.repeater_parents ? { used_inside: ds.repeater_parents } : {}),
      fields: ds.fields,
    })),
  };
}

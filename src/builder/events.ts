// Authoritative EVENTS catalog + helpers for the BuilderX component model.
//
// An interactive element carries an `events: [ <event>, ... ]` array. Each event is a
// FLAT object the storefront renderer consumes:
//   { id, eventName, action, ...action-specific fields }
// - eventName = the TRIGGER (click/hover/success/...). Source of truth:
//   builderx_spa/src/components/editor/traits/{Events,EventSetting}.vue and the Elixir
//   renderer builderx_api/lib/qwik/html/common.ex (validates eventName) +
//   builderx_api/assets/render/events.js (dispatches `action` → PascalCase handler).
// - action = WHAT happens; each action reads its own extra fields (open_page_id,
//   toggle_id, popup_id, link_target, …).
// This module mirrors that shape so the MCP can MINT valid events, VALIDATE them, and
// TEACH the AI the exact trigger/action/field names (no invented keys).

import { randomString } from "./factory.js";

// ── Triggers (eventName) ─────────────────────────────────────────────────────
export interface EventTrigger {
  name: string;
  when: string;
  applies_to?: string; // hint: which element types commonly use it
}

export const EVENT_TRIGGERS: EventTrigger[] = [
  { name: "click", when: "User clicks the element (the default for buttons/text/images/containers).", applies_to: "most elements" },
  { name: "hover", when: "Pointer hovers the element — used for hover style actions (scale, change_background, …).", applies_to: "most elements" },
  { name: "mouseenter", when: "Pointer enters the element." },
  { name: "mouseleave", when: "Pointer leaves the element." },
  { name: "success", when: "A form submitted successfully — fire follow-up actions (redirect/popup).", applies_to: "form" },
  { name: "submit", when: "A submit-button submits its parent form.", applies_to: "submit-button" },
  { name: "tab", when: "A swiper/tab changed.", applies_to: "swiper, tabs" },
  { name: "hide", when: "A popup is hidden.", applies_to: "popup" },
  { name: "onenter", when: "Enter key pressed in a search input.", applies_to: "input-search" },
];

const TRIGGER_NAMES = new Set(EVENT_TRIGGERS.map((t) => t.name));

// ── Actions ──────────────────────────────────────────────────────────────────
// `target_in_page`: a field whose value MUST reference another node id ON THIS PAGE
// (so validatePage can flag a dangling target). Fields that point off-page (page ids,
// global popups/menus, urls, phone numbers) are NOT listed there — they can't be checked.
export interface EventAction {
  action: string;
  trigger: string; // the usual eventName for this action
  summary: string;
  required?: string[]; // fields the action needs to work
  optional?: string[];
  target_in_page?: string[]; // fields referencing an element id on the same page
  category: "navigation" | "ui" | "cart" | "form" | "contact" | "content" | "media" | "hover" | "account" | "misc";
}

export const EVENT_ACTIONS: EventAction[] = [
  // navigation
  { action: "open_page", trigger: "click", category: "navigation", summary: "Go to a page in this site.", required: ["open_page_id"], optional: ["scrollTarget", "scroll_to_id", "scroll_to_element_id", "scrollMore", "no_follow", "active_color"] },
  { action: "open_link", trigger: "click", category: "navigation", summary: "Open an external URL.", required: ["link_target"], optional: ["link_target_url", "no_follow"] },
  { action: "open_category", trigger: "click", category: "navigation", summary: "Open a product category page.", required: ["open_category_id"], optional: ["no_follow"] },
  { action: "open_blog_category", trigger: "click", category: "navigation", summary: "Open a blog category page.", required: ["open_blog_category_id"], optional: ["no_follow"] },
  { action: "scroll_to", trigger: "click", category: "navigation", summary: "Smooth-scroll to a section/element on this page.", required: ["scroll_to_id"], optional: ["scroll_to_element_id", "scrollMore", "scrollTarget"], target_in_page: ["scroll_to_id", "scroll_to_element_id"] },
  { action: "direction_login", trigger: "click", category: "navigation", summary: "Redirect by login state: open_page_id if logged in, target_direction_id if not.", required: ["open_page_id"], optional: ["target_direction_id"] },
  // ui control
  { action: "toggle", trigger: "click", category: "ui", summary: "Show/hide another element on this page.", required: ["toggle_id"], optional: ["toggle_status", "only_mode"], target_in_page: ["toggle_id"] },
  { action: "open_popup", trigger: "click", category: "ui", summary: "Open a popup.", required: ["popup_id"], optional: ["popup_overlay", "close_all_other_popup"] },
  { action: "close_popup", trigger: "click", category: "ui", summary: "Close a popup.", required: ["popup_id"], optional: ["popup_overlay", "close_all_other_popup"] },
  { action: "open_menu", trigger: "click", category: "ui", summary: "Open a dropdown/submenu.", required: ["open_menu_id"], target_in_page: ["open_menu_id"] },
  { action: "close_menu", trigger: "click", category: "ui", summary: "Close a menu.", optional: ["close_menu_id"] },
  { action: "change_tab", trigger: "click", category: "ui", summary: "Switch a swiper/tabs to a given tab.", required: ["change_tab_id"], optional: ["move_to", "tab_index", "tab_color"], target_in_page: ["change_tab_id"] },
  { action: "load_more", trigger: "click", category: "ui", summary: "Load more items in a list.", optional: ["load_more_id"], target_in_page: ["load_more_id"] },
  // cart / commerce
  { action: "add_to_cart", trigger: "click", category: "cart", summary: "Add the current product to the cart.", optional: ["open_page", "auto_add_bonus", "activeNotify", "productNoteElId"] },
  { action: "buy_now", trigger: "click", category: "cart", summary: "Add to cart and go straight to checkout.", optional: ["open_page", "auto_add_bonus", "activeNotify"] },
  { action: "add_to_cart_form", trigger: "success", category: "cart", summary: "Add to cart from a form submit (product form).", optional: ["open_page"] },
  { action: "open_cart", trigger: "click", category: "cart", summary: "Open the cart sidebar/drawer." },
  { action: "close_cart", trigger: "click", category: "cart", summary: "Close the cart sidebar/drawer." },
  { action: "apply_promotion", trigger: "click", category: "cart", summary: "Apply a promotion/coupon code.", optional: ["apply_id", "is_hidden", "has_text", "text_change"] },
  // form / account
  { action: "required_login", trigger: "click", category: "account", summary: "Require login before proceeding (redirect to a page or popup).", optional: ["login_target", "login_page_id", "login_popup_id"] },
  { action: "logout", trigger: "click", category: "account", summary: "Log the customer out." },
  { action: "login_google", trigger: "click", category: "account", summary: "Sign in with Google." },
  { action: "login_facebook", trigger: "click", category: "account", summary: "Sign in with Facebook." },
  // content
  { action: "change_text", trigger: "click", category: "content", summary: "Replace the text of another element.", required: ["target_id"], optional: ["text_value"], target_in_page: ["target_id"] },
  { action: "see_more", trigger: "click", category: "content", summary: "Expand a clamped/collapsed element.", optional: ["elements"] },
  { action: "shorten", trigger: "click", category: "content", summary: "Collapse a previously expanded element.", optional: ["elements"] },
  { action: "copy", trigger: "click", category: "content", summary: "Copy text to the clipboard.", optional: ["copy_type", "copy_data"] },
  { action: "download", trigger: "click", category: "content", summary: "Download a file.", required: ["download_link"], optional: ["fileType"] },
  // contact
  { action: "phone_call", trigger: "click", category: "contact", summary: "Start a phone call (tel:).", required: ["phone_call_number"] },
  { action: "open_email", trigger: "click", category: "contact", summary: "Open the mail client (mailto:).", required: ["open_email"] },
  { action: "send_messenger", trigger: "click", category: "contact", summary: "Open Facebook Messenger.", optional: ["messenger_link"] },
  { action: "send_zalo_mess", trigger: "click", category: "contact", summary: "Open Zalo chat.", optional: ["zalo_oa_id"] },
  { action: "send_whatsapp_mess", trigger: "click", category: "contact", summary: "Open WhatsApp chat.", optional: ["whatsapp_phone_number"] },
  { action: "sharing", trigger: "click", category: "contact", summary: "Share to a social network.", optional: ["shareTarget", "shareLink", "shareLinkCustom"] },
  // hover styles (eventName must be "hover")
  { action: "scale", trigger: "hover", category: "hover", summary: "Scale the element on hover.", optional: ["el_target_id"] },
  { action: "change_background", trigger: "hover", category: "hover", summary: "Change background colour on hover." },
  { action: "change_text_color", trigger: "hover", category: "hover", summary: "Change text colour on hover." },
  { action: "change_border_color", trigger: "hover", category: "hover", summary: "Change border colour on hover." },
];

const ACTION_BY_NAME: Record<string, EventAction> = {};
for (const a of EVENT_ACTIONS) ACTION_BY_NAME[a.action] = a;

export function isKnownTrigger(name: string): boolean {
  return TRIGGER_NAMES.has(name);
}
export function getEventAction(action: string): EventAction | undefined {
  return ACTION_BY_NAME[action];
}

// Element types whose events only fire on a specific trigger — mirrors builderx_spa
// components/editor/traits/Events.vue `addEvent()`. For these the element-type trigger
// is the right default (a click handler on a form never fires); for everything else the
// action's usual trigger (or "click") wins.
const SPECIAL_EVENT_TRIGGER: Record<string, string> = {
  form: "success",
  swiper: "tab",
  popup: "hide",
  "input-search": "onenter",
  "submit-button": "hover",
};

/** The trigger the builder defaults to for a given element type, if it is a special one. */
export function defaultTriggerForType(type?: string): string | undefined {
  return type ? SPECIAL_EVENT_TRIGGER[type] : undefined;
}

/**
 * Mint a structurally-valid event object. Pass at least `action`; extra action-specific
 * fields are merged verbatim. The id and a sensible eventName are filled in.
 * eventName precedence (mirrors the editor): explicit > element-type default
 * (form→success, swiper→tab, popup→hide, input-search→onenter, submit-button→hover) >
 * the action's usual trigger > "click".
 *   makeEvent({ action: "scroll_to", scroll_to_id: "SECTION-x" })
 *   makeEvent({ action: "open_page", open_page_id: "…" }, "form") // eventName → "success"
 */
export function makeEvent(spec: any, elementType?: string): any {
  if (!spec || typeof spec !== "object") throw new Error("Event spec must be an object with at least an `action`.");
  const def = spec.action ? ACTION_BY_NAME[spec.action] : undefined;
  const eventName = spec.eventName || defaultTriggerForType(elementType) || (def ? def.trigger : "click");
  const { eventName: _e, action: _a, id: _id, ...rest } = spec;
  return { id: spec.id || `EVENT-${randomString(6)}`, eventName, ...(spec.action ? { action: spec.action } : {}), ...rest };
}

/** Ensure every event in an array has an id + an eventName (mint where missing).
 *  Pass the owning element's type so special types get the right default trigger.
 *  Round-trip safe: events that already carry id/eventName are preserved verbatim. */
export function normalizeEvents(events: any[], elementType?: string): any[] {
  if (!Array.isArray(events)) return events;
  return events.map((e) => (e && typeof e === "object" ? makeEvent(e, elementType) : e));
}

/** Validate one element's events against the catalog + the set of ids present in the page. */
export function validateEvents(node: any, allIds: Set<string>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const where = node?.id || node?.type || "?";
  for (const ev of node?.events || []) {
    if (!ev || typeof ev !== "object") {
      warnings.push(`Event on "${where}" is not an object.`);
      continue;
    }
    if (ev.eventName && !isKnownTrigger(ev.eventName)) {
      warnings.push(`Event on "${where}" has unknown eventName "${ev.eventName}" (see list_events triggers).`);
    }
    if (!ev.action) {
      warnings.push(`Event on "${where}" has no action — it does nothing.`);
      continue;
    }
    const def = ACTION_BY_NAME[ev.action];
    if (!def) {
      warnings.push(`Event on "${where}" has unknown action "${ev.action}" (see list_events).`);
      continue;
    }
    for (const f of def.required || []) {
      if (ev[f] == null || ev[f] === "") warnings.push(`Event "${ev.action}" on "${where}" is missing required field "${f}".`);
    }
    for (const f of def.target_in_page || []) {
      const v = ev[f];
      if (v && !allIds.has(v)) warnings.push(`Event "${ev.action}" on "${where}" targets missing element "${v}" (field ${f}).`);
    }
  }
  return { errors, warnings };
}

/** Catalog for the list_events discovery tool. */
export function describeEventsCatalog() {
  return {
    note: "An interactive node carries events:[{ id, eventName, action, ...fields }]. eventName = trigger, action = what happens. Build with new_element opts.events (ids are auto-minted) — e.g. new_element('button',{ text:'Mua', events:[{ action:'add_to_cart', open_page:'cart' }] }).",
    triggers: EVENT_TRIGGERS,
    actions: EVENT_ACTIONS.map((a) => ({
      action: a.action,
      category: a.category,
      usual_trigger: a.trigger,
      summary: a.summary,
      ...(a.required ? { required: a.required } : {}),
      ...(a.optional ? { optional: a.optional } : {}),
      ...(a.target_in_page ? { references_element_on_page: a.target_in_page } : {}),
    })),
  };
}

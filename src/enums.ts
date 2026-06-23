// WebCake enum reference, mirrored from builderx_api so the AI knows what the numeric
// codes / string values mean. Sources:
//   - Enum.Application (lib/builderx_api/enum.ex) — application/app types
//   - Automation schema (lib/builderx_api/automations/automation.ex) — type/status
//   - Enum.PageType (page kinds) — kept here for one-stop reference

/** Application types (the `type` used by get_app / install_app / register). */
export const APP_TYPES = {
  product_review: 0,
  articles_review: 1,
  automation: 2,
  telegram: 3,
  affiliates: 4,
  multilingual: 5,
  appointment: 6,
  send_email: 7,
  botcake: 8,
  sale_channel: 9,
  product_design: 10,
  auth_otp: 11,
  personal_product_design: 12,
  course: 14,
  zalo_mini_app: 15,
  cms: 16,
  recaptcha: 17,
  pwa: 18,
} as const;
export type AppName = keyof typeof APP_TYPES;
export const APP_NAMES = Object.keys(APP_TYPES) as AppName[];

/** name -> code and code -> name helpers. */
export const APP_TYPE_BY_NAME: Record<string, number> = { ...APP_TYPES };
export const APP_NAME_BY_TYPE: Record<number, string> = Object.fromEntries(
  Object.entries(APP_TYPES).map(([k, v]) => [v, k]),
);

/** Automation.status values. */
export const AUTOMATION_STATUS = ["ACTIVE", "INACTIVE"] as const;
/** Automation.type — user-built automations default to CUSTOM. */
export const AUTOMATION_TYPE_DEFAULT = "CUSTOM";

/** Page kinds (Enum.PageType) — numeric value stored on a page. */
export const PAGE_TYPES = {
  main: 1,
  store: 2,
  member: 3,
  blog: 4,
  custom: 5,
  error: 6,
  maintain: 7,
} as const;

/** A compact human-readable summary, handy to surface in tool output. */
export const APP_TYPE_REFERENCE = APP_NAMES.map((n) => `${APP_TYPES[n]}=${n}`).join(", ");

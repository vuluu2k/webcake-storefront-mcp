// Breakpoint + grid model, ported from builderx_spa (composable/grid.js + common/index.js).
//
// CRITICAL: BuilderX persists each node's style/layout under per-breakpoint keys
// `bp1`/`bp2`/`bp3`/`bp4` — each `{ style, config }` — NOT under `runtime`. The
// `runtime` key the factory emits is only a staging area inside the Vue editor; the
// storefront renderer reads `node[breakpointActive]` (see getStyle/getConfig in
// builderx_spa/src/composable/get.js) and does NOT fall back to `runtime`. A node that
// only has `runtime` renders with no styles/grid placement (a broken-looking page).
// page.ts:finalizeForRender() converts runtime -> bp1..bp4 before a page is saved.

/** Site default breakpoints, largest first. [minWidth, maxWidth]. bp1 is the base. */
export const BREAKPOINTS: Record<string, [number, number]> = {
  bp1: [1320, 1e9], // desktop  (base / largest, default active)
  bp2: [993, 1319], // laptop
  bp3: [641, 992],  // tablet
  bp4: [320, 640],  // mobile
};
export const BREAKPOINT_KEYS = Object.keys(BREAKPOINTS); // ['bp1','bp2','bp3','bp4']
export const BASE_BP = "bp1";

// Position / layout keys that are breakpoint-specific. The builder does NOT copy these
// when syncing one breakpoint onto another (placement differs per device). We keep them
// in whichever breakpoint they were authored, and copy only the non-async keys across.
export const STYLE_ASYNC = ["top", "left", "right", "bottom", "width", "height", "zIndex", "position", "fontSize"];
export const CONFIG_ASYNC = [
  "constraintX", "constraintY", "leftUnit", "rightUnit", "relLeft", "relRight", "absRight",
  "relWidth", "widthUnit", "topUnit", "bottomUnit", "relTop", "relBottom", "absBottom", "absLeftCenterX",
  "relLeftCenterX", "leftCenterXUnit", "absRightCenterX", "relRightCenterX", "rightCenterXUnit", "topCenterYUnit",
  "absTopCenterY", "relTopCenterY", "bottomCenterYUnit", "absBottomCenterY", "relBottomCenterY", "heightUnit",
  "relHeight", "vhHeight", "columnStart", "columnEnd", "rowStart", "rowEnd", "isHidden", "columns", "rows", "grid",
  "is_use_width_outer_parent", "area", "lockCellGrid", "slideWidth", "slideWidthUnit", "relSlideWidth",
  "posts_per_row", "is_pin_video", "sizeThumbnail", "layout", "scrollDirection",
];

/**
 * Section "centered content" grid for a given breakpoint width — verbatim port of
 * builderx_spa composable/grid.js:genGridByBp. A section is a 3-column grid: a flexible
 * margin on each side and the page content in the centre column (max 1300px on desktop).
 * `rows` here is a single placeholder row; callers override `rows`/`grid` for the real
 * number of stacked children.
 */
export function genGridByBp(bp: number) {
  const rows = [{ unit: "min/max", min: { unit: "px", absValue: 600 }, max: { unit: "max-c" } }];
  if (bp >= 1320) {
    return {
      grid: "3x1",
      columns: [{ unit: "fr", value: 1 }, { unit: "px", absValue: 1300, value: 1 }, { unit: "fr", value: 1 }],
      rows,
      loaded: true,
    };
  } else if (bp >= 993) {
    return {
      grid: "3x1",
      columns: [{ unit: "px", absValue: 10 }, { unit: "fr", value: 1 }, { unit: "px", absValue: 10 }],
      rows,
      loaded: true,
    };
  } else {
    return {
      grid: "3x1",
      columns: [{ unit: "px", absValue: 5 }, { unit: "fr", value: 1 }, { unit: "px", absValue: 5 }],
      rows,
      loaded: true,
    };
  }
}

/** The centre (content) column index in a section's 3-column grid (1-based grid lines). */
export const SECTION_CONTENT_COL_START = 2;
export const SECTION_CONTENT_COL_END = 3;

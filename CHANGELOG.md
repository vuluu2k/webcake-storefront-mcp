# Changelog

**English** · [Tiếng Việt](./CHANGELOG.vi.md)

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [1.31.7] - 2026-06-26

### Fixed
- `build_page`, `create_page`, `update_page`, and `commit_page_draft` now strip a leading `/` from `slug` before saving; a slug like `/cart` would previously 404 on the storefront because it matches the bare path segment only.
- Sections built by `new_section` and `build_page` now apply vertical padding via top and bottom spacer grid rows in `runtime.config` instead of CSS `paddingTop`/`paddingBottom`, which the storefront renderer ignores on sections.
- Child elements placed by `new_section` and `new_row` now default to `widthUnit:"%"` and `relWidth:100` in their `runtime.config`, eliminating the invalid `width: %;` that caused elements to render with zero width.
- `create_product` now expands attribute axes into a cartesian product of variations, each carrying the correct `fields` entries with unique `id`s, so the storefront variation selector has values to display; `product_attributes` now also includes an `id` and a `keyword` list (with `keyValue` and `value` per entry) as required by the selector.

## [1.31.6] - 2026-06-26

### Removed
- `scaffold_store_pages`, `scaffold_global_sections`, and `scaffold_popup` tools are removed; pages are now composed free-form from elements using `new_section`, `new_element`, `new_row`, and `build_page`.

### Added
- New `get_page_schema` tool returns the authoritative JSON Schema (Draft 2020-12) for the CSS-grid page source, documenting the structural contract for every page node.
- Six new page-draft tools (`start_page_draft`, `add_draft_section`, `get_page_draft`, `list_page_drafts`, `commit_page_draft`, `clear_page_draft`) enable building large pages section-by-section into a local cache (Redis when `REDIS_URL` or `WEBCAKE_REDIS_URL` is set, otherwise in-memory) and committing them to the backend incrementally and resumably, avoiding 15-second request timeouts.

### Changed
- `create_site` now auto-clears seeded sample products, non-default categories, and articles on site creation so the new site starts empty and on-theme; opt out with `keep_seed:true`, and the result reports `seed_cleared` counts.
- `get_build_guide` is rewritten with a "DESIGN SYSTEM" section covering palette, type-scale, 8px spacing grid, contrast rules (CTA buttons must use `var(--color_24)` with a white label; `var(--color_20)` is too pale for white text on any theme), hero image rules (build a real full-width image element, not a CSS `background` shorthand), and product-image requirements (product-level images, not variation-only).
- `new_element`, `new_section`, `new_row`, and `build_page` now accept a `responsive` option with sparse per-breakpoint `style`/`config` overrides that cascade waterfall (bp1→bp4) so each smaller breakpoint inherits the resolved larger one and applies only its own diff.

### Fixed
- `publish_site` now sends all saved pages (with `source`, `id`, `type`, `slug`, `is_homepage`, and `settings`) and a `changes` map to the publish endpoint, so the storefront actually goes live instead of remaining on the "no interface" error page.
- `publish_site` now includes the site's live `domain` in the publish request body, preventing published sites from expiring on the preview URL instead of resolving to the live domain.
- The page schema used by `validate_page` and `get_page_schema` now accepts `runtime.specials` and relaxes `heightUnit` validation to match the actual factory node shape.

## [1.31.5] - 2026-06-26

### Added
- Column definitions accepted by `create_collection` and `update_collection_columns` now support five new optional fields: `note` (help text for the column), `default` (default value), `reference` (referenced `table_name` or system entity for `reference`-type columns), `reference_type` (`"system"` or `"collection"`), and `date_default_type` (`"empty"`, `"added"`, or `"specific"` for `date`/`naive_datetime` columns).

### Fixed
- The `type` field in column definitions for `create_collection` and `update_collection_columns` now enumerates all 20 editor-supported types (`text`, `rich_text`, `url`, `integer`, `float`, `decimal`, `boolean`, `reference`, `color`, `image`, `media_gallery`, `video`, `audio`, `document`, `date`, `naive_datetime`, `time`, `address`, `object`, `array`) instead of the outdated 9-type subset that included backend-internal aliases (`string`, `binary_id`, `map`).
- The MCP server now reports its version from `package.json` at runtime instead of the stale hardcoded `"1.0.0"`.

## [1.31.4] - 2026-06-26

### Added
- The guide returned by `get_http_function` and `get_site_custom_code` now includes a verified end-to-end "Custom data TABLES (collections)" section documenting the complete workflow: create a table and its columns with `create_collection` and `update_collection_columns`, read rows directly with `query_collection_records`, and write rows from an HTTP function via the webcake-data SDK (`db.model(table).create`, `updateOne`, `deleteMany`, `find`); the section notes that record writes have no direct dashboard API and must be deployed with `update_http_function` then invoked with `run_function`, and that `debug_function` requires the function to be deployed first.

## [1.31.3] - 2026-06-26

### Added
- New `update_collection_columns` tool reads the current collection schema and PATCHes it with the system columns plus the provided custom columns, enabling safe column management without accidentally dropping existing fields.
- New `delete_collection` tool permanently removes a collection (table) and all its records by `collection_id`.

### Changed
- `create_collection` now accepts an optional `table_name` (snake_case, distinct from the display `name`) and a `columns` array of custom field definitions; it creates the bare table first, then applies columns in a second PATCH call, matching the verified backend flow.
- `create_collection` description now explicitly documents that record writes must go through an HTTP function using the webcake-data SDK (`db.model(table).create({...})`), since no direct dashboard record-insert API exists; `get_http_function` is surfaced as the guide reference.

### Fixed
- `create_collection` previously sent the `schema` array in the create body, which caused a 500 error from the backend; custom columns are now added via a follow-up `PATCH` after the table is created.

### Removed
- `insert_collection_record`, `update_collection_record`, and `delete_collection_record` are removed because the dashboard record-write endpoint returns 422 unconditionally on every call regardless of payload; record writes must be performed via an HTTP function using the webcake-data SDK.

## [1.31.2] - 2026-06-26

### Changed
- The `HTTP_FUNCTION_GUIDE` embedded in `get_http_function` and `get_site_custom_code` now includes a "Common patterns" section with battle-tested production recipes: find-or-create, upsert with `{ new: true }` read-back, count-then-denormalize, multi-table ordered writes with an audit/history row, soft delete via status field, reference-id helpers (`toId`/`toNumber`), numeric status enums, and the auth-guard + `try/catch { mess }` return convention.
- The `@webcake/*` module section in the same guide now explicitly notes that these modules run inside the function sandbox (authenticated via `global.token`) and can therefore reach `/cms_function` endpoints that the dashboard JWT cannot; `@webcake/customer` documentation now lists the returned object's fields (`id`, `name`, `avatar`, `email`, `phone_number`), the always-check-`customer?.id` rule, and a typical lookup-by-anything helper (code → phone → email → id); the `@webcake/promotion` `addBonus` entry now includes a concrete example call.

## [1.31.1] - 2026-06-26

### Fixed
- The `webcake-data` SDK reference embedded in `get_http_function` and `get_site_custom_code` now documents the correct Mongoose-document API: filters are plain MongoDB-style objects (e.g. `{ status: { $in: [0, 1, 2] } }`) instead of the `.where().gte()` QueryBuilder pattern; chains are directly awaitable with no `.exec()`; `.select()` takes an array of field names; `.populate({ field, select:[...] })` resolves a reference field to its related object; the write API documents `findOneAndUpdate(filter, update, { new: true })`, `updateOne`, `updateMany`, and `deleteMany`; and the example is rewritten to a real production pattern with `db` and models declared at module top, `request.customer?.id` for auth, `request.params` for inputs, and `{ mess: "OK", ...data }` as the return convention.

## [1.31.0] - 2026-06-26

### Added
- New `create_collection` tool creates a custom data table by accepting a `name` and a `schema` array of field definitions (with types such as `string`, `integer`, `naive_datetime`, `map`, etc.); the backend automatically adds `id`, `inserted_at`, and `updated_at`.
- New `insert_collection_record` tool inserts a record into a collection by accepting a `table_name` and a `record` field-value object matching the table schema.
- New `update_collection_record` tool updates a collection record by `record_id`, accepting only the changed fields in `record`.
- New `delete_collection_record` tool deletes a collection record by `record_id`.

### Changed
- `query_collection_records` now accepts an optional `where` filter object (e.g. `{ status: "active" }`) and an `order_by` field name, enabling server-side filtering and sorting of collection data.

### Fixed
- `query_collection_records` previously returned 401 on every call because the collection records endpoint requires an `x-cms-api-key` header in addition to the standard dashboard JWT; the API client now fetches and caches that key automatically and sends it with all collection-data requests.

## [1.30.0] - 2026-06-26

### Added
- New `list_customers` tool browses or searches the site's customer list; accepts `page`, `limit`, and `term` (name/phone/email keyword) and returns a compact projection of `name`, `phone_number`, `email`, `order_count`, `succeed_order_count`, `purchased_amount`, `reward_point`, `tags`, and `last_order_at` alongside a `total` count; complements the exact-match `find_customer` tool.

## [1.29.0] - 2026-06-26

### Added
- `scaffold_global_sections` now accepts a `logo` parameter (hosted image URL) that renders an `image` element in the header instead of the brand-name text node.
- `scaffold_global_sections` now accepts an `account` parameter (default `false`) that adds a `member-bar` (login/signup links) to the header right-hand action bar, for member-gated sites.
- `scaffold_global_sections` now accepts a `language` parameter (default `false`) that adds a `language-menu` switcher to the header right-hand action bar, for multilingual sites.

### Changed
- The header generated by `scaffold_global_sections` now includes a storefront `input-search` box by default (controlled by the new `search` parameter, which defaults to `true`), matching the layout found in real production templates; the right-hand action area is built dynamically so grid column widths adjust to whichever combination of search, account, language, cart, and CTA elements is enabled.

## [1.28.0] - 2026-06-26

### Added
- New `scaffold_popup` tool builds and saves a designed newsletter/promo popup (heading + subtext + email subscribe form + close button, centred modal) as a `popup` global source in one call; accepts `headline`, `subtext`, `cta_label`, `delay_seconds`, and `palette` overrides, auto-derives the accent colour from the active site theme, and supports `dry_run=true` (default) to preview the node before saving.

### Changed
- `get_build_guide` popup workflow section is rewritten to document the correct model: popup size and position live in `runtime.style` and `runtime.config` (`popupHorizontalPosition`, `popupVerticalPosition`), not in `specials`; the auto-open trigger (`openPopupAction`, `timeOpenPopup`, `page_ids`, `effect`, `timeAnim`) lives in `specials`; and the overlay flag (`popup_overlay:true`) belongs on the `open_popup` event, not on the popup node itself; the section now promotes `scaffold_popup` as the recommended fast path.

## [1.27.0] - 2026-06-26

### Added
- `build_page` now accepts an `seo` object (`title`, `description`, `keyword`, `favicon`, `thumbnail`) that is written to `page.settings.seo` with Open Graph mirroring; tokens such as `{{name_product}} | {{name_site}}` are supported so pages no longer publish with an empty title and description.
- `create_page` now accepts the same `seo` object and writes it to `page.settings.seo` via a follow-up `update_page` call.

### Changed
- `scaffold_store_pages` now reads the active site theme's colour matrix and, for light brand seeds (e.g. beige stores), automatically switches the generated page accent from `var(--color_20)` to `var(--color_24)` so white button labels stay readable; explicit `palette` overrides still take precedence.

### Fixed
- `create_page` now maps its `type` parameter to the correct numeric backend value (`main`→1, `store`→2, `member`→3, `blog`→4, `custom`→5, `error`→6, `maintain`→7); previously the raw string was forwarded to the backend and silently ignored.
- `create_page` now applies `slug` and `is_homepage` via a follow-up `update_page` call, matching the pattern used by `build_page`; previously these fields were passed in the create body and silently ignored by the backend.

## [1.26.1] - 2026-06-26

### Fixed
- `list_products` now correctly unwraps the `{ products, total_product }` API response shape, returning a product array and accurate total instead of silently passing through the raw response object.
- `list_orders` now correctly unwraps the `{ orders: { data, total_entries, count_status } }` response shape and exposes `count_status` in the result.
- `list_collections` now correctly unwraps the `{ data: { data, total_entries } }` response shape and reports `total_entries` as the collection total.
- `get_active_promotions` now reads the `promotions` array from the top level of the response instead of the nested `res.data.promotions` path, fixing an issue where it always returned an empty list.
- `search_promotions` now routes to a working endpoint (`/promotion_advance/all`) with client-side filtering for `type`, `status`, `keyword`, and `is_activated`, replacing an endpoint that returned 404 on production.
- The default page colour palette no longer uses `var(--color_00)` (white) for text; it now maps to the site theme matrix with `var(--color_04)` (black) for text and `var(--color_20)` (brand primary) for accent, so headings generated by `build_page` and `scaffold_store_pages` are visible on white backgrounds.
- `createPopup` now seeds `runtime.config` (centred horizontal and vertical position) and `runtime.style` (480 px width, white background, 12 px border-radius) by default, so popup elements created via `new_section` or `build_page` render with correct geometry instead of collapsing to zero size.

### Changed
- `get_build_guide` colour advice now documents the 5×5 theme variable matrix (`var(--color_RC)`), explicitly identifies `var(--color_00)` as white (for backgrounds and labels on accent only, never for body text), and recommends `var(--color_04)` for text and `var(--color_20)` for brand-accent buttons, prices, and highlights.

## [1.26.0] - 2026-06-26

### Fixed
- `create_product` now accepts a `short_description` parameter and sends it to the backend as `[{description}]` — the array shape the real product schema requires — so product cards and detail pages bound to `product::short_description` are no longer blank.
- The `description` parameter of `create_product` now documents that it binds to `product::description` on the detail page, distinguishing it from the new `short_description` card-binding field.

## [1.25.0] - 2026-06-26

### Changed
- `list_elements` now documents 16 previously-uncovered element types, completing curated attribute coverage across all 132 factory types: `popup` (modal/overlay with `trigger`, `effect`, `overlay`, and position config; built as a `global_source` and opened via `open_popup`/`close_popup`), `notify` (toast banner, often wired to `add_to_cart`'s `activeNotify`), `random-number` (fake-stock urgency widget), `table` (datagrid-bound data table with row-colour config), `rectangle-dataset` (dataset-bound styled box), `reward-point`, `referral-code`, and `input-product-note` (checkout/cart form fields), `lucky-wheel` (spin-to-win marketing minigame), `tee-form` (product-design/print-on-demand form), `warehouse` and `warehouse-dataset` (pickup-branch selector and its dataset bindings), `calendar` and `calendar-content` (appointment-booking calendar), `collapse-content` (accordion body panel), and `question-container` (quiz/survey question wrapper).
- `list_elements` now documents `favorite-icon` with `config.mask` and `config.colorActive` keys, event names `add_wishlist_product` / `wishlist_remove_item`, and a note that it pairs with the `wishlist` header element.

## [1.24.0] - 2026-06-26

### Changed
- `list_elements` now documents `tabIndex` and `text_animation_type` as shared `specials` present on every element, covering tab-panel visibility binding and text entrance animation.
- `list_elements` now documents richer `specials` and `config` for layout elements: `section` gains sticky config (`stickyPosition`, `stickyTop`, `showShadowWhenSticky`) and video/pattern background keys; `container` gains full floating/pinned config (`fixedPosition`, `fixedRight`, `fixedBottom`, `fixedLeft`, `pinnedPoint`, `unpinnedPoint`) and collapsible-height config (`initMaxHeight`, `isUseInitMaxHeight`); `line` gains a `type` special (`horizontal|vertical`); `rectangle` gains `fixedPosition` and `animation` config keys.
- `list_elements` now documents richer `specials` and `config` for media and content elements: `video` gains `autoplay`, `loop`, `showControl`, and `id` specials plus `config.ratio`; `video-dataset` gains course-specific specials (`autoRotateInMobile`, `show_list_video_lesson`, `show_next_video_lesson`); `gallery` gains `showNavigation`, `arrowColor`, and `autoplay_time` specials plus `image_ratio` and `showPaginate` config; `carousel` gains full autoplay, slide-list, and pagination specials and config; `swiper` gains comprehensive autoplay, pagination, and transition specials plus nav config, with notes now identifying it as the primary hero/banner slider; `embed` gains `htmlCode` and `type` (`code|iframe`) specials; `googlemap` gains a `type` special and `config.maxHeight`; `countdown` gains the full set of duration, daily-reset, promotion, and display-control specials plus digit-background config; `breadcrumb` gains `config.hoverColor`; `text-dataset` gains a `tag` special and `config.hover_color`.
- `list_elements` now documents richer `specials` and `config` for commerce elements: `grid-product` gains card-control specials (`show_button`, `show_button_on_hover`, `textQuickBtn`, `action_add_to_cart`, `show_total_sold`, `show_wholesale_price`, `show_divider`, `barValue`, `saleInfoDisplayText`, `saleInfoSoldoutText`, `disable_filter`, `disable_search`, `promotion_id`, `action_product_card`) and card-style config (`image_border_radius`, `cardBackground`, ribbon styling keys, `paginationColor`); `slider-product` gains a full specials set matching `grid-product`'s card controls plus slider keys (`autoplay`, `autoplay_time`, `autoplay_step`, `show_navigation`, `arrow_icon`); `product-gallery` gains `show_ribbon`, `zoom_type`, `autoplay_video`, and `infinity` specials and full thumbnail config (`thumbnailPosition`, `thumbnailWidth`, `thumbnailHeight`, `scrollDirection`); `cart-icon` and `wishlist` gain badge font-weight and background config; `quantity-input` gains `showLeftBtn`, `min`, and `max` specials and per-button style config; `attr` gains a `tooltip` special and swatch-style config; `payment` gains specials for method list (`options`), `icon_color`, `runNow`, and `config.activeColor`; `order-history` gains full pagination, label, filter-preset, and auto-cancel countdown specials plus display config; `coupon` gains form-field specials (`label`, `placeholder`, `required`, `auto_fill_coupon`) and field config; `promotions` and `promotions-short` gain `displayPromotions` and layout config; `grid-category` and `slider-category` gain `showCategories` specials and image/card styling config; `post-list` and `slider-post` gain pagination, source-mode, layout, and semantic-tag specials; `tags` gains `auto_category_type`, `auto_option`, `use_filter_or`, and `keyword_suggestions` specials.

## [1.23.0] - 2026-06-25

### Added
- `get_build_guide` now includes a category-page filter recipe explaining how sidebar filter widgets (`checkbox-group`, `color-group`, `tags`, `two-point-range`, `radio-group`, sort `dropdown`) connect to a `grid-product` via `specials.filter_elements` and `specials.sync_tab` to re-query the product grid when an option is selected.

### Changed
- `list_elements` now documents a shared input-styling config set (`backgroundInput`, `placeholderColor`, `labelColor`, `textPadding`, `optionBorderColor`, `optionBorderWidth`, `optionBorderStyle`, `optionBorderRadius`) across all input-like field types (`input`, `email`, `phone-number`, `text-area`, `password`, `select`, `checkbox`, `radio`, `address`, `otp-input`, `identity`, and others), replacing the previous partial per-element coverage.
- `list_elements` now documents richer `specials` for form input fields: `password`/`retype-password`/`current-password` gain `showHidePassword`; `select` gains `isRetrieve`; `checkbox` and `radio` gain `options`, `defaultValue`, and `icon_color`; `address` gains `useNewAddress`, `isColumn`, and province/district/commune placeholder keys; `postal-code` gains regex and character-count keys; `country` gains `countries[]` and `defaultValue`; `input-date` gains `field_connect_pos`; `otp-input` gains `time_otp`; `rating-input` gains star icon SVG and colour specials; `input-search` gains search-modal, scope, and full icon config.
- `list_elements` now documents the category-page filter specials (`filter_elements`, `sync_tab`, `count`, `use_button_filter`) on `checkbox-group`, `radio-group`, `dropdown`, `color-group`, `two-point-range`, and `tags`, annotating each widget's role in driving a `grid-product`.
- `list_elements` now documents 15 previously-undocumented element types: `search-form`, `search-droppable`, `two-point-range` (price-range slider filter), `color-group` (colour-swatch filter), `tags` (chip filter), `auto-number` (count-up animation), `agency` (store-locator list), `user-point-log` (loyalty reward-point history), `empty-product-layout`, `cart-items-empty`, `cart-droppable` (mini-cart drawer), `lesson-sidebar`, `lesson-items`, `next-lesson-droppable`, and `list-lesson-droppable` (course app).
- `list_elements` now documents `form` with three additional `specials.type` values (`customer_data`, `reset_password`, `forgot_password`), `multiForms`/`formParent` for split order forms, `tabIndex` for account-panel binding, and `autoGetInfoCustomer`.
- `list_elements` now documents navigation elements more completely: `menu` gains icon-mode config (`shapeType`, `url`, `mask`), `isPostList`, and hover/active style keys; `menu-item` gains `linkBlogCategory`, `linkCategoryTarget`, custom `link`, and `isSync`; `submenu` and `menu-droppable` gain animation config (`effect`, `timeAnim`); `member-bar` gains login/signup labels, popup ids (`login_popup`, `register_popup`), and avatar layout config; `member-dropdown` gains `dropdown_position`; `language-menu` gains `show_flag`, display `type`, and full colour config.
- `list_elements` now documents `tabs` with its `tabs[]` definition array, `navMode`, `showNav`, `showBullet`, `showDivider` specials, and `navPosition`/`alignNav`/`nav_display_style` config; `switch` gains `defaultValue`, `backgroundSlider`, `colorRound`, and `colorSlider`.

## [1.22.0] - 2026-06-25

### Added
- `list_bindings` now returns a `meta_keys` map documenting binding combine-keys mined from 34 production templates — `name_style`, `attr_id`, `prefix_content`, `separator`, `value` (dual-source computed display), `number_of_line_title`, and others — that control how a bound field renders or combines inside an element.
- Three new binding datasets are available: `agency` (store-locator branch fields: `name`, `phone_number`, `address`, `time`), `blog` (blog category heading on list pages), and `search_result` (search query and matched products on a search page).
- The `product` binding dataset now includes `discount_price_to_original_price` and eight course/LMS fields: `total_course`, `total_course_learning`, `course_member_quantity`, `course_total_time`, `course_video_quantity`, `lesson_name`, `lesson_description`, and `video_lesson`.
- The `cart_item` binding dataset now includes `cart_surcharge_fee`, `discount_percent`, `discount_reward_point`, and `total_price_all_promotions`.
- The `order` binding dataset now includes `order_promotion_coupon`; the `customer` dataset now includes `succeed_order_count`.
- 21 event actions previously flagged as unknown by `validate_page` are now recognized: `search`, `open_quick_view`, `back_to_menu_parent`, `toggle_group`, `add_wishlist_product`, `wishlist_remove_item`, `close_search`, `close_cart_item`, `edit_cart_item`, `change_column_grid_prd`, `open_product_page`, `set_address_default`, `copy_promotion`, `use_reward_point`, `transform_x`, `transform_y`, `cursor`, `lightbox`, `change_avatar`, and `open_preview_product_gallery`; the recognized event action count grows from 37 to 58.
- `get_build_guide` now includes a "Composition recipes" section describing self-rendering repeaters (`grid-product`, `slider-product`, `post-list`) versus hand-composed dataset-cell rows (`cart-items`, `order-items`, `layout-dataset`, `promotions`), and the canonical dual-menu header pattern (horizontal desktop `menu` + hamburger/collapse mobile `menu` with `cart-icon`, `input-search`, `member-bar`, and `language-menu`).

### Changed
- `list_elements` now documents two additional `menu` `type` values — `collapse` and `grid` — and its notes now describe the dual-menu header pattern (separate desktop and mobile `menu` elements) found in real production templates.
- `open_popup`, `open_page`, `add_to_cart`, and hover actions (`change_background`, `change_text_color`, `change_border_color`, `scale`) now expose additional optional fields (`apply_element`, `cursor`, `el_target_id`, `open_page_id`, `open_popup_id`, etc.) drawn from real template usage.
- `get_build_guide` binding documentation now covers the combine-keys (`name_style`, `prefix_content`, `value` for dual-source computed nodes, `number_of_line_title`, `attr_id`) and points callers to `list_bindings → meta_keys` for the complete reference.

## [1.21.0] - 2026-06-25

### Changed
- The `grid-product` factory now ships cross-industry neutral defaults (`image_ratio:"1/1"`, `gap_column`/`gap_row` 24, `products_per_load` 12) instead of the previous fashion-specific values (`image_ratio:"4/5"`, gaps 30/15, `products_per_load` 36, hard-coded 18 px font sizes); callers of `build_page` and `new_section` should now explicitly set `image_ratio`, column count, and font sizes to match the target brand.
- The `quantity-input` factory now defaults to `specials.spinner:"hide-spin"`, matching the universal pattern found across all five surveyed production templates; callers can override via `opts.specials`.
- `list_elements` now returns richer documentation for `grid-product`, covering the full `specials` surface (`category_id`, `show_rating`, `load_rating`, `show_ribbon`, `load_brand`, `load_category`, `on_hover`, `randomDisplay`, `typeLinkCategory`, `plugins`) and additional `config` colour keys (`productNameColor`, `productNameHover`, `productPriceColor`, `productOriginalPriceColor`), with a note that `image_ratio`, column count, and gaps are industry-dependent.
- `list_elements` now returns full documentation for `product-gallery` (`specials.showNavigation`, `specials.on_hover`, `config.sizeThumbnail`, `config.image_ratio`), `quantity-input` (`specials.spinner`, `specials.showRightBtn`, `config.textColor`), and `attr` (variation selector — `specials.attrName`, `specials.autoAttrName`, `specials.attrPrimary`, `specials.layout`, `specials.defaultSelected`, `config.borderColorHover`).
- `get_build_guide` PRODUCT GRID note now states that `grid-product` config is industry-dependent (surveyed fashion/kids/cosmetics/food/electronics), documents configurable ranges for `image_ratio` (4/5 fashion, 2/3 kids, 3/4 food, 1/1 square), `columns` (1–6), and `gap` (8–40), and adds guidance on using `attr (attrName:"auto")` for variation selectors and `quantity-input` defaulting to `spinner:"hide-spin"`.

## [1.20.0] - 2026-06-25

### Changed
- The header generated by `scaffold_global_sections` now uses a `menu` element with `menu-item` children for navigation links, matching real production template structure; each item's navigation is wired through `specials` (`linkType`, `linkPage`, `pageId` for pages; `linkType:"custom"` + `link` for URLs) instead of `events`, so nav links render and navigate correctly on the live storefront.

## [1.19.1] - 2026-06-25

### Fixed
- `create_site_from_template` now auto-generates a URL-safe slug from the site name when none is supplied, fixing the 400 error returned by the backend when `slug` is absent.
- The `grid-product` factory now merges caller-supplied `opts.config` and `opts.specials` over the defaults instead of silently discarding them, so `build_page` and `new_section` callers can override any card field.

### Changed
- Builder element factories for `grid-product`, `cart-icon`, and `product-gallery` now ship real designer-template defaults derived from production themes (`image_ratio` `4/5`, `products_per_load` 36, `gap_column` 30 / `gap_row` 15, bold price, `show_original_price` / `show_discount_on_price` enabled, a default bag SVG for `cart-icon`, thumbnail sizing for `product-gallery`), so pages generated by `build_page` and `new_section` match production template quality without additional config.
- Checkout page template generated by `scaffold_store_pages` now uses real `form_order` config keys (`backgroundInput`, `placeholderColor`, `labelColor`, `borderColor`, `borderRadius`), includes an email field, and adds a success event that redirects to the Thank-you page.
- `get_build_guide` now documents correct `grid-product` config keys (replacing the fictional `cardBorderRadius` / `cardBoxShadow`), the `menu-item` SPECIALS navigation pattern (vs. `events` on generic elements), and a form success-redirect recipe.
- `list_elements` now returns richer documentation for `grid-product`, `cart-icon`, `menu`, `menu-item`, `form`, `cart-items`, and `order-items`, with real config keys and behavioral notes mined from production templates.

## [1.19.0] - 2026-06-25

### Added
- New `scaffold_global_sections` tool generates a fully-designed global Header and Footer in one call — logo, nav links, cart icon, CTA button, and a branded footer with contact info and link columns — then embeds both on every page of the site; it skips a slot that already has a global section (pass `force=true` to override), and supports `dry_run=true` (default) to preview affected pages before committing.
- `scaffold_store_pages` now accepts a `style` parameter (`"rich"` default or `"minimal"`) and an optional `palette` override; `style:"rich"` generates fully-designed, palette-aware pages for every store page type — banner + breadcrumb + styled product grid (Category), two-column gallery/info layout with price, quantity, add-to-cart, trust badges, and related products (Product Detail), two-column cart and checkout layouts (Cart/Checkout), and a centred confirmation page (Thank-you) — with navigation automatically wired between them (add-to-cart→cart, cart→checkout, thank-you→home).

### Changed
- `get_build_guide` now describes the updated smart build flow: `scaffold_store_pages` produces fully-designed pages by default and `scaffold_global_sections` adds designed Header/Footer chrome in one call; `style:"minimal"` is documented as the opt-out for hand-built stubs.
- `get_intake_guide` `recommended_flow` now references `scaffold_store_pages (style:"rich")` and `scaffold_global_sections` in the recommended site-build sequence.

### Fixed
- `list_products` no longer returns a 400 error when called without explicit `page` or `limit` arguments; the tool now defaults `page` to 1 and `limit` to 50, and drops undefined or blank query keys before sending the request.

## [1.18.1] - 2026-06-25

### Changed
- `get_build_guide` now includes three new sections: "Build the WHOLE storefront" with per-page recipes for enriching category, product detail, cart, checkout, and thank-you pages to the same visual standard as the home page; "Global Header & Footer" documenting the `create_global_section` workflow (type `"header"`/`"footer"`, build-order rule — create page content first, then globals — and re-embed-after-overwrite pattern for `update_page_source`/`build_page`); and "Popups" covering the end-to-end workflow from building with `new_element("popup")` and `specials`, saving via `create_global_source` with `component:"popup"`, to triggering with `open_popup`/`close_popup` events.
- The server instructions now direct the agent to build the whole site (not just the home page), use `create_global_section` for a consistent header and footer on every page, and build newsletter or promo offers as popup global sources rather than inline sections — pointing to `get_build_guide` for per-page recipes and workflow details; `scaffold_store_pages` also now carries a notice in its description that the pages it creates are minimal starters (heading + binding element only) requiring enrichment and a global header/footer before the site is considered complete.

## [1.18.0] - 2026-06-25

### Added
- New `get_intake_guide` tool returns a step-by-step questionnaire and recommended build flow (create_site → products → build_page → global sections → publish_site) for use before starting a fresh site or page build; the server instructions now direct the agent to call it, gather the brief, restate the plan, and get confirmation before building.

### Fixed
- `publish_site` now automatically calls a new `rebuildSiteCss` routine before publishing, replaying the builder's `/save` pipeline to regenerate every page's compiled CSS; previously, sites edited only through the MCP shipped with stale or empty CSS and rendered unstyled on the live storefront.
- `stackChildren` and `rowChildren` now assign `constraintX: ["left","right"]` (stretch) to fill-width component types (`grid-product`, `slider-product`, `cart-items`, `order-items`, `post-list`, `grid-category`, `grid-blog`, `form`, and related repeaters) instead of the default `["centerLeft"]` (center), so product grids and other repeater layouts no longer collapse to a single column on the storefront.
- `create_product` now always includes `product_attributes: []` in the request body even for products with no attributes, preventing a 500 error on the storefront's product-attributes endpoint for attribute-less products.

## [1.17.1] - 2026-06-25

### Changed
- `get_http_function` and `get_site_custom_code` now include a "File / media uploads" section in the embedded HTTP function guide, documenting three ways to upload files from inside a function and receive a permanent CDN URL: automatic URL injection for multipart form-data file POSTs, `@webcake/media` `upload()` for re-hosting a remote URL or uploading base64 bytes, and a direct admin API call.

## [1.17.0] - 2026-06-24

### Added
- New `new_row` tool builds a multi-column responsive row container where child elements are placed side by side (left to right); the row auto-collapses to two columns on tablet and one column on mobile, with `column_gap`, `row_gap`, `col_widths`, and `collapse` parameters available for tuning.
- Container child specs passed to `new_section` and `build_page` now accept a `layout` field; set `layout:"row"` to place that container's children side by side instead of stacked, with optional `columnGap`, `rowGap`, `colWidths`, and `collapse` fields for fine-grained responsive control.

### Changed
- `get_build_guide` now includes a "Multi-column rows" section documenting the `new_row` tool and the `layout:"row"` container spec pattern, with examples for feature cards, category tiles, footer columns, and two-column hero layouts.

## [1.16.0] - 2026-06-24

### Added
- New `uninstall_app`, `update_app`, and `update_app_review` tools complete the app lifecycle: uninstall an installed app by subscription id, patch an app's config/status, and update the product-review app's `shop_info` and auto-approve settings specifically.
- New product-review tools: `list_reviews`, `get_review`, `get_review_products`, `create_or_update_review` (create a new review, edit an existing one, or post a shop reply via `is_shop: true`), `moderate_reviews` (bulk approve or hide by `permission`), and `remove_reviews`.
- New appointment-booking tools covering calendars (`list_appointment_calendars`, `create_appointment_calendar`, `update_appointment_calendar`, `delete_appointment_calendars`, `duplicate_appointment_calendars`), booked appointments (`list_appointments`), locations (`list_appointment_addresses`, `create_appointment_address`, `update_appointment_address`, `delete_appointment_addresses`), service types (`list_appointment_classifies`, `create_appointment_classify`, `update_appointment_classify`, `delete_appointment_classifies`), and assignees (`list_appointment_employees`, `create_appointment_employee`, `update_appointment_employee`, `delete_appointment_employees`).
- New affiliate tools: `get_affiliate_programs`, `get_affiliate_statistic`, `list_affiliate_products`, `list_affiliate_orders`, `list_affiliate_accounts`, `list_affiliate_payouts`, `update_affiliate_order_program`, `update_affiliate_product_program`, `upsert_affiliate_product`, `delete_affiliate_products`, `update_affiliate_payout_status`, `delete_affiliate_accounts`, and `update_affiliate_account`.
- New catalog-extras tools: brands (`list_product_brands`, `upsert_product_brand`), suppliers (`list_product_suppliers`, `upsert_product_supplier`), product tags (`list_product_tags`, `upsert_product_tag`), ribbons/sale-badges (`list_ribbons`, `upsert_ribbon`), materials (`list_materials`, `upsert_material`), variation detail (`get_variation`), measurement units (`get_product_measurement`, `update_product_measurement`), phone blocking (`list_blocked_phones`, `block_phone_customers`, `unblock_all_phone_customers`), contact-for-price config (`get_price_contact`, `update_price_contact`), and single-category fetch (`get_category`).
- New site-configuration tools: custom domains (`list_domains`, `add_domain`, `update_domain`, `verify_domain`, `delete_domain`, `check_domain`), SEO 301 redirects (`list_redirect_urls`, `create_redirect_url`, `update_redirect_url`, `delete_redirect_urls`), shipping rules (`get_shipping`, `update_shipping`), UTM links (`list_site_utms`, `create_site_utm`, `update_site_utm`, `delete_site_utms`), activity logs (`list_entity_logs`), saved table filters (`list_saved_filters`, `create_saved_filter`, `update_saved_filter`, `delete_saved_filter`), general settings and identity (`update_site_settings`, `rename_site`, `update_site_slug`), fonts (`list_fonts`, `remove_font`, `list_font_groups`, `create_font_group`, `remove_font_group`), and API keys / publish history (`list_api_keys`, `list_publish_histories`).
- New marketing and CRM tools: transactional email templates (`get_email_templates`, `save_email_templates`), contact-form submissions (`list_contacts`, `create_contact`, `delete_contacts`), newsletter subscribers (`list_subscribers`, `create_subscriber`, `delete_subscribers`), customer tags (`list_customer_tags`, `upsert_customer_tag`, `assign_customer_tags`), team members (`list_employees`, `invite_employee`, `update_employee_permissions`, `delete_employees`), site invitations (`list_invitations`, `accept_invitation`, `refuse_invitation`), analytics snapshots (`get_insight_today`, `get_insight`), and account notifications (`list_notifications`, `mark_notification_read`).
- New multilingual tools: `add_site_languages` (set the complete list of enabled languages), `set_default_language`, `list_translations` and `save_translations` (covering all translatable resource types: product, combo_product, product_attribute, category, ribbon, article, article_category, promotion, page_name, site, notification), and `auto_translate` (machine-translate a JSON key→value blob between two language codes).
- New media-library and PWA tools: `list_media_folders`, `list_media_content`, `list_media_all`, `get_media_capacity`, `upload_media_base64` (upload an image from a base64 data URI and receive a CDN URL), `update_media_folder`, `update_media_content`, `empty_media_trash`, `get_pwa`, and `update_pwa`.
- New advanced-app tools: Product Design (`get_device_templates`, `create_products_from_device_templates`), Personal Product Design/PPD (`list_ppd`, `upsert_ppd`, `remove_ppd`, `get_ppd_variation_template`), and Course app (`list_courses`, `get_course`, `create_course`, `update_course`, `delete_course`, `delete_courses`, `get_course_members`).
- New sale-channel tools: sitemap (`sync_sitemap`, `rebuild_sitemap`), partner product feeds for Google Shopping, Facebook, and other channels (`list_partner_feeds`, `create_partner_feed`, `update_partner_feed`, `delete_partner_feeds`, `list_partner_feed_products`, `sync_partner_feed`), and read-only Google Merchant records (`list_google_merchants`).
- New `list_tool_groups` tool lists all 15 tool groups with per-group tool counts and whether each group is loaded natively or available on-demand.
- New `search_tools` tool finds tools across the full 271-tool catalog by English keyword, returning name, group, description, and JSON input schema; covers all groups including those not natively loaded.
- New `invoke_tool` tool runs any WebCake tool by its exact name with zod-validated arguments, enabling callers to use on-demand groups without loading the full catalog into context.

### Changed
- Tools now load under a progressive-disclosure model: the four core groups (session, page building, store, content, ~123 tools) register natively on startup; the remaining 11 groups (marketing, i18n, media, appointment, affiliate, reviews, site_config, catalog, apps_advanced, channels, automation) are on-demand and reached via `search_tools` + `invoke_tool`, preventing all 271 tool schemas from consuming context budget at once.
- A capability-map index listing every tool group and its load status ([loaded] vs. [on-demand]) is injected into the system prompt so the model always knows which domains exist and when to call `search_tools`.
- The `WEBCAKE_TOOLS` environment variable (and `ServerOptions.tools`, per-request `x-webcake-tools` header, or `?tools=` query parameter) controls which groups load natively; accepted forms: `all`, a comma-separated group list such as `core,marketing`, or a delta form such as `+i18n,-store`.

## [1.15.1] - 2026-06-24

### Fixed
- `update_page_element`, `update_page_elements`, `update_global_source_element`, and `update_global_source_elements` now normalize `events` and `bindings` arrays on update, ensuring every entry has a valid `id` and `eventName`; previously events were stored without `eventName` and the storefront renderer never dispatched them.
- Event normalization now applies the correct element-type-aware default `eventName` on both creation and update paths, mirroring the builder editor: `form→success`, `swiper→tab`, `popup→hide`, `input-search→onenter`, `submit-button→hover`; all other element types default to the action's own trigger or `click`.
- `normalizeBindings` now accepts a bare `"name::field"` string entry and converts it to a well-formed binding object, preventing a dropped binding when callers pass the shorthand target notation.

## [1.15.0] - 2026-06-24

### Added
- New `get_global_section` tool returns a compact tree representation of a single global section (Header/Footer/block), listing each element's id, type, text, class, bindings, and events in 3–5x fewer tokens than raw JSON; pass `raw=true` to retrieve the full tree via the large-result cache instead.
- New `search_global_section_elements` tool searches and filters elements within a global section by type, id substring, custom class, text content, or presence of bindings/events, without loading the full element tree.
- New `get_global_section_element` tool returns full detail (style, config, specials, events, bindings, responsive bp1..bp4, children ids) for a single element inside a global section.
- New `create_global_section` tool creates a reusable global section (Header, Footer, or shared block) via the builder's `/save` pipeline and atomically embeds the same section node into page sources so it renders across the site; supports `dry_run=true` (default) to preview which pages would change before committing.
- New `delete_global_section` tool deletes a global section record and removes its node from every page source in a single atomic save; supports `dry_run=true` (default) to preview affected pages.
- New `read_cached_result` tool reads a paginated slice of a large result stored in the session cache by another tool, enabling chunk-by-chunk access to payloads that are too large to fit in a single tool result.
- New `list_cached_results` tool lists all large results currently held in the session cache, showing cache_id, label, size in characters, and age.

### Changed
- `list_global_sections` now returns a slim summary (id, slot, element count, type histogram, custom classes, ~1 KB) instead of the raw multi-megabyte tree, preventing token overflow on real sites; use `get_global_section` to drill into a specific section's element tree.

## [1.14.0] - 2026-06-24

### Added
- New `list_events` tool returns the authoritative interaction-events catalog: 9 triggers (click, hover, submit, success, ...) and 38 actions (open_page, scroll_to, toggle, open_popup, add_to_cart, buy_now, phone_call, open_link, ...) with the exact extra fields each action requires; pass events to `new_element` or `new_section` via `opts.events`.
- New `list_bindings` tool returns the authoritative data-binding catalog: 14 datasets (product, cart_item, order, order_item, post, category, customer, customer_address, ...) with their exact `target` field names, the page `type` each dataset requires, and how repeater children (grid-product, cart-items, post-list, ...) resolve per-item bindings automatically; pass bindings to `new_element` via `opts.bindings`.

### Changed
- `new_element` and `new_section` now automatically attach and normalize `opts.bindings` and `opts.events` on the returned node, auto-minting valid `id` values and inferring `name`/`eventName` — callers no longer need to set ids by hand.
- `validate_page` now validates every node's `events` and `bindings` arrays against the authoritative catalogs, reporting warnings for unknown triggers, unknown actions, missing required action fields, dangling in-page event targets (`toggle_id`, `scroll_to_id`, `change_tab_id`, `target_id`), and unrecognized binding targets.
- `get_build_guide` now includes a full Events section documenting triggers, the most-used actions with their required fields, and a code example using `add_to_cart`; the bindings section is expanded with repeater-context rules (how `grid-product → product`, `cart-items → cart_item`, and `post-list → post` per-item resolution works).
- `get_element` now surfaces hints to call `list_events` and `list_bindings` alongside its existing layout hints.

## [1.13.0] - 2026-06-24

### Added
- New `restore_file_version` tool rolls a CMS file back to a saved version in one step: it reads the chosen version's content (via `get_file_versions`) and writes it back with `update_cms_file`; omit `version_id` to restore the most recent snapshot, completing the save/list/restore versioning loop.

### Changed
- `get_file_versions` description now references `restore_file_version` as a one-step alternative to manually passing saved content back to `update_cms_file` or `update_http_function`.

## [1.12.1] - 2026-06-24

### Fixed
- `save_file_version` and `get_file_versions` both sent the parameter as `cms_file_id`, but the backend reads `file_id`; versions were saved unlinked to any file and version history always returned empty.

### Changed
- `get_file_versions` description now states that each returned version includes its full saved content, and documents how to restore a prior version by passing that content to `update_http_function` (for HTTP-function files) or `update_cms_file`.

## [1.12.0] - 2026-06-24

### Added
- New `update_product` tool updates an existing product's `name`, `description`, `images`, `category_ids`, `is_published` flag, or `variations` (price/stock/SKU per variant); pass only the fields to change alongside `product_id`.
- New `set_product_published` tool publishes or unpublishes one or more products by `product_ids` in a single call, without requiring a full `update_product`.
- New `delete_product` tool deletes one or more products by `product_ids`.
- New `update_product_category` tool updates a product category's `name`, `image`, `description`, or visibility (`hidden` flag) by category `id`.
- New `delete_product_category` tool deletes one or more product categories by `ids`.

## [1.11.1] - 2026-06-24

### Fixed
- `create_site_from_template` now calls the dedicated `import_store_to_theme` API instead of the generic site-duplicate endpoint, correctly cloning the template's pages, global sections, cart, popups, styles, and fonts into the new site.

### Changed
- `create_site_from_template` now requires `theme_id` as the sole template identifier; the `template_site_id` parameter is removed — pass the `theme_id` returned by `semantic_search_themes` or `list_template_themes` directly.
- `semantic_search_themes` and `list_template_themes` results no longer include the `template_site_id` field, which was only needed to feed the now-removed parameter.

## [1.11.0] - 2026-06-24

### Added
- New `create_site_from_template` tool clones a marketplace template (all its pages, page-sources, and settings) into a new account-owned site, switches to it automatically, and returns a preview URL; accepts `theme_id` (from `semantic_search_themes` / `list_template_themes`) or `template_site_id` directly, with an optional `slug` and a `switch_to` flag (default `true`).
- `semantic_search_themes` and `list_template_themes` results now include a `template_site_id` field exposing the template's source site id, and the response now includes a top-level `hint` directing agents to call `create_site_from_template` after picking a theme.

## [1.10.0] - 2026-06-24

### Added
- New `scaffold_store_pages` tool creates the standard storefront pages (Category, Product, Cart, Checkout, Thank-you) so navigation links resolve instead of returning 404; optional `include_member` and `include_blog` flags add login/register/profile and blog/post pages; pages that already exist are skipped; `dry_run=true` (default) previews what would be created without making any changes.

### Changed
- Sections built by `new_section` now receive default vertical padding (56 px top and bottom) and stacked children get a 16 px `rowGap` so layouts breathe instead of cramming elements edge-to-edge.
- `get_build_guide` now includes a "Make it look DESIGNED" playbook covering section padding and background variety, spacing rhythm, typography hierarchy, required button colour styling (`background` and `color` must be set explicitly), hero-with-background-image layout, product-grid card config keys (`cardBorderRadius`, `cardBoxShadow`, `productNameColor`, `productPriceColor`), and brand accent colour usage via `var(--color_NN)` theme variables.

## [1.9.0] - 2026-06-24

### Added
- `search_images` now accepts an `upload` parameter (default `true`) that re-hosts each Pexels result on the WebCake CDN and adds a `cdn_url` field to every photo entry ready to use in `runtime.config.src` or product images; pass `upload:false` to browse raw Pexels URLs without re-hosting.
- Image CDN uploads are now cached per site so that uploading the same source URL or local file path a second time returns the cached CDN URL instantly; in `serve` mode the cache is stored in Redis (shared across instances, survives redeploys), with an automatic fallback to a local JSON file in stdio/npx mode.

### Changed
- `search_images` now re-hosts results to the WebCake CDN by default, because the storefront whitelists image domains and raw Pexels URLs will not render on a page; the response includes an `uploaded_to_cdn` flag and a `note` field indicating which URL to use.
- `get_build_guide` now documents that `runtime.config.src` for image elements must be a WebCake CDN URL, since external URLs from Pexels or other sources are not whitelisted and will not display on the storefront.

## [1.8.0] - 2026-06-23

### Added
- New `list_automations` tool returns each automation's `id`, `name`, `status`, and trigger info so agents can find the `automation_id` required by `send_mail` or by `sendMail` inside an HTTP function.
- New `create_automation` tool creates a site automation with a `name`, `status`, and `rule` (trigger + actions map), and automatically installs the Automation app on the site if it is not already present.
- New `update_automation` tool updates any combination of `name`, `description`, `status`, or `rule` on an existing automation by `id`.
- New `delete_automation` tool deletes one or more automations by their `id` values.
- New `install_app` tool registers a named application (e.g. `automation`, `send_email`, `cms`) on the current site and is idempotent — it returns immediately if the app is already installed.

### Changed
- `send_mail` now uses the correct `{ automation_id, data }` request contract; the former `to` / `subject` / `body` parameters are replaced by `automation_id` (a UUID from `list_automations`) and a `data` payload object passed to the email template.
- `list_apps` now returns a normalized `apps` list that includes a `type_name` string alongside the numeric `type` code, and appends an `app_types` reference map to the response.
- `get_app` now accepts the app type as either a numeric code or a human-readable name string (e.g. `"automation"`).
- The embedded HTTP function guide returned by `get_http_function` and `get_site_custom_code` is substantially expanded: the full `request` argument shape is documented, each `@webcake/*` module now shows its exact backend endpoint and accepted fields, sandbox globals and runtime limits are listed, and a complete end-to-end example function is included.

## [1.7.0] - 2026-06-23

### Changed
- The web guide landing page (served via the `serve` command) is reframed to lead on full-storefront creation: the hero, meta description, "What you build" gallery, example prompt, and product-tool group description now highlight creating products, categories, shop pages, and blog posts with images — replacing the previous single-page-build narrative.
- The web guide visual theme is retoned from purple/lavender to teal/neutral, the dark mode is deepened, the body now uses a subtle vertical gradient, a layered teal aurora mesh, a faint masked grid texture, and a third animated blob are added for visual depth.

## [1.6.0] - 2026-06-23

### Added
- `get_element` now returns an `attributes` field with a curated per-element reference covering the meaningful `specials`, `config`, `events`, and `bindings` keys — sourced from 329 real published pages, factory defaults, and builder panel traits — so agents know which keys to set before authoring or editing an element.

## [1.5.1] - 2026-06-23

### Fixed
- `build_page` now passes the finalized page `source` to `create_page` in the initial create call (required by the backend), then sets `slug` and `is_homepage` via a follow-up `update_page` call; the previously broken separate `updatePageSource` step is removed.
- `create_product` now always sends `categories` and `ribbons` as arrays, preventing a 500 error from the backend when either field is nil; the new product id is now correctly parsed from `res.product.id`.
- `publish_site` now fetches the current site settings before publishing and sends them as a JSON string, preventing a 422/500 error that previously nulled out settings (disabling `use_store`, `use_blog`, and similar flags) on each publish.

## [1.5.0] - 2026-06-23

### Added
- New `create_product` tool creates a storefront product (simple name + price, or advanced with named `attributes` and per-SKU `variations`); accepts hosted image URLs and `category_ids` so `grid-product` and `slider-product` bindings have real merchandise to display.
- New `create_product_category` tool creates a product category and returns the new `category_id` to pass to `create_product`.
- New `create_blog_category` tool creates a blog/article category and returns the new `category_id` to pass to `create_article`.

### Changed
- `create_article` is rewritten to use the dashboard command pipeline: `category_ids` (array) replaces `category_id`, the `slug` / `tags` / `is_hidden` parameters are removed, all fields except `name` are now optional, and the backend generates the article id and slug.
- Server instructions now document the recommended data-population flow for a fresh site: `create_site` → `create_product_category` / `create_blog_category` → `create_product` / `create_article` → `build_page` → `publish_site`.

## [1.4.0] - 2026-06-23

### Changed
- The `install` command's interactive wizard now presents numbered choices with ANSI colour output and a completion summary.
- The `install` command now supports 11 IDEs and agent hosts (up from 5), adding Codex (TOML format), Antigravity, Gemini CLI, Cline, Kiro, and OpenCode alongside the existing Claude Desktop, Claude Code, Cursor, Windsurf, and VS Code; Claude Code is configured via `claude mcp add` when the CLI is available; `uninstall` removes the server entry from all 11 configs.
- The browser-login success page shown after `login` completes is redesigned with a gradient card, animated checkmark, and dark-mode support; on macOS the CLI automatically re-focuses the originating terminal or IDE after the token is received.

### Fixed
- On Windows, the `login` command now opens the authorization URL via `cmd /c start` with verbatim argument passing so the `&state=` query parameter is no longer truncated by the shell command separator.
- The `login` callback server now ignores requests to paths other than `/callback` (such as favicon fetches) so stray browser requests no longer abort the login flow, and live keep-alive connections are dropped on shutdown so the CLI process exits promptly.

## [1.3.0] - 2026-06-23

### Added
- New `create_site` tool creates a brand-new storefront site for the current account (seeded with sample products, categories, and a blog), optionally switches to it immediately, and returns a preview URL; quota errors on free accounts (4-site limit) are surfaced with a clear message.

### Changed
- Sections built by `new_section` now use the builder's centred 3-column grid (flexible margin · up to 1300px content column · flexible margin), matching the builderx_spa layout model; children are placed in the centre column (`columnStart:2`, `columnEnd:3`) instead of the former single-column layout.
- `get_build_guide` now documents the correct breakpoint key names (`bp1`..`bp4`, replacing former aliases `tablet` and `laptop`), the centred 3-column section grid, concrete data-binding target names (`product::product_price`, `cart_item::cart_item_price`, `order_item::product_name`, etc.), theme colour variable syntax (`var(--color_NN)`), and the automatic `runtime`-to-breakpoint expansion that `build_page` and `add_section` perform on save.

### Fixed
- `build_page` and `add_section` now expand each node's `runtime.{style,config}` into the four per-breakpoint keys (`bp1`, `bp2`, `bp3`, `bp4`) the storefront renderer reads before saving the page; previously, nodes saved with only a `runtime` key appeared completely unstyled because the renderer does not fall back to `runtime`.

## [1.2.0] - 2026-06-23

### Added
- `upload_images` replaces `upload_image` with batch support (1–20 sources per call), parallel uploads, and a `dry_run` mode that previews what would be processed without uploading.
- `upload_images` accepts local file paths (absolute, `~/`, `file://`) in stdio mode so images on the user's machine can be uploaded directly to the site CDN.
- `build_page` now accepts a `type` enum (`main`, `store`, `member`, `blog`, `custom`, `error`, `maintain`) and automatically enables the matching site data-source flag (`use_store`, `use_member`, `use_blog`, `use_error`, `use_maintain`) before creating the page, so product, customer, and blog bindings resolve on first load.
- `get_build_guide` now includes a "Page types & data sources" section documenting the page kind enum, `PAGE_TYPE` numeric values, required data-source flags, and binding names for each special page type.

### Changed
- `build_page`'s `type` parameter is now a typed enum instead of a free string; the dry-run response includes new `page_type_num` and `will_enable_feature` fields, and the success response includes `page_type` and `data_source`.
- References to `upload_image` in `ingest_html` and `ingest_url` hints have been updated to `upload_images`.
- `set_image_alts` no longer auto-caches generated alt text between runs; the `cached_alt` field has been removed from `list_image_alts` output.

### Removed
- `upload_image` (singular) has been replaced by the new `upload_images` batch tool.
- `get_cached_image_alts`, `save_image_alts_cache`, `list_image_alts_cache`, `sync_image_alts_to_mongo`, and `sync_image_alts_from_mongo` tools have been removed along with the local image-alt cache and MongoDB sync layer.

## [1.1.4] - 2026-06-23

### Added
- The remote landing page served by the `serve` command now includes a "What's new" section that renders a version timeline loaded from a build-time `changelog.json` (generated from CHANGELOG.md and CHANGELOG.vi.md), with the current version shown as a pill badge in the hero bar and a nav link added to the page navigation.

## [1.1.3] - 2026-06-23

### Changed
- The `install` command's interactive wizard now runs a three-step flow: environment selection (`prod` / `staging` / `local`), authentication, then IDE configuration.
- During `install`, the authentication step now offers a recommended browser-login path (credentials saved to the local config file, not injected into IDE environment blocks) alongside the existing manual token + session ID paste option.
- The remote landing page's "Way ②" now directs users to `webcake.io/mcp-remote-store` to retrieve a personal pre-authenticated connector link instead of displaying a static MCP endpoint URL, and adds a security note that the personal link contains login credentials.

## [1.1.2] - 2026-06-23

### Fixed
- The server no longer crashes at startup in container environments built with `npm ci --ignore-scripts`; the `better-sqlite3` native SQLite module has been replaced with plain JSON file persistence (`config.json` and `image-alt-cache.json`) stored in `~/.webcake-storefront-mcp/`.

### Changed
- The landing page served by the `serve` command has been recolored from violet/indigo to teal-green (`#108B67`).
- The landing page no longer displays npm version, download, and license shields.io badges, and the footer no longer includes links to npm or the `/health` endpoint.
- The descriptions of `get_cached_image_alts`, `sync_image_alts_to_mongo`, and `sync_image_alts_from_mongo` now refer to the "local cache" instead of "local SQLite cache" to reflect the storage migration.

## [1.1.1] - 2026-06-23

### Added
- The `serve` command's OAuth token store now optionally uses Postgres (via `DATABASE_URL`) for durable persistence across restarts and shared state across multiple instances behind a load balancer, and Redis (via `REDIS_URL`) for caching access-token lookups; both are optional and the server falls back to in-memory when neither is configured.
- The landing page served at `/` by the `serve` command now supports bilingual content (Vietnamese and English) selectable via the `?lang=en` query parameter.

### Changed
- The landing page at `/` has been redesigned with simplified, non-technical copy and an updated violet/indigo color palette.

## [1.1.0] - 2026-06-23

### Added
- The `serve` (remote Streamable-HTTP) mode now embeds a full OAuth 2.1 Authorization Server at `/authorize`, `/token`, `/revoke`, `/register`, and `/.well-known/oauth-authorization-server`, allowing the claude.ai Connector Directory to authenticate via a browser-based PKCE consent flow without pre-sharing credentials.
- The `serve` command now serves a marketing landing page at `/` (HTML for browsers and known crawlers, JSON for programmatic clients) plus a favicon at `/favicon.svg` and `/favicon.ico`.
- Self-hosted Privacy Policy page at `/privacy` (also `/privacy-policy`) and Terms of Service page at `/terms` (also `/tos`), suitable for Claude Connectors Directory submissions.
- A `/health` endpoint is now served by `serve` mode (JSON response for uptime probes, landing HTML for browsers).

### Changed
- Unauthenticated requests to `/mcp` in `serve` mode now receive a `401 WWW-Authenticate` challenge by default, triggering the OAuth flow in supported clients such as claude.ai; set `WEBCAKE_OAUTH=0` to disable enforcement and retain the previous header/query-param-only auth behavior.
- OAuth redirect URIs are now constructed using `X-Forwarded-Proto` and `X-Forwarded-Host` headers when present, enabling correct operation behind a reverse proxy.

## [1.0.3] - 2026-06-23

### Added
- MIT license (Copyright vuluu2k) added to the package.

### Fixed
- The server no longer exits at startup when `WEBCAKE_API_URL` is not set; the API base URL defaults to the `prod` preset and can be overridden with `WEBCAKE_API_URL` or `WEBCAKE_ENV`.

## [1.0.2] - 2026-06-23

### Changed
- The `install` command no longer prompts for a Site ID; it now prompts for the Session ID (`WEBCAKE_SESSION_ID`) instead, since the active site is chosen at runtime via `list_my_sites` and `switch_site`.
- `WEBCAKE_SITE_ID` is no longer required at startup; on first interaction the server instructs the AI to call `list_my_sites` and `switch_site` if no site has been selected yet, and the choice is persisted across sessions.

## [1.0.1] - 2026-06-23

### Added
- Named environment presets (`local`, `staging`, `prod`) selectable via `--env` flag or `WEBCAKE_ENV` variable, defaulting to `prod` so `WEBCAKE_API_URL` no longer needs to be set manually.
- `staging` environment preset added with endpoints `api.staging.storecake.io` / `staging.webcake.io`.
- `publish_site` now returns a `preview_url` field: the site's custom domain if configured, otherwise a per-environment subdomain (prod) or path-based URL (local/staging).
- `login` now captures and persists the `wsid` session ID alongside the bearer token so `WEBCAKE_SESSION_ID` is populated automatically after connecting.

### Changed
- `login` command now opens the `/mcp-storefront` handoff page instead of `/mcp-connect`.
- Production API endpoint updated from `api.storecake.io` to `api.storefront.webcake.io`; app URL updated from `builder.webcake.io` to `webcake.io`.

### Removed
- Knowledge-management tools `sync_knowledge`, `list_knowledge`, `get_knowledge`, `create_knowledge`, `update_knowledge`, and `delete_knowledge` have been removed.

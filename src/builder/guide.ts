// Generation guide injected into builder tools so an AI agent understands the BuilderX
// page model well enough to author pages that actually render.

export const BUILD_GUIDE = `# BuilderX page authoring guide

## Page shape
A page's content is a single JSON object: \`{ "sections": [ <section>, ... ] }\`.
- Save it via build_page (new page) or update_page_source (existing page).
- A page is a vertical STACK of sections (top → bottom). Sections are the only valid
  top-level children of \`sections\`.

## Node shape (every element)
\`\`\`
{
  "id": "TEXT-ab12cd34",        // unique per page; prefix = TYPE-, see factories
  "type": "text",                // one of the catalog types (list_elements)
  "name": "",
  "specials": { ... },           // CONTENT + behaviour (text, src, field_name, ...)
  "runtime": { "style": {}, "config": {} },  // STYLE (css) + LAYOUT (grid/position)
  "children": [ ... ],           // only for container types
  "events": [ ... ],             // click/hover actions
  "bindings": [ ... ]            // dataset bindings (product/category/blog fields)
}
\`\`\`
Never hand-write a node from scratch — call new_element / new_section so the factory
fills the correct defaults, then edit specials/style.

## Layout = CSS grid (NOT absolute top/left)
This is the key difference from landing-page builders. A section/container positions its
children with a grid:
- A SECTION uses a centred 3-column grid: \`grid: "3xN"\`, columns
  \`[{unit:'fr',value:1}, {unit:'px',absValue:1300,value:1}, {unit:'fr',value:1}]\` —
  flexible margin · 1300px content · flexible margin. Children sit in the CENTRE column
  (\`columnStart:2, columnEnd:3\`). \`rows\` = one \`{unit:'min/max', min:{unit:'px',absValue:H}, max:{unit:'max-c'}}\` per child.
- A nested CONTAINER uses a simple \`grid: "1xN"\` with \`columns:[{unit:'fr',value:1}]\`;
  its children sit in \`columnStart:1, columnEnd:2\`.
- each child config also has \`rowStart/rowEnd\` (1-based grid lines),
  \`constraintX\` (['left'|'right'|'centerLeft']), \`constraintY\` (['top'|'bottom'|'centerTop']).
new_section does ALL of this for you: pass children and they are stacked one row each in
the centre column.

## Multi-column rows (cards side by side) — USE THIS, real pages are full of them
A plain vertical stack looks like a blog post, not a designed page. Feature cards,
category tiles, footer columns, a text+image hero — all are HORIZONTAL rows. Two ways:
- new_row(children=[colA, colB, colC]) → a container whose children sit SIDE BY SIDE in
  equal columns. Place the returned node as a child of a section.
- Inside new_section, add \`layout:"row"\` to a CONTAINER child spec and its children become
  columns: \`{ type:"container", layout:"row", children:[ {..}, {..}, {..} ] }\`.
Rows are RESPONSIVE automatically: finalizeForRender collapses them on small screens
(default tablet=2 columns, mobile=1) so cards never shrink to slivers — override with
\`collapse:{bp3:2,bp4:1}\`. Uneven columns via \`colWidths\` (e.g. a 2:1 text/image split:
\`colWidths:[{unit:'fr',value:2},{unit:'fr',value:1}]\`), spacing via \`columnGap\`/\`rowGap\`.
Each column is usually a \`container\` holding its own stacked children (image + title +
text). Example feature row:
\`new_row(children=[
  { type:"container", children:[ {type:"image",opts:{...}}, {type:"text",opts:{text:"Giao nhanh"}} ] },
  { type:"container", children:[ {type:"image",opts:{...}}, {type:"text",opts:{text:"Chất lượng"}} ] },
  { type:"container", children:[ {type:"image",opts:{...}}, {type:"text",opts:{text:"Bảo hành"}} ] },
])\`

## Where layout/style live: per-breakpoint keys (NOT \`runtime\`)
new_section / new_element emit a temporary \`runtime: { style, config }\`. That is a
STAGING shape — the storefront does NOT read \`runtime\`. On save, build_page / add_section
automatically expand \`runtime\` into the four breakpoint keys the renderer actually reads:
\`node.bp1\`, \`node.bp2\`, \`node.bp3\`, \`node.bp4\` (each \`{ style, config }\`). You normally
never write these by hand for new pages. When EDITING an existing page, elements are
already in this shape — see the \`responsive\` field on get_page_element/update_page_element.

## Styling
- \`runtime.style\` holds CSS-ish props: width/height (numbers = px), color, background,
  fontSize ("16px"), fontWeight, textAlign, border*, boxShadow, etc.
- \`runtime.config.heightUnit\`: "auto" lets content set height (default for text/image).
- Colours: prefer the site THEME variables \`var(--color_00)\`, \`var(--color_01)\`, …
  (the published site themes them); plain hex or rgba() also work.

## Make it look DESIGNED (not plain) — do this, every page
A bare stack of default elements looks unfinished. Apply real styling:
- SECTIONS: new_section already gives ~56px top/bottom padding + a centred content column.
  Add variety: give some sections a background (\`section_opts:{ style:{ background:"var(--color_01)" } }\`
  or a light tint) and alternate so the page has rhythm. Increase padding (72–96px) for hero/CTA.
- SPACING: children are stacked with a rowGap; bump it (\`section_opts:{ rowGap: 24 }\`) for airy
  layouts. Don't cram.
- TYPOGRAPHY hierarchy: h1 40–56px / fontWeight 700, h2 28–34px / 600, body 16–18px with
  lineHeight "1.6", muted color for sub-text. Center hero text (textAlign:"center").
- BUTTONS HAVE NO DEFAULT COLOUR — you MUST style them or they look like plain text:
  \`{ type:"button", opts:{ text:"Mua ngay", style:{ background:"var(--color_02)", color:"#fff",
  borderRadius:"8px", fontWeight:"600", height:48 } } }\`.
- HERO: prefer a section with a background image + an overlay heading/sub/button on top
  (set section_opts.style.background or a full-width image, then text centered), rather than a
  small image stacked above text.
- PRODUCT GRID: style the cards — \`grid-product opts.config\`: { columns:3-4, image_ratio:"1/1",
  img_object_fit:"cover", gap_column:20, gap_row:28, cardBorderRadius:12, cardBoxShadow:"0 6px 24px rgba(0,0,0,.08)",
  productNameColor:"var(--color_00)", productPriceColor:"var(--color_02)" }.
- BRAND COLOURS: reuse var(--color_00) (text), and an accent (var(--color_02)/var(--color_03))
  for buttons, prices, highlights — consistent accent = looks intentional.
- IMAGES: must be WebCake-CDN urls (search_images cdn_url / upload_images), else they won't show.

## Responsive breakpoints
The four breakpoints (largest → smallest), keyed bp1..bp4, are:
- \`bp1\` ≥1320px (desktop, the base) · \`bp2\` 993–1319 (laptop) · \`bp3\` 641–992 (tablet) · \`bp4\` 320–640 (mobile).
For NEW pages you author once in \`runtime\` (desktop) and build_page copies it to all four
breakpoints automatically — the page renders identically across devices. To make a node
look DIFFERENT on a smaller screen, set that breakpoint's key explicitly, e.g.
\`node.bp4 = { style: { fontSize: "20px" }, config: {...} }\`. (There is no \`tablet\`/\`laptop\`
key — only bp1..bp4.)

## Content & data
- Text: \`specials.text\` (HTML allowed), \`specials.tag\` ("h1".."p").
- Image: \`runtime.config.src\` (URL). The URL MUST be a WebCake CDN url — the storefront
  whitelists image domains, so external URLs (Pexels, random sites) won't render. Get CDN
  urls from search_images (uploads by default → use its cdn_url) or upload_images.
- Form: wrap inputs in a \`form\`; set \`form.specials.type\`
  (form_order | form_login | form_signup | form_discount | order_tracking). Each input
  needs \`specials.field_name\`.
- Dataset elements (text-dataset, image-dataset, rectangle-dataset…) and the CHILDREN of
  a repeater (grid-product, cart-items, order-items, post-list, grid-category, customer-address)
  pull live data via a \`bindings\` array. Each binding is
  \`{ id, name:<dataset>, target:"<dataset>::<field>" }\` — you DON'T set the id, the builder
  mints it. Just pass \`opts.bindings:[{ target:"product::product_price" }]\` to new_element.
  Common targets (call \`list_bindings\` for the full catalog — use these EXACTLY, there is no \`product::price\`):
  - product:  \`product::product_image\`, \`product::product_name\`, \`product::product_price\`, \`product::product_original_price\`, \`product::short_description\`
  - cart_item: \`cart_item::cart_item_image\`, \`cart_item::cart_item_name\`, \`cart_item::cart_item_price\`, \`cart_item::cart_item_total_price\`, \`cart_item::cart_item_prod_attr\`
  - order_item: \`order_item::product_image\`, \`order_item::product_name\`, \`order_item::product_quantity\`, \`order_item::items_sum_up_price\`, \`order_item::product_attrs\`
  - customer_address: \`customer_address::full_name\`, \`customer_address::phone_number\`, \`customer_address::address\`, \`customer_address::pdc\`
  REPEATER CONTEXT: inside a \`grid-product\` each cell IS a product, so a child
  \`text-dataset\` with \`product::product_name\` resolves to that cell's product (no extra
  wiring). Same for cart-items→cart_item, order-items→order_item, post-list→post,
  grid-category→category. A target only resolves on a page of the matching \`type\` (below).

## Events (clicks, navigation, cart, popups)
Interactive nodes (button, text, image, container, rectangle, icons) carry an \`events\`
array. Each event is \`{ id, eventName, action, ...fields }\` — you set \`action\` (+ its
fields); the builder mints the id and picks a sensible \`eventName\` (trigger). Pass via
\`opts.events\`. Call \`list_events\` for the full trigger/action catalog. Most-used:
- Navigate: \`{ action:"open_page", open_page_id:"<page id>" }\`, \`{ action:"open_link", link_target:"https://…", link_target_url:"_blank" }\`, \`{ action:"open_category", open_category_id:"<id>" }\`.
- Scroll on this page: \`{ action:"scroll_to", scroll_to_id:"<section id on this page>" }\`.
- Show/hide: \`{ action:"toggle", toggle_id:"<element id on this page>" }\`, \`{ action:"open_popup", popup_id:"<popup id>" }\`.
- Commerce: \`{ action:"add_to_cart", open_page:"cart" }\`, \`{ action:"buy_now" }\`, \`{ action:"apply_promotion" }\`.
- Contact: \`{ action:"phone_call", phone_call_number:"+84…" }\`, \`{ action:"open_email", open_email:"hi@shop.vn" }\`.
- Hover style (set eventName:"hover"): \`{ eventName:"hover", action:"scale" }\`.
Example: \`new_element("button", { text:"Mua ngay", style:{…}, events:[{ action:"add_to_cart", open_page:"cart" }] })\`.
validate_page warns on unknown actions, missing required fields, and events whose
in-page target (toggle_id/scroll_to_id/…) doesn't exist on the page.

## Page types & data sources (IMPORTANT for special pages)
A page's \`type\` decides which live data it can bind to. A SPECIAL page only works if the
matching site data-source flag (on site.settings) is enabled — otherwise the page renders
but every product/customer/blog binding resolves to NULL (an empty, broken-looking page).
\`build_page\` enables the right flag for you when you pass \`type\`:
- \`main\`    — homepage / normal content. No flag needed.
- \`store\`   — product detail, category, cart, checkout, thank-you. Needs \`use_store\`.
            Bindings: \`product::product_*\`, \`cart_item::cart_item_*\`.
- \`member\`  — login, register, profile, order history. Needs \`use_member\`.
            Bindings: \`customer_address::*\`, \`order_item::*\`.
- \`blog\`    — blog list, article/post. Needs \`use_blog\`.
- \`error\` / \`maintain\` — 404 / maintenance. Need \`use_error\` / \`use_maintain\`.
- \`custom\`  — a free page with no special data. No flag needed.
Rule of thumb: if the page shows products, a cart, customer/order data, or blog posts,
set \`type\` accordingly so the binding source is turned on. A binding target like
\`product::product_price\` REQUIRES its page to be the matching type.

## Build the WHOLE storefront — every page to the SAME standard (NOT just the home page)
A shop is multi-page. Build EACH page to a real e-commerce standard with the same palette,
spacing and header/footer — never leave the home page rich and the rest as bare stubs.
\`scaffold_store_pages\` now builds FULLY-DESIGNED, palette-aware store pages by DEFAULT
(style:"rich") — banner+breadcrumb+styled grid (Category), 2-col gallery|info with price/
quantity/add-to-cart+trust badges+related (Product), 2-col cart|summary, 2-col checkout
form|summary, centred thank-you — and auto-wires navigation between them. Then add chrome with
\`scaffold_global_sections({ brand, contact })\` for a designed Header+Footer in one call. Pass
style:"minimal" only if you want bare stubs to hand-build. The per-page recipe each rich page
follows (so you can match it when editing or building extra pages):
- Category (collections, type store): banner + heading + grid-product (+ optional intro/CTA).
- Product detail (products, type store): 2-col [product-gallery | info: text-dataset
  product::product_name + product_price/original_price + short_description, quantity-input,
  "Thêm vào giỏ" (add_to_cart) + "Mua ngay" (buy_now), trust badges] then a description/feature
  band then a related grid-product ("Có thể bạn cũng thích").
- Cart (cart, type store): heading + 2-col [cart-items | order-summary card with a
  "Tiến hành thanh toán" button -> { action:"open_page", open_page_id:<checkout> }] + continue link.
- Checkout (checkout, type store): heading + 2-col [form{type:form_order} with input/
  phone-number/email/address + submit-button "Đặt hàng" | order summary (cart-items)].
- Thank-you (complete, type store): centred confirmation + order-items + continue-shopping.
- Optional: About / Contact (custom), Blog (type blog: post-list) + Post.
Reuse the SAME section helpers, palette and card styling as the home page so the whole site
feels like ONE design.

## Global Header & Footer — create them for EVERY site (don't inline per page)
A header (logo/nav/cart) and footer (links/contact/copyright) belong on EVERY page, so make them
GLOBAL, not copied into each page. Build a header section + a footer section (new_section, same as
any section), then:
  create_global_section({ type:"header", name:"Header", section:<headerSection> })   // top of every page
  create_global_section({ type:"footer", name:"Footer", section:<footerSection> })   // bottom of every page
(omit page_ids to apply to ALL pages). ORDER MATTERS: build/save the page CONTENT first, THEN
create the globals — they embed into each page's source. If you later overwrite a page's source
(update_page_source/build_page) you WIPE its embedded header/footer, so re-create the globals
(delete_global_section by the section NODE id, then create once) to re-embed cleanly. Edit a global
later with update_global_section_element(s) and it updates on every page at once.

## Popups (newsletter / promo / age-gate)
A popup is a GLOBAL SOURCE, not a page section. Build it, store it, then trigger it:
1. Build the popup body (new_section: heading + text + form/input + a close button), then wrap it:
   new_element("popup", { children:[<that section>], specials:{ /* trigger + overlay */ } }).
   Trigger/behaviour (auto-open after a delay, exit-intent, only-once, overlay) lives in specials.
2. Save it: create_global_source({ component:"popup", source:{ sections:[<popupNode>] } }) -> returns its id.
3. Open/close from any element via events: a button { action:"open_popup", popup_id:"<id>", popup_overlay:true };
   a close button inside { action:"close_popup", popup_id:"<id>" }; a form can auto-close on its
   success trigger ({ eventName:"success", action:"close_popup", popup_id:"<id>" }).
List existing popups with list_global_sources({component:"popup"}); edit via update_global_source(_element).

## Workflow (do this every time)
1. Intake: confirm goal, brand, colours, sections wanted (ask 3-5 questions if unclear).
2. list_elements / get_element to pick the right component types.
3. Build sections with new_section (or new_element for one node), fill content.
4. validate_page — fix every error and review warnings.
5. build_page with dry_run:true first → review → dry_run:false to persist.
6. For existing pages, prefer surgical edits (update_page_element) over full rewrites.
Always keep Vietnamese text with full diacritics; reply in the user's language.`;

// Generation guide injected into builder tools so an AI agent understands the BuilderX
// page model well enough to author pages that actually render.

export const BUILD_GUIDE = `# BuilderX page authoring guide

## DESIGN SYSTEM — lock this FIRST, every build (this is what makes free composition look DESIGNED)
There are NO page templates here and NO seeded data — you COMPOSE every page from elements
based on the user's actual goal. To make that composition look intentional (not a random pile
of default elements), LOCK a small design system before you place anything, and reuse it on
EVERY section and EVERY page:
- PALETTE — from the site THEME matrix vars \`var(--color_RC)\` (see Colours below). Pick: page
  background, body text, one accent (for CTAs/prices/highlights), one or two soft section tints.
- TYPE SCALE — h1 40–56px / fontWeight 700, h2 28–34px / 600, body 16–18px with lineHeight "1.6",
  small/muted 13–14px. Use the SAME sizes everywhere; don't invent a new size per section.
- SPACING — everything on an 8px grid: 8 / 16 / 24 / 32 / 48 / 64. Section padding 64–96px,
  rowGap 16–24 inside sections. Generous whitespace = premium; cramped = cheap.
- ONE BUTTON SPEC — decide it once and reuse: e.g. \`{ background:"var(--color_24)",
  color:"var(--color_00)", borderRadius:"8px", fontWeight:"600", height:48 }\`. Same button on
  every page.
- ONE CARD SPEC + ONE CONTENT WIDTH + ONE RADIUS — reuse the same card padding/radius/shadow and
  the same centred content width across sections. Consistency = looks professionally designed.

⚠️ CONTRAST is the #1 ugliness/bug — get it right:
- The BRAND row \`var(--color_2C)\` goes LIGHT → DARK: \`var(--color_20)\` (lightest tint) …
  \`var(--color_24)\` (darkest brand).
- Button / CTA / price BACKGROUNDS must use \`var(--color_24)\` (dark brand) WITH a white label
  \`var(--color_00)\`. This is readable on every theme.
- NEVER put a white label on \`var(--color_20)\` — on many themes that's a pale tint (e.g. #f2decc)
  and white text becomes INVISIBLE. Use \`var(--color_20)\`/\`var(--color_21)\` ONLY as soft section
  tints / backgrounds, never as a button background under white text.
- Body text = \`var(--color_04)\` (near-black). Page background = \`var(--color_00)\` (white).

IMAGES (or the page looks broken/empty):
- Every image needs a WebCake-CDN url (search_images → cdn_url, or upload_images), or it won't
  render — the storefront whitelists image domains.
- HERO must be a REAL full-width \`image\` element (width:"100%"), NOT a CSS \`background:url(...)\`
  shorthand — the renderer ignores the shorthand and you get a blank band.
- grid-product cards show the PRODUCT-LEVEL image, so create products WITH a product image or the
  cards are blank.

COLOR & SPACING DISCIPLINE:
- ONE accent, used sparingly (CTAs, prices, a few highlights) — not on everything.
- Alternate plain (\`var(--color_00)\`) and softly-tinted (\`var(--color_01)\`/\`var(--color_20)\`)
  section backgrounds to give the page rhythm.
- Reuse the SAME content width + radius + button across sections.

COMPOSE, DON'T TEMPLATE — there are no templates and no seeded data, so for each page:
1. Pick a SECTION ARCHETYPE for the page type (propose it, then confirm with the user via
   get_intake_guide before building):
   - home: hero · category tiles · featured products (grid-product) · story/USP · social proof · CTA
   - category (type store): banner + breadcrumb + grid-product (+ optional filter sidebar)
   - product detail (type store): 2-col [gallery | info: name/price/qty/add-to-cart/buy-now/trust]
     + description band + related grid-product
   - cart (type store): 2-col [cart-items | order summary card]
   - checkout (type store): 2-col [form{form_order} | order summary]
   - thank-you (type store): centred confirmation + order-items + continue-shopping
2. Build each section from elements (new_section / new_row / new_element) using the locked
   design system above.
3. CREATE real product data + product images (create_product_category / create_product, images
   from search_images/upload_images) so the dataset bindings (grid-product, product detail) resolve.

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

### ALIGNMENT inside a cell — how children line up (avoid the "snapped to a corner" look)
\`constraintX\`/\`constraintY\` decide where a child sits in its grid cell. The renderer maps:
- \`["left","right"]\` → justify-self: STRETCH — the element FILLS the cell width (this is what makes
  columns, cards, and images line up edge-to-edge). This is the DEFAULT new_section/new_row give to
  every width-filling element (text, image, container, repeaters), so siblings stay in straight rows.
- \`["centerLeft"]\` → justify-self: CENTER (shrinks a content-width element to its content and centres it),
  \`["left"]\` → left, \`["right"]\` → right. \`constraintY\`: \`["top"]\` (default) / \`["bottom"]\` / \`["centerTop"]\` (middle).
DON'T hand-set \`["centerLeft"]\` on a full-width element (text/container/card) — that snaps it to its
content width and floats it, so it no longer lines up with its neighbours (the classic "cắn/lệch" bug).
Instead: leave the default stretch and control the LOOK with \`textAlign\` (for text) or, for a
content-width element like a button, with \`opts.align\` ('left'|'center'|'right'|'fill'). A button is
content-width + centred by DEFAULT; pass \`align:"left"\` so it lines up with left-aligned text above it,
or \`align:"fill"\` to span the column.

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
- Colours: use the site THEME matrix vars \`var(--color_RC)\` (R=row 0-4, C=col 0-4). Row 0 is
  greyscale: \`var(--color_00)\`=WHITE … \`var(--color_04)\`=BLACK. Row 2 is the BRAND row, getting
  DARKER left→right: \`var(--color_20)\` (lightest brand tint) … \`var(--color_24)\` (darkest brand).
  So TEXT = \`var(--color_04)\` (NOT color_00 = white → invisible). PAGE BACKGROUND = \`var(--color_00)\`.
  BUTTON / CTA BACKGROUND = \`var(--color_24)\` (the darkest brand shade) WITH a white label
  (\`color:var(--color_00)\`) — this is readable on EVERY theme. ⚠️ Do NOT put a white label on
  \`var(--color_20)\`: on many themes color_20 is a pale tint (e.g. #f2decc) and white text vanishes.
  Use \`var(--color_20)\`/\`var(--color_21)\` only as a LIGHT section tint / soft background, never as a
  button background under white text. PRICES / accents = \`var(--color_24)\` too. Plain hex/rgba() also work.

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
  \`{ type:"button", opts:{ text:"Mua ngay", style:{ background:"var(--color_24)", color:"var(--color_00)",
  borderRadius:"8px", fontWeight:"600", height:48 } } }\` (DARK brand background, white label — always readable).
- BUTTON WIDTH & ALIGNMENT (don't fight it): a \`button\` is CONTENT-SIZED by default (label + built-in
  28px side padding) and CENTRED in its cell — so a standalone CTA looks like a real button, never a
  full-width bar with cramped text or one slammed flush-left. To place/size it, pass \`opts.align\`:
  \`"left"\` | \`"center"\` (default) | \`"right"\` | \`"fill"\` (span the whole column, e.g. two side-by-side
  Add-to-cart / Buy-now buttons, or a button inside a narrow summary card). \`align\` works on ANY element
  (text/image/container too). A form \`submit-button\` stays full-width by design. Do NOT try to force a
  button's width via \`style.width\` — the renderer ignores it (use \`align:"fill"\` instead).
- HERO: build it as a section whose FIRST child is a full-width \`image\` element (the background photo,
  width:"100%", height ~480), then overlay the heading/sub/button on top. ⚠️ Do NOT rely on a CSS
  \`background:"linear-gradient(...), url(...)"\` SHORTHAND on the section — the storefront renderer
  ignores the shorthand and the photo won't show (you get a blank/flat band). A real \`image\` element
  (src = a WebCake-CDN url) always renders; for a text overlay put a semi-transparent \`rectangle\`
  over it and the text above that.
- PRODUCT GRID: grid-product SELF-RENDERS the image+name+price card. Its look is
  INDUSTRY-DEPENDENT (surveyed fashion/kids/cosmetics/food/electronics) — only \`bold price\`,
  \`responsive\` collapse and \`show_original_price/show_discount_on_price\` are near-universal;
  the factory ships those + neutral defaults (columns 4, image_ratio "1/1", gap 24). Tune per
  brand via \`opts.config\`: { columns:3-6, image_ratio:"4/5"|"2/3"|"3/4"|"1/1", img_object_fit:"cover",
  gap_column:8-40, gap_row, product_info_alignment:"center"?, productNameColor, productPriceColor }
  and \`opts.specials\`: { products_per_load:8-36, on_hover:"zoom"|"swap", show_rating, show_ribbon }.
  (There are NO cardBorderRadius/cardBoxShadow keys.) For variations use \`attr\` elements
  (attrName:"auto"); steppers are \`quantity-input\` (defaults spinner:"hide-spin").
- BRAND COLOURS: text = var(--color_04) (black); accent = var(--color_24) (DARK brand) for button
  backgrounds, prices, highlights — consistent accent = looks intentional. (var(--color_00) is WHITE
  — only for page backgrounds / labels ON the dark accent, never for text on a white surface; and a
  white label on the pale var(--color_20) tint is the #1 invisible-text bug.)
- IMAGES: must be WebCake-CDN urls (search_images cdn_url / upload_images), else they won't show.
  A product card (grid-product) shows the PRODUCT-LEVEL thumbnail — if a product only has variation
  images and no product image, its card is blank, so set product images when you create products.

## Responsive breakpoints
The four breakpoints (largest → smallest), keyed bp1..bp4, are:
- \`bp1\` ≥1320px (desktop, the base) · \`bp2\` 993–1319 (laptop) · \`bp3\` 641–992 (tablet) · \`bp4\` 320–640 (mobile).
For NEW pages you author once in \`runtime\` (the bp1/desktop base); on save the build expands
it into bp1..bp4. By default all four are the same (renders identically across devices), PLUS
sections re-centre their grid per breakpoint and multi-column rows auto-collapse (4→2→1 cols).
AUTO-RESPONSIVE DEFAULTS (you get these for free, no diffs needed): on tablet/mobile the build
also shrinks oversized TYPOGRAPHY (any fontSize ≥22px scales ~0.86× on tablet / ~0.72× on mobile,
floored at 15px) and TALL images (height >320px shrinks on mobile) so hero headlines and big media
don't blow out small screens. Body text (<22px) is left alone. Pass \`opts.responsive\` only to
OVERRIDE this default for a specific node/breakpoint (your explicit diff always wins).

RESPONSIVE CASCADE (reason about each breakpoint, don't hand-copy): to make a node look
different on smaller screens, pass \`opts.responsive\` = SPARSE per-breakpoint diffs and the
build cascades them bp1→bp4 (each smaller breakpoint inherits the resolved larger one, then
applies only the keys you give). You only write what CHANGES:
\`new_element("text", { text:"...", style:{ fontSize:"52px" },
   responsive:{ bp3:{ style:{ fontSize:"38px" } }, bp4:{ style:{ fontSize:"28px", textAlign:"center" } } } })\`
→ bp1/bp2 = 52px; bp3 = 38px; bp4 = 28px centred. Works on new_element/new_section/new_row and
build_page children (in each child's \`opts.responsive\`). Use it for hero headline sizes, padding,
columnGap, hiding/realigning per device. (There is no \`tablet\`/\`laptop\` key — only bp1..bp4.)
You can still hand-set a final \`node.bpN\` when editing an already-saved page.

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
- BINDING COMBINE-KEYS (how a field renders/combines — mined from real templates; pass them
  alongside \`target\`): \`name_style:"sku"|"variation-sku"\`, \`prefix_content:"-"\` (prepend),
  \`number_of_line_title:1\` (clamp lines), \`attr_id:"ATTR-…"\` (bind ONE attribute), and
  \`value:"form::coupon_price"\` — a SECOND source so one node shows a COMPUTED value (e.g.
  \`cart_item::cart_total_price\` with \`value:"form::coupon_price"\` = total minus coupon). Call
  \`list_bindings\` → meta_keys for the full list.

## Composition recipes (how real templates assemble components)
Repeaters fall into two kinds (surveyed across 34 templates):
- SELF-RENDERING (just add badges): \`grid-product\` / \`slider-product\` / \`post-list\` render the
  card themselves — their children are only \`product-overlay\` (sale/discount badge) or, for a
  fully custom card, a \`custom-layout\` wrapping dataset cells. \`post-list\`→\`post-overlay\` children.
- HAND-COMPOSED from per-item dataset cells (build the row yourself):
  - \`cart-items\` row = \`image-dataset[cart_item::cart_item_image]\`, \`text-dataset[cart_item::cart_item_name]\`,
    \`text-dataset[cart_item::cart_item_price]\`, \`quantity-input\`, \`text-dataset[cart_item::cart_item_total_price]\`,
    a \`container\` for name+\`cart_item::cart_item_prod_attr\`, \`line\` (config.columns sets the row template).
  - \`order-items\` row = \`image-dataset[order_item::product_image]\` + \`text-dataset\` for
    \`order_item::product_name\` / \`product_attrs\` / \`product_quantity\` / \`items_sum_up_price\`.
  - \`layout-dataset\` / \`customer-address\` = a generic repeater: \`text-dataset[customer_address::full_name|phone_number|address|pdc|is_default]\` + a "Set default" button.
  - \`promotions\` = \`text-dataset[promotion_item::code|description|end_date]\` + a copy button (\`copy_promotion\`).
The bare \`cart-items\`/\`order-items\` (no children) self-render a DEFAULT row — fine for a quick build; compose cells only when you want a custom layout.
HEADER patterns: real headers carry TWO menus (a horizontal desktop \`menu\` + a hamburger/collapse mobile \`menu\`), the logo (image/text), \`cart-icon\`, often \`input-search\`/\`search-droppable\`, \`member-bar\` (login/signup ↔ avatar+account), and \`language-menu\`. BREADCRUMB is common — keep it on category/product pages (often its own slim section, or next to a \`text-dataset\` page title).
CATEGORY-PAGE FILTERS: a category page sidebar FILTERS the product grid. The filter widgets —
\`checkbox-group\` / \`color-group\` / \`tags\` / \`two-point-range\` (price) / \`radio-group\` / a sort
\`dropdown\` — each carry \`specials.filter_elements:["GRID-PRODUCT-id"]\` (the grid they drive) +
\`specials.sync_tab\` ("attribute" | "brand" | "category" | "price" | "tag") so picking an option
re-queries that grid-product. So a real category page = breadcrumb + [filter sidebar | grid-product].

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
- Form follow-up (eventName defaults to "success" on a form): a form_order commonly carries
  \`{ action:"open_page", open_page_id:"<thank-you page>" }\` so a successful order redirects.
Example: \`new_element("button", { text:"Mua ngay", style:{…}, events:[{ action:"add_to_cart", open_page:"cart" }] })\`.
NAV EXCEPTION — \`menu\`/\`menu-item\`: a menu-item's navigation lives in its SPECIALS, not events.
For a page link set \`menu-item specials\`: { linkType:"page", linkPage:"<page id>", pageId:"<page id>", name:"Trang chủ" }.
(Only generic elements — text/container/button/image/rectangle — navigate via the events array above.)
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
There are NO page templates and NO scaffold shortcuts: you COMPOSE each store page from elements
(new_section / new_row / new_element → build_page) using the locked design system, then add a
GLOBAL header/footer via create_global_section. Create the store pages whose slugs the storefront
expects so navigation resolves (clicking a product/category/cart lands on a real page, not a 404):
Category (slug "collections"), Product (slug "products"), Cart (slug "cart"), Checkout (slug
"checkout"), Thank-you (slug "complete") — all build_page type:'store' (auto-enables use_store);
plus optional member (login/register/profile, type 'member') and blog (blog/post, type 'blog')
pages. Wire navigation between them yourself with open_page events (add-to-cart → cart, cart →
checkout, order success → thank-you, thank-you → home). The per-page archetype to compose:
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

### HEADER must be RESPONSIVE — add a MOBILE MENUBAR, don't just let nav stack
A header built as one horizontal row of nav links looks fine on desktop but on a phone the links
squash or collapse into an ugly vertical pile. Build a header that carries TWO navs and swap them
per breakpoint with the \`isHidden\` config (it cascades bp1→bp4 like any config key):
- DESKTOP nav — the inline row of links in the top bar. Keep it on desktop+laptop, hide from tablet
  down: \`responsive:{ bp3:{ config:{ isHidden:true } } }\` (base visible).
- MOBILE MENUBAR — a SEPARATE container, a centred horizontal row of the same links placed as a
  second row of the header section (below the logo/cart bar). Hide it on desktop+laptop, show from
  tablet down: base \`config:{ isHidden:true }\` + \`responsive:{ bp3:{ config:{ isHidden:false } } }\`.
RELIABILITY NOTE (storefront-verified): this two-nav \`isHidden\`-SWAP is the dependable mobile
menubar. AVOID these — they do NOT render dependably from raw MCP data: the native \`menu\`
\`type:"hamburger"\` (its ☰ trigger paints as a 0-width empty box; an inline-SVG \`mask\` is ignored);
a \`toggle\`-revealed panel (the storefront only makes a toggle target's hidden state reactive when
it's wired in the builder UI, so a click can't show an \`isHidden\` element); and \`open_popup\` drawers
(popups are global_sources and the publish pipeline doesn't always emit them, so the popup isn't on
the page). A plain visible mobile nav row, shown via \`isHidden\` swap, always works.
Lay the bar as a 2-column row [logo | (desktop-nav + cart, aligned right)] and add the mobile nav row
as the section's 2nd child. Keep the logo + cart-icon visible on every breakpoint.
(If you do want a real collapsible hamburger, finish it in the WebCake builder UI, which wires the
toggle/menu reactively — the MCP can't reproduce that wiring from data alone.)

## Popups (newsletter / promo / age-gate)
A popup is a GLOBAL SOURCE, not a page section. Compose it from elements (there is no scaffold
shortcut), then save it as a "popup" global source:
1. Build the popup node: new_element("popup", { children:[…heading,text,form,close button…], style:{ width:480, background:"#fff", borderRadius:"12px" }, config:{ popupHorizontalPosition:"center", popupVerticalPosition:"center" }, specials:{ effect:"fade-in", timeAnim:0.5 } }).
   - SIZE + POSITION live in the popup's runtime style/config (width/height/background + popupHorizontalPosition/popupVerticalPosition), NOT in specials. createPopup seeds a centred-modal default.
   - TRIGGER (auto-open) lives in SPECIALS: \`openPopupAction:"openPopupWithTime"\` + \`timeOpenPopup:<seconds>\` for a delay; \`page_ids:[…]\` to limit which pages it shows on; \`effect\`/\`timeAnim\` for the animation. (There is no exit-intent/only-once flag in the node — those are app settings.)
   - OVERLAY is NOT on the popup node — it's a field on the open_popup EVENT (popup_overlay:true).
2. Save it: create_global_source({ component:"popup", source:{ sections:[<popupNode>] } }) -> returns its id.
3. Open/close from any element via events: a button { action:"open_popup", popup_id:"<id>", popup_overlay:true };
   a close button inside { action:"close_popup", popup_id:"<id>" }; a form can auto-close on its
   success trigger ({ eventName:"success", action:"close_popup", popup_id:"<id>" }).
List existing popups with list_global_sources({component:"popup"}); edit via update_global_source(_element).

## Workflow (do this every time)
1. Intake: confirm goal, brand, colours, sections wanted (ask 3-5 questions if unclear).
2. list_elements / get_element to pick the right component types; get_page_schema for the exact
   node contract ({ sections:[ { id,type,specials,runtime:{style,config},children,events,bindings } ] }).
3. Build sections with new_section (or new_element for one node), fill content.
4. validate_page — fix every error and review warnings.
5. build_page with dry_run:true first → review → dry_run:false to persist.
6. For existing pages, prefer surgical edits (update_page_element) over full rewrites.

## LARGE PAGES — avoid timeout (use the DRAFT flow)
A multi-section page sent in one build_page can be a huge request and hit the 15s timeout.
For anything beyond a small/simple page, build it incrementally with the durable DRAFT flow:
1. start_page_draft({ name, slug, type?, is_homepage?, seo? }) → draft_id (LOCAL, no network).
2. add_draft_section({ draft_id, section }) ONCE per section — each is cached locally (safe,
   can't time out) and quick-validated. Build the section with new_section first.
3. commit_page_draft({ draft_id, dry_run:true }) to validate the whole page, then dry_run:false
   to persist. It creates the page then appends sections ONE AT A TIME (small requests), saving
   progress after each — and RESUMES from where it stopped if a request is interrupted (just call
   commit_page_draft again). clear_page_draft discards a draft.
The draft cache is DISPOSABLE — Redis on the remote server when REDIS_URL is set, in-memory
otherwise, with a sliding ~2h TTL. A lost draft (expiry / cache restart) just means re-sending
the sections via start_page_draft + add_draft_section (or build_page directly) — never a failure.
Keep build_page for small/simple pages.
Always keep Vietnamese text with full diacritics; reply in the user's language.`;

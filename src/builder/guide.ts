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
the centre column. To build multi-column layouts, nest a container child with its own grid.

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
- Dataset elements (text-dataset, image-dataset, rectangle-dataset...) pull live data via
  a \`bindings\` array. Each binding is \`{ id:"BINDING"+random, name:<source>, target:"<source>::<field>" }\`.
  Real target field names (use these EXACTLY — there is no \`product::price\`):
  - product:  \`product::product_image\`, \`product::product_name\`, \`product::product_price\`
  - cart_item: \`cart_item::cart_item_image\`, \`cart_item::cart_item_name\`, \`cart_item::cart_item_price\`, \`cart_item::cart_item_total_price\`, \`cart_item::cart_item_prod_attr\`
  - order_item: \`order_item::product_image\`, \`order_item::product_name\`, \`order_item::product_quantity\`, \`order_item::items_sum_up_price\`, \`order_item::product_attrs\`
  - customer_address: \`customer_address::full_name\`, \`customer_address::phone_number\`, \`customer_address::address\`, \`customer_address::pdc\`
  A target only resolves on a page of the matching \`type\` (see below).

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

## Workflow (do this every time)
1. Intake: confirm goal, brand, colours, sections wanted (ask 3-5 questions if unclear).
2. list_elements / get_element to pick the right component types.
3. Build sections with new_section (or new_element for one node), fill content.
4. validate_page — fix every error and review warnings.
5. build_page with dry_run:true first → review → dry_run:false to persist.
6. For existing pages, prefer surgical edits (update_page_element) over full rewrites.
Always keep Vietnamese text with full diacritics; reply in the user's language.`;

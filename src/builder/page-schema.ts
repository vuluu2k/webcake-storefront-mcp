// Authoritative JSON Schema (Draft 2020-12) for the BuilderX storefront page SOURCE — the
// `{ sections: [...] }` object that build_page / update_page_source persist. Mirrors what
// webcake-landing-mcp exposes via get_page_schema, but for THIS product's CSS-GRID model
// (not absolute top/left). It documents the AUTHORING shape an AI emits via new_section /
// new_element (nodes carry a staging `runtime:{style,config}`; build_page expands that into
// the per-breakpoint bp1..bp4 keys the storefront actually renders). Use it as the structural
// contract; validate_page enforces the semantic rules (unique ids, valid grids, form fields).

export const PAGE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://webcake.io/schemas/storefront-page.json",
  title: "BuilderX storefront page source",
  description:
    "A page's content: a vertical stack of section nodes. Build nodes with new_section/new_element (the factory fills correct defaults) — never hand-write a node from scratch.",
  type: "object",
  required: ["sections"],
  additionalProperties: true,
  properties: {
    sections: {
      type: "array",
      description: "Top-level bands, rendered top→bottom. Only `section` nodes are valid here.",
      items: { $ref: "#/$defs/node" },
    },
  },
  $defs: {
    node: {
      type: "object",
      required: ["id", "type"],
      additionalProperties: true,
      properties: {
        id: {
          type: "string",
          description: "Unique per page. Prefix = TYPE- (e.g. 'TEXT-ab12cd34', 'SECTION-...'). Minted by the factory; never reuse.",
        },
        type: {
          type: "string",
          description: "Element type from list_elements (e.g. section, container, text, image, button, grid-product, form, input, cart-items, menu).",
        },
        name: { type: "string", description: "Optional editor label." },
        specials: {
          type: "object",
          description: "CONTENT + behaviour. Per-type keys (see get_element): text/tag (text), src (image, also in config), field_name (form input), type (form: form_order|form_login|…), products_per_load (grid-product), linkType/linkPage (menu-item nav), …",
          additionalProperties: true,
        },
        runtime: {
          type: "object",
          description: "STAGING shape emitted by new_section/new_element. The storefront does NOT read `runtime` — build_page/add_section (the SPA's buildElementWithBreakpoint) expand it into bp1..bp4 {style,config} on save and DELETE runtime; runtime.specials, if present, is merged into the top-level specials. Author here; don't hand-write bp1..bp4 for new pages.",
          additionalProperties: true,
          properties: {
            style: { $ref: "#/$defs/style" },
            config: { $ref: "#/$defs/config" },
            specials: { type: "object", description: "Optional per-breakpoint specials override; merged into top-level specials on expand.", additionalProperties: true },
            responsive: { $ref: "#/$defs/responsive" },
          },
        },
        children: {
          type: "array",
          description: "Child nodes — ONLY for container types (section, container, form, and repeaters like grid-product/cart-items whose children are the per-item template).",
          items: { $ref: "#/$defs/node" },
        },
        events: { type: "array", items: { $ref: "#/$defs/event" } },
        bindings: { type: "array", items: { $ref: "#/$defs/binding" } },
        bp1: { $ref: "#/$defs/breakpoint" },
        bp2: { $ref: "#/$defs/breakpoint" },
        bp3: { $ref: "#/$defs/breakpoint" },
        bp4: { $ref: "#/$defs/breakpoint" },
      },
    },
    responsive: {
      type: "object",
      description: "CASCADE overrides — sparse per-breakpoint diffs you (the AI) supply to make the page responsive by reasoning, not a flat copy. bp1 is the base (runtime.style/config). Each smaller breakpoint INHERITS the resolved larger one, then applies only the keys here. Example: { bp4: { style: { fontSize: '28px', textAlign: 'center' } }, bp3: { style: { fontSize: '36px' } } } → bp1/bp2 keep the base h1; bp3 shrinks it; bp4 shrinks + centres. Pass via opts.responsive on new_element/new_section/new_row/build_page children.",
      additionalProperties: false,
      properties: {
        bp2: { $ref: "#/$defs/bpOverride" },
        bp3: { $ref: "#/$defs/bpOverride" },
        bp4: { $ref: "#/$defs/bpOverride" },
      },
    },
    bpOverride: {
      type: "object",
      description: "Only the style/config keys that CHANGE at this breakpoint (everything else cascades from the larger breakpoint).",
      additionalProperties: false,
      properties: {
        style: { $ref: "#/$defs/style" },
        config: { $ref: "#/$defs/config" },
      },
    },
    breakpoint: {
      type: "object",
      description: "Per-breakpoint render data (bp1 ≥1320 desktop · bp2 993–1319 · bp3 641–992 tablet · bp4 320–640 mobile). Written by build_page; set explicitly only to override a smaller screen.",
      additionalProperties: false,
      properties: {
        style: { $ref: "#/$defs/style" },
        config: { $ref: "#/$defs/config" },
      },
    },
    style: {
      type: "object",
      description: "CSS-ish props. Numbers (width/height) are px. Colours: theme vars var(--color_RC) or hex/rgba. borderRadius is a STRING with units ('8px'). Common: width,height,color,background,fontSize,fontWeight,textAlign,lineHeight,border,boxShadow,padding*,borderRadius,overflow,justifyContent.",
      additionalProperties: true,
    },
    config: {
      type: "object",
      description: "LAYOUT (CSS grid placement) + a few render flags. Not absolute top/left.",
      additionalProperties: true,
      properties: {
        grid: { type: "string", description: "Grid template id, e.g. '3xN' (section: margin·content·margin) or '1xN' (container)." },
        columns: { type: "array", description: "Column unit objects, e.g. [{unit:'fr',value:1},{unit:'px',absValue:1300,value:1},{unit:'fr',value:1}].", items: { type: "object" } },
        rows: { type: "array", description: "Row unit objects — one per child.", items: { type: "object" } },
        rowGap: { type: "number", description: "Vertical gap (px) between stacked children." },
        columnGap: { type: "number", description: "Horizontal gap (px) between columns." },
        heightUnit: { type: "string", description: "'auto' lets content set height (the common value); a fixed px height is used otherwise." },
        loaded: { type: "boolean", description: "Internal flag set on expand (bp config). You don't set it." },
        columnStart: { type: "number" },
        columnEnd: { type: "number" },
        rowStart: { type: "number" },
        rowEnd: { type: "number" },
        constraintX: { type: "array", items: { type: "string", enum: ["left", "right", "centerLeft"] } },
        constraintY: { type: "array", items: { type: "string", enum: ["top", "bottom", "centerTop"] } },
        src: { type: "string", description: "Image source URL (image elements). MUST be a WebCake-CDN url or it won't render." },
      },
    },
    event: {
      type: "object",
      description: "Interaction. Set `action` (+ its fields); the factory mints id and a sensible eventName. See list_events.",
      required: ["action"],
      additionalProperties: true,
      properties: {
        action: {
          type: "string",
          description: "open_page | open_link | open_category | scroll_to | toggle | open_popup | close_popup | add_to_cart | buy_now | apply_promotion | phone_call | open_email | scale | …",
        },
        eventName: { type: "string", description: "Trigger: click (default) | hover | success | submit | mouseenter | mouseleave." },
        open_page_id: { type: "string" },
        open_category_id: { type: "string" },
        link_target: { type: "string" },
        link_target_url: { type: "string" },
        scroll_to_id: { type: "string" },
        toggle_id: { type: "string" },
        popup_id: { type: "string" },
        popup_overlay: { type: "boolean" },
        open_page: { type: "string", description: "Commerce shortcut, e.g. add_to_cart with open_page:'cart'." },
        phone_call_number: { type: "string" },
        open_email: { type: "string" },
      },
    },
    binding: {
      type: "object",
      description: "Dataset binding for dataset elements / repeater children. Set `target`; the builder mints id. Target only resolves on a page whose `type` enables that dataset (store/member/blog). See list_bindings.",
      required: ["target"],
      additionalProperties: true,
      properties: {
        target: { type: "string", description: "'<dataset>::<field>', e.g. product::product_price, cart_item::cart_item_name, order_item::product_name." },
        name: { type: "string", description: "Dataset name (product, cart_item, order_item, post, category, customer_address, …)." },
      },
    },
  },
} as const;

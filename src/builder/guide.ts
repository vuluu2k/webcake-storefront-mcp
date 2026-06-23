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
- container \`runtime.config\`: \`grid: "1xN"\`, \`columns: [{unit:'fr',value:1}]\`,
  \`rows: [{unit:'min/max', min:{unit:'px',absValue:H}, max:{unit:'max-c'}}, ...]\`.
- each child \`runtime.config\`: \`columnStart/columnEnd\`, \`rowStart/rowEnd\` (1-based grid
  lines), \`constraintX\` (['left'|'right'|'centerLeft']), \`constraintY\` (['top'|'bottom'|'centerTop']).
new_section does this for you: pass children and they are stacked one row each. To build
multi-column layouts, nest a container child and give it its own grid.

## Styling
- \`runtime.style\` holds CSS-ish props: width/height (numbers = px), color, background,
  fontSize ("16px"), fontWeight, textAlign, border*, boxShadow, etc.
- \`runtime.config.heightUnit\`: "auto" lets content set height (default for text/image).
- Colours as hex or rgba(). Use the site theme colours where possible.

## Responsive breakpoints
Override style/config per breakpoint by adding a key on the node: \`bp1\`, \`tablet\`,
\`laptop\` → \`{ style: {...}, config: {...} }\`. Desktop values live in \`runtime\`.
Breakpoint widths: large_desktop 1920, desktop 1280, laptop 992, tablet 640.

## Content & data
- Text: \`specials.text\` (HTML allowed), \`specials.tag\` ("h1".."p").
- Image: \`runtime.config.src\` (URL). Use search_images / upload before referencing.
- Form: wrap inputs in a \`form\`; set \`form.specials.type\`
  (form_order | form_login | form_signup | form_discount | order_tracking). Each input
  needs \`specials.field_name\`.
- Dataset elements (text-dataset, image-dataset, grid-product...) use \`bindings\` to pull
  product/category/blog data — leave bindings to dataset-driven pages.

## Workflow (do this every time)
1. Intake: confirm goal, brand, colours, sections wanted (ask 3-5 questions if unclear).
2. list_elements / get_element to pick the right component types.
3. Build sections with new_section (or new_element for one node), fill content.
4. validate_page — fix every error and review warnings.
5. build_page with dry_run:true first → review → dry_run:false to persist.
6. For existing pages, prefer surgical edits (update_page_element) over full rewrites.
Always keep Vietnamese text with full diacritics; reply in the user's language.`;

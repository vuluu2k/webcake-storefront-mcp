**🌐 [Tiếng Việt](README_VI.md)** | English

# WebCake CMS MCP Server

MCP server exposing WebCake CMS features for AI agents.

## Quick Install (Recommended)

Run the auto-install script — it handles everything: clone, install dependencies, configure your IDE.

### macOS / Linux

**Option A — Interactive** (prompts for input):

If you already cloned the repo:
```bash
./install.sh
```

Or download and run directly:
```bash
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/install.sh -o install.sh && bash install.sh
```

**Option B — Non-interactive** (via `curl` pipe or CI):

```bash
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/install.sh | bash -s -- \
  --token YOUR_TOKEN \
  --session-id YOUR_SESSION_ID \
  --site-id YOUR_SITE_ID
```

**All flags:**

| Flag | Description | Default |
|------|-------------|---------|
| `--token TOKEN` | JWT Bearer token | *(required)* |
| `--session-id ID` | Session ID (`x-session-id`) | *(optional)* |
| `--site-id ID` | Target site ID | *(required)* |
| `--api-url URL` | API base URL | `https://api.storecake.io` |
| `--ide IDE` | IDE to configure: `claude-desktop`, `claude`, `cursor`, `windsurf`, `augment`, `codex`, `all` | `all` |
| `--dir PATH` | Install directory | `~/.webcake-storefront-mcp` |
| `--uninstall` | Remove MCP server and IDE configs | — |

**Examples:**

```bash
# Install and configure only Claude Code
curl -fsSL .../install.sh | bash -s -- --token abc123 --site-id site_xyz --ide claude

# Install and configure Cursor + Windsurf
./install.sh --token abc123 --site-id site_xyz --ide cursor
./install.sh --token abc123 --site-id site_xyz --ide windsurf

# Uninstall
./install.sh --uninstall
```

### Windows (PowerShell)

If you already cloned the repo:
```powershell
.\install.ps1
```

Or download and run directly:
```powershell
irm https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/install.ps1 -OutFile install.ps1; .\install.ps1
```

Uninstall:
```powershell
.\install.ps1 --uninstall
```

---

## Update

Update to the latest version:

### macOS / Linux

```bash
# Auto-detect install path
~/.webcake-storefront-mcp/update.sh
```

Or specify the path:
```bash
./update.sh ~/.webcake-storefront-mcp
```

Or download and run:
```bash
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/update.sh | bash
```

### Windows (PowerShell)

```powershell
# Auto-detect install path
.\update.ps1
```

Or specify the path:
```powershell
.\update.ps1 C:\Users\you\.webcake-storefront-mcp
```

Or download and run:
```powershell
irm https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/update.ps1 -OutFile update.ps1; .\update.ps1
```

---

## Setup Knowledge (Optional)

Add custom knowledge files so AI agents understand your business rules, policies, and coding standards.

```bash
# If you already cloned the repo
./setup_env.sh

# Or download and run directly
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/setup_env.sh | bash
```

This script will:
1. Ask for knowledge env vars (`WEBCAKE_KNOWLEDGE_DIR`, `WEBCAKE_KNOWLEDGE_REPO`, `WEBCAKE_KNOWLEDGE_TOKEN`)
2. Auto-detect IDEs already configured with webcake-cms
3. Merge the new env vars into existing IDE configs

See the `knowledge/` folder for examples and writing guides.

---

## Manual Setup

```bash
git clone https://github.com/vuluu2k/webcake-storefront-mcp.git
cd webcake-storefront-mcp
npm install
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WEBCAKE_API_URL` | Yes | WebCake API base URL (e.g. `https://api.storecake.io`) |
| `WEBCAKE_TOKEN` | No* | JWT Bearer token (dashboard auth) |
| `WEBCAKE_SESSION_ID` | No* | Session ID (`x-session-id` header) |
| `WEBCAKE_SITE_ID` | No* | Target site ID |
| `WEBCAKE_KNOWLEDGE_DIR` | No | Path to local knowledge files directory (default: `./knowledge`) |
| `WEBCAKE_KNOWLEDGE_REPO` | No | GitHub repo for knowledge files (e.g. `owner/repo` or full URL) |
| `WEBCAKE_KNOWLEDGE_TOKEN` | No | GitHub token for private repos |
| `MONGO_URI` | No | MongoDB connection string. If set, image alt cache is mirrored to Mongo for cross-instance reuse |
| `MONGO_DB` | No | MongoDB database name (default: `webcake_mcp`) |
| `MONGO_COLLECTION` | No | MongoDB collection name (default: `image_alt_cache`) |

> \* Token, session_id, site_id can be set later via `update_auth` and `switch_site` tools in chat. When set via tools, values are **saved to SQLite** (`webcake-mcp.db`) and auto-restored in the next session.

> CMS admin token and CMS API key are automatically fetched via API when needed (no manual config required).

### How to get `WEBCAKE_TOKEN` and `WEBCAKE_SESSION_ID`

1. Open [WebCake Dashboard](https://storecake.io) and log in
2. Open DevTools (`F12` or `Cmd + Option + I`)
3. Go to **Network** tab > click any page
4. Find an API request (e.g. `@me`, `site/all`...)
5. In **Request Headers**:
   - `Authorization: Bearer ...` → copy the value after "Bearer " → this is your `WEBCAKE_TOKEN`
   - `x-session-id: ...` → copy the value → this is your `WEBCAKE_SESSION_ID`
6. `WEBCAKE_SITE_ID` is in the dashboard URL: `https://storecake.io/site/{site_id}/...` or use the `list_my_sites` tool to list all sites

---

## Configuration by IDE / AI Tool

> Replace `/absolute-path/webcake-storefront-mcp/index.js` below with the actual path where you cloned the repo.
> Example: `/Users/username/webcake-storefront-mcp/index.js`

### 1. Claude Desktop

Open Settings > Developer > Edit Config, or edit the file directly:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/absolute-path/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<your-token>",
        "WEBCAKE_SESSION_ID": "<your-session-id>",
        "WEBCAKE_SITE_ID": "<your-site-id>"
      }
    }
  }
}
```

Restart Claude Desktop. The MCP tools will appear in the chat input (hammer icon).

---

### 2. Claude Code (CLI)

Run in terminal:

```bash
claude mcp add webcake-cms \
  -e WEBCAKE_API_URL=https://api.storecake.io \
  -e WEBCAKE_TOKEN=<your-token> \
  -e WEBCAKE_SESSION_ID=<your-session-id> \
  -e WEBCAKE_SITE_ID=<your-site-id> \
  -- node /absolute-path/webcake-storefront-mcp/index.js
```

Or create `.claude.json` at project root:

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/absolute-path/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<your-token>",
        "WEBCAKE_SESSION_ID": "<your-session-id>",
        "WEBCAKE_SITE_ID": "<your-site-id>",
      }
    }
  }
}
```

Or configure globally at `~/.claude.json`.

Verify:
```bash
claude mcp list
```

---

### 3. Cursor

Create `.cursor/mcp.json` at project root:

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/absolute-path/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<your-token>",
        "WEBCAKE_SESSION_ID": "<your-session-id>",
        "WEBCAKE_SITE_ID": "<your-site-id>",
      }
    }
  }
}
```

Or global config at `~/.cursor/mcp.json`. Restart Cursor and check Settings > MCP Servers for **"Connected"** status.

---

### 4. Windsurf

Create `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/absolute-path/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<your-token>",
        "WEBCAKE_SESSION_ID": "<your-session-id>",
        "WEBCAKE_SITE_ID": "<your-site-id>",
      }
    }
  }
}
```

Restart Windsurf. Type `@` in Cascade chat to see `webcake-cms` tools.

---

### 5. Augment (VS Code Extension)

Open Command Palette: `Cmd + Shift + P` > **"Augment: Edit MCP Settings"**, then add:

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/absolute-path/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<your-token>",
        "WEBCAKE_SESSION_ID": "<your-session-id>",
        "WEBCAKE_SITE_ID": "<your-site-id>",
      }
    }
  }
}
```

Restart VS Code.

---

### 6. Codex (OpenAI CLI)

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.webcake-cms]
command = "node"
args = ["/absolute-path/webcake-storefront-mcp/index.js"]
env = { "WEBCAKE_API_URL" = "https://api.storecake.io", "WEBCAKE_TOKEN" = "<your-token>", "WEBCAKE_SESSION_ID" = "<your-session-id>", "WEBCAKE_SITE_ID" = "<your-site-id>" }
```

Or via CLI:
```bash
codex mcp add webcake-cms \
  --env WEBCAKE_API_URL=https://api.storecake.io \
  --env WEBCAKE_TOKEN=<your-token> \
  --env WEBCAKE_SESSION_ID=<your-session-id> \
  --env WEBCAKE_SITE_ID=<your-site-id> \
  -- node /absolute-path/webcake-storefront-mcp/index.js
```

Verify:
```bash
codex mcp list
```

---

## Usage Examples

### Example 1: Write backend HTTP function + frontend integration

**Prompt:**
```
Create a newsletter subscription feature. Backend saves email to "subscribers" collection,
frontend calls the backend function.
```

**AI agent will automatically:**

**Step 1** — Call `get_http_function` to read current code

**Step 2** — Call `update_http_function` to add new functions:

```javascript
import { DBConnection } from 'webcake-data';
const db = new DBConnection();
const Subscriber = db.model('subscribers');

export const post_Subscribe = async (request) => {
  const { email } = request.params;
  if (!email) return { error: 'Email is required' };

  const exists = await Subscriber.exists({ email });
  if (exists) return { error: 'Already subscribed' };

  await Subscriber.create({ email, subscribed_at: new Date() });
  return { success: true, message: 'Subscribed successfully!' };
}

export const get_Subscribers = async (request) => {
  const { page = 1, limit = 20 } = request.params;
  const data = await Subscriber.find()
    .sort({ subscribed_at: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .exec();
  const total = await Subscriber.countDocuments();
  return { data, total, page };
}
```

**Step 3** — Call `update_site_custom_code` to add frontend code:

`code_before_head`:
```html
<script src="https://cdn.jsdelivr.net/npm/webcake-fn/dist/webcake-fn.umd.min.js"></script>
```

`code_custom_javascript`:
```javascript
document.getElementById('newsletter-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('newsletter-email').value;
  try {
    const result = await api.post_Subscribe({ email });
    if (result.success) {
      window.useNotification('success', { title: result.message });
    } else {
      window.useNotification('error', { title: result.error });
    }
  } catch (err) {
    window.useNotification('error', { title: 'Error', message: err.message });
  }
});
```

---

### Example 2: Batch create blog articles

**Prompt:**
```
Write 3 blog posts about summer skincare, each 300 words, with SEO-friendly slugs.
```

**AI agent calls `create_article` 3 times:**

```
create_article({
  name: "5 Steps for Summer Skincare",
  slug: "5-steps-summer-skincare",
  content: "<h2>...</h2><p>...</p>",
  tags: ["skincare", "summer"]
})

create_article({
  name: "Sun Protection Done Right",
  slug: "sun-protection-done-right",
  content: "<h2>...</h2><p>...</p>",
  tags: ["skincare", "sunscreen"]
})

create_article({
  name: "Moisturizing Oily Skin",
  slug: "moisturizing-oily-skin",
  content: "<h2>...</h2><p>...</p>",
  tags: ["skincare", "moisturizer"]
})
```

---

### Example 3: Debug and test a function

**Prompt:**
```
Test the get_Subscribers function to see if it works
```

**AI agent calls:**
```
run_function({
  function_name: "Subscribers",
  method: "GET",
  params: { page: 1, limit: 5 }
})
```

Returns the result or error, AI agent reads and explains to the developer.

---

### Example 4: Add custom CSS

**Prompt:**
```
Add hover effect to all product cards: slight lift with drop shadow.
```

**AI agent calls `update_site_custom_code`:**

`code_custom_css`:
```css
.product-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
}
```

---

### Example 5: Find customer and send email

**Prompt:**
```
Find the customer with email john@example.com and send a thank-you email.
```

**AI agent calls 2 tools:**

```
find_customer({ by: "email", value: "john@example.com" })
→ Found: { name: "John Doe", email: "john@example.com" }

send_mail({
  to: "john@example.com",
  subject: "Thank you for your purchase!",
  body: "<h2>Hi John Doe,</h2><p>Thank you for shopping with us...</p>"
})
```

---

### Example 6: Find and update page elements

**Prompt:**
```
Change the hero title color to red and update the CTA button text to "Buy Now"
```

**AI agent calls 3 tools:**

```
# Step 1: Find the hero title
search_page_elements({ page_id: "page_1", custom_class: "hero-title" })
→ { matched: 1, elements: [{ id: "TEXT-3", type: "text", ... }] }

# Step 2: Find the CTA button
search_page_elements({ page_id: "page_1", custom_class: "cta" })
→ { matched: 1, elements: [{ id: "BUTTON-1", type: "button", ... }] }

# Step 3: Update both elements at once
update_page_elements({
  page_id: "page_1",
  updates: [
    { element_id: "TEXT-3", style: { "color": "#ff0000" } },
    { element_id: "BUTTON-1", specials: { "text": "Buy Now" } }
  ]
})
```

---

## Detailed Tool Usage Guide

All tools are designed with **token optimization** in mind — list tools return lightweight metadata, detail tools return full data, and guides are loaded on-demand. This section explains the optimal workflow for each tool group.

### CMS Files & HTTP Functions

#### Step 1: Get overview — `get_http_function` (default: overview mode)

By default, returns **only function names and line ranges** — no code body. Very token-efficient for large files.

```
# First time — overview + guide + schemas
get_http_function({ include_guide: true })
→ {
    file_id: "file_123",
    total_lines: 250,
    imports: "import { DBConnection } from 'webcake-data';",
    functions: [
      { name: "get_Products", method: "get", function_name: "Products", start_line: 5, end_line: 35, lines: 31 },
      { name: "post_CreateOrder", method: "post", function_name: "CreateOrder", start_line: 37, end_line: 120, lines: 84 },
      ...
    ],
    collections: [...],
    guide: "..."
  }

# Subsequent calls — overview only
get_http_function({})
```

To get the full file (when really needed): `get_http_function({ overview: false })`

#### Step 2: Read specific functions — `get_http_function_snippet`

Read only the function(s) you need — saves 80-95% tokens vs reading the full file.

```
get_http_function_snippet({ function_names: ["get_Products"] })
→ {
    functions: [{
      name: "get_Products", method: "get", function_name: "Products",
      start_line: 5, end_line: 35,
      code: "export const get_Products = (request) => {\n  ..."
    }]
  }
```

#### Step 3: Edit by function name — `edit_http_function`

Edit functions by **name** — server finds function boundaries automatically. No fragile string matching.

```
# Replace entire function by name (server finds where it starts/ends)
edit_http_function({
  action: "replace_function",
  function_name: "get_Products",
  code: "export const get_Products = (request) => {\n  const db = new DBConnection();\n  return db.model('products').find().limit(20).exec();\n}"
})

# Add a new function at end of file
edit_http_function({
  action: "add",
  code: "export const get_Stats = (request) => {\n  return { count: 42 };\n}"
})

# Remove a function by name
edit_http_function({ action: "remove", function_name: "get_OldFunction" })

# Update import block
edit_http_function({
  action: "update_imports",
  code: "import { DBConnection } from 'webcake-data';\nimport { findArticle } from '@webcake/article';"
})
→ { success: true, total_lines: 245, functions: [...] }
```

#### Full rewrite (when needed) — `update_http_function`

Send full file content. Use `edit_http_function` for targeted changes instead.

```
update_http_function({ content: "import { DBConnection } from 'webcake-data';\n..." })
```

#### Testing — `debug_function` vs `run_function`

| Tool | When to use |
|------|-------------|
| `debug_function` | Test code **before deploying** — send code directly, get result + logs |
| `run_function` | Call an **already deployed** function — like calling a REST API |

```
# Debug: test code without saving
debug_function({
  content: "export const get_Test = (request) => { return { hello: 'world' }; }",
  function_name: "Test",
  params: {}
})

# Run: call deployed function (note: function_name excludes method prefix)
run_function({ function_name: "Products", method: "GET", params: { page: 1 } })
```

#### Version management — `save_file_version` / `get_file_versions`

Save a snapshot before major changes for rollback capability:

```
save_file_version({ cms_file_id: "file_123", content: "...", is_public: false })
get_file_versions({ cms_file_id: "file_123" })
```

---

### Pages & Custom Code

#### Step 1: List pages — `list_pages`

Returns **metadata only** (no source data) — id, name, slug, type, is_homepage, updated_at.

```
list_pages({})
→ [{ id: "page_1", name: "Home", slug: "/", type: "page", is_homepage: true, ... }, ...]
```

#### Step 2: Get page overview — `get_page_source`

Returns a **lightweight overview** of the page structure — section count, element type counts, and all custom CSS classes used. Does NOT return full source data.

```
get_page_source({ page_id: "page_1" })
→ {
    page: { id, name, slug, type },
    custom_code: { ... },
    overview: {
      sections_count: 5,
      total_elements: 47,
      element_types: { section: 5, container: 12, text: 15, image: 8, button: 7 },
      custom_classes: ["hero-title", "product-card", "cta-button", ...]
    }
  }
```

#### Step 3: Search specific elements — `search_page_elements`

Query elements by various filters. Returns **full detail** for each matched element (style, config, specials, events, bindings, responsive breakpoints).

```
# Find all buttons
search_page_elements({ page_id: "page_1", type: "button" })

# Find elements with a specific CSS class
search_page_elements({ page_id: "page_1", custom_class: "hero" })

# Find text containing "subscribe"
search_page_elements({ page_id: "page_1", text: "subscribe" })

# Find all data-bound elements (product, category, blog bindings)
search_page_elements({ page_id: "page_1", has_bind: true })

# Find all elements with click/submit events
search_page_elements({ page_id: "page_1", has_events: true })

# Find all elements that have custom CSS classes
search_page_elements({ page_id: "page_1", has_custom_class: true })

# Combine filters
search_page_elements({ page_id: "page_1", type: "text", custom_class: "hero", limit: 10 })
```

Each matched element returns:

```json
{
  "id": "TEXT-3",
  "type": "text",
  "style": { "color": "#333", "font-size": "18px", ... },
  "config": { ... },
  "specials": { "text": "Subscribe now", "custom_class": "cta-text", "custom_css": "..." },
  "events": [{ "eventName": "click", "action": "open_page", ... }],
  "bindings": [{ "name": "product", "target": "title", ... }],
  "responsive": {
    "bp_320_768": { "style": { "font-size": "14px" } },
    "bp_768_1024": { "style": { "font-size": "16px" } }
  },
  "children_count": 3
}
```

**CSS targeting**: Sections render as `<section id="SECTION-1" class="x-section {custom_class}">`, elements as `<div id="TEXT-3" class="x-element {custom_class}">`. Target via `#TEXT-3` (by ID) or `.cta-text` (by custom class).

#### Custom code — `get_site_custom_code` / `append_site_custom_code`

**Read specific fields only** to save tokens when code is large:

```
# Read only CSS (skip large JS)
get_site_custom_code({ fields: ["code_custom_css"] })
→ { code_custom_css: ".hero { color: #333; ... }" }

# Read all — _sizes shows character count per field
get_site_custom_code({ include_guide: true })
→ { ..., _sizes: { code_custom_css: 3500, code_custom_javascript: 8200, ... }, guide: "..." }
```

**Add new code** — append/prepend without reading existing content:

```
# Append new CSS rules
append_site_custom_code({ field: "code_custom_css", code: ".new-section { padding: 20px; }" })

# Prepend a script tag to head
append_site_custom_code({ field: "code_before_head", position: "prepend",
  code: "<script src='https://cdn.example.com/lib.js'></script>" })
```

**Full update** — read first, then rewrite entire field:
```
get_site_custom_code({ fields: ["code_custom_css"] })   # read only CSS
update_site_custom_code({ code_custom_css: ".hero { ... }\n.new-style { ... }" })
```

| Field | Where it's injected | Use for |
|-------|-------------------|---------|
| `code_before_head` | Before `</head>` | External scripts, meta tags |
| `code_before_body` | Before `</body>` | Tracking scripts, chat widgets |
| `code_custom_css` | Auto-wrapped in `<style>` | Custom CSS styles |
| `code_custom_javascript` | As inline `<script>` | Custom JavaScript |

#### Step 4: Update elements — `update_page_element` / `update_page_elements`

After finding elements via search, update their properties directly in the page source.

**Single element update:**
```
# Change text and style of a specific element
update_page_element({
  page_id: "page_1",
  element_id: "TEXT-3",
  style: { "color": "#ff0000", "font-size": "24px" },
  specials: { "text": "New heading text", "custom_class": "hero-title,bold" }
})

# Add events to a button
update_page_element({
  page_id: "page_1",
  element_id: "BUTTON-1",
  events: [{ "eventName": "click", "action": "open_page", "open_page_id": "page_2" }]
})

# Update responsive styles
update_page_element({
  page_id: "page_1",
  element_id: "TEXT-3",
  responsive: {
    "bp_320_768": { "style": { "font-size": "14px" } },
    "bp_768_1024": { "style": { "font-size": "18px" } }
  }
})
```

**Batch update multiple elements at once:**
```
update_page_elements({
  page_id: "page_1",
  updates: [
    { element_id: "TEXT-1", specials: { "text": "Welcome" } },
    { element_id: "TEXT-2", style: { "color": "#333" } },
    { element_id: "BUTTON-1", specials: { "custom_class": "cta-primary" } }
  ]
})
```

**Merge rules:**
| Property | Behavior | Example |
|----------|----------|---------|
| `style` | Shallow merge | Only changed CSS properties are updated, others kept |
| `config` | Shallow merge | Same as style |
| `specials` | Shallow merge | Update `text`, `custom_class`, `custom_css` individually |
| `events` | Replace | Entire events array is replaced (get current first) |
| `bindings` | Replace | Entire bindings array is replaced |
| `responsive` | Merge by breakpoint | Each `bp_*` key is set/replaced individually |

#### Get single element detail — `get_page_element`

Get full detail of one element by its ID, including children IDs for tree navigation.

```
get_page_element({ page_id: "page_1", element_id: "SECTION-1" })
→ { id: "SECTION-1", type: "section", style: {...}, specials: {...},
    children: [{ id: "CONTAINER-1", type: "container" }, { id: "TEXT-1", type: "text" }] }
```

#### Custom code — `get_site_custom_code` / `update_site_custom_code`

**Always read before writing** to avoid overwriting existing code.

On the **first call**, set `include_guide=true` to get the coding guide (~400 tokens). Omit on subsequent calls.

```
# First time — read current code + guide
get_site_custom_code({ include_guide: true })
→ {
    code_before_head: "<script src='...'>",
    code_before_body: "",
    code_custom_css: ".hero { ... }",
    code_custom_javascript: "document.addEventListener(...)",
    guide: "..."
  }

# Update — only send the fields you want to change
update_site_custom_code({ code_custom_css: ".hero { ... }\n.new-style { ... }" })
```

| Field | Where it's injected | Use for |
|-------|-------------------|---------|
| `code_before_head` | Before `</head>` | External scripts, meta tags |
| `code_before_body` | Before `</body>` | Tracking scripts, chat widgets |
| `code_custom_css` | Auto-wrapped in `<style>` | Custom CSS styles |
| `code_custom_javascript` | As inline `<script>` | Custom JavaScript |

#### Recommended workflows

**CSS/JS tasks:**
```
1. list_pages()                              → find the target page
2. get_page_source({ page_id })              → understand page structure
3. search_page_elements({ page_id, ... })    → find specific elements to style
4. get_site_custom_code({ include_guide: true })  → read existing code
5. update_site_custom_code({ ... })          → write new code (merged with existing)
```

**Direct element modification:**
```
1. list_pages()                              → find the target page
2. get_page_source({ page_id })              → overview of elements
3. search_page_elements({ page_id, ... })    → find elements to modify
4. update_page_element({ page_id, element_id, ... })  → update properties
   or update_page_elements({ page_id, updates: [...] })  → batch update
```

---

### Collections (Database)

#### List collections — `list_collections`

Returns **summary only** — name, table_name, field count. Does NOT include full schema definitions.

```
list_collections({})
→ {
    data: [
      { id: "col_1", name: "Subscribers", table_name: "subscribers", fields_count: 5 },
      { id: "col_2", name: "Orders", table_name: "custom_orders", fields_count: 12 },
      ...
    ],
    total: 8
  }
```

#### Get full schema — `get_collection`

Use this to get complete field definitions (name, type, constraints, references) when you need to write queries.

```
get_collection({ id: "col_1" })
→ { name: "Subscribers", table_name: "subscribers", schema: [
    { name: "email", type: "string", is_required: true },
    { name: "subscribed_at", type: "datetime", is_required: false },
    ...
  ]}
```

#### Query records — `query_collection_records`

Inspect existing data using the **table_name** (not collection ID).

```
query_collection_records({ table_name: "subscribers", page: 1, limit: 10 })
```

---

### Blog Articles

#### List articles — `list_articles`

Returns **metadata only** — no HTML content. Saves significant tokens for sites with many articles.

```
list_articles({ page: 1, limit: 20 })
→ {
    data: [
      { id: "art_1", name: "Getting Started", slug: "getting-started", summary: "...",
        tags: ["tutorial"], category_id: "cat_1", created_at: "...", updated_at: "..." },
      ...
    ],
    total: 45
  }
```

#### Get full article — `get_article`

Use this when you need the full HTML content of a specific article.

```
get_article({ id: "art_1" })
→ { id: "art_1", name: "...", content: "<h2>...</h2><p>Full HTML content...</p>", ... }
```

---

### Products

#### List products — `list_products`

Returns **metadata only** — id, name, slug, price, image, status. No full description or variations.

```
list_products({ page: 1, limit: 20, term: "shirt" })
→ {
    data: [
      { id: "prod_1", name: "Blue Shirt", slug: "blue-shirt", price: 29.99,
        image: "https://...", is_published: true, total_sold: 150, ... },
      ...
    ],
    total: 42
  }
```

#### Get full product — `get_product`

Returns complete product data: description, variations (sizes/colors/prices), attributes, images, SEO meta.

```
get_product({ id: "prod_1" })
→ { id: "prod_1", name: "Blue Shirt", description: "<p>...</p>",
    variations: [...], product_attributes: [...], meta_tags: [...], ... }
```

#### Search products — `search_products`

Quick keyword search across product names.

```
search_products({ term: "summer dress", limit: 10 })
```

#### Product categories — `list_categories`

List all product categories of the site.

```
list_categories({})
→ [{ id: "cat_1", name: "Shirts", slug: "shirts", ... }, ...]
```

---

### Orders

#### List orders — `list_orders`

Returns order **metadata only** — customer name, status, total value. No item details.

```
list_orders({ page: 1, limit: 20, status: 50 })
→ {
    data: [
      { id: "ord_1", bill_full_name: "John Doe", status: 50,
        invoice_value: 99.99, items_count: 3, created_at: "..." },
      ...
    ],
    total: 128
  }
```

**Status codes:** 0=pending, 50=confirmed, 100=shipping, 150=delivered, -1=cancelled

#### Get full order — `get_order`

Returns complete order: items with product details, customer info, payment, shipping, discounts.

```
get_order({ id: "ord_1" })
→ { id: "ord_1", bill_full_name: "John Doe", items: [...], shipping_address: {...}, ... }
```

#### Order statistics — `count_orders_by_status`

Get order count grouped by status for dashboard overview.

```
count_orders_by_status({})
→ { pending: 5, confirmed: 12, shipping: 3, delivered: 108, cancelled: 2 }
```

---

### Promotions & Discounts

#### List promotions — `list_promotions`

Returns promotion **metadata only** — name, type, status, schedule. Use `include_guide=true` for promotion type reference.

```
list_promotions({ page: 1, limit: 20, include_guide: true })
→ {
    data: [
      { id: "promo_1", name: "Summer Sale 30%", type: "normal",
        is_activated: true, start_time: "2025-06-01", end_time: "2025-06-30",
        priority_level: 1, used_count: 45 },
      { id: "promo_2", name: "WELCOME10", type: "coupon",
        is_activated: true, coupon_info: { code: "WELCOME10", max_uses: 100 } },
      ...
    ],
    total: 8,
    guide: "## Promotion Types..."
  }
```

#### Get full promotion — `get_promotion`

Returns complete promotion: discount rules, coupon settings, items, bonus products, customer levels.

```
get_promotion({ id: "promo_1" })
→ { id: "promo_1", name: "Summer Sale 30%", type: "normal", items: [...],
    bonus_items: [...], customer_levels: [...], ... }
```

#### Get promotion items — `get_promotion_items`

Returns products/variations/categories attached to a promotion with detailed discount info.

```
get_promotion_items({ id: "promo_1", page: 1, limit: 20 })
→ { items: [{ id: "item_1", product: { name: "..." }, fixed_prices: 299000,
    level_info: [...] }], total_items: 15 }
```

#### Active promotions — `get_active_promotions`

Get all currently active promotions (activated and within schedule).

```
get_active_promotions({})
→ { data: [{ id: "promo_1", name: "Summer Sale", type: "normal", is_activated: true, ... }], total: 3 }
```

#### Search/filter promotions — `search_promotions`

Filter by type, time status, keyword, active state.

```
search_promotions({ type: "coupon", status: 2, is_activated: true })
→ { promotions: [...], total: 5 }
```

**Status filter:** 1=coming_soon, 2=in_progress, 3=finished

---

### Combo / Bundle Products

#### List combos — `list_combos`

Returns combo **metadata** — name, discount type, schedule. Use `include_guide=true` for combo type reference.

```
list_combos({ page: 1, limit: 20, include_guide: true })
→ {
    data: [
      { id: "combo_1", name: "Summer Bundle", is_activated: true,
        is_variation: false, discount_amount: 50000,
        start_time: "2025-06-01", end_time: "2025-06-30" },
      { id: "combo_2", name: "Buy 3 Get 1 Free", is_activated: true,
        is_categories: true, is_use_percent: true, discount_by_percent: 25 },
    ],
    total: 4,
    guide: "## Combo Product Types..."
  }
```

**Combo types:**
- `is_variation=true` — Variation-based: requires specific product variations
- `is_variation=false` — Product-based: requires specific products (any variation)
- `is_categories=true` — Category-based: requires items from categories with quantities

**Discount types:**
- `discount_amount` — Fixed amount off
- `is_use_percent=true` + `discount_by_percent` — Percentage off (capped by `max_discount_by_percent`)
- `is_value_combo=true` + `value_combo` — Fixed total price for combo
- `is_free_shipping=true` — Free shipping included

#### Get combo items — `get_combo_items`

Returns the products/variations that compose the combo and any bonus/gift products.

```
get_combo_items({ combo_product_id: "combo_1" })
→ {
    combo_items: [
      { id: "item_1", product: { name: "T-Shirt" }, count: 2 },
      { id: "item_2", product: { name: "Shorts" }, count: 1 },
    ],
    bonus_items: [
      { id: "bonus_1", product: { name: "Free Socks" }, quantity: 1 }
    ]
  }
```

---

### Site Style & Theme

#### Site info — `get_site_info`

Get full site configuration: name, domain, logo, and **all settings** (colors, typography, layout, language, payment methods, etc.).

```
get_site_info({})
→ { id: "site_1", name: "My Store", domain: "mystore.storecake.io",
    settings: { primary_colors: [...], typography: {...}, layout_mode: "...", ... } }
```

#### Themes — `list_themes`

List all custom themes: colors, typographies, transitions, and which is currently active.

```
list_themes({})
→ [{ id: "theme_1", name: "Modern", colors: {...}, typographies: {...}, is_selected: true }, ...]
```

---

### Applications

#### Installed apps — `list_apps`

List all installed applications/subscriptions with their settings and status.

```
list_apps({})
→ [{ id: "app_1", type: 1, is_active: true, settings: {...} }, ...]
```

**Common app types:** 1=CMS, 2=Product Design, 10=Multilingual

#### Get app detail — `get_app`

Get a specific app by its type ID.

```
get_app({ type: "1" })
→ { id: "app_1", type: 1, is_active: true, settings: {...} }
```

---

### Custom Knowledge (Training)

Add your own knowledge files so AI agents have custom context about your business, coding standards, or workflows.

Knowledge supports two sources: **local files** and **GitHub repo**. Both can be used together — local files take priority if names conflict.

#### Source 1: Local files

Drop `.md` or `.txt` files into the `knowledge/` directory (next to `index.js`):

```
knowledge/
  business-rules.md
  coding-standards.md
  api-docs.md
```

Or set a custom directory:
```json
{ "env": { "WEBCAKE_KNOWLEDGE_DIR": "/path/to/my/knowledge" } }
```

#### Source 2: GitHub repo

Point to a GitHub repo containing knowledge files. The AI agent will fetch and read them automatically.

```json
{
  "env": {
    "WEBCAKE_KNOWLEDGE_REPO": "your-org/my-knowledge"
  }
}
```

**Supported formats:**

| Format | Example |
|--------|---------|
| `owner/repo` | `acme/knowledge-base` |
| `owner/repo/subdir` | `acme/docs/ai-guides` |
| Full URL | `https://github.com/acme/knowledge-base` |
| URL with branch + path | `https://github.com/acme/docs/tree/main/ai-guides` |

**Private repos** — add a GitHub personal access token:
```json
{
  "env": {
    "WEBCAKE_KNOWLEDGE_REPO": "your-org/private-knowledge",
    "WEBCAKE_KNOWLEDGE_TOKEN": "ghp_xxxxxxxxxxxx"
  }
}
```

Files are cached for 5 minutes to avoid GitHub API rate limits.

#### File format

Files support optional frontmatter for name and description:

```markdown
---
name: Business Rules
description: E-commerce shipping and return policies
tags: business, policy
---

## Shipping Policy
- Free shipping for orders over $50
- Express shipping: 2-3 business days
...
```

#### Usage

```
# List available knowledge files
list_knowledge({})
→ { files: [
    { file: "business-rules", name: "Business Rules", description: "E-commerce shipping..." },
    { file: "coding-standards", name: "Coding Standards", description: "..." }
  ]}

# Read a specific file
get_knowledge({ file: "business-rules" })
→ { file: "business-rules.md", name: "Business Rules", content: "## Shipping Policy\n..." }
```

AI agents will use this knowledge as context when helping with tasks. For example, if you have shipping rules documented, the AI will reference them when writing order-related code.

---

### Token Optimization Summary

| Pattern | Tokens saved | How |
|---------|-------------|-----|
| Lazy guides (`include_guide`) | ~600-1000 per call | Only load guide on first call |
| List = metadata only | 50-90% per list call | HTML content, source JSON, full schemas stripped from list responses |
| Overview + Search (pages) | ~85-90% | Overview gives structure, search gives only matched elements |
| HTTP function overview + snippet | ~80-95% per read | Overview shows function list only, snippet reads just the needed function |
| `edit_http_function` | ~70-90% per edit | Replace/add/remove by function name, not full file |
| Custom code field filter | ~50-80% per read | Read only CSS or JS instead of all 4 fields |
| `append_site_custom_code` | ~100% on add | Append/prepend without reading existing content |
| Compact JSON | ~30% per response | No pretty-printing in responses |

---

## Available Tools

### CMS Files (12 tools)
| Tool | Description |
|------|-------------|
| `list_cms_files` | List all CMS files |
| `create_cms_file` | Create HTTP function / cron job / default file |
| `update_cms_file` | Update file content |
| `get_http_function` | **Default**: full code + schemas. **overview=true**: function list only (for browsing). `include_guide=true` for coding guide |
| `get_http_function_snippet` | Read specific function(s) by name — much more token-efficient than full file |
| `edit_http_function` | Edit by function name: replace_function/add/remove/update_imports — no string matching needed |
| `update_http_function` | Full file write — best for new features, major refactors. `edit_http_function` for small fixes |
| `run_function` | Execute a deployed function |
| `debug_function` | Run code in debug mode (without deploying) |
| `save_file_version` | Save version snapshot for rollback |
| `get_file_versions` | Get version history |
| `toggle_debug_render` | Toggle debug render mode |

### Pages (16 tools)
| Tool | Description |
|------|-------------|
| `list_pages` | List all pages (metadata only, no source) |
| `get_page_source` | Get page overview: section count, element types, custom classes |
| `search_page_elements` | Search elements by type, id, class, text, bind, events (returns full detail) |
| `get_page_element` | Get full detail of a single element by ID (includes children IDs) |
| `update_page_element` | Update element properties: style, config, specials, events, bindings, responsive |
| `update_page_elements` | Batch update multiple elements in one call |
| `create_page` | Create a new page |
| `update_page` | Update page properties |
| `get_site_custom_code` | Read CSS/JS. Use `fields` to read only specific fields. `include_guide=true` for guide |
| `update_site_custom_code` | Write full CSS/JS custom code (only specified fields are updated) |
| `append_site_custom_code` | Append/prepend CSS/JS code without reading first — for adding new rules |
| `delete_page` | Delete a page |
| `get_page_versions` | Page version history |
| `list_page_contents` | Multi-language contents |
| `update_page_content` | Update content for a language |
| `list_global_sections` | List reusable global sections |

### Collections — Database (3 tools)
| Tool | Description |
|------|-------------|
| `list_collections` | List collections (name, table_name, field count only) |
| `get_collection` | Get full schema: field names, types, constraints, references |
| `query_collection_records` | Query records by table_name |

### Blog Articles (5 tools)
| Tool | Description |
|------|-------------|
| `list_articles` | List articles (metadata only, no HTML content) |
| `get_article` | Get full article with HTML content |
| `create_article` | Create article |
| `update_article` | Update article |
| `delete_article` | Delete article |

### Products (4 tools)
| Tool | Description |
|------|-------------|
| `list_products` | List products (metadata: name, slug, price, image, status) |
| `get_product` | Get full product: description, variations, attributes, images, SEO |
| `search_products` | Search products by keyword |
| `list_categories` | List all product categories |

### Orders (3 tools)
| Tool | Description |
|------|-------------|
| `list_orders` | List orders (metadata: customer, status, total, items count) |
| `get_order` | Get full order: items, payment, shipping, discounts |
| `count_orders_by_status` | Order count grouped by status |

### Promotions & Discounts (5 tools)
| Tool | Description |
|------|-------------|
| `list_promotions` | List all promotions (metadata: name, type, status, schedule). `include_guide=true` for type reference |
| `get_promotion` | Get full promotion details: discount rules, coupon settings, items, bonus products |
| `get_promotion_items` | Get products/variations/categories attached to a promotion with discount details |
| `get_active_promotions` | Get all currently active promotions |
| `search_promotions` | Search/filter by type, status (coming_soon/in_progress/finished), keyword |

### Combo Products (2 tools)
| Tool | Description |
|------|-------------|
| `list_combos` | List all combo/bundle products (name, discount, schedule, type). `include_guide=true` for type reference |
| `get_combo_items` | Get combo composition: required items (with quantities) and bonus/gift products |

### Site Style & Theme (2 tools)
| Tool | Description |
|------|-------------|
| `get_site_info` | Get site name, domain, logo, and all design settings |
| `list_themes` | List custom themes: colors, typography, transitions |

### Applications (2 tools)
| Tool | Description |
|------|-------------|
| `list_apps` | List installed apps with settings and status |
| `get_app` | Get specific app by type ID |

### Custom Knowledge (2 tools)
| Tool | Description |
|------|-------------|
| `list_knowledge` | List all custom knowledge/guide files |
| `get_knowledge` | Read a specific knowledge file |

### Customers (1 tool)
| Tool | Description |
|------|-------------|
| `find_customer` | Find by ID, phone, or email |

### Automation (1 tool)
| Tool | Description |
|------|-------------|
| `send_mail` | Send email via CMS automation |

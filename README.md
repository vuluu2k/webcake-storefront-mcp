<p align="center">
  <img src="./assets/logo.svg" alt="WebCake Storefront MCP" width="96" height="96">
</p>

<h1 align="center">WebCake Storefront MCP</h1>

**English** · [Tiếng Việt](./README.vi.md)

[![npm version](https://img.shields.io/npm/v/webcake-storefront-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/webcake-storefront-mcp)
[![npm downloads](https://img.shields.io/npm/dm/webcake-storefront-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/webcake-storefront-mcp)
[![GitHub stars](https://img.shields.io/github/stars/vuluu2k/webcake-storefront-mcp?style=social)](https://github.com/vuluu2k/webcake-storefront-mcp/stargazers)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-server-6E56CF)](https://modelcontextprotocol.io)

> **Describe a store page in plain words — your AI builds it, validates it, and publishes it to your WebCake storefront.**

> ⭐ **If this saves you an afternoon of dragging blocks around, [give it a star](https://github.com/vuluu2k/webcake-storefront-mcp) — every star keeps a solo project alive.**

> *"Build a page for my coffee shop — a hero with a Shop Now button, a product grid, and an order form. Save it and publish."*

…and a real, **editable** page appears on your WebCake/StoreCake site. No dragging blocks, no learning the schema, no hand-writing JSON.

---

## 🧩 How it works

This server is the **bridge** between your AI assistant and your storefront. The AI never *guesses* what a
page looks like — it asks this MCP, which knows the entire BuilderX component model, validates the result, and saves it.

```text
   You              AI assistant          webcake-storefront MCP          WebCake / StoreCake
  ┌──────┐  prompt  ┌────────────┐  tools ┌───────────────────────┐  API ┌──────────┐
  │ idea │ ───────► │  Claude /  │ ─────► │ • knows the BuilderX  │ ───► │  a real  │
  │      │          │  Cursor /  │        │   component model     │      │ editable │
  │      │ ◄─────── │  Windsurf  │ ◄───── │ • builds + validates  │ ◄─── │  page on │
  └──────┘ live URL └────────────┘ result │ • saves + publishes   │      │ your site│
                                          └───────────────────────┘      └──────────┘
```

1. **You ask** in plain language — goal, brand, sections, products, form fields.
2. **The AI learns the model** from the MCP: the element catalog, the CSS-grid layout, the breakpoints — so it builds a *real* storefront page, not a guess.
3. **It assembles + validates** the `{ sections: [...] }` page source. `validate_page` catches duplicate ids, broken grids, and form fields without a name **before** anything is saved.
4. **It saves** to your site — dry-run preview first, then for real — and `publish_site` makes it live.
5. **You get the preview URL** — open it, tweak in the editor, done.

### Why it's reliable

| | |
|---|---|
| 📚 **Knows the real model** | Serves 130+ BuilderX component types (text, image, button, form, product grid, cart, countdown, gallery…) ported **straight from the builder's own factory** — the exact same shapes the editor produces. |
| ✅ **Validates before saving** | Structural checks (unique ids, valid grid, form fields with names, working event targets) so the page isn't broken when it lands. |
| 🛡️ **Safe by default** | Every write is **dry-run first** — preview the change, nothing touches your site until you confirm. |
| ✏️ **Edits surgically** | Ask for one change ("make the CTA green") and it edits *only* that element — every other id, style, and block stays exactly as it was. |

> 💡 Selling **COD or online**? It speaks the full commerce model too — products, variations, cart, orders, promotions, combos.

---

## ✨ What you can build

One sentence to your AI → a finished, **editable** storefront page:

| | Just say… |
|---|---|
| 🛒 **Product page** | *"A one-product page for my skincare serum — gallery, price, an order form with cart."* |
| 🏬 **Storefront home** | *"A homepage — hero banner, featured product grid, a newsletter form."* |
| ⚡ **Flash sale** | *"A flash-sale page — big countdown, discounted product grid, a sticky Buy button."* |
| 🎟️ **Event / webinar** | *"A registration page — countdown, agenda, a sign-up form."* |
| 💌 **Invitation** | *"A wedding invite — names, date, a map, an RSVP form."* |
| 📰 **Blog / content** | *"A blog index with featured posts and a subscribe box."* |
| 🔗 **Link-in-bio** | *"A link-in-bio — avatar, short bio, 5 link buttons, socials."* |

…then **"make the CTA green"** or **"add a 4th feature"** and it edits *only* that block.

> 🤖 Works in **Claude Desktop, Claude Code, Cursor, Windsurf, VS Code**, or any MCP-capable client — and the **build guide + element catalog tools need zero backend calls**, so you can explore the model before pasting a token.

---

## Under the hood

An MCP (Model Context Protocol) server that teaches AI agents the **WebCake/StoreCake storefront builder
(BuilderX) component model** and connects them to the backend. The AI produces the full `{ sections: [...] }`
page source; `build_page` creates the page and saves it, and `publish_site` makes the whole site live.

Beyond page authoring, it exposes your real store: pages & custom code, products, orders, collections,
blog articles, promotions, combos, themes, customers, and automation — **~280 tools** in total.

| Method | Best for | Auth |
|--------|----------|------|
| **npx (local)** — runs on your machine | Personal daily use, full control | browser `login`, or a token + session |
| **Remote (`serve`)** — self-host Streamable-HTTP | Teams, the claude.ai dialog, always-on | `?jwt=` link / `x-webcake-jwt` header |

The **build + catalog tools** (`get_build_guide`, `list_elements`, `get_element`, `new_section`,
`validate_page`) work with **zero config**; everything that reads or writes your site needs a token + session.

---

## 🚀 Get connected

Pick **one**. Both hand your AI tool the full storefront toolkit. No coding.

### ① `npx` — runs on your machine (recommended)

Zero install, always the latest version, needs Node.js 18+. **One line** configures your IDE:

```bash
# Interactive — pick your IDE(s) and paste your credentials
npx -y webcake-storefront-mcp install

# Non-interactive — configure every supported IDE at once
npx -y webcake-storefront-mcp install --ide all --token <token> --session <session-id>

# Remove the server from every IDE config
npx -y webcake-storefront-mcp uninstall
```

Targets: `claude-desktop`, `claude-code`, `cursor`, `windsurf`, `vscode`, or `all`.
Just want to run the server (configure by hand)? `npx -y webcake-storefront-mcp`.

### ② Browser login — no token copy/paste

```bash
npx -y webcake-storefront-mcp login
```

Opens the builder's **connect page**; click *Connect* and your token + session are saved locally and picked up automatically.

### Remote URL — self-hosted, nothing per-client to install

```bash
npx -y webcake-storefront-mcp serve --port 8787
```

Then point any client at `http://<host>:8787/mcp?jwt=<TOKEN>` (clients that support headers can send
`x-webcake-jwt` instead; pick the site in chat with `switch_site`). Server-side secrets like `PEXELS_API_KEY`
live on the host — handy on a VPS.

> ⚠️ A `?jwt=` link contains your personal token — treat it like a password and use **HTTPS** in production.

---

## ⚙️ Configuration

Two values are required: **`WEBCAKE_TOKEN`** (Bearer JWT) and **`WEBCAKE_SESSION_ID`** (sent as
`x-session-id`). You pick the **site at runtime** — just ask in chat and the AI calls `list_my_sites` /
`switch_site` (your choice is saved and reused next session), so no `WEBCAKE_SITE_ID` is needed.

Base URLs come from a **named environment** — set `WEBCAKE_ENV` (or `--env`) and you never type a URL:

| `WEBCAKE_ENV` | api | app (login) | preview |
|---|---|---|---|
| `local` | `http://localhost:24679` | `http://localhost:5173` | `demo.localhost:24679/<siteId>` |
| `staging` | `https://api.staging.storecake.io` | `https://staging.webcake.io` | `staging2.webcake.me/<siteId>` |
| **`prod`** (default) | `https://api.storefront.webcake.io` | `https://webcake.io` | `<site_slug>.webcake.me` |

Override a preset with `WEBCAKE_API_URL` / `WEBCAKE_APP_URL`. Optional, configured server-side:
`PEXELS_API_KEY` (search_images). Token / session / site can also be set
in chat via `update_auth` and `switch_site` — saved to a local config file at `~/.webcake-storefront-mcp/`.

<details>
<summary><b>How to get your token + session</b></summary>

1. Open the WebCake builder and log in.
2. Open DevTools (`F12`) → **Network** tab → click any API request.
3. In **Request Headers**: `Authorization: Bearer …` → `WEBCAKE_TOKEN`; `x-session-id: …` → `WEBCAKE_SESSION_ID`.
4. No site id needed up front — in chat, run `list_my_sites` then `switch_site` to choose the site (remembered next time).

</details>

---

## 🧰 The tools at a glance

~280 tools. The headline group **builds pages**; the rest read and edit your live store.

| Group | Tools | Needs |
|-------|-------|-------|
| **Build a page** | `get_build_guide` · `list_elements` · `get_element` · `new_element` · `new_section` · `new_page_skeleton` · `validate_page` · `build_page` · `add_section` | catalog tools: nothing |
| **Media & ingest** | `search_images` (Pexels) · `upload_images` (CDN) · `ingest_html` · `ingest_url` (recreate a reference page) | — |
| **Pages & code** | `list_pages` · `get_page_source` · `search_page_elements` · `get_page_element` · `update_page_element(s)` · `create_page` · `update_page` · `update_page_source` · custom CSS/JS · page contents · global sections · `publish_site` | token + session |
| **Commerce** | products · orders · collections · promotions · combos | token + session |
| **Content & store** | blog articles · themes / site style · apps · customers · `send_mail` | token + session |
| **Backend code** | HTTP-function CRUD (`get_http_function`, `edit_http_function`, `run_function`, `debug_function`…) | token + session |
| **Context** | `get_current_context` · `list_my_sites` · `switch_site` · `update_auth` · `toggle_confirm_mode` | token |

Every write **defaults to `dry_run=true`** — it previews the exact change and only touches your site when you re-run with `dry_run=false`.

## 💬 Suggested prompt

> Build me a WebCake storefront page for &lt;brand/offer&gt;. Use the webcake-storefront MCP:
> call `get_build_guide`, `list_elements`, build the sections with `new_section`,
> `validate_page` until zero errors, then `build_page` (dry-run first) and `publish_site`.

---

## ⭐ Like the idea? Drop a star

This is a solo, open-source project — every ⭐ genuinely keeps it moving and helps other builders find it.

- ⭐ **[Star the repo](https://github.com/vuluu2k/webcake-storefront-mcp)** — 2 seconds, huge motivation.
- 🐛 **[Open an issue](https://github.com/vuluu2k/webcake-storefront-mcp/issues)** — a bug, a missing component, or just an idea.
- 🔁 **Share it** with anyone still building store pages block by block.

[![Star History Chart](https://api.star-history.com/svg?repos=vuluu2k/webcake-storefront-mcp&type=Date)](https://star-history.com/#vuluu2k/webcake-storefront-mcp&Date)

> Built with ❤️ for the WebCake community. Thanks for being here.

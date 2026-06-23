---
name: Knowledge Writing Guide
description: How to write effective knowledge files for AI agents
tags: guide, template
---

# Writing Knowledge Files

## File Structure

Each knowledge file has 2 parts: **frontmatter** (optional metadata) and **content** (the actual knowledge).

```markdown
---
name: Display Name
description: Short description shown in list_knowledge
tags: tag1, tag2
---

Your knowledge content here...
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Display name (defaults to filename) |
| `description` | No | One-line description for quick scanning |
| `tags` | No | Comma-separated tags for categorization |

If you omit the frontmatter, the filename becomes the display name.

---

## Content Writing Tips

### 1. Be specific and structured

Bad:
```
We have some shipping rules.
```

Good:
```markdown
## Shipping Rules

- Free shipping: orders >= 500,000 VND
- Standard: 3-5 business days, 30,000 VND
- Express: 1-2 business days, 60,000 VND
- Remote areas (list): +20,000 VND surcharge
- No shipping: fragile items over 50kg
```

### 2. Use clear headings to separate topics

```markdown
## Return Policy
...

## Refund Process
...

## Exceptions
...
```

### 3. Include code examples when relevant

```markdown
## API Integration - Payment Gateway

Endpoint: POST /api/v1/payments/create
Headers: X-Api-Key: {key}

Request body:
​```json
{
  "amount": 500000,
  "currency": "VND",
  "method": "bank_transfer",
  "callback_url": "https://mysite.com/payment/callback"
}
​```

Response codes:
- 200: Payment created
- 400: Invalid amount
- 401: Invalid API key
```

### 4. Provide decision rules the AI can follow

```markdown
## Discount Logic

1. VIP customers (total_spent > 10,000,000): 15% off
2. Orders > 1,000,000: 10% off
3. First-time buyers: 5% off + free shipping
4. Discounts do NOT stack — apply the highest one
5. Sale items are excluded from all discounts
```

### 5. Document naming conventions and terminology

```markdown
## Terminology

- "SKU" = product variation ID (format: PROD-001-RED-M)
- "Fulfillment" = packing + shipping process
- "COD" = Cash on Delivery (thu tiền khi giao hàng)
- "Pre-order" = customer pays now, ships in 2-4 weeks
```

---

## Example Files

### Business Rules (`business-rules.md`)

```markdown
---
name: Business Rules
description: E-commerce policies for order processing
tags: business, orders, shipping
---

## Order Processing

- Orders before 2PM: ship same day
- Orders after 2PM: ship next business day
- Weekend orders: process Monday morning

## Payment Methods

- COD: max 5,000,000 VND per order
- Bank transfer: verify within 24h, auto-cancel if not paid in 48h
- Credit card: instant confirmation via payment gateway

## Inventory

- Low stock alert: < 10 units
- Out of stock: hide "Buy" button, show "Notify me"
- Pre-order: allow purchase, mark estimated ship date
```

### Coding Standards (`coding-standards.md`)

```markdown
---
name: Coding Standards
description: Code conventions for HTTP functions
tags: code, standards
---

## Function Naming

- Query data: get_[Resource] (e.g. get_Products)
- Create: post_[Action] (e.g. post_CreateOrder)
- Update: put_[Action] (e.g. put_UpdateProfile)

## Error Handling

Always return structured errors:
​```javascript
return { error: true, code: "INVALID_EMAIL", message: "Email is not valid" };
​```

Never expose internal errors to users. Log them with console.error().

## Database Queries

- Always add .limit() to prevent fetching all records
- Use .select() to pick only needed fields
- Index frequently queried fields
```

### External API Docs (`payment-api.md`)

```markdown
---
name: Payment Gateway API
description: VNPay integration reference
tags: api, payment, vnpay
---

## Create Payment

POST https://sandbox.vnpayment.vn/paymentv2/vpcpay.html

Required params:
- vnp_Amount: amount * 100 (integer)
- vnp_Command: pay
- vnp_CreateDate: yyyyMMddHHmmss
- vnp_OrderInfo: order description
- vnp_TxnRef: unique transaction ID

## Verify Callback

Check vnp_SecureHash matches HMAC-SHA512 of all params (sorted by key).

Status codes:
- 00: Success
- 01: Transaction incomplete
- 02: Transaction error
- 04: Reversed (refunded)
```

### Product Content Guide (`product-content.md`)

```markdown
---
name: Product Content Guide
description: How to write product descriptions and SEO content
tags: content, seo, products
---

## Product Title Format

[Brand] + [Product Name] + [Key Feature] + [Size/Color if applicable]
Example: "Nike Air Max 90 - Breathable Mesh - White/Black"

## Description Structure

1. Opening hook (1 sentence)
2. Key features (bullet points, 3-5 items)
3. Specifications (table)
4. Care instructions
5. Warranty info

## SEO Meta

- Title: max 60 chars, include primary keyword
- Description: max 155 chars, include CTA
- Slug: lowercase, hyphens, no special chars
```

---

## File Organization Tips

```
knowledge/
  business-rules.md          # Order, shipping, payment policies
  coding-standards.md        # Code conventions for HTTP functions
  product-content.md         # How to write product descriptions
  payment-api.md             # External payment API reference
  email-templates.md         # Email content templates
  faq.md                     # Common customer questions & answers
```

Keep each file focused on **one topic**. Prefer many small files over one large file — the AI agent will only read what it needs.

---

## Quick Setup with Script

Instead of manually editing each IDE config, use the automated setup scripts.

### Copy & Run (curl)

**Install MCP server + configure IDE (first time):**

```bash
# English
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/install.sh | bash

# Vietnamese
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/install_vi.sh | bash
```

**Setup knowledge env vars (after install):**

```bash
# English
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/setup_env.sh | bash

# Vietnamese
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/setup_env_vi.sh | bash
```

**Update to latest version:**

```bash
# English
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/update.sh | bash

# Vietnamese
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/update_vi.sh | bash
```

> **Tip:** Replace `| bash` with `| less` to review the script before running

**Or if you already cloned the repo:**

```bash
./setup_env.sh       # English
./setup_env_vi.sh    # Vietnamese
```

The script will:

1. **Detect** your MCP server installation
2. **Ask** for 3 optional knowledge env vars:

| Variable | Description | Required |
|----------|-------------|----------|
| `WEBCAKE_KNOWLEDGE_DIR` | Local knowledge files directory | No (default: `knowledge/`) |
| `WEBCAKE_KNOWLEDGE_REPO` | GitHub repo with knowledge files | No |
| `WEBCAKE_KNOWLEDGE_TOKEN` | GitHub token for private repos | No |

3. **Auto-detect** IDEs with webcake-cms configured (Claude Desktop, Claude Code, Cursor, Windsurf, Augment, Codex)
4. **Merge** new env vars into existing configs — without overwriting your API URL, token, or site_id

### All Environment Variables

```
Required (set via install.sh):
  WEBCAKE_API_URL          — Backend API URL
  WEBCAKE_TOKEN            — JWT Bearer token
  WEBCAKE_SESSION_ID       — Session ID
  WEBCAKE_SITE_ID          — Target site ID

Optional (set via setup_env.sh):
  WEBCAKE_KNOWLEDGE_DIR    — Custom knowledge files directory
  WEBCAKE_KNOWLEDGE_REPO   — GitHub repo (owner/repo or full URL)
  WEBCAKE_KNOWLEDGE_TOKEN  — GitHub token (for private repos)
```

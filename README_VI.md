**🌐 [English](README.md)** | Tiếng Việt

# WebCake CMS MCP Server

MCP server cung cấp các tính năng CMS của WebCake cho AI agent sử dụng.

## Cài đặt nhanh (Khuyên dùng)

Chạy script tự động — tự clone, cài dependencies, cấu hình IDE cho bạn.

### macOS / Linux

**Cách A — Tương tác** (script sẽ hỏi từng bước):

Nếu đã clone repo:
```bash
./install_vi.sh
```

Hoặc tải về rồi chạy:
```bash
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/install_vi.sh -o install_vi.sh && bash install_vi.sh
```

Script sẽ hướng dẫn bạn:
1. Cài Node.js (nếu chưa có)
2. Clone MCP server
3. Nhập thông tin kết nối (token, session_id, site_id — **đều có thể bỏ qua**, set sau qua AI)
4. Chọn IDE để cấu hình

> **Cách lấy token & session_id:** Đăng nhập dashboard WebCake → F12 DevTools → tab Network → click bất kỳ trang → copy header `Authorization: Bearer ...` (token) và `x-session-id` (session_id)

**Gỡ cài đặt:**
```bash
./install_vi.sh --uninstall
```

### Windows (PowerShell)

Nếu đã clone repo:
```powershell
.\install.ps1
```

Hoặc tải về rồi chạy:
```powershell
irm https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/install.ps1 -OutFile install.ps1; .\install.ps1
```

Gỡ cài đặt:
```powershell
.\install.ps1 --uninstall
```

---

## Cập nhật

Cập nhật lên phiên bản mới nhất:

### macOS / Linux

```bash
# Tự tìm thư mục cài đặt
~/.webcake-storefront-mcp/update_vi.sh
```

Hoặc chỉ định đường dẫn:
```bash
./update_vi.sh ~/.webcake-storefront-mcp
```

Hoặc tải về rồi chạy:
```bash
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/update_vi.sh | bash
```

### Windows (PowerShell)

```powershell
# Tự tìm thư mục cài đặt
.\update.ps1
```

Hoặc chỉ định đường dẫn:
```powershell
.\update.ps1 C:\Users\you\.webcake-storefront-mcp
```

Hoặc tải về rồi chạy:
```powershell
irm https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/update.ps1 -OutFile update.ps1; .\update.ps1
```

---

## Cấu hình Knowledge (Tuỳ chọn)

Thêm knowledge files để AI hiểu quy tắc kinh doanh, chính sách, chuẩn code của bạn.

```bash
# Nếu đã clone repo
./setup_env_vi.sh

# Hoặc tải về rồi chạy
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/setup_env_vi.sh | bash
```

Script sẽ:
1. Hỏi các biến knowledge (`WEBCAKE_KNOWLEDGE_DIR`, `WEBCAKE_KNOWLEDGE_REPO`, `WEBCAKE_KNOWLEDGE_TOKEN`)
2. Tự phát hiện IDE đã cấu hình webcake-cms
3. Gộp biến mới vào config hiện có — không ghi đè biến cũ

Xem thư mục `knowledge/` để biết cách viết và ví dụ mẫu.

---

## Cài đặt thủ công

```bash
git clone https://github.com/vuluu2k/webcake-storefront-mcp.git
cd webcake-storefront-mcp
npm install
```

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `WEBCAKE_API_URL` | Có | URL gốc của WebCake API (vd: `https://api.storecake.io`) |
| `WEBCAKE_TOKEN` | Không* | JWT Bearer token (xác thực dashboard) |
| `WEBCAKE_SESSION_ID` | Không* | Session ID (`x-session-id` header) |
| `WEBCAKE_SITE_ID` | Không* | ID của site cần thao tác |
| `WEBCAKE_KNOWLEDGE_DIR` | Không | Đường dẫn thư mục knowledge local (mặc định: `./knowledge`) |
| `WEBCAKE_KNOWLEDGE_REPO` | Không | GitHub repo chứa knowledge (vd: `owner/repo` hoặc URL đầy đủ) |
| `WEBCAKE_KNOWLEDGE_TOKEN` | Không | GitHub token cho repo private |

> \* Token, session_id, site_id có thể set sau qua tool `update_auth` và `switch_site` trong chat. Khi set qua tool, giá trị được **lưu vào SQLite** (`webcake-mcp.db`) và tự khôi phục ở session tiếp theo.

> CMS admin token và CMS API key được tự động lấy qua API khi cần (không cần cấu hình thủ công).

### Cách lấy `WEBCAKE_TOKEN` và `WEBCAKE_SESSION_ID`

1. Mở [WebCake Dashboard](https://storecake.io) và đăng nhập
2. Mở DevTools (`F12` hoặc `Cmd + Option + I`)
3. Vào tab **Network** > click bất kỳ trang nào
4. Tìm một API request (vd: `@me`, `site/all`...)
5. Trong **Request Headers**:
   - `Authorization: Bearer ...` → copy phần sau "Bearer " → đây là `WEBCAKE_TOKEN`
   - `x-session-id: ...` → copy giá trị → đây là `WEBCAKE_SESSION_ID`
6. `WEBCAKE_SITE_ID` nằm trong URL dashboard: `https://storecake.io/site/{site_id}/...` hoặc dùng tool `list_my_sites` để liệt kê

---

## Cấu hình theo từng IDE / AI Tool

> Thay `/đường-dẫn-tuyệt-đối/webcake-storefront-mcp/index.js` bằng đường dẫn thực tế nơi bạn đã clone repo.
> Ví dụ: `/Users/username/webcake-storefront-mcp/index.js`

### 1. Claude Desktop

Mở Settings > Developer > Edit Config, hoặc sửa file trực tiếp:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/đường-dẫn-tuyệt-đối/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<token-của-bạn>",
        "WEBCAKE_SESSION_ID": "<session-id-của-bạn>",
        "WEBCAKE_SITE_ID": "<site-id-của-bạn>"
      }
    }
  }
}
```

Restart Claude Desktop. Các MCP tools sẽ xuất hiện trong chat input (icon búa).

---

### 2. Claude Code (CLI)

Chạy lệnh sau trong terminal:

```bash
claude mcp add webcake-cms \
  -e WEBCAKE_API_URL=https://api.storecake.io \
  -e WEBCAKE_TOKEN=<token-của-bạn> \
  -e WEBCAKE_SESSION_ID=<session-id-của-bạn> \
  -e WEBCAKE_SITE_ID=<site-id-của-bạn> \
  -- node /đường-dẫn-tuyệt-đối/webcake-storefront-mcp/index.js
```

Hoặc tạo file `.claude.json` tại thư mục project:

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/đường-dẫn-tuyệt-đối/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<token-của-bạn>",
        "WEBCAKE_SESSION_ID": "<session-id-của-bạn>",
        "WEBCAKE_SITE_ID": "<site-id-của-bạn>"
      }
    }
  }
}
```

Hoặc cấu hình global tại `~/.claude.json` (áp dụng cho mọi project).

Kiểm tra đã cài thành công:
```bash
claude mcp list
```

---

### 3. Cursor

**Bước 1:** Mở Cursor Settings: `Cmd + ,` (Mac) hoặc `Ctrl + ,` (Windows/Linux)

**Bước 2:** Tìm mục **"MCP Servers"** trong sidebar bên trái

**Bước 3:** Click **"Add new MCP Server"**

**Bước 4:** Tạo file `.cursor/mcp.json` tại thư mục gốc project với nội dung:

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/đường-dẫn-tuyệt-đối/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<token-của-bạn>",
        "WEBCAKE_SESSION_ID": "<session-id-của-bạn>",
        "WEBCAKE_SITE_ID": "<site-id-của-bạn>"
      }
    }
  }
}
```

Hoặc cấu hình global tại `~/.cursor/mcp.json`.

**Bước 5:** Restart Cursor. Kiểm tra trong Settings > MCP Servers — sẽ thấy trạng thái **"Connected"** màu xanh.

---

### 4. Windsurf

**Bước 1:** Mở Windsurf Settings: `Cmd + ,` (Mac) hoặc `Ctrl + ,` (Windows/Linux)

**Bước 2:** Tìm mục **"Cascade"** > **"MCP Servers"**

**Bước 3:** Click **"Add Server"** > chọn **"Custom"**

**Bước 4:** Tạo file `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/đường-dẫn-tuyệt-đối/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<token-của-bạn>",
        "WEBCAKE_SESSION_ID": "<session-id-của-bạn>",
        "WEBCAKE_SITE_ID": "<site-id-của-bạn>"
      }
    }
  }
}
```

**Bước 5:** Restart Windsurf. Trong Cascade chat, gõ `@` sẽ thấy các tools của `webcake-cms`.

---

### 5. Augment (VS Code Extension)

**Bước 1:** Cài extension **Augment** từ VS Code Marketplace

**Bước 2:** Mở Command Palette: `Cmd + Shift + P` > tìm **"Augment: Edit MCP Settings"**

**Bước 3:** File settings sẽ mở ra. Thêm cấu hình:

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/đường-dẫn-tuyệt-đối/webcake-storefront-mcp/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "<token-của-bạn>",
        "WEBCAKE_SESSION_ID": "<session-id-của-bạn>",
        "WEBCAKE_SITE_ID": "<site-id-của-bạn>"
      }
    }
  }
}
```

**Bước 4:** Restart VS Code. Trong Augment chat panel sẽ thấy các tools MCP.

---

### 6. Codex (OpenAI CLI)

Thêm vào file `~/.codex/config.toml`:

```toml
[mcp_servers.webcake-cms]
command = "node"
args = ["/đường-dẫn-tuyệt-đối/webcake-storefront-mcp/index.js"]
env = { "WEBCAKE_API_URL" = "https://api.storecake.io", "WEBCAKE_TOKEN" = "<token-của-bạn>", "WEBCAKE_SESSION_ID" = "<session-id-của-bạn>", "WEBCAKE_SITE_ID" = "<site-id-của-bạn>" }
```

Hoặc dùng CLI:
```bash
codex mcp add webcake-cms \
  --env WEBCAKE_API_URL=https://api.storecake.io \
  --env WEBCAKE_TOKEN=<token-của-bạn> \
  --env WEBCAKE_SITE_ID=<site-id-của-bạn> \
  -- node /đường-dẫn-tuyệt-đối/webcake-storefront-mcp/index.js
```

Kiểm tra:
```bash
codex mcp list
```

---

## Lưu ý quan trọng

### Lấy token và site_id
1. Đăng nhập dashboard WebCake
2. Mở DevTools (F12) > tab Network
3. Tìm bất kỳ API request nào > copy header `Authorization: Bearer <token>`
4. `site_id` nằm trong URL: `/api/v1/dashboard/site/{site_id}/...`

### Kiểm tra MCP hoạt động
Sau khi cấu hình, thử hỏi AI agent:
```
Liệt kê tất cả CMS files của site
```
Nếu trả về danh sách files → MCP đã hoạt động.

---

## Ví dụ sử dụng

### Ví dụ 1: Viết HTTP function backend + gọi từ frontend

**Prompt:**
```
Tạo tính năng đăng ký nhận newsletter. Backend lưu email vào collection "subscribers",
frontend có form nhập email gọi lên backend.
```

**AI agent sẽ tự động thực hiện:**

**Bước 1** — Gọi `get_http_function` để đọc code hiện tại

**Bước 2** — Gọi `update_http_function` để thêm function mới:

```javascript
import { DBConnection } from 'webcake-data';
const db = new DBConnection();
const Subscriber = db.model('subscribers');

export const post_Subscribe = async (request) => {
  const { email } = request.params;
  if (!email) return { error: 'Email là bắt buộc' };

  const exists = await Subscriber.exists({ email });
  if (exists) return { error: 'Email đã đăng ký' };

  await Subscriber.create({ email, subscribed_at: new Date() });
  return { success: true, message: 'Đăng ký thành công!' };
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

**Bước 3** — Gọi `update_site_custom_code` để thêm code frontend:

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
    window.useNotification('error', { title: 'Lỗi', message: err.message });
  }
});
```

---

### Ví dụ 2: Viết loạt bài blog

**Prompt:**
```
Viết 3 bài blog về chăm sóc da mùa hè, mỗi bài 300 từ, có slug tiếng Việt không dấu.
```

**AI agent gọi `create_article` 3 lần:**

```
create_article({
  name: "5 bước chăm sóc da mùa hè",
  slug: "5-buoc-cham-soc-da-mua-he",
  content: "<h2>...</h2><p>...</p>",
  tags: ["skincare", "mùa hè"]
})

create_article({
  name: "Chống nắng đúng cách",
  slug: "chong-nang-dung-cach",
  content: "<h2>...</h2><p>...</p>",
  tags: ["skincare", "chống nắng"]
})

create_article({
  name: "Dưỡng ẩm cho da dầu",
  slug: "duong-am-cho-da-dau",
  content: "<h2>...</h2><p>...</p>",
  tags: ["skincare", "dưỡng ẩm"]
})
```

---

### Ví dụ 3: Debug và test function

**Prompt:**
```
Test thử function get_Subscribers xem có chạy được không
```

**AI agent gọi:**
```
run_function({
  function_name: "Subscribers",
  method: "GET",
  params: { page: 1, limit: 5 }
})
```

Trả về kết quả hoặc lỗi, AI agent đọc và giải thích cho developer.

---

### Ví dụ 4: Thêm custom CSS cho site

**Prompt:**
```
Thêm hiệu ứng hover cho tất cả product card: nổi lên nhẹ và có bóng đổ.
```

**AI agent gọi `update_site_custom_code`:**

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

### Ví dụ 5: Tìm khách hàng và gửi email

**Prompt:**
```
Tìm khách hàng có email john@example.com rồi gửi email cảm ơn đã mua hàng.
```

**AI agent gọi 2 tools:**

```
find_customer({ by: "email", value: "john@example.com" })
→ Tìm thấy: { name: "John Doe", email: "john@example.com" }

send_mail({
  to: "john@example.com",
  subject: "Cảm ơn bạn đã mua hàng!",
  body: "<h2>Xin chào John Doe,</h2><p>Cảm ơn bạn đã mua hàng tại cửa hàng của chúng tôi...</p>"
})
```

---

### Ví dụ 6: Tìm và cập nhật elements trên trang

**Prompt:**
```
Đổi màu tiêu đề hero sang đỏ và cập nhật text nút CTA thành "Mua ngay"
```

**AI agent gọi 3 tools:**

```
# Bước 1: Tìm tiêu đề hero
search_page_elements({ page_id: "page_1", custom_class: "hero-title" })
→ { matched: 1, elements: [{ id: "TEXT-3", type: "text", ... }] }

# Bước 2: Tìm nút CTA
search_page_elements({ page_id: "page_1", custom_class: "cta" })
→ { matched: 1, elements: [{ id: "BUTTON-1", type: "button", ... }] }

# Bước 3: Cập nhật cả hai elements cùng lúc
update_page_elements({
  page_id: "page_1",
  updates: [
    { element_id: "TEXT-3", style: { "color": "#ff0000" } },
    { element_id: "BUTTON-1", specials: { "text": "Mua ngay" } }
  ]
})
```

---

## Hướng dẫn sử dụng chi tiết

Tất cả tools được thiết kế với mục tiêu **tối ưu token** — tools liệt kê chỉ trả metadata nhẹ, tools chi tiết trả đầy đủ dữ liệu, và guide chỉ được tải khi cần. Phần này giải thích workflow tối ưu cho từng nhóm tools.

### CMS Files & HTTP Functions

#### Bước 1: Xem tổng quan — `get_http_function` (mặc định: chế độ overview)

Mặc định trả về **chỉ danh sách tên function và vị trí dòng** — không trả code. Rất tiết kiệm token cho file lớn.

```
# Lần đầu — overview + guide + schemas
get_http_function({ include_guide: true })
→ {
    file_id: "file_123",
    total_lines: 250,
    imports: "import { DBConnection } from 'webcake-data';",
    functions: [
      { name: "get_Products", method: "get", function_name: "Products", start_line: 5, end_line: 35, lines: 31 },
      { name: "post_CreateOrder", method: "post", function_name: "CreateOrder", start_line: 37, end_line: 120, lines: 84 },
    ],
    collections: [...],
    guide: "..."
  }
```

Muốn lấy toàn bộ file: `get_http_function({ overview: false })`

#### Bước 2: Đọc function cụ thể — `get_http_function_snippet`

Đọc chỉ function cần thiết — tiết kiệm 80-95% token so với đọc toàn bộ file.

```
get_http_function_snippet({ function_names: ["get_Products", "post_CreateOrder"] })
→ {
    functions: [{
      name: "get_Products", start_line: 5, end_line: 35,
      code: "export const get_Products = (request) => {\n  ..."
    }, ...]
  }
```

#### Bước 3: Sửa theo tên function — `edit_http_function`

Server tự tìm vị trí function theo tên — không cần string matching, không lo whitespace.

```
# Thay thế toàn bộ function theo tên (server tự tìm đầu/cuối)
edit_http_function({
  action: "replace_function",
  function_name: "get_Products",
  code: "export const get_Products = (request) => {\n  return { hello: 'world' };\n}"
})

# Thêm function mới vào cuối file
edit_http_function({
  action: "add",
  code: "export const get_Stats = (request) => {\n  return { count: 42 };\n}"
})

# Xóa function theo tên
edit_http_function({ action: "remove", function_name: "get_OldFunction" })

# Cập nhật import block
edit_http_function({ action: "update_imports",
  code: "import { DBConnection } from 'webcake-data';" })
→ { success: true, total_lines: 245, functions: [...] }
```

#### Viết lại toàn bộ (khi cần) — `update_http_function`

Gửi toàn bộ file. Dùng `edit_http_function` cho thay đổi nhỏ.

#### Testing — `debug_function` vs `run_function`

| Tool | Khi nào dùng |
|------|-------------|
| `debug_function` | Test code **trước khi deploy** — gửi code trực tiếp, nhận kết quả + logs |
| `run_function` | Gọi function **đã deploy** — giống gọi REST API |

```
debug_function({ content: "export const get_Test = ...", function_name: "Test", params: {} })
run_function({ function_name: "Products", method: "GET", params: { page: 1 } })
```

#### Quản lý phiên bản — `save_file_version` / `get_file_versions`

```
save_file_version({ cms_file_id: "file_123", content: "...", is_public: false })
get_file_versions({ cms_file_id: "file_123" })
```

---

### Trang (Pages) & Custom Code

#### Bước 1: Liệt kê trang — `list_pages`

Trả về **chỉ metadata** (không có source data) — id, name, slug, type, is_homepage, updated_at.

```
list_pages({})
→ [{ id: "page_1", name: "Trang chủ", slug: "/", type: "page", is_homepage: true, ... }, ...]
```

#### Bước 2: Xem tổng quan trang — `get_page_source`

Trả về **tổng quan nhẹ** của cấu trúc trang — số section, số lượng theo loại element, và tất cả custom CSS classes đang dùng. KHÔNG trả về toàn bộ source data.

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

#### Bước 3: Tìm kiếm elements cụ thể — `search_page_elements`

Truy vấn elements theo nhiều bộ lọc. Trả về **đầy đủ chi tiết** cho mỗi element khớp (style, config, specials, events, bindings, responsive breakpoints).

```
# Tìm tất cả buttons
search_page_elements({ page_id: "page_1", type: "button" })

# Tìm elements có CSS class cụ thể
search_page_elements({ page_id: "page_1", custom_class: "hero" })

# Tìm text chứa "đăng ký"
search_page_elements({ page_id: "page_1", text: "đăng ký" })

# Tìm tất cả elements có data binding (product, category, blog)
search_page_elements({ page_id: "page_1", has_bind: true })

# Tìm tất cả elements có sự kiện click/submit
search_page_elements({ page_id: "page_1", has_events: true })

# Tìm tất cả elements có custom CSS classes
search_page_elements({ page_id: "page_1", has_custom_class: true })

# Kết hợp nhiều bộ lọc
search_page_elements({ page_id: "page_1", type: "text", custom_class: "hero", limit: 10 })
```

Mỗi element khớp trả về:

```json
{
  "id": "TEXT-3",
  "type": "text",
  "style": { "color": "#333", "font-size": "18px", ... },
  "config": { ... },
  "specials": { "text": "Đăng ký ngay", "custom_class": "cta-text", "custom_css": "..." },
  "events": [{ "eventName": "click", "action": "open_page", ... }],
  "bindings": [{ "name": "product", "target": "title", ... }],
  "responsive": {
    "bp_320_768": { "style": { "font-size": "14px" } },
    "bp_768_1024": { "style": { "font-size": "16px" } }
  },
  "children_count": 3
}
```

**CSS targeting**: Sections render thành `<section id="SECTION-1" class="x-section {custom_class}">`, elements thành `<div id="TEXT-3" class="x-element {custom_class}">`. Target bằng `#TEXT-3` (theo ID) hoặc `.cta-text` (theo custom class).

#### Bước 4: Cập nhật elements — `update_page_element` / `update_page_elements`

Sau khi tìm elements qua search, cập nhật trực tiếp các thuộc tính trong page source.

**Cập nhật từng element:**
```
# Đổi text và style của element cụ thể
update_page_element({
  page_id: "page_1",
  element_id: "TEXT-3",
  style: { "color": "#ff0000", "font-size": "24px" },
  specials: { "text": "Tiêu đề mới", "custom_class": "hero-title,bold" }
})

# Thêm events cho button
update_page_element({
  page_id: "page_1",
  element_id: "BUTTON-1",
  events: [{ "eventName": "click", "action": "open_page", "open_page_id": "page_2" }]
})

# Cập nhật style responsive
update_page_element({
  page_id: "page_1",
  element_id: "TEXT-3",
  responsive: {
    "bp_320_768": { "style": { "font-size": "14px" } },
    "bp_768_1024": { "style": { "font-size": "18px" } }
  }
})
```

**Cập nhật hàng loạt nhiều elements cùng lúc:**
```
update_page_elements({
  page_id: "page_1",
  updates: [
    { element_id: "TEXT-1", specials: { "text": "Xin chào" } },
    { element_id: "TEXT-2", style: { "color": "#333" } },
    { element_id: "BUTTON-1", specials: { "custom_class": "cta-primary" } }
  ]
})
```

**Quy tắc merge:**
| Thuộc tính | Hành vi | Giải thích |
|------------|---------|------------|
| `style` | Shallow merge | Chỉ CSS properties thay đổi được cập nhật, còn lại giữ nguyên |
| `config` | Shallow merge | Tương tự style |
| `specials` | Shallow merge | Cập nhật `text`, `custom_class`, `custom_css` riêng lẻ |
| `events` | Thay thế | Toàn bộ mảng events bị thay thế (lấy hiện tại trước) |
| `bindings` | Thay thế | Toàn bộ mảng bindings bị thay thế |
| `responsive` | Merge theo breakpoint | Mỗi key `bp_*` được set/thay thế riêng |

#### Xem chi tiết element — `get_page_element`

Lấy đầy đủ thông tin của một element theo ID, bao gồm danh sách children để duyệt cây.

```
get_page_element({ page_id: "page_1", element_id: "SECTION-1" })
→ { id: "SECTION-1", type: "section", style: {...}, specials: {...},
    children: [{ id: "CONTAINER-1", type: "container" }, { id: "TEXT-1", type: "text" }] }
```

#### Custom code — `get_site_custom_code` / `append_site_custom_code`

**Đọc chỉ field cần thiết** để tiết kiệm token khi code lớn:

```
# Chỉ đọc CSS (bỏ qua JS nếu lớn)
get_site_custom_code({ fields: ["code_custom_css"] })
→ { code_custom_css: ".hero { color: #333; ... }" }

# Đọc tất cả — _sizes cho biết kích thước từng field
get_site_custom_code({ include_guide: true })
→ { ..., _sizes: { code_custom_css: 3500, code_custom_javascript: 8200, ... } }
```

**Thêm code mới** — không cần đọc nội dung hiện có:

```
# Thêm CSS mới vào cuối
append_site_custom_code({ field: "code_custom_css",
  code: ".new-section { padding: 20px; }" })

# Thêm script vào đầu head
append_site_custom_code({ field: "code_before_head", position: "prepend",
  code: "<script src='https://cdn.example.com/lib.js'></script>" })
```

**Sửa code hiện có** — đọc field → sửa → gửi lại field đó:
```
get_site_custom_code({ fields: ["code_custom_css"] })   # đọc chỉ CSS
update_site_custom_code({ code_custom_css: "... CSS đã sửa ..." })
```

| Field | Vị trí chèn | Dùng cho |
|-------|-------------|----------|
| `code_before_head` | Trước `</head>` | Scripts bên ngoài, meta tags |
| `code_before_body` | Trước `</body>` | Tracking scripts, chat widgets |
| `code_custom_css` | Tự bọc trong `<style>` | CSS tùy chỉnh |
| `code_custom_javascript` | Inline `<script>` | JavaScript tùy chỉnh |

#### Workflow khuyên dùng

**Tác vụ CSS/JS:**
```
1. list_pages()                              → tìm trang mục tiêu
2. get_page_source({ page_id })              → hiểu cấu trúc trang
3. search_page_elements({ page_id, ... })    → tìm elements cụ thể cần style
4. get_site_custom_code({ include_guide: true })  → đọc code hiện có
5. update_site_custom_code({ ... })          → viết code mới (merge với code cũ)
```

**Sửa đổi trực tiếp elements:**
```
1. list_pages()                              → tìm trang mục tiêu
2. get_page_source({ page_id })              → tổng quan elements
3. search_page_elements({ page_id, ... })    → tìm elements cần sửa
4. update_page_element({ page_id, element_id, ... })  → cập nhật thuộc tính
   hoặc update_page_elements({ page_id, updates: [...] })  → cập nhật hàng loạt
```

---

### Collections (Cơ sở dữ liệu)

#### Liệt kê collections — `list_collections`

Trả về **tóm tắt** — name, table_name, số fields. KHÔNG bao gồm đầy đủ schema.

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

#### Xem đầy đủ schema — `get_collection`

Dùng khi cần biết chi tiết các fields (name, type, constraints, references) để viết queries.

```
get_collection({ id: "col_1" })
→ { name: "Subscribers", table_name: "subscribers", schema: [
    { name: "email", type: "string", is_required: true },
    { name: "subscribed_at", type: "datetime", is_required: false },
    ...
  ]}
```

#### Truy vấn records — `query_collection_records`

Xem dữ liệu hiện có bằng **table_name** (không phải collection ID).

```
query_collection_records({ table_name: "subscribers", page: 1, limit: 10 })
```

---

### Bài viết Blog

#### Liệt kê bài viết — `list_articles`

Trả về **chỉ metadata** — không có HTML content. Tiết kiệm đáng kể tokens cho site có nhiều bài viết.

```
list_articles({ page: 1, limit: 20 })
→ {
    data: [
      { id: "art_1", name: "Bắt đầu", slug: "bat-dau", summary: "...",
        tags: ["hướng dẫn"], category_id: "cat_1", created_at: "...", updated_at: "..." },
      ...
    ],
    total: 45
  }
```

#### Xem đầy đủ bài viết — `get_article`

Dùng khi cần nội dung HTML đầy đủ của một bài viết cụ thể.

```
get_article({ id: "art_1" })
→ { id: "art_1", name: "...", content: "<h2>...</h2><p>Nội dung HTML đầy đủ...</p>", ... }
```

---

### Sản phẩm (Products)

#### Liệt kê sản phẩm — `list_products`

Trả về **chỉ metadata** — id, name, slug, price, image, trạng thái. Không có mô tả đầy đủ hay biến thể.

```
list_products({ page: 1, limit: 20, term: "áo" })
→ {
    data: [
      { id: "prod_1", name: "Áo xanh", slug: "ao-xanh", price: 299000,
        image: "https://...", is_published: true, total_sold: 150, ... },
      ...
    ],
    total: 42
  }
```

#### Xem chi tiết sản phẩm — `get_product`

Trả về đầy đủ: mô tả, biến thể (size/màu/giá), thuộc tính, hình ảnh, SEO meta.

```
get_product({ id: "prod_1" })
→ { id: "prod_1", name: "Áo xanh", description: "<p>...</p>",
    variations: [...], product_attributes: [...], meta_tags: [...], ... }
```

#### Tìm kiếm sản phẩm — `search_products`

Tìm kiếm nhanh theo tên sản phẩm.

```
search_products({ term: "váy hè", limit: 10 })
```

#### Danh mục sản phẩm — `list_categories`

Liệt kê tất cả danh mục sản phẩm.

```
list_categories({})
→ [{ id: "cat_1", name: "Áo", slug: "ao", ... }, ...]
```

---

### Đơn hàng (Orders)

#### Liệt kê đơn hàng — `list_orders`

Trả về **chỉ metadata** — tên khách, trạng thái, tổng giá trị. Không có chi tiết sản phẩm.

```
list_orders({ page: 1, limit: 20, status: 50 })
→ {
    data: [
      { id: "ord_1", bill_full_name: "Nguyễn Văn A", status: 50,
        invoice_value: 999000, items_count: 3, created_at: "..." },
      ...
    ],
    total: 128
  }
```

**Mã trạng thái:** 0=chờ xử lý, 50=đã xác nhận, 100=đang giao, 150=đã giao, -1=đã hủy

#### Xem chi tiết đơn hàng — `get_order`

Trả về đầy đủ: sản phẩm, thanh toán, vận chuyển, giảm giá.

```
get_order({ id: "ord_1" })
→ { id: "ord_1", bill_full_name: "Nguyễn Văn A", items: [...], shipping_address: {...}, ... }
```

#### Thống kê đơn hàng — `count_orders_by_status`

Đếm đơn hàng theo trạng thái cho tổng quan dashboard.

```
count_orders_by_status({})
→ { pending: 5, confirmed: 12, shipping: 3, delivered: 108, cancelled: 2 }
```

---

### Khuyến mãi & Giảm giá (Promotions)

#### Danh sách khuyến mãi — `list_promotions`

Trả về **metadata** — tên, loại, trạng thái, lịch. Dùng `include_guide=true` để xem hướng dẫn các loại khuyến mãi.

```
list_promotions({ page: 1, limit: 20, include_guide: true })
→ {
    data: [
      { id: "promo_1", name: "Sale hè 30%", type: "normal",
        is_activated: true, start_time: "2025-06-01", end_time: "2025-06-30",
        priority_level: 1, used_count: 45 },
      { id: "promo_2", name: "WELCOME10", type: "coupon",
        is_activated: true, coupon_info: { code: "WELCOME10", max_uses: 100 } },
    ],
    total: 8,
    guide: "## Promotion Types..."
  }
```

**Các loại khuyến mãi (type):**
- `normal` — Giảm giá sản phẩm thông thường
- `same_price` — Đồng giá
- `coupon` — Mã giảm giá / voucher
- `promotion_order` — Giảm theo tổng đơn hàng
- `promotion_category` — Giảm theo danh mục
- `x_get_y_prod` — Mua X tặng Y sản phẩm

#### Chi tiết khuyến mãi — `get_promotion`

Trả về đầy đủ: quy tắc giảm giá, cài đặt coupon, sản phẩm áp dụng, quà tặng kèm.

```
get_promotion({ id: "promo_1" })
→ { id: "promo_1", name: "Sale hè 30%", type: "normal", items: [...],
    bonus_items: [...], customer_levels: [...], ... }
```

#### Sản phẩm trong KM — `get_promotion_items`

Lấy danh sách sản phẩm/biến thể/danh mục áp dụng khuyến mãi.

```
get_promotion_items({ id: "promo_1", page: 1, limit: 20 })
→ { items: [{ product: { name: "..." }, fixed_prices: 299000, level_info: [...] }], total_items: 15 }
```

#### KM đang hoạt động — `get_active_promotions`

Lấy tất cả khuyến mãi đang active (đã kích hoạt và trong khung giờ).

```
get_active_promotions({})
→ { data: [{ id: "promo_1", name: "Sale hè", type: "normal", is_activated: true }], total: 3 }
```

#### Tìm kiếm KM — `search_promotions`

Lọc theo loại, trạng thái thời gian, từ khóa.

```
search_promotions({ type: "coupon", status: 2, is_activated: true })
→ { promotions: [...], total: 5 }
```

**Lọc theo trạng thái:** 1=sắp diễn ra, 2=đang diễn ra, 3=đã kết thúc

---

### Combo / Sản phẩm combo

#### Danh sách combo — `list_combos`

Trả về **metadata** combo — tên, loại giảm giá, lịch. Dùng `include_guide=true` để xem hướng dẫn.

```
list_combos({ page: 1, limit: 20, include_guide: true })
→ {
    data: [
      { id: "combo_1", name: "Combo hè", is_activated: true,
        is_variation: false, discount_amount: 50000,
        start_time: "2025-06-01", end_time: "2025-06-30" },
      { id: "combo_2", name: "Mua 3 tặng 1", is_activated: true,
        is_categories: true, is_use_percent: true, discount_by_percent: 25 },
    ],
    total: 4
  }
```

**Loại combo:**
- `is_variation=true` — Theo biến thể: yêu cầu biến thể cụ thể
- `is_variation=false` — Theo sản phẩm: yêu cầu sản phẩm (bất kỳ biến thể)
- `is_categories=true` — Theo danh mục: yêu cầu SP từ danh mục với số lượng

**Loại giảm giá:**
- `discount_amount` — Giảm cố định
- `is_use_percent` + `discount_by_percent` — Giảm theo %, giới hạn bởi `max_discount_by_percent`
- `is_value_combo` + `value_combo` — Giá cố định cho cả combo (đồng giá)
- `is_free_shipping` — Miễn phí vận chuyển

#### Chi tiết combo — `get_combo_items`

Lấy sản phẩm/biến thể cấu thành combo và sản phẩm quà tặng kèm.

```
get_combo_items({ combo_product_id: "combo_1" })
→ {
    combo_items: [
      { product: { name: "Áo thun" }, count: 2 },
      { product: { name: "Quần short" }, count: 1 },
    ],
    bonus_items: [
      { product: { name: "Vớ miễn phí" }, quantity: 1 }
    ]
  }
```

---

### Giao diện & Theme

#### Thông tin site — `get_site_info`

Lấy cấu hình site đầy đủ: tên, domain, logo, và **tất cả settings** (màu sắc, typography, layout, ngôn ngữ, phương thức thanh toán, v.v.).

```
get_site_info({})
→ { id: "site_1", name: "Cửa hàng", domain: "cuahang.storecake.io",
    settings: { primary_colors: [...], typography: {...}, layout_mode: "...", ... } }
```

#### Themes — `list_themes`

Liệt kê tất cả theme tùy chỉnh: màu sắc, typography, transitions, và theme nào đang active.

```
list_themes({})
→ [{ id: "theme_1", name: "Modern", colors: {...}, typographies: {...}, is_selected: true }, ...]
```

---

### Ứng dụng (Applications)

#### Ứng dụng đã cài — `list_apps`

Liệt kê tất cả ứng dụng đã cài với settings và trạng thái.

```
list_apps({})
→ [{ id: "app_1", type: 1, is_active: true, settings: {...} }, ...]
```

**Loại app phổ biến:** 1=CMS, 2=Product Design, 10=Đa ngôn ngữ

#### Chi tiết ứng dụng — `get_app`

Lấy thông tin app cụ thể theo type ID.

```
get_app({ type: "1" })
→ { id: "app_1", type: 1, is_active: true, settings: {...} }
```

---

### Knowledge tùy chỉnh (Training)

Thêm knowledge/hướng dẫn riêng để AI agent có thêm ngữ cảnh về doanh nghiệp, quy chuẩn code, hoặc workflow của bạn.

Knowledge hỗ trợ hai nguồn: **file local** và **GitHub repo**. Có thể dùng cả hai — file local được ưu tiên nếu trùng tên.

#### Nguồn 1: File local

Đặt file `.md` hoặc `.txt` vào thư mục `knowledge/` (cùng cấp với `index.js`):

```
knowledge/
  quy-tac-kinh-doanh.md
  quy-chuan-code.md
  api-docs.md
```

Hoặc đặt thư mục tùy chỉnh:
```json
{ "env": { "WEBCAKE_KNOWLEDGE_DIR": "/duong-dan/toi/knowledge" } }
```

#### Nguồn 2: GitHub repo

Trỏ tới GitHub repo chứa knowledge files. AI agent sẽ tự fetch và đọc.

```json
{
  "env": {
    "WEBCAKE_KNOWLEDGE_REPO": "your-org/my-knowledge"
  }
}
```

**Các định dạng hỗ trợ:**

| Định dạng | Ví dụ |
|-----------|-------|
| `owner/repo` | `acme/knowledge-base` |
| `owner/repo/subdir` | `acme/docs/ai-guides` |
| URL đầy đủ | `https://github.com/acme/knowledge-base` |
| URL với branch + path | `https://github.com/acme/docs/tree/main/ai-guides` |

**Repo private** — thêm GitHub personal access token:
```json
{
  "env": {
    "WEBCAKE_KNOWLEDGE_REPO": "your-org/private-knowledge",
    "WEBCAKE_KNOWLEDGE_TOKEN": "ghp_xxxxxxxxxxxx"
  }
}
```

Files được cache 5 phút để tránh giới hạn GitHub API.

#### Định dạng file

File hỗ trợ frontmatter (tùy chọn) để đặt tên và mô tả:

```markdown
---
name: Quy tắc kinh doanh
description: Chính sách vận chuyển và đổi trả
tags: kinh doanh, chính sách
---

## Chính sách vận chuyển
- Miễn phí vận chuyển cho đơn trên 500k
- Giao nhanh: 2-3 ngày làm việc
...
```

#### Cách sử dụng

```
# Liệt kê các file knowledge
list_knowledge({})
→ { files: [
    { file: "quy-tac-kinh-doanh", name: "Quy tắc kinh doanh", description: "Chính sách vận chuyển..." },
    { file: "quy-chuan-code", name: "Quy chuẩn code", description: "..." }
  ]}

# Đọc file cụ thể
get_knowledge({ file: "quy-tac-kinh-doanh" })
→ { file: "quy-tac-kinh-doanh.md", name: "Quy tắc kinh doanh", content: "## Chính sách vận chuyển\n..." }
```

AI agent sẽ dùng knowledge này làm ngữ cảnh khi hỗ trợ. Ví dụ: nếu bạn có chính sách vận chuyển, AI sẽ tham chiếu khi viết code liên quan đến đơn hàng.

---

### Tổng kết tối ưu Token

| Kỹ thuật | Token tiết kiệm | Cách thức |
|----------|-----------------|-----------|
| Lazy guides (`include_guide`) | ~600-1000 mỗi lần gọi | Chỉ tải guide lần đầu |
| List = chỉ metadata | 50-90% mỗi lần list | HTML content, source JSON, full schemas bị loại khỏi response list |
| Overview + Search (pages) | ~85-90% | Overview cho cấu trúc, search cho chỉ elements khớp |
| HTTP function overview + snippet | ~80-95% mỗi lần đọc | Overview chỉ trả danh sách function, snippet đọc đúng function cần |
| `edit_http_function` | ~70-90% mỗi lần sửa | Sửa/thêm/xóa theo tên function, không gửi toàn bộ file |
| Custom code field filter | ~50-80% mỗi lần đọc | Chỉ đọc CSS hoặc JS thay vì cả 4 fields |
| `append_site_custom_code` | ~100% khi thêm mới | Thêm code mà không cần đọc nội dung hiện có |
| Compact JSON | ~30% mỗi response | Không pretty-print trong response |

---

## Danh sách công cụ

### Quản lý kết nối — Context (4 tools)
| Tool | Mô tả |
|------|-------|
| `get_current_context` | Xem site đang kết nối, account, session — gọi đầu tiên để xác nhận đúng site |
| `list_my_sites` | Liệt kê tất cả sites của account (hỗ trợ tìm kiếm theo tên) |
| `switch_site` | Đổi sang site khác — lưu vào SQLite, session sau tự nhớ |
| `update_auth` | Cập nhật token và/hoặc session_id — lưu vào SQLite |

### CMS Files (12 tools)
| Tool | Mô tả |
|------|-------|
| `list_cms_files` | Liệt kê tất cả CMS files |
| `create_cms_file` | Tạo HTTP function / cron job / file mặc định |
| `update_cms_file` | Cập nhật nội dung file |
| `get_http_function` | **Mặc định**: full code + schemas. **overview=true**: chỉ danh sách function (để duyệt). `include_guide=true` cho guide |
| `get_http_function_snippet` | Đọc function cụ thể theo tên — tiết kiệm token hơn nhiều so với đọc toàn bộ file |
| `edit_http_function` | Sửa theo tên function: replace_function/add/remove/update_imports — không cần string matching |
| `update_http_function` | Ghi toàn bộ file — dùng khi viết tính năng mới, refactor lớn. Sửa nhỏ dùng `edit_http_function` |
| `run_function` | Chạy function đã triển khai |
| `debug_function` | Chạy code ở chế độ debug (không cần deploy) |
| `save_file_version` | Lưu phiên bản để rollback |
| `get_file_versions` | Xem lịch sử phiên bản |
| `toggle_debug_render` | Bật/tắt chế độ debug render |

### Quản lý trang — Pages (16 tools)
| Tool | Mô tả |
|------|-------|
| `list_pages` | Liệt kê trang (chỉ metadata, không có source) |
| `get_page_source` | Tổng quan trang: số section, loại element, custom classes |
| `search_page_elements` | Tìm elements theo type, id, class, text, bind, events (trả đầy đủ chi tiết) |
| `get_page_element` | Xem chi tiết một element theo ID (bao gồm danh sách children) |
| `update_page_element` | Cập nhật thuộc tính element: style, config, specials, events, bindings, responsive |
| `update_page_elements` | Cập nhật hàng loạt nhiều elements trong một lần gọi |
| `create_page` | Tạo trang mới |
| `update_page` | Cập nhật thuộc tính trang |
| `get_site_custom_code` | Đọc CSS/JS. Dùng `fields` để chỉ đọc field cần. `include_guide=true` để nhận guide |
| `update_site_custom_code` | Cập nhật toàn bộ CSS/JS (chỉ field được gửi sẽ thay đổi) |
| `append_site_custom_code` | Thêm CSS/JS mới (append/prepend) mà không cần đọc trước |
| `delete_page` | Xóa trang |
| `get_page_versions` | Lịch sử phiên bản trang |
| `list_page_contents` | Nội dung đa ngôn ngữ |
| `update_page_content` | Cập nhật nội dung theo ngôn ngữ |
| `list_global_sections` | Liệt kê section dùng chung |

### Collections — Cơ sở dữ liệu (3 tools)
| Tool | Mô tả |
|------|-------|
| `list_collections` | Liệt kê collections (name, table_name, số fields) |
| `get_collection` | Xem đầy đủ schema: tên field, type, constraints, references |
| `query_collection_records` | Truy vấn records theo table_name |

### Bài viết Blog (5 tools)
| Tool | Mô tả |
|------|-------|
| `list_articles` | Liệt kê bài viết (chỉ metadata, không có HTML content) |
| `get_article` | Lấy bài viết đầy đủ với HTML content |
| `create_article` | Tạo bài viết |
| `update_article` | Cập nhật bài viết |
| `delete_article` | Xóa bài viết |

### Sản phẩm — Products (4 tools)
| Tool | Mô tả |
|------|-------|
| `list_products` | Liệt kê sản phẩm (metadata: tên, slug, giá, ảnh, trạng thái) |
| `get_product` | Xem chi tiết: mô tả, biến thể, thuộc tính, ảnh, SEO |
| `search_products` | Tìm kiếm sản phẩm theo từ khóa |
| `list_categories` | Liệt kê tất cả danh mục sản phẩm |

### Đơn hàng — Orders (3 tools)
| Tool | Mô tả |
|------|-------|
| `list_orders` | Liệt kê đơn hàng (metadata: khách, trạng thái, tổng tiền, số SP) |
| `get_order` | Xem chi tiết: sản phẩm, thanh toán, vận chuyển, giảm giá |
| `count_orders_by_status` | Đếm đơn hàng theo trạng thái |

### Khuyến mãi — Promotions (5 tools)
| Tool | Mô tả |
|------|-------|
| `list_promotions` | Liệt kê khuyến mãi (metadata: tên, loại, trạng thái, lịch). `include_guide=true` để xem hướng dẫn |
| `get_promotion` | Xem chi tiết: quy tắc giảm giá, coupon, sản phẩm, quà tặng |
| `get_promotion_items` | Lấy sản phẩm/biến thể/danh mục trong khuyến mãi với chi tiết giảm giá |
| `get_active_promotions` | Lấy tất cả khuyến mãi đang hoạt động |
| `search_promotions` | Tìm/lọc theo loại, trạng thái (sắp diễn ra/đang diễn ra/đã kết thúc), từ khóa |

### Combo sản phẩm (2 tools)
| Tool | Mô tả |
|------|-------|
| `list_combos` | Liệt kê combo (tên, giảm giá, lịch, loại). `include_guide=true` để xem hướng dẫn |
| `get_combo_items` | Lấy sản phẩm cấu thành combo (số lượng) và quà tặng kèm |

### Giao diện & Theme (2 tools)
| Tool | Mô tả |
|------|-------|
| `get_site_info` | Lấy tên site, domain, logo, và tất cả settings thiết kế |
| `list_themes` | Liệt kê theme tùy chỉnh: màu sắc, typography, transitions |

### Ứng dụng — Applications (2 tools)
| Tool | Mô tả |
|------|-------|
| `list_apps` | Liệt kê ứng dụng đã cài với settings và trạng thái |
| `get_app` | Xem chi tiết ứng dụng theo type ID |

### Knowledge tùy chỉnh (2 tools)
| Tool | Mô tả |
|------|-------|
| `list_knowledge` | Liệt kê các file knowledge/hướng dẫn tùy chỉnh |
| `get_knowledge` | Đọc nội dung file knowledge cụ thể |

### Khách hàng (1 tool)
| Tool | Mô tả |
|------|-------|
| `find_customer` | Tìm theo ID, số điện thoại, hoặc email |

### Tự động hóa (1 tool)
| Tool | Mô tả |
|------|-------|
| `send_mail` | Gửi email qua CMS automation |

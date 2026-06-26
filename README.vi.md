<p align="center">
  <img src="./assets/logo.svg" alt="WebCake Storefront MCP" width="96" height="96">
</p>

<h1 align="center">WebCake Storefront MCP</h1>

[English](./README.md) · **Tiếng Việt**

[![npm version](https://img.shields.io/npm/v/webcake-storefront-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/webcake-storefront-mcp)
[![npm downloads](https://img.shields.io/npm/dm/webcake-storefront-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/webcake-storefront-mcp)
[![GitHub stars](https://img.shields.io/github/stars/vuluu2k/webcake-storefront-mcp?style=social)](https://github.com/vuluu2k/webcake-storefront-mcp/stargazers)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-server-6E56CF)](https://modelcontextprotocol.io)

> **Mô tả trang bằng lời — AI tự dựng, tự kiểm tra, rồi xuất bản thẳng lên storefront WebCake của bạn.**

> ⭐ **Nếu nó giúp bạn đỡ một buổi chiều kéo-thả, [tặng một sao nhé](https://github.com/vuluu2k/webcake-storefront-mcp) — mỗi sao giúp dự án một người làm này sống tiếp.**

> *"Dựng trang cho quán cà phê của tôi — hero kèm nút Mua ngay, lưới sản phẩm và form đặt hàng. Lưu rồi xuất bản."*

…và một trang **chỉnh sửa được** thật sự xuất hiện trên site WebCake/StoreCake của bạn. Không kéo-thả, không học schema, không tự viết JSON.

---

## 🧩 Hoạt động thế nào

Server này là **cầu nối** giữa trợ lý AI và storefront của bạn. AI không *đoán* trang trông ra sao —
nó hỏi MCP này, nơi nắm toàn bộ mô hình component BuilderX, kiểm tra kết quả, rồi lưu lại.

```text
   Bạn             Trợ lý AI           webcake-storefront MCP          WebCake / StoreCake
  ┌──────┐  prompt  ┌────────────┐  tool ┌───────────────────────┐  API ┌──────────┐
  │ ý    │ ───────► │  Claude /  │ ─────►│ • nắm mô hình         │ ───► │ trang    │
  │ tưởng│          │  Cursor /  │       │   component BuilderX  │      │ thật,    │
  │      │ ◄─────── │  Windsurf  │ ◄─────│ • dựng + kiểm tra     │ ◄─── │ sửa được │
  └──────┘ link live └────────────┘ kết quả│ • lưu + xuất bản     │      │ trên site│
                                          └───────────────────────┘      └──────────┘
```

1. **Bạn yêu cầu** bằng lời — mục tiêu, thương hiệu, các section, sản phẩm, trường form.
2. **AI học mô hình** từ MCP: catalog element, layout dạng lưới CSS, các breakpoint — để dựng trang *thật*, không phải đoán.
3. **AI ráp + kiểm tra** nguồn trang `{ sections: [...] }`. `validate_page` bắt id trùng, lưới hỏng, form thiếu tên trường **trước khi** lưu.
4. **AI lưu** vào site — xem trước (dry-run) trước, rồi mới thật — và `publish_site` đưa lên live.
5. **Bạn nhận link preview** — mở ra, chỉnh trong editor, xong.

### Vì sao đáng tin

| | |
|---|---|
| 📚 **Nắm mô hình thật** | Cung cấp 130+ loại component BuilderX (text, ảnh, nút, form, lưới sản phẩm, giỏ hàng, đếm ngược, gallery…) **port thẳng từ factory của builder** — đúng y hình dạng editor tạo ra. |
| ✅ **Kiểm tra trước khi lưu** | Kiểm tra cấu trúc (id duy nhất, lưới hợp lệ, form có tên trường, event trỏ đúng) để trang không bị hỏng khi lên. |
| 🛡️ **Mặc định an toàn** | Mọi ghi đều **dry-run trước** — xem thay đổi, chưa đụng site cho tới khi bạn xác nhận. |
| ✏️ **Sửa chính xác** | Yêu cầu đổi một chỗ ("đổi nút CTA sang xanh") thì nó chỉ sửa *đúng* element đó — mọi id, style, block khác giữ nguyên. |

> 💡 Bán **COD hay online**? Nó hiểu cả mô hình thương mại — sản phẩm, biến thể, giỏ hàng, đơn hàng, khuyến mãi, combo.

---

## ✨ Bạn có thể dựng gì

Một câu cho AI → một trang storefront **chỉnh sửa được** hoàn chỉnh:

| | Chỉ cần nói… |
|---|---|
| 🛒 **Trang sản phẩm** | *"Trang một sản phẩm cho serum dưỡng da — gallery, giá, form đặt hàng có giỏ."* |
| 🏬 **Trang chủ shop** | *"Trang chủ — banner hero, lưới sản phẩm nổi bật, form đăng ký nhận tin."* |
| ⚡ **Flash sale** | *"Trang flash-sale — đếm ngược lớn, lưới sản phẩm giảm giá, nút Mua dính."* |
| 🎟️ **Sự kiện / webinar** | *"Trang đăng ký — đếm ngược, agenda, form đăng ký."* |
| 💌 **Thiệp mời** | *"Thiệp cưới — tên, ngày, bản đồ, form RSVP."* |
| 📰 **Blog / nội dung** | *"Trang blog với bài nổi bật và ô đăng ký."* |
| 🔗 **Link-in-bio** | *"Link-in-bio — avatar, bio ngắn, 5 nút liên kết, mạng xã hội."* |

…rồi **"đổi CTA sang xanh"** hay **"thêm tính năng thứ 4"** và nó chỉ sửa đúng block đó.

> 🤖 Chạy trong **Claude Desktop, Claude Code, Cursor, Windsurf, VS Code**, hay client MCP bất kỳ — và **tool guide dựng trang + catalog element không cần gọi backend**, nên bạn khám phá mô hình được trước cả khi dán token.

---

## Bên dưới capô

Một MCP (Model Context Protocol) server dạy AI mô hình component của **trình tạo trang storefront
WebCake/StoreCake (BuilderX)** và kết nối tới backend. AI tạo nguồn trang `{ sections: [...] }` đầy đủ;
`build_page` tạo + lưu trang, `publish_site` đưa cả site lên live.

Ngoài dựng trang, nó mở ra cả store thật: trang & custom code, sản phẩm, đơn hàng, collection,
bài blog, khuyến mãi, combo, theme, khách hàng, automation — **~280 tool** tổng cộng.

| Cách | Hợp cho | Auth |
|--------|----------|------|
| **npx (local)** — chạy trên máy bạn | Dùng cá nhân hằng ngày, toàn quyền | `login` qua trình duyệt, hoặc token + session |
| **Remote (`serve`)** — tự host Streamable-HTTP | Nhóm, hộp thoại claude.ai, chạy liên tục | link `?jwt=` / header `x-webcake-jwt` |

Các **tool dựng + catalog** (`get_build_guide`, `list_elements`, `get_element`, `new_section`,
`validate_page`) chạy **không cần cấu hình**; mọi thứ đọc/ghi site cần token + session.

---

## 🚀 Kết nối

Chọn **một**. Cả hai đều trao cho AI toàn bộ bộ công cụ storefront. Không cần code.

### ① `npx` — chạy trên máy bạn (khuyên dùng)

Không cần cài, luôn mới nhất, cần Node.js 18+. **Một dòng** cấu hình IDE:

```bash
# Tương tác — chọn IDE và dán thông tin
npx -y webcake-storefront-mcp install

# Phi tương tác — cấu hình mọi IDE hỗ trợ cùng lúc
npx -y webcake-storefront-mcp install --ide all --token <token> --session <session-id>

# Gỡ khỏi mọi IDE
npx -y webcake-storefront-mcp uninstall
```

Hỗ trợ: `claude-desktop`, `claude-code`, `cursor`, `windsurf`, `vscode`, hoặc `all`.
Chỉ muốn chạy server (cấu hình tay)? `npx -y webcake-storefront-mcp`.

### ② Đăng nhập trình duyệt — khỏi copy token

```bash
npx -y webcake-storefront-mcp login
```

Mở **trang kết nối** của builder; bấm *Kết nối* là token + session được lưu cục bộ và tự nạp.

### Remote URL — tự host, mỗi client khỏi cài gì

```bash
npx -y webcake-storefront-mcp serve --port 8787
```

Rồi trỏ client tới `http://<host>:8787/mcp?jwt=<TOKEN>` (client hỗ trợ header có thể gửi `x-webcake-jwt`;
chọn site trong chat bằng `switch_site`). Secret phía server như `PEXELS_API_KEY` đặt trên host — tiện cho VPS.

> ⚠️ Link `?jwt=` chứa token cá nhân — coi như mật khẩu, dùng **HTTPS** khi chạy thật.

---

## ⚙️ Cấu hình

Chỉ cần hai giá trị: **`WEBCAKE_TOKEN`** (JWT Bearer) và **`WEBCAKE_SESSION_ID`** (gửi qua `x-session-id`).
Bạn chọn **site lúc chạy** — chỉ cần hỏi trong chat, AI sẽ gọi `list_my_sites` / `switch_site` (lựa chọn được
lưu lại cho lần sau), nên không cần `WEBCAKE_SITE_ID`.

URL gốc lấy theo **môi trường có tên** — đặt `WEBCAKE_ENV` (hoặc `--env`) là khỏi gõ URL:

| `WEBCAKE_ENV` | api | app (login) | preview |
|---|---|---|---|
| `local` | `http://localhost:24679` | `http://localhost:5173` | `demo.localhost:24679/<siteId>` |
| `staging` | `https://api.staging.storecake.io` | `https://staging.webcake.io` | `staging2.webcake.me/<siteId>` |
| **`prod`** (mặc định) | `https://api.storefront.webcake.io` | `https://webcake.io` | `<site_slug>.webcake.me` |

Override bằng `WEBCAKE_API_URL` / `WEBCAKE_APP_URL`. Tuỳ chọn, đặt phía server:
`PEXELS_API_KEY` (search_images). Token / session / site cũng có thể đặt
trong chat bằng `update_auth` và `switch_site` — lưu vào file cấu hình tại `~/.webcake-storefront-mcp/`.

<details>
<summary><b>Cách lấy token + session</b></summary>

1. Mở trình tạo trang WebCake và đăng nhập.
2. Mở DevTools (`F12`) → tab **Network** → bấm một request API.
3. Trong **Request Headers**: `Authorization: Bearer …` → `WEBCAKE_TOKEN`; `x-session-id: …` → `WEBCAKE_SESSION_ID`.
4. Không cần site id từ đầu — trong chat, chạy `list_my_sites` rồi `switch_site` để chọn site (được nhớ cho lần sau).

</details>

---

## 🧰 Bộ công cụ tổng quan

~280 tool. Nhóm chủ lực **dựng trang**; phần còn lại đọc và sửa store thật của bạn.

| Nhóm | Tool | Cần |
|-------|-------|-------|
| **Dựng trang** | `get_build_guide` · `list_elements` · `get_element` · `new_element` · `new_section` · `new_page_skeleton` · `validate_page` · `build_page` · `add_section` | tool catalog: không cần |
| **Media & ingest** | `search_images` (Pexels) · `upload_images` (CDN) · `ingest_html` · `ingest_url` (dựng lại trang tham khảo) | — |
| **Trang & code** | `list_pages` · `get_page_source` · `search_page_elements` · `get_page_element` · `update_page_element(s)` · `create_page` · `update_page` · `update_page_source` · custom CSS/JS · nội dung trang · global section · `publish_site` | token + session |
| **Thương mại** | sản phẩm · đơn hàng · collection · khuyến mãi · combo | token + session |
| **Nội dung & store** | bài blog · theme / site style · app · khách hàng · `send_mail` | token + session |
| **Code backend** | CRUD HTTP-function (`get_http_function`, `edit_http_function`, `run_function`, `debug_function`…) | token + session |
| **Ngữ cảnh** | `get_current_context` · `list_my_sites` · `switch_site` · `update_auth` · `toggle_confirm_mode` | token |

Mọi thao tác ghi **mặc định `dry_run=true`** — xem trước thay đổi, chỉ đụng site khi bạn chạy lại với `dry_run=false`.

## 💬 Prompt gợi ý

> Dựng cho tôi một trang storefront WebCake cho &lt;thương hiệu/ưu đãi&gt;. Dùng MCP webcake-storefront:
> gọi `get_build_guide`, `list_elements`, dựng các section bằng `new_section`,
> `validate_page` đến khi không còn lỗi, rồi `build_page` (dry-run trước) và `publish_site`.

---

## ⭐ Thích ý tưởng? Tặng một sao

Đây là dự án mã nguồn mở một người làm — mỗi ⭐ thật sự giúp nó tiến tới và giúp người khác tìm thấy.

- ⭐ **[Star repo](https://github.com/vuluu2k/webcake-storefront-mcp)** — 2 giây, động lực lớn.
- 🐛 **[Mở issue](https://github.com/vuluu2k/webcake-storefront-mcp/issues)** — một lỗi, một component còn thiếu, hay chỉ một ý tưởng.
- 🔁 **Chia sẻ** với ai vẫn đang dựng trang store từng block một.

[![Star History Chart](https://api.star-history.com/svg?repos=vuluu2k/webcake-storefront-mcp&type=Date)](https://star-history.com/#vuluu2k/webcake-storefront-mcp&Date)

> Làm với ❤️ cho cộng đồng WebCake. Cảm ơn bạn đã ghé.

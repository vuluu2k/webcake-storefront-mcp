---
name: Hướng dẫn viết Knowledge (Tiếng Việt)
description: Hướng dẫn chi tiết cách viết file knowledge và xây dựng repo GitHub để huấn luyện AI agent
tags: guide, template, vietnamese, github
---

# Hướng dẫn viết Knowledge & Xây dựng trên GitHub

## Tổng quan

Hệ thống Knowledge cho phép bạn "dạy" AI agent những kiến thức riêng của doanh nghiệp — quy trình, chính sách, thuật ngữ, API docs, v.v. AI sẽ đọc các file này và áp dụng khi trả lời khách hàng hoặc xử lý tác vụ.

**2 nguồn dữ liệu:**
1. **Thư mục local** — file `.md/.txt/.json` trong thư mục `knowledge/`
2. **GitHub repo** — trỏ đến một repo chứa các file knowledge

---

## Phần 1: Cấu trúc file Knowledge

Mỗi file gồm 2 phần: **frontmatter** (metadata tùy chọn) và **nội dung**.

```markdown
---
name: Tên hiển thị
description: Mô tả ngắn gọn (hiện trong list_knowledge)
tags: tag1, tag2, tag3
---

Nội dung kiến thức ở đây...
```

### Các trường frontmatter

| Trường | Bắt buộc | Mô tả |
|--------|----------|-------|
| `name` | Không | Tên hiển thị (mặc định lấy tên file) |
| `description` | Không | Mô tả 1 dòng để AI nhanh chóng biết file chứa gì |
| `tags` | Không | Các tag phân loại, cách nhau bởi dấu phẩy |

Nếu bỏ qua frontmatter, tên file sẽ được dùng làm tên hiển thị.

---

## Phần 2: Cách viết nội dung hiệu quả

### 1. Viết cụ thể, có cấu trúc

**Sai:**
```
Chúng tôi có một số quy tắc vận chuyển.
```

**Đúng:**
```markdown
## Quy tắc vận chuyển

- Miễn phí ship: đơn >= 500.000đ
- Tiêu chuẩn: 3-5 ngày làm việc, 30.000đ
- Nhanh: 1-2 ngày làm việc, 60.000đ
- Vùng xa (danh sách kèm theo): phụ thu 20.000đ
- Không ship: hàng dễ vỡ trên 50kg
```

### 2. Dùng heading rõ ràng để phân tách chủ đề

```markdown
## Chính sách đổi trả
...

## Quy trình hoàn tiền
...

## Trường hợp ngoại lệ
...
```

### 3. Viết quy tắc quyết định để AI có thể tuân theo

```markdown
## Logic giảm giá

1. Khách VIP (tổng chi > 10.000.000đ): giảm 15%
2. Đơn > 1.000.000đ: giảm 10%
3. Khách mua lần đầu: giảm 5% + miễn ship
4. Các mức giảm KHÔNG cộng dồn — áp dụng mức cao nhất
5. Sản phẩm đang sale: không áp dụng thêm giảm giá
```

### 4. Kèm ví dụ code/API khi cần

```markdown
## Tích hợp thanh toán VNPay

Endpoint: POST https://sandbox.vnpayment.vn/paymentv2/vpcpay.html

Tham số bắt buộc:
- vnp_Amount: số tiền × 100 (integer)
- vnp_Command: pay
- vnp_CreateDate: yyyyMMddHHmmss
- vnp_TxnRef: mã giao dịch duy nhất

Mã trạng thái:
- 00: Thành công
- 01: Giao dịch chưa hoàn tất
- 02: Lỗi giao dịch
- 04: Đã hoàn tiền
```

### 5. Định nghĩa thuật ngữ nội bộ

```markdown
## Thuật ngữ

- "SKU" = mã biến thể sản phẩm (format: PROD-001-RED-M)
- "Fulfillment" = quy trình đóng gói + giao hàng
- "COD" = Thu tiền khi giao hàng (Cash on Delivery)
- "Pre-order" = Khách đặt trước, giao trong 2-4 tuần
- "Flash sale" = Khuyến mãi giới hạn thời gian (thường 2-4 tiếng)
```

---

## Phần 3: Xây dựng repo GitHub cho Knowledge

### Bước 1: Tạo repo trên GitHub

1. Vào [github.com/new](https://github.com/new)
2. Đặt tên repo, ví dụ: `my-store-knowledge`
3. Chọn **Public** (miễn phí, không cần token) hoặc **Private** (cần token)
4. Tích **Add a README file**
5. Nhấn **Create repository**

### Bước 2: Tạo cấu trúc thư mục

Tổ chức file theo chủ đề, mỗi file tập trung vào **một chủ đề duy nhất**:

```
my-store-knowledge/
├── README.md                    # Giới thiệu repo
├── chinh-sach-ban-hang.md       # Chính sách bán hàng, đổi trả
├── quy-trinh-don-hang.md        # Xử lý đơn hàng
├── san-pham.md                  # Thông tin sản phẩm, danh mục
├── van-chuyen.md                # Quy tắc vận chuyển
├── thanh-toan.md                # Phương thức thanh toán
├── khuyen-mai.md                # Quy tắc khuyến mãi, giảm giá
├── cham-soc-khach-hang.md       # Kịch bản trả lời khách
├── faq.md                       # Câu hỏi thường gặp
└── thuat-ngu.md                 # Định nghĩa thuật ngữ
```

### Bước 3: Viết file knowledge

Tạo file mới trên GitHub (nhấn **Add file > Create new file**) hoặc clone về máy:

```bash
git clone https://github.com/your-username/my-store-knowledge.git
cd my-store-knowledge
```

**Ví dụ file `chinh-sach-ban-hang.md`:**

```markdown
---
name: Chính sách bán hàng
description: Quy định đổi trả, bảo hành, hoàn tiền
tags: chính sách, đổi trả, bảo hành
---

## Chính sách đổi trả

- Đổi trả trong vòng **7 ngày** kể từ ngày nhận hàng
- Sản phẩm phải còn nguyên tem, nhãn, chưa qua sử dụng
- Không đổi trả: đồ lót, đồ bơi, sản phẩm cá nhân hóa

## Quy trình đổi trả

1. Khách liên hệ hotline hoặc chat
2. Cung cấp mã đơn hàng + hình ảnh sản phẩm
3. Nhân viên xác nhận trong 24h
4. Gửi hàng trả về (shop chịu phí ship nếu lỗi từ shop)
5. Hoàn tiền/đổi hàng trong 3-5 ngày làm việc

## Bảo hành

- Sản phẩm điện tử: bảo hành 12 tháng
- Quần áo/giày dép: bảo hành lỗi sản xuất 30 ngày
- Phụ kiện: không bảo hành

## Hoàn tiền

- COD: hoàn qua tài khoản ngân hàng trong 3-5 ngày
- Chuyển khoản/thẻ: hoàn lại phương thức gốc trong 5-7 ngày
- Ví điện tử: hoàn trong 1-2 ngày
```

**Ví dụ file `quy-trinh-don-hang.md`:**

```markdown
---
name: Quy trình đơn hàng
description: Xử lý đơn từ khi đặt đến khi giao
tags: đơn hàng, xử lý, vận hành
---

## Trạng thái đơn hàng

| Mã | Trạng thái | Mô tả |
|----|-----------|-------|
| 0 | Chờ xác nhận | Đơn mới tạo, chưa xử lý |
| 50 | Đã xác nhận | Nhân viên đã xác nhận |
| 100 | Đang giao | Đã chuyển cho đơn vị vận chuyển |
| 150 | Đã giao | Giao thành công |
| -1 | Đã hủy | Đơn bị hủy |

## Quy trình xử lý

1. Đơn mới → kiểm tra tồn kho
2. Có hàng → xác nhận đơn (status: 50)
3. Hết hàng → liên hệ khách, đề xuất thay thế hoặc hủy
4. Đóng gói → chuyển vận chuyển (status: 100)
5. Giao thành công (status: 150) hoặc giao thất bại → liên hệ khách

## Quy tắc xử lý đặc biệt

- Đơn trước 14h: giao trong ngày
- Đơn sau 14h: giao ngày làm việc tiếp theo
- Đơn cuối tuần: xử lý sáng thứ Hai
- Đơn > 5.000.000đ: cần xác nhận qua điện thoại
- Đơn COD > 3.000.000đ: yêu cầu đặt cọc 30%
```

**Ví dụ file `cham-soc-khach-hang.md`:**

```markdown
---
name: Chăm sóc khách hàng
description: Kịch bản trả lời và xử lý tình huống với khách
tags: CSKH, chatbot, kịch bản
---

## Giọng điệu

- Thân thiện, lịch sự, chuyên nghiệp
- Xưng "em/mình", gọi khách "anh/chị"
- Không dùng từ viết tắt khó hiểu
- Luôn cảm ơn và xin lỗi khi cần

## Kịch bản phổ biến

### Khách hỏi giá
> Dạ anh/chị ơi, sản phẩm [tên] hiện có giá [giá]ạ.
> [Nếu đang sale]: Hiện đang giảm còn [giá sale], chương trình đến hết [ngày]ạ!

### Khách hỏi tồn kho
> Dạ em kiểm tra giúp anh/chị ngay ạ.
> [Có hàng]: Sản phẩm [tên] size [size] hiện còn hàng ạ!
> [Hết hàng]: Dạ size này hiện tạm hết ạ. Anh/chị có muốn em báo khi có hàng lại không ạ?

### Khách muốn hủy đơn
> Dạ anh/chị cho em xin mã đơn hàng ạ.
> [Chưa ship]: Em hủy đơn giúp anh/chị ngay ạ. Lý do hủy là gì ạ?
> [Đã ship]: Dạ đơn đã chuyển cho bên vận chuyển rồi ạ. Anh/chị có thể từ chối nhận hàng khi shipper giao ạ.

### Khách phản hồi tiêu cực
> Dạ em rất xin lỗi về trải nghiệm không tốt của anh/chị ạ.
> Em sẽ chuyển phản hồi lên bộ phận xử lý và liên hệ lại trong vòng 24h ạ.
> [Ghi nhận thông tin: tên, SĐT, mã đơn, nội dung phản hồi]
```

### Bước 4: Kết nối repo với WebCake CMS

Thêm biến môi trường khi chạy MCP server:

**Repo public (không cần token):**

```json
{
  "mcpServers": {
    "webcake-cms": {
      "command": "node",
      "args": ["/path/to/mcp/cms/index.js"],
      "env": {
        "WEBCAKE_API_URL": "https://api.storecake.io",
        "WEBCAKE_TOKEN": "your-jwt-token",
        "WEBCAKE_SITE_ID": "your-site-id",
        "WEBCAKE_KNOWLEDGE_REPO": "your-username/my-store-knowledge"
      }
    }
  }
}
```

**Repo private (cần Personal Access Token):**

1. Vào GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
2. Nhấn **Generate new token**
3. Chọn quyền **repo** (Full control of private repositories)
4. Copy token

```json
{
  "env": {
    "WEBCAKE_KNOWLEDGE_REPO": "your-username/my-store-knowledge",
    "WEBCAKE_KNOWLEDGE_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxx"
  }
}
```

**Hỗ trợ nhiều format link:**

```bash
# Shorthand
WEBCAKE_KNOWLEDGE_REPO="your-username/my-store-knowledge"

# Thư mục con trong repo
WEBCAKE_KNOWLEDGE_REPO="your-username/my-store-knowledge/docs/knowledge"

# Full URL
WEBCAKE_KNOWLEDGE_REPO="https://github.com/your-username/my-store-knowledge"

# URL với branch cụ thể
WEBCAKE_KNOWLEDGE_REPO="https://github.com/your-username/my-store-knowledge/tree/main/docs"
```

### Bước 5: Kiểm tra

Sau khi cấu hình, AI agent có thể dùng 2 tool:

- **`list_knowledge`** — Xem danh sách tất cả file knowledge
- **`get_knowledge`** — Đọc nội dung một file cụ thể

AI sẽ tự động tìm và đọc file phù hợp khi cần trả lời câu hỏi liên quan.

---

## Phần 4: Mẹo tổ chức tốt

### Nên làm

- Mỗi file **một chủ đề** — AI chỉ đọc file cần thiết, tiết kiệm token
- Đặt tên file bằng **tiếng Việt không dấu** hoặc **tiếng Anh**, dùng dấu gạch ngang: `chinh-sach-ban-hang.md`
- Viết **description** rõ ràng trong frontmatter — giúp AI biết file nào chứa thông tin gì
- Dùng **bảng** cho dữ liệu có cấu trúc (bảng giá, trạng thái, mã lỗi)
- Dùng **danh sách đánh số** cho quy trình có thứ tự
- Dùng **gạch đầu dòng** cho quy tắc không thứ tự

### Không nên

- Nhét tất cả vào một file lớn — AI phải đọc hết, tốn token
- Viết mơ hồ kiểu "liên hệ để biết thêm" — AI cần thông tin cụ thể
- Dùng hình ảnh — AI chỉ đọc được text
- Lặp lại thông tin ở nhiều file — gây nhầm lẫn khi cập nhật

### Cập nhật thường xuyên

Khi chính sách hoặc quy trình thay đổi, chỉ cần:

1. Sửa file trên GitHub (nhấn nút Edit)
2. Commit thay đổi
3. AI sẽ tự động đọc bản mới (cache 5 phút)

Không cần restart server hay cấu hình lại.

---

## Phần 5: Ví dụ cấu trúc repo hoàn chỉnh

```
my-store-knowledge/
│
├── README.md                        # Giới thiệu, không phải knowledge
│
├── chinh-sach-ban-hang.md           # Đổi trả, bảo hành, hoàn tiền
├── quy-trinh-don-hang.md            # Xử lý đơn, trạng thái, quy tắc
├── van-chuyen.md                    # Phí ship, vùng miền, đơn vị VC
├── thanh-toan.md                    # COD, chuyển khoản, ví, trả góp
│
├── san-pham.md                      # Danh mục, cách mô tả SP
├── khuyen-mai.md                    # Logic giảm giá, voucher, flash sale
│
├── cham-soc-khach-hang.md           # Kịch bản trả lời, giọng điệu
├── faq.md                           # Câu hỏi thường gặp + câu trả lời
│
├── thuat-ngu.md                     # Định nghĩa thuật ngữ nội bộ
└── api-tich-hop.md                  # API bên thứ 3 (thanh toán, VC...)
```

Mỗi file là một "bài học" riêng cho AI. Khi khách hỏi về vận chuyển, AI sẽ chỉ đọc `van-chuyen.md`. Khi hỏi về đổi trả, AI đọc `chinh-sach-ban-hang.md`. Tiết kiệm và chính xác.

---

## Phần 6: Cấu hình nhanh bằng script

Thay vì sửa thủ công từng file cấu hình IDE, bạn có thể dùng script tự động:

### Cài đặt & chạy nhanh (copy & run)

**Cài đặt MCP server + cấu hình IDE (lần đầu):**

```bash
# Tiếng Việt
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/install_vi.sh | bash

# English
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/install.sh | bash
```

**Cấu hình biến knowledge (sau khi đã cài):**

```bash
# Tiếng Việt
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/setup_env_vi.sh | bash

# English
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/setup_env.sh | bash
```

**Cập nhật lên bản mới nhất:**

```bash
# Tiếng Việt
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/update_vi.sh | bash

# English
curl -fsSL https://raw.githubusercontent.com/vuluu2k/webcake-storefront-mcp/main/update.sh | bash
```

> **Lưu ý:** Nếu muốn xem nội dung script trước khi chạy, thay `| bash` bằng `| less`

**Hoặc nếu đã clone repo, chạy trực tiếp:**

```bash
# Tiếng Việt
./setup_env_vi.sh

# English
./setup_env.sh
```

### Script làm gì?

1. **Tự động tìm** MCP server đã cài (thư mục hiện tại hoặc `~/.webcake-storefront-mcp`)
2. **Hỏi bạn** 3 biến môi trường knowledge:

| Biến | Mô tả | Bắt buộc |
|------|--------|----------|
| `WEBCAKE_KNOWLEDGE_DIR` | Thư mục chứa file knowledge local | Không (mặc định: `knowledge/`) |
| `WEBCAKE_KNOWLEDGE_REPO` | GitHub repo chứa knowledge | Không |
| `WEBCAKE_KNOWLEDGE_TOKEN` | GitHub token cho repo private | Không (repo public không cần) |

3. **Tự phát hiện** các IDE đã cấu hình webcake-cms (Claude Desktop, Claude Code, Cursor, Windsurf, Augment, Codex)
4. **Gộp thêm** biến mới vào config hiện có — không ghi đè các biến cũ (API URL, token, site_id...)

### Ví dụ luồng chạy

```
$ ./setup_env_vi.sh

╔══════════════════════════════════════════════════════╗
║  WebCake CMS MCP - Cấu hình biến môi trường        ║
╚══════════════════════════════════════════════════════╝

[OK] MCP server tại /Users/you/.webcake-storefront-mcp
[OK] Node.js v20.11.0

── Cấu hình Knowledge ──

  WEBCAKE_KNOWLEDGE_DIR (Enter = mặc định): ↵
  WEBCAKE_KNOWLEDGE_REPO (Enter để bỏ qua): mycompany/store-knowledge
  WEBCAKE_KNOWLEDGE_TOKEN (Enter để bỏ qua): ghp_abc123...

── Cập nhật cấu hình IDE ──

  ✓ Claude Code         (~/.claude.json)
  ✓ Cursor              (~/.cursor/mcp.json)

  Cập nhật tất cả IDE đã tìm thấy? (C/k): C

[OK] Claude Code đã cập nhật
[OK] Cursor đã cập nhật

  Cấu hình biến môi trường hoàn tất!
```

### Khi nào cần chạy lại?

- Thay đổi thư mục knowledge local
- Đổi sang GitHub repo khác
- Cập nhật GitHub token (hết hạn)
- Thêm IDE mới (cài Cursor, Windsurf... sau khi đã setup)

### Tất cả biến môi trường

```
Bắt buộc (set qua install_vi.sh):
  WEBCAKE_API_URL          — URL API backend
  WEBCAKE_TOKEN            — JWT Bearer token
  WEBCAKE_SESSION_ID       — Session ID
  WEBCAKE_SITE_ID          — ID site đích

Tuỳ chọn (set qua setup_env_vi.sh):
  WEBCAKE_KNOWLEDGE_DIR    — Thư mục chứa knowledge files
  WEBCAKE_KNOWLEDGE_REPO   — GitHub repo (owner/repo hoặc URL đầy đủ)
  WEBCAKE_KNOWLEDGE_TOKEN  — GitHub token (cho repo private)
```

# Changelog

[English](./CHANGELOG.md) · **Tiếng Việt**

Mọi thay đổi đáng chú ý của dự án được ghi lại trong file này.
Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [1.4.0] - 2026-06-23

### Changed
- Trình hướng dẫn tương tác của lệnh `install` nay hiển thị các lựa chọn được đánh số kèm màu ANSI và thông báo tóm tắt sau khi hoàn tất.
- Lệnh `install` nay hỗ trợ 11 IDE và môi trường agent (tăng từ 5), bổ sung Codex (định dạng TOML), Antigravity, Gemini CLI, Cline, Kiro và OpenCode bên cạnh các IDE hiện có là Claude Desktop, Claude Code, Cursor, Windsurf và VS Code; Claude Code được cấu hình qua `claude mcp add` khi CLI khả dụng; lệnh `uninstall` xóa entry server khỏi cả 11 config.
- Trang thành công hiển thị sau khi `login` hoàn tất được thiết kế lại với thẻ gradient, dấu tích có hiệu ứng động và hỗ trợ dark mode; trên macOS, CLI tự động đưa terminal hoặc IDE đang chạy lệnh trở lại foreground sau khi nhận được token.

### Fixed
- Trên Windows, lệnh `login` nay mở URL xác thực qua `cmd /c start` với cờ truyền tham số nguyên văn, tránh ký tự `&` trong `&state=` bị shell hiểu nhầm là phân tách lệnh.
- Callback server của lệnh `login` nay bỏ qua các yêu cầu đến đường dẫn khác `/callback` (như favicon) để chúng không vô tình ngắt luồng đăng nhập, đồng thời đóng các kết nối keep-alive đang mở khi tắt server để CLI thoát ngay lập tức thay vì bị treo.

## [1.3.0] - 2026-06-23

### Added
- Tool mới `create_site` tạo một site storefront hoàn toàn mới cho tài khoản hiện tại (kèm sản phẩm, danh mục và blog mẫu), tự động chuyển sang site vừa tạo (theo mặc định) và trả về preview URL; lỗi vượt hạn mức tài khoản miễn phí (giới hạn 4 site) được báo rõ ràng.

### Changed
- Các section được tạo bởi `new_section` nay sử dụng lưới 3 cột căn giữa của builder (lề co giãn · cột nội dung tối đa 1300px · lề co giãn), đúng với mô hình layout của builderx_spa; các phần tử con được đặt vào cột giữa (`columnStart:2`, `columnEnd:3`) thay vì bố cục một cột như trước đây.
- `get_build_guide` nay ghi lại đúng tên key breakpoint (`bp1`..`bp4`, thay cho các alias cũ `tablet` và `laptop`), mô hình lưới section 3 cột căn giữa, tên trường binding dữ liệu cụ thể (`product::product_price`, `cart_item::cart_item_price`, `order_item::product_name`, v.v.), cú pháp biến màu theme (`var(--color_NN)`), và quá trình tự động mở rộng `runtime` thành các key breakpoint mà `build_page` và `add_section` thực hiện khi lưu.

### Fixed
- `build_page` và `add_section` nay mở rộng `runtime.{style,config}` của mỗi node thành bốn key per-breakpoint (`bp1`, `bp2`, `bp3`, `bp4`) mà storefront renderer đọc, trước khi lưu trang; trước đây, các node chỉ được lưu với key `runtime` sẽ không có bất kỳ style nào vì renderer không có fallback về `runtime`.

## [1.2.0] - 2026-06-23

### Added
- `upload_images` thay thế `upload_image` với khả năng xử lý hàng loạt (1–20 nguồn mỗi lần gọi), tải song song, và chế độ `dry_run` cho phép xem trước những gì sẽ được xử lý mà không thực sự tải lên.
- `upload_images` chấp nhận đường dẫn file cục bộ (tuyệt đối, `~/`, `file://`) trong chế độ stdio, giúp người dùng tải ảnh trực tiếp từ máy của mình lên CDN của site.
- `build_page` nay nhận tham số `type` dạng enum (`main`, `store`, `member`, `blog`, `custom`, `error`, `maintain`) và tự động bật flag dữ liệu site tương ứng (`use_store`, `use_member`, `use_blog`, `use_error`, `use_maintain`) trước khi tạo trang, giúp các binding dữ liệu sản phẩm, khách hàng và blog hoạt động ngay từ lần tải đầu tiên.
- `get_build_guide` nay bổ sung mục "Page types & data sources" ghi lại enum loại trang, giá trị số `PAGE_TYPE`, flag dữ liệu cần bật, và tên binding cho từng loại trang đặc biệt.

### Changed
- Tham số `type` của `build_page` nay là enum có kiểu rõ ràng thay vì chuỗi tự do; phản hồi dry-run bổ sung các trường `page_type_num` và `will_enable_feature`, còn phản hồi thành công bổ sung `page_type` và `data_source`.
- Các gợi ý trong `ingest_html` và `ingest_url` đã được cập nhật từ `upload_image` sang `upload_images`.
- `set_image_alts` không còn tự động cache alt text được tạo ra giữa các lần chạy; trường `cached_alt` đã bị xóa khỏi kết quả của `list_image_alts`.

### Removed
- `upload_image` (số ít) đã được thay thế bởi tool hàng loạt `upload_images`.
- Các tool `get_cached_image_alts`, `save_image_alts_cache`, `list_image_alts_cache`, `sync_image_alts_to_mongo` và `sync_image_alts_from_mongo` đã bị xóa cùng với bộ nhớ cache alt ảnh cục bộ và lớp đồng bộ MongoDB.

## [1.1.4] - 2026-06-23

### Added
- Trang landing của lệnh `serve` nay có thêm mục "Có gì mới" hiển thị timeline lịch sử phiên bản được tải từ file `changelog.json` sinh ra lúc build (từ CHANGELOG.md và CHANGELOG.vi.md), phiên bản hiện tại được hiển thị dạng pill badge trên hero bar, và bổ sung liên kết điều hướng đến mục này trong thanh nav của trang.

## [1.1.3] - 2026-06-23

### Changed
- Trình hướng dẫn tương tác của lệnh `install` nay chạy theo 3 bước: chọn môi trường (`prod` / `staging` / `local`), xác thực, rồi cấu hình IDE.
- Trong bước xác thực khi chạy `install`, người dùng có thể chọn đăng nhập qua trình duyệt (được đề xuất — thông tin đăng nhập lưu vào file config cục bộ, không ghi vào khối biến môi trường của IDE) hoặc dán token + session ID thủ công như trước.
- Trang landing của lệnh `serve`, mục "Cách ②", nay hướng người dùng đến `webcake.io/mcp-remote-store` để lấy link kết nối cá nhân đã gắn sẵn mã đăng nhập thay vì hiển thị URL endpoint MCP tĩnh, đồng thời bổ sung cảnh báo bảo mật rằng link cá nhân này chứa thông tin đăng nhập.

## [1.1.2] - 2026-06-23

### Fixed
- Server không còn bị crash khi khởi động trong môi trường container được build bằng `npm ci --ignore-scripts`; module SQLite native `better-sqlite3` đã được thay thế bằng lưu trữ file JSON thuần túy (`config.json` và `image-alt-cache.json`) trong thư mục `~/.webcake-storefront-mcp/`.

### Changed
- Trang landing của lệnh `serve` đã được đổi bảng màu từ violet/indigo sang xanh ngọc (`#108B67`).
- Trang landing không còn hiển thị các huy hiệu shields.io (version npm, lượt tải, license), và chân trang không còn liên kết tới npm hoặc endpoint `/health`.
- Mô tả của các tool `get_cached_image_alts`, `sync_image_alts_to_mongo` và `sync_image_alts_from_mongo` nay ghi "local cache" thay vì "local SQLite cache" để phản ánh đúng loại lưu trữ đã thay đổi.

## [1.1.1] - 2026-06-23

### Added
- Kho lưu trữ token OAuth của lệnh `serve` nay hỗ trợ tùy chọn sử dụng Postgres (qua `DATABASE_URL`) để lưu token bền vững qua các lần khởi động lại và chia sẻ trạng thái giữa nhiều instance sau load balancer, đồng thời hỗ trợ Redis (qua `REDIS_URL`) để cache tra cứu access-token; cả hai đều tùy chọn và server tự động dùng in-memory nếu không cấu hình.
- Trang landing tại `/` của lệnh `serve` nay hỗ trợ nội dung song ngữ (Tiếng Việt và Tiếng Anh) có thể chọn qua tham số `?lang=en`.

### Changed
- Trang landing tại `/` được thiết kế lại với nội dung đơn giản hóa dành cho người dùng không chuyên về kỹ thuật và bảng màu violet/indigo mới.

## [1.1.0] - 2026-06-23

### Added
- Chế độ `serve` (remote Streamable-HTTP) nay tích hợp sẵn một Authorization Server OAuth 2.1 đầy đủ tại các endpoint `/authorize`, `/token`, `/revoke`, `/register` và `/.well-known/oauth-authorization-server`, cho phép Claude Connectors Directory xác thực qua luồng đồng ý PKCE trên trình duyệt mà không cần chia sẻ thông tin đăng nhập trước.
- Lệnh `serve` nay phục vụ trang landing marketing tại `/` (HTML cho trình duyệt và các crawler đã biết, JSON cho client lập trình) cùng favicon tại `/favicon.svg` và `/favicon.ico`.
- Trang Privacy Policy tự host tại `/privacy` (cũng là `/privacy-policy`) và trang Terms of Service tại `/terms` (cũng là `/tos`), phù hợp để đăng ký vào Claude Connectors Directory.
- Endpoint `/health` được thêm vào chế độ `serve` (trả về JSON cho các probe kiểm tra uptime, trả về HTML landing cho trình duyệt).

### Changed
- Các request đến `/mcp` không có thông tin xác thực trong chế độ `serve` nay nhận phản hồi `401 WWW-Authenticate` theo mặc định, kích hoạt luồng OAuth trên các client hỗ trợ như claude.ai; đặt `WEBCAKE_OAUTH=0` để tắt cơ chế này và giữ lại hành vi xác thực qua header/query-param như trước.
- URI chuyển hướng OAuth nay được xây dựng dựa trên các header `X-Forwarded-Proto` và `X-Forwarded-Host` khi có mặt, cho phép hoạt động đúng khi triển khai sau một reverse proxy.

## [1.0.3] - 2026-06-23

### Added
- Thêm giấy phép MIT (Copyright vuluu2k) vào package.

### Fixed
- Server không còn thoát khi khởi động nếu `WEBCAKE_API_URL` chưa được đặt; URL API base mặc định là preset `prod` và có thể ghi đè bằng `WEBCAKE_API_URL` hoặc `WEBCAKE_ENV`.

## [1.0.2] - 2026-06-23

### Changed
- Lệnh `install` không còn hỏi Site ID nữa; thay vào đó hỏi Session ID (`WEBCAKE_SESSION_ID`), vì site hoạt động được chọn tại runtime thông qua `list_my_sites` và `switch_site`.
- `WEBCAKE_SITE_ID` không còn bắt buộc khi khởi động; ở lần tương tác đầu tiên, server hướng dẫn AI gọi `list_my_sites` và `switch_site` nếu chưa có site nào được chọn, và lựa chọn sẽ được lưu lại cho các phiên tiếp theo.

## [1.0.1] - 2026-06-23

### Added
- Thêm các môi trường đặt sẵn có tên (`local`, `staging`, `prod`) có thể chọn qua cờ `--env` hoặc biến `WEBCAKE_ENV`, mặc định là `prod` nên không cần đặt `WEBCAKE_API_URL` thủ công nữa.
- Thêm preset môi trường `staging` với endpoint `api.staging.storecake.io` / `staging.webcake.io`.
- `publish_site` nay trả về trường `preview_url`: domain tuỳ chỉnh của site nếu đã cấu hình, ngược lại là URL theo subdomain (prod) hoặc theo đường dẫn (local/staging) tương ứng với môi trường.
- `login` nay tự động lưu `wsid` (session ID) cùng với bearer token, giúp `WEBCAKE_SESSION_ID` được điền sẵn sau khi kết nối.

### Changed
- Lệnh `login` nay mở trang handoff `/mcp-storefront` thay vì `/mcp-connect`.
- Endpoint API production được cập nhật từ `api.storecake.io` thành `api.storefront.webcake.io`; URL app cập nhật từ `builder.webcake.io` thành `webcake.io`.

### Removed
- Các tool quản lý knowledge `sync_knowledge`, `list_knowledge`, `get_knowledge`, `create_knowledge`, `update_knowledge` và `delete_knowledge` đã bị xoá.

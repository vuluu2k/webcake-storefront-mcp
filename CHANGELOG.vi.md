# Changelog

[English](./CHANGELOG.md) · **Tiếng Việt**

Mọi thay đổi đáng chú ý của dự án được ghi lại trong file này.
Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
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

# Changelog

[English](./CHANGELOG.md) · **Tiếng Việt**

Mọi thay đổi đáng chú ý của dự án được ghi lại trong file này.
Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
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

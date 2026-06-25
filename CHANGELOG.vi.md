# Changelog

[English](./CHANGELOG.md) · **Tiếng Việt**

Mọi thay đổi đáng chú ý của dự án được ghi lại trong file này.
Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [1.23.0] - 2026-06-25

### Added
- `get_build_guide` nay bổ sung công thức filter trang danh mục, giải thích cách các widget lọc trong sidebar (`checkbox-group`, `color-group`, `tags`, `two-point-range`, `radio-group`, sort `dropdown`) kết nối với `grid-product` thông qua `specials.filter_elements` và `specials.sync_tab` để truy vấn lại lưới sản phẩm khi người dùng chọn một tùy chọn.

### Changed
- `list_elements` nay tài liệu hóa bộ config kiểu dáng đầu vào dùng chung (`backgroundInput`, `placeholderColor`, `labelColor`, `textPadding`, `optionBorderColor`, `optionBorderWidth`, `optionBorderStyle`, `optionBorderRadius`) trên toàn bộ các kiểu trường đầu vào (`input`, `email`, `phone-number`, `text-area`, `password`, `select`, `checkbox`, `radio`, `address`, `otp-input`, `identity` và các kiểu khác), thay thế phạm vi tài liệu từng phần trước đây.
- `list_elements` nay tài liệu hóa `specials` phong phú hơn cho các trường đầu vào của form: `password`/`retype-password`/`current-password` bổ sung `showHidePassword`; `select` bổ sung `isRetrieve`; `checkbox` và `radio` bổ sung `options`, `defaultValue` và `icon_color`; `address` bổ sung `useNewAddress`, `isColumn` và các key placeholder tỉnh/huyện/xã; `postal-code` bổ sung regex và key số ký tự; `country` bổ sung `countries[]` và `defaultValue`; `input-date` bổ sung `field_connect_pos`; `otp-input` bổ sung `time_otp`; `rating-input` bổ sung SVG icon ngôi sao và specials màu sắc; `input-search` bổ sung search-modal, phạm vi tìm kiếm và cấu hình icon đầy đủ.
- `list_elements` nay tài liệu hóa các specials filter trang danh mục (`filter_elements`, `sync_tab`, `count`, `use_button_filter`) trên `checkbox-group`, `radio-group`, `dropdown`, `color-group`, `two-point-range` và `tags`, chú thích rõ vai trò của mỗi widget trong việc điều khiển `grid-product`.
- `list_elements` nay tài liệu hóa 15 kiểu phần tử trước đây chưa được ghi lại: `search-form`, `search-droppable`, `two-point-range` (bộ lọc khoảng giá dạng slider), `color-group` (bộ lọc màu sắc dạng swatch), `tags` (bộ lọc dạng chip), `auto-number` (animation đếm số), `agency` (danh sách chi nhánh store-locator), `user-point-log` (lịch sử điểm thưởng), `empty-product-layout`, `cart-items-empty`, `cart-droppable` (mini-cart drawer), `lesson-sidebar`, `lesson-items`, `next-lesson-droppable` và `list-lesson-droppable` (ứng dụng khóa học).
- `list_elements` nay tài liệu hóa `form` với ba giá trị `specials.type` bổ sung (`customer_data`, `reset_password`, `forgot_password`), `multiForms`/`formParent` cho các order form phân tách, `tabIndex` để gắn với panel tài khoản và `autoGetInfoCustomer`.
- `list_elements` nay tài liệu hóa đầy đủ hơn các phần tử điều hướng: `menu` bổ sung cấu hình icon-mode (`shapeType`, `url`, `mask`), `isPostList` và các key style hover/active; `menu-item` bổ sung `linkBlogCategory`, `linkCategoryTarget`, `link` tùy chỉnh và `isSync`; `submenu` và `menu-droppable` bổ sung cấu hình animation (`effect`, `timeAnim`); `member-bar` bổ sung nhãn login/signup, id popup (`login_popup`, `register_popup`) và cấu hình bố cục avatar; `member-dropdown` bổ sung `dropdown_position`; `language-menu` bổ sung `show_flag`, display `type` và cấu hình màu sắc đầy đủ.
- `list_elements` nay tài liệu hóa `tabs` với mảng định nghĩa `tabs[]`, `navMode`, `showNav`, `showBullet`, `showDivider` trong specials và `navPosition`/`alignNav`/`nav_display_style` trong config; `switch` bổ sung `defaultValue`, `backgroundSlider`, `colorRound` và `colorSlider`.

## [1.22.0] - 2026-06-25

### Added
- `list_bindings` nay trả về map `meta_keys` tài liệu hóa các combine-key liên kết dữ liệu được khai thác từ 34 template production — `name_style`, `attr_id`, `prefix_content`, `separator`, `value` (hiển thị tính toán từ hai nguồn), `number_of_line_title` và các key khác — kiểm soát cách một trường liên kết được hiển thị hoặc kết hợp bên trong một phần tử.
- Ba dataset liên kết mới: `agency` (thông tin chi nhánh store-locator: `name`, `phone_number`, `address`, `time`), `blog` (tiêu đề danh mục blog trên trang danh sách) và `search_result` (truy vấn tìm kiếm và sản phẩm khớp trên trang tìm kiếm).
- Dataset `product` nay bổ sung `discount_price_to_original_price` và tám trường course/LMS: `total_course`, `total_course_learning`, `course_member_quantity`, `course_total_time`, `course_video_quantity`, `lesson_name`, `lesson_description` và `video_lesson`.
- Dataset `cart_item` nay bổ sung `cart_surcharge_fee`, `discount_percent`, `discount_reward_point` và `total_price_all_promotions`.
- Dataset `order` nay bổ sung `order_promotion_coupon`; dataset `customer` nay bổ sung `succeed_order_count`.
- 21 event action trước đây bị `validate_page` gắn cờ là unknown nay đã được nhận diện: `search`, `open_quick_view`, `back_to_menu_parent`, `toggle_group`, `add_wishlist_product`, `wishlist_remove_item`, `close_search`, `close_cart_item`, `edit_cart_item`, `change_column_grid_prd`, `open_product_page`, `set_address_default`, `copy_promotion`, `use_reward_point`, `transform_x`, `transform_y`, `cursor`, `lightbox`, `change_avatar` và `open_preview_product_gallery`; số lượng event action được hỗ trợ tăng từ 37 lên 58.
- `get_build_guide` nay bổ sung mục "Composition recipes" mô tả các repeater tự render (`grid-product`, `slider-product`, `post-list`) so với các hàng dataset-cell được ghép thủ công (`cart-items`, `order-items`, `layout-dataset`, `promotions`), và pattern header dual-menu chuẩn (desktop `menu` nằm ngang + mobile `menu` dạng hamburger/collapse kèm `cart-icon`, `input-search`, `member-bar` và `language-menu`).

### Changed
- `list_elements` nay tài liệu hóa thêm hai giá trị `type` của `menu` — `collapse` và `grid` — và phần ghi chú mô tả pattern header dual-menu (hai phần tử `menu` riêng biệt cho desktop và mobile) phổ biến trong các template production thực tế.
- `open_popup`, `open_page`, `add_to_cart` và các hover action (`change_background`, `change_text_color`, `change_border_color`, `scale`) nay cung cấp thêm các trường optional (`apply_element`, `cursor`, `el_target_id`, `open_page_id`, `open_popup_id`, v.v.) được khai thác từ cách dùng trong template thực tế.
- Tài liệu binding trong `get_build_guide` nay bao gồm các combine-key (`name_style`, `prefix_content`, `value` cho node tính toán từ hai nguồn, `number_of_line_title`, `attr_id`) và hướng người dùng đến `list_bindings → meta_keys` để xem đầy đủ.

## [1.21.0] - 2026-06-25

### Changed
- Factory `grid-product` nay sử dụng các giá trị mặc định trung lập đa ngành (`image_ratio:"1/1"`, `gap_column`/`gap_row` 24, `products_per_load` 12) thay vì các giá trị trước đây vốn dành riêng cho ngành thời trang (`image_ratio:"4/5"`, gap 30/15, `products_per_load` 36, font size cố định 18 px); các caller của `build_page` và `new_section` cần chủ động đặt `image_ratio`, số cột và kích thước font phù hợp với thương hiệu mục tiêu.
- Factory `quantity-input` nay mặc định `specials.spinner:"hide-spin"`, khớp với pattern phổ quát được tìm thấy trong toàn bộ năm template production đã khảo sát; caller có thể ghi đè qua `opts.specials`.
- `list_elements` nay trả về tài liệu phong phú hơn cho `grid-product`, bao gồm toàn bộ các trường `specials` (`category_id`, `show_rating`, `load_rating`, `show_ribbon`, `load_brand`, `load_category`, `on_hover`, `randomDisplay`, `typeLinkCategory`, `plugins`) và các key màu sắc `config` bổ sung (`productNameColor`, `productNameHover`, `productPriceColor`, `productOriginalPriceColor`), kèm ghi chú rằng `image_ratio`, số cột và khoảng cách phụ thuộc vào ngành hàng.
- `list_elements` nay trả về tài liệu đầy đủ cho `product-gallery` (`specials.showNavigation`, `specials.on_hover`, `config.sizeThumbnail`, `config.image_ratio`), `quantity-input` (`specials.spinner`, `specials.showRightBtn`, `config.textColor`) và `attr` (bộ chọn biến thể — `specials.attrName`, `specials.autoAttrName`, `specials.attrPrimary`, `specials.layout`, `specials.defaultSelected`, `config.borderColorHover`).
- Mục PRODUCT GRID trong `get_build_guide` nay nêu rõ rằng cấu hình `grid-product` phụ thuộc vào ngành hàng (đã khảo sát thời trang/trẻ em/mỹ phẩm/thực phẩm/điện tử), tài liệu hóa dải giá trị có thể chỉnh cho `image_ratio` (4/5 thời trang, 2/3 trẻ em, 3/4 thực phẩm, 1/1 dạng vuông), `columns` (1–6) và `gap` (8–40), đồng thời bổ sung hướng dẫn sử dụng `attr (attrName:"auto")` cho bộ chọn biến thể và ghi nhận rằng `quantity-input` mặc định `spinner:"hide-spin"`.

## [1.20.0] - 2026-06-25

### Changed
- Header được tạo bởi `scaffold_global_sections` nay sử dụng phần tử `menu` với các phần tử con `menu-item` cho các liên kết điều hướng, khớp với cấu trúc template production thực tế; điều hướng của mỗi mục được nối qua `specials` (`linkType`, `linkPage`, `pageId` cho trang; `linkType:"custom"` + `link` cho URL) thay vì `events`, giúp các liên kết điều hướng hiển thị và hoạt động đúng trên storefront thực.

## [1.19.1] - 2026-06-25

### Fixed
- `create_site_from_template` nay tự động tạo slug an toàn cho URL từ tên site khi không có slug nào được cung cấp, khắc phục lỗi 400 mà backend trả về khi thiếu `slug`.
- Factory `grid-product` nay hợp nhất `opts.config` và `opts.specials` do caller cung cấp vào các giá trị mặc định thay vì bỏ qua chúng, giúp các caller `build_page` và `new_section` có thể ghi đè bất kỳ trường nào trên card.

### Changed
- Các factory phần tử builder cho `grid-product`, `cart-icon` và `product-gallery` nay đi kèm các giá trị mặc định thực từ designer template production (`image_ratio` `4/5`, `products_per_load` 36, `gap_column` 30 / `gap_row` 15, giá in đậm, bật `show_original_price` / `show_discount_on_price`, SVG túi mặc định cho `cart-icon`, kích thước thumbnail cho `product-gallery`), giúp các trang được tạo bởi `build_page` và `new_section` đạt chất lượng template production mà không cần cấu hình thêm.
- Template trang checkout do `scaffold_store_pages` tạo ra nay dùng các config key thực của `form_order` (`backgroundInput`, `placeholderColor`, `labelColor`, `borderColor`, `borderRadius`), bổ sung trường email và thêm success event để chuyển hướng sang trang Thank-you.
- `get_build_guide` nay tài liệu hóa đúng các config key của `grid-product` (thay thế các key không tồn tại `cardBorderRadius` / `cardBoxShadow`), pattern điều hướng qua SPECIALS của `menu-item` (thay vì `events` trên các phần tử thông thường) và công thức success-redirect cho form.
- `list_elements` nay trả về tài liệu phong phú hơn cho `grid-product`, `cart-icon`, `menu`, `menu-item`, `form`, `cart-items` và `order-items`, với các config key thực và ghi chú hành vi được khai thác từ template production.

## [1.19.0] - 2026-06-25

### Added
- Tool mới `scaffold_global_sections` tạo Header và Footer toàn cục đã thiết kế sẵn trong một lần gọi — logo, liên kết điều hướng, icon giỏ hàng, nút CTA và footer có thương hiệu kèm thông tin liên hệ và cột liên kết — rồi nhúng cả hai vào mọi trang trên site; tự động bỏ qua slot đã có global section (truyền `force=true` để ghi đè), hỗ trợ `dry_run=true` (mặc định) để xem trước các trang bị ảnh hưởng trước khi lưu.
- `scaffold_store_pages` nay chấp nhận tham số `style` (`"rich"` mặc định hoặc `"minimal"`) và tuỳ chọn `palette`; `style:"rich"` tạo ra trang đã thiết kế đầy đủ và nhận biết bảng màu cho mọi loại trang cửa hàng — banner + breadcrumb + lưới sản phẩm có style (Danh mục), bố cục hai cột gallery/thông tin với giá, số lượng, thêm vào giỏ, trust badge và sản phẩm liên quan (Chi tiết sản phẩm), bố cục hai cột cho giỏ hàng và thanh toán (Cart/Checkout), và trang cảm ơn căn giữa (Thank-you) — với điều hướng được tự động nối giữa các trang (add-to-cart→cart, cart→checkout, thank-you→home).

### Changed
- `get_build_guide` nay mô tả quy trình build thông minh đã cập nhật: `scaffold_store_pages` mặc định tạo trang thiết kế đầy đủ và `scaffold_global_sections` bổ sung chrome Header/Footer đã thiết kế trong một lần gọi; `style:"minimal"` được tài liệu hoá là tuỳ chọn opt-out để tự build thủ công.
- `recommended_flow` trong `get_intake_guide` nay tham chiếu `scaffold_store_pages (style:"rich")` và `scaffold_global_sections` trong trình tự build site được khuyến nghị.

### Fixed
- `list_products` không còn trả về lỗi 400 khi gọi mà không truyền rõ tham số `page` hoặc `limit`; tool nay mặc định `page` là 1 và `limit` là 50, đồng thời loại bỏ các query key undefined hoặc rỗng trước khi gửi request.

## [1.18.1] - 2026-06-25

### Changed
- `get_build_guide` nay bổ sung ba mục mới: "Build the WHOLE storefront" — công thức từng trang để nâng cấp danh mục, trang chi tiết sản phẩm, giỏ hàng, checkout và trang cảm ơn lên cùng tiêu chuẩn thiết kế với trang chủ; "Global Header & Footer" — hướng dẫn quy trình `create_global_section` (type `"header"`/`"footer"`, quy tắc thứ tự — tạo nội dung trang trước, tạo global sau — và cách re-embed sau khi `update_page_source`/`build_page` ghi đè); và "Popups" — quy trình đầy đủ từ việc build popup bằng `new_element("popup")` và `specials`, lưu qua `create_global_source` với `component:"popup"`, đến kích hoạt bằng event `open_popup`/`close_popup`.
- Server instructions nay hướng dẫn agent build toàn bộ site (không chỉ trang chủ), dùng `create_global_section` để tạo header và footer nhất quán trên mọi trang, và xây dựng newsletter hoặc ưu đãi khuyến mãi dưới dạng popup global source thay vì section inline — trỏ đến `get_build_guide` để xem công thức từng trang và chi tiết quy trình; `scaffold_store_pages` cũng được bổ sung thông báo trong mô tả tool rằng các trang được tạo ra chỉ là bản khởi điểm tối giản (heading + binding element) cần được hoàn thiện và bổ sung global header/footer trước khi coi site là hoàn chỉnh.

## [1.18.0] - 2026-06-25

### Added
- Tool mới `get_intake_guide` trả về bảng câu hỏi từng bước và quy trình build được khuyến nghị (create_site → sản phẩm → build_page → global sections → publish_site) để sử dụng trước khi bắt đầu tạo một site hoặc trang mới; server instructions nay hướng dẫn agent gọi tool này, thu thập brief, tóm tắt lại kế hoạch và chờ xác nhận trước khi bắt đầu build.

### Fixed
- `publish_site` nay tự động gọi routine `rebuildSiteCss` mới trước khi xuất bản, phát lại pipeline `/save` của builder để tái tạo CSS đã biên dịch cho mọi trang; trước đây các site chỉ được chỉnh sửa qua MCP sẽ được publish với CSS cũ hoặc trống, khiến storefront hiển thị thiếu style.
- `stackChildren` và `rowChildren` nay gán `constraintX: ["left","right"]` (stretch) cho các loại component chiếm toàn chiều rộng (`grid-product`, `slider-product`, `cart-items`, `order-items`, `post-list`, `grid-category`, `grid-blog`, `form` và các repeater liên quan) thay vì mặc định `["centerLeft"]` (center), giúp lưới sản phẩm và các repeater không còn bị thu gọn xuống một cột trên storefront.
- `create_product` nay luôn gửi `product_attributes: []` trong body request ngay cả với sản phẩm không có thuộc tính, tránh lỗi 500 trên endpoint product-attributes của storefront đối với sản phẩm không có attribute.

## [1.17.1] - 2026-06-25

### Changed
- `get_http_function` và `get_site_custom_code` nay bổ sung mục "File / media uploads" vào hướng dẫn HTTP function nhúng sẵn, tài liệu hóa ba cách tải file từ bên trong một function để nhận về CDN URL cố định: tự động inject URL cho file POST dạng multipart/form-data, `@webcake/media` `upload()` để rehost một URL từ xa hoặc tải lên bytes base64, và gọi trực tiếp admin API.

## [1.17.0] - 2026-06-24

### Added
- Tool mới `new_row` tạo một container đa cột responsive với các phần tử con được đặt nằm ngang cạnh nhau (từ trái sang phải); hàng tự động thu gọn xuống 2 cột trên tablet và 1 cột trên mobile, có thể tinh chỉnh qua `column_gap`, `row_gap`, `col_widths` và `collapse`.
- Spec phần tử con truyền vào `new_section` và `build_page` nay chấp nhận trường `layout`; đặt `layout:"row"` trên một container spec để các phần tử con nằm ngang thay vì xếp chồng dọc, với các tùy chọn `columnGap`, `rowGap`, `colWidths` và `collapse` để kiểm soát responsive chi tiết.

### Changed
- `get_build_guide` nay bổ sung mục "Multi-column rows" hướng dẫn cách dùng tool `new_row` và pattern `layout:"row"` trên container spec, kèm ví dụ thực tế cho thẻ tính năng, ô danh mục, cột footer và bố cục hero hai cột.

## [1.16.0] - 2026-06-24

### Added
- Tool mới `uninstall_app`, `update_app` và `update_app_review` hoàn thiện vòng đời ứng dụng: gỡ cài đặt theo subscription id, cập nhật config/status của app, và cập nhật `shop_info` cùng cài đặt auto-approve riêng cho app đánh giá sản phẩm.
- Tool mới cho đánh giá sản phẩm: `list_reviews`, `get_review`, `get_review_products`, `create_or_update_review` (tạo đánh giá mới, chỉnh sửa đánh giá có sẵn hoặc đăng phản hồi của shop qua `is_shop: true`), `moderate_reviews` (phê duyệt hoặc ẩn hàng loạt bằng `permission`) và `remove_reviews`.
- Tool mới cho đặt lịch hẹn, bao gồm lịch booking (`list_appointment_calendars`, `create_appointment_calendar`, `update_appointment_calendar`, `delete_appointment_calendars`, `duplicate_appointment_calendars`), lịch hẹn đã đặt (`list_appointments`), địa điểm (`list_appointment_addresses`, `create_appointment_address`, `update_appointment_address`, `delete_appointment_addresses`), loại dịch vụ (`list_appointment_classifies`, `create_appointment_classify`, `update_appointment_classify`, `delete_appointment_classifies`) và nhân viên phụ trách (`list_appointment_employees`, `create_appointment_employee`, `update_appointment_employee`, `delete_appointment_employees`).
- Tool mới cho affiliate: `get_affiliate_programs`, `get_affiliate_statistic`, `list_affiliate_products`, `list_affiliate_orders`, `list_affiliate_accounts`, `list_affiliate_payouts`, `update_affiliate_order_program`, `update_affiliate_product_program`, `upsert_affiliate_product`, `delete_affiliate_products`, `update_affiliate_payout_status`, `delete_affiliate_accounts` và `update_affiliate_account`.
- Tool mới cho danh mục mở rộng: nhãn hiệu (`list_product_brands`, `upsert_product_brand`), nhà cung cấp (`list_product_suppliers`, `upsert_product_supplier`), tag sản phẩm (`list_product_tags`, `upsert_product_tag`), ribbon/nhãn sale (`list_ribbons`, `upsert_ribbon`), chất liệu (`list_materials`, `upsert_material`), chi tiết biến thể (`get_variation`), đơn vị đo lường (`get_product_measurement`, `update_product_measurement`), chặn số điện thoại (`list_blocked_phones`, `block_phone_customers`, `unblock_all_phone_customers`), cấu hình giá liên hệ (`get_price_contact`, `update_price_contact`) và lấy thông tin một danh mục (`get_category`).
- Tool mới cho cấu hình site: tên miền tùy chỉnh (`list_domains`, `add_domain`, `update_domain`, `verify_domain`, `delete_domain`, `check_domain`), redirect SEO 301 (`list_redirect_urls`, `create_redirect_url`, `update_redirect_url`, `delete_redirect_urls`), cấu hình vận chuyển (`get_shipping`, `update_shipping`), UTM links (`list_site_utms`, `create_site_utm`, `update_site_utm`, `delete_site_utms`), nhật ký hoạt động (`list_entity_logs`), bộ lọc bảng đã lưu (`list_saved_filters`, `create_saved_filter`, `update_saved_filter`, `delete_saved_filter`), cài đặt chung và định danh site (`update_site_settings`, `rename_site`, `update_site_slug`), font chữ (`list_fonts`, `remove_font`, `list_font_groups`, `create_font_group`, `remove_font_group`), và API key / lịch sử xuất bản (`list_api_keys`, `list_publish_histories`).
- Tool mới cho marketing và CRM: mẫu email giao dịch (`get_email_templates`, `save_email_templates`), liên hệ từ form (`list_contacts`, `create_contact`, `delete_contacts`), người đăng ký newsletter (`list_subscribers`, `create_subscriber`, `delete_subscribers`), tag khách hàng (`list_customer_tags`, `upsert_customer_tag`, `assign_customer_tags`), thành viên nhóm (`list_employees`, `invite_employee`, `update_employee_permissions`, `delete_employees`), lời mời vào site (`list_invitations`, `accept_invitation`, `refuse_invitation`), ảnh chụp phân tích (`get_insight_today`, `get_insight`) và thông báo tài khoản (`list_notifications`, `mark_notification_read`).
- Tool mới cho đa ngôn ngữ: `add_site_languages` (đặt danh sách đầy đủ các ngôn ngữ được kích hoạt), `set_default_language`, `list_translations` và `save_translations` (hỗ trợ tất cả loại tài nguyên: product, combo_product, product_attribute, category, ribbon, article, article_category, promotion, page_name, site, notification) và `auto_translate` (dịch tự động một đối tượng JSON key→text giữa hai mã ngôn ngữ).
- Tool mới cho thư viện media và PWA: `list_media_folders`, `list_media_content`, `list_media_all`, `get_media_capacity`, `upload_media_base64` (tải ảnh từ data URI base64 và nhận về CDN URL), `update_media_folder`, `update_media_content`, `empty_media_trash`, `get_pwa` và `update_pwa`.
- Tool mới cho ứng dụng nâng cao: Product Design (`get_device_templates`, `create_products_from_device_templates`), Personal Product Design/PPD (`list_ppd`, `upsert_ppd`, `remove_ppd`, `get_ppd_variation_template`) và Course app (`list_courses`, `get_course`, `create_course`, `update_course`, `delete_course`, `delete_courses`, `get_course_members`).
- Tool mới cho kênh bán hàng: sitemap (`sync_sitemap`, `rebuild_sitemap`), feed sản phẩm cho Google Shopping, Facebook và các kênh khác (`list_partner_feeds`, `create_partner_feed`, `update_partner_feed`, `delete_partner_feeds`, `list_partner_feed_products`, `sync_partner_feed`) và đọc bản ghi Google Merchant (`list_google_merchants`).
- Tool mới `list_tool_groups` liệt kê tất cả 15 nhóm công cụ kèm số lượng tool trong mỗi nhóm và trạng thái tải (native hoặc on-demand).
- Tool mới `search_tools` tìm kiếm tool theo từ khóa tiếng Anh trên toàn bộ danh mục 271 tool, trả về tên, nhóm, mô tả và JSON input schema; hoạt động với cả các nhóm không được tải natively.
- Tool mới `invoke_tool` thực thi bất kỳ WebCake tool nào theo tên chính xác với đối số được xác thực bằng zod, cho phép gọi các nhóm on-demand mà không cần nạp toàn bộ danh mục vào context.

### Changed
- Tool nay tải theo mô hình progressive disclosure: bốn nhóm core (session, page building, store, content, ~123 tool) đăng ký natively khi khởi động; 11 nhóm còn lại (marketing, i18n, media, appointment, affiliate, reviews, site_config, catalog, apps_advanced, channels, automation) là on-demand và được truy cập qua `search_tools` + `invoke_tool`, tránh việc tất cả 271 schema tool tiêu tốn context budget ngay từ đầu.
- Một capability-map index liệt kê từng nhóm tool và trạng thái tải ([loaded] hoặc [on-demand]) được chèn vào system prompt để model luôn biết những miền nào tồn tại và khi nào cần gọi `search_tools`.
- Biến môi trường `WEBCAKE_TOOLS` (cùng với `ServerOptions.tools`, header `x-webcake-tools` hoặc query parameter `?tools=` theo từng request) giờ kiểm soát nhóm nào tải natively; các dạng chấp nhận: `all`, danh sách nhóm ngăn cách bằng dấu phẩy như `core,marketing`, hoặc dạng delta như `+i18n,-store`.

## [1.15.1] - 2026-06-24

### Fixed
- `update_page_element`, `update_page_elements`, `update_global_source_element` và `update_global_source_elements` nay chuẩn hóa mảng `events` và `bindings` khi cập nhật, đảm bảo mỗi entry có `id` và `eventName` hợp lệ; trước đây event được lưu mà không có `eventName` nên storefront renderer không bao giờ kích hoạt chúng.
- Quá trình chuẩn hóa event nay áp dụng `eventName` mặc định đúng theo loại phần tử trên cả hai đường dẫn tạo mới và cập nhật, phản chiếu chính xác hành vi của builder editor: `form→success`, `swiper→tab`, `popup→hide`, `input-search→onenter`, `submit-button→hover`; các loại phần tử khác mặc định theo trigger của action hoặc `click`.
- `normalizeBindings` nay chấp nhận entry dạng chuỗi `"name::field"` và chuyển đổi thành đối tượng binding đầy đủ, tránh trường hợp binding bị bỏ qua khi caller truyền vào theo ký pháp shorthand target.

## [1.15.0] - 2026-06-24

### Added
- Tool mới `get_global_section` trả về cây phần tử dạng compact của một global section (Header/Footer/block), liệt kê id, type, text, class, binding và event của từng phần tử với số token ít hơn 3–5 lần so với JSON thô; truyền `raw=true` để lấy toàn bộ cây qua large-result cache.
- Tool mới `search_global_section_elements` tìm kiếm và lọc các phần tử bên trong một global section theo type, id substring, custom class, nội dung text, hoặc sự hiện diện của binding/event, mà không cần tải toàn bộ cây phần tử.
- Tool mới `get_global_section_element` trả về toàn bộ chi tiết (style, config, specials, events, bindings, responsive bp1..bp4, children ids) của một phần tử đơn lẻ bên trong một global section.
- Tool mới `create_global_section` tạo một global section tái sử dụng (Header, Footer hoặc block dùng chung) thông qua pipeline `/save` của builder và đồng thời nhúng cùng một section node vào page source của các trang để nó render xuyên suốt toàn site; hỗ trợ `dry_run=true` (mặc định) để xem trước các trang sẽ thay đổi trước khi thực hiện.
- Tool mới `delete_global_section` xóa bản ghi global section và loại bỏ node của nó khỏi page source của mọi trang trong một lần lưu duy nhất; hỗ trợ `dry_run=true` (mặc định) để xem trước các trang bị ảnh hưởng.
- Tool mới `read_cached_result` đọc từng phần (phân trang) của một kết quả lớn được lưu trong session cache bởi một tool khác, cho phép truy cập tuần tự các payload quá lớn để trả về trong một lần gọi tool.
- Tool mới `list_cached_results` liệt kê tất cả kết quả lớn hiện đang được lưu trong session cache, hiển thị cache_id, nhãn, kích thước tính bằng ký tự và thời gian tồn tại.

### Changed
- `list_global_sections` nay trả về bản tóm tắt gọn nhẹ (id, slot, số phần tử, histogram type, custom class, ~1 KB) thay vì toàn bộ cây JSON nhiều megabyte, tránh tràn token trên các site thực; dùng `get_global_section` để xem chi tiết cây phần tử của một section cụ thể.

## [1.14.0] - 2026-06-24

### Added
- Tool mới `list_events` trả về danh mục sự kiện tương tác đầy đủ: 9 trigger (click, hover, submit, success, ...) và 38 action (open_page, scroll_to, toggle, open_popup, add_to_cart, buy_now, phone_call, open_link, ...) kèm theo các trường bổ sung chính xác mà mỗi action yêu cầu; truyền sự kiện vào `new_element` hoặc `new_section` qua `opts.events`.
- Tool mới `list_bindings` trả về danh mục data binding đầy đủ: 14 dataset (product, cart_item, order, order_item, post, category, customer, customer_address, ...) với tên trường `target` chính xác, loại trang `type` mà mỗi dataset yêu cầu, và cách các phần tử con trong repeater (grid-product, cart-items, post-list, ...) tự động resolve binding theo từng item; truyền binding vào `new_element` qua `opts.bindings`.

### Changed
- `new_element` và `new_section` nay tự động gắn và chuẩn hóa `opts.bindings` và `opts.events` lên node được trả về, tự động sinh giá trị `id` hợp lệ và suy ra `name`/`eventName` — người dùng không còn cần tự đặt id bằng tay.
- `validate_page` nay kiểm tra mảng `events` và `bindings` của từng node dựa trên danh mục chuẩn, báo cảnh báo khi gặp trigger không xác định, action không xác định, thiếu các trường bắt buộc của action, target sự kiện nội bộ bị dangling (`toggle_id`, `scroll_to_id`, `change_tab_id`, `target_id`) và binding target không được nhận ra.
- `get_build_guide` nay bổ sung mục Events đầy đủ với tài liệu về trigger, các action phổ biến cùng trường bắt buộc và ví dụ code dùng `add_to_cart`; phần bindings được mở rộng với các quy tắc ngữ cảnh repeater (cách `grid-product → product`, `cart-items → cart_item` và `post-list → post` resolve dữ liệu theo từng item).
- `get_element` nay bổ sung gợi ý gọi `list_events` và `list_bindings` cùng với các gợi ý layout hiện có.

## [1.13.0] - 2026-06-24

### Added
- Tool mới `restore_file_version` khôi phục CMS file về một phiên bản đã lưu chỉ trong một bước: đọc nội dung phiên bản được chọn (qua `get_file_versions`) rồi ghi lại bằng `update_cms_file`; bỏ qua `version_id` để khôi phục về snapshot gần nhất, hoàn thiện vòng lặp versioning save/list/restore.

### Changed
- Mô tả của `get_file_versions` nay đề cập đến `restore_file_version` như một lựa chọn thực hiện trong một bước, thay thế cho cách thủ công truyền nội dung đã lưu vào `update_cms_file` hoặc `update_http_function`.

## [1.12.1] - 2026-06-24

### Fixed
- `save_file_version` và `get_file_versions` đều gửi tham số dưới key `cms_file_id`, trong khi backend đọc `file_id`; các phiên bản được lưu mà không liên kết với file nào và lịch sử version luôn trả về rỗng.

### Changed
- Mô tả của `get_file_versions` nay ghi rõ rằng mỗi version trả về bao gồm toàn bộ nội dung đã lưu, đồng thời hướng dẫn cách khôi phục phiên bản cũ bằng cách truyền nội dung đó vào `update_http_function` (với file HTTP function) hoặc `update_cms_file`.

## [1.12.0] - 2026-06-24

### Added
- Tool mới `update_product` cập nhật `name`, `description`, `images`, `category_ids`, cờ `is_published` hoặc `variations` (giá/tồn kho/SKU theo từng biến thể) của sản phẩm hiện có; chỉ cần truyền các trường cần thay đổi cùng với `product_id`.
- Tool mới `set_product_published` phát hành hoặc ẩn một hoặc nhiều sản phẩm theo `product_ids` trong một lần gọi duy nhất, không cần thực hiện `update_product` đầy đủ.
- Tool mới `delete_product` xoá một hoặc nhiều sản phẩm theo `product_ids`.
- Tool mới `update_product_category` cập nhật `name`, `image`, `description` hoặc trạng thái hiển thị (cờ `hidden`) của danh mục sản phẩm theo `id`.
- Tool mới `delete_product_category` xoá một hoặc nhiều danh mục sản phẩm theo `ids`.

## [1.11.1] - 2026-06-24

### Fixed
- `create_site_from_template` nay gọi đúng API `import_store_to_theme` thay vì endpoint nhân bản site thông thường, giúp clone đầy đủ các trang, global section, giỏ hàng, popup, style và font của template vào site mới.

### Changed
- `create_site_from_template` nay chỉ nhận `theme_id` làm định danh template duy nhất; tham số `template_site_id` đã bị xoá — truyền thẳng `theme_id` trả về từ `semantic_search_themes` hoặc `list_template_themes`.
- Kết quả của `semantic_search_themes` và `list_template_themes` không còn trả về trường `template_site_id` vốn chỉ được dùng để truyền vào tham số đã xoá.

## [1.11.0] - 2026-06-24

### Added
- Tool mới `create_site_from_template` nhân bản một template marketplace (toàn bộ trang, page-source và cài đặt) thành một site mới thuộc tài khoản hiện tại, tự động chuyển sang site đó và trả về preview URL; nhận `theme_id` (từ `semantic_search_themes` / `list_template_themes`) hoặc `template_site_id` trực tiếp, cùng `slug` tùy chọn và cờ `switch_to` (mặc định `true`).
- Kết quả của `semantic_search_themes` và `list_template_themes` nay bổ sung trường `template_site_id` chứa id site nguồn của template, và response nay có thêm trường `hint` cấp cao hướng dẫn agent gọi `create_site_from_template` sau khi chọn được theme.

## [1.10.0] - 2026-06-24

### Added
- Tool mới `scaffold_store_pages` tạo các trang storefront tiêu chuẩn (Category, Product, Cart, Checkout, Thank-you) để các liên kết điều hướng không bị 404; tuỳ chọn `include_member` và `include_blog` bổ sung thêm các trang login/register/profile và blog/post; các trang đã tồn tại sẽ bị bỏ qua; `dry_run=true` (mặc định) xem trước những gì sẽ được tạo mà không thực hiện thay đổi nào.

### Changed
- Các section được tạo bởi `new_section` nay nhận padding dọc mặc định (56 px trên và dưới) và các phần tử con xếp chồng có `rowGap` mặc định 16 px để bố cục thoáng hơn thay vì các phần tử bị dồn sát nhau.
- `get_build_guide` nay bổ sung một chương trình hướng dẫn "Make it look DESIGNED" bao gồm: thêm padding và màu nền xen kẽ cho section, nhịp điệu khoảng cách, phân cấp typography, yêu cầu bắt buộc đặt màu cho button (`background` và `color` phải được khai báo rõ ràng), bố cục hero với hình nền, các config key cho card product-grid (`cardBorderRadius`, `cardBoxShadow`, `productNameColor`, `productPriceColor`) và cách dùng màu accent nhất quán qua biến theme `var(--color_NN)`.

## [1.9.0] - 2026-06-24

### Added
- `search_images` nay nhận thêm tham số `upload` (mặc định `true`) để tự động tải từng kết quả Pexels lên WebCake CDN và bổ sung trường `cdn_url` vào mỗi ảnh, sẵn sàng dùng trực tiếp trong `runtime.config.src` hoặc ảnh sản phẩm; truyền `upload:false` để chỉ duyệt URL Pexels thuần mà không tải lên.
- Upload ảnh lên CDN nay được cache theo từng site, giúp việc tải cùng một URL hoặc đường dẫn file lần thứ hai trả về URL CDN đã lưu ngay lập tức; trong chế độ `serve`, cache được lưu trên Redis (dùng chung giữa các instance, tồn tại qua các lần redeploy), với cơ chế tự động fallback về file JSON cục bộ trong chế độ stdio/npx.

### Changed
- `search_images` nay mặc định tải kết quả lên WebCake CDN vì storefront chỉ cho phép hiển thị ảnh từ các domain được whitelist và URL Pexels thuần sẽ không render trên trang; response nay gồm trường `uploaded_to_cdn` và trường `note` hướng dẫn URL nào nên dùng.
- `get_build_guide` nay ghi rõ rằng `runtime.config.src` của các element ảnh phải là URL WebCake CDN, vì URL từ Pexels hoặc nguồn ngoài khác không nằm trong danh sách whitelist và sẽ không hiển thị trên storefront.

## [1.8.0] - 2026-06-23

### Added
- Tool mới `list_automations` trả về `id`, `name`, `status` và thông tin trigger của từng automation, giúp agent tìm được `automation_id` cần truyền vào `send_mail` hoặc vào `sendMail` bên trong HTTP function.
- Tool mới `create_automation` tạo một automation cho site với `name`, `status` và `rule` (map gồm trigger + actions), đồng thời tự động cài đặt ứng dụng Automation nếu chưa có trên site.
- Tool mới `update_automation` cập nhật bất kỳ tổ hợp nào trong các trường `name`, `description`, `status` hoặc `rule` của một automation theo `id`.
- Tool mới `delete_automation` xoá một hoặc nhiều automation theo danh sách `id`.
- Tool mới `install_app` đăng ký một ứng dụng theo tên (ví dụ `automation`, `send_email`, `cms`) lên site hiện tại và có tính idempotent — trả về ngay nếu ứng dụng đó đã được cài.

### Changed
- `send_mail` nay sử dụng đúng contract `{ automation_id, data }`; các tham số cũ `to` / `subject` / `body` được thay bằng `automation_id` (UUID lấy từ `list_automations`) và đối tượng `data` truyền vào template email.
- `list_apps` nay trả về danh sách `apps` đã chuẩn hoá, bao gồm trường `type_name` dạng chuỗi bên cạnh mã số `type`, kèm thêm bản đồ tham chiếu `app_types` trong response.
- `get_app` nay chấp nhận kiểu ứng dụng dưới dạng mã số hoặc chuỗi tên (ví dụ `"automation"`).
- Hướng dẫn HTTP function nhúng trong response của `get_http_function` và `get_site_custom_code` được mở rộng đáng kể: hình dạng đầy đủ của đối số `request` được tài liệu hoá, mỗi module `@webcake/*` nay hiển thị chính xác endpoint backend và các trường chấp nhận, các global và giới hạn của sandbox được liệt kê, và một ví dụ function đầy đủ từ đầu đến cuối được bổ sung.

## [1.7.0] - 2026-06-23

### Changed
- Trang web guide (phục vụ qua lệnh `serve`) được viết lại để làm nổi bật việc xây dựng toàn bộ cửa hàng: hero, meta description, thư viện "Bạn dựng được gì", ví dụ prompt và mô tả nhóm công cụ sản phẩm giờ đây nhấn mạnh việc tạo sản phẩm, danh mục, trang bán hàng và bài viết có ảnh — thay thế nội dung trước đây chỉ tập trung vào tạo một trang đơn lẻ.
- Giao diện nền của web guide được chuyển sang bảng màu teal/neutral (thay thế tím/lavender), dark mode được làm đậm hơn, body nay dùng gradient dọc tinh tế, bổ sung lớp lưới aurora teal, texture lưới mờ và blob hoạt hình thứ ba để tăng chiều sâu thị giác.

## [1.6.0] - 2026-06-23

### Added
- `get_element` nay trả về trường `attributes` chứa tài liệu tham chiếu theo từng loại element, bao gồm các key có ý nghĩa của `specials`, `config`, `events` và `bindings` — được thu thập từ 329 trang thực đã publish, giá trị mặc định của factory và các trait component của builder — giúp agent biết chính xác cần đặt key nào trước khi tạo hoặc chỉnh sửa một element.

## [1.5.1] - 2026-06-23

### Fixed
- `build_page` nay truyền `source` trang đã hoàn thiện vào lời gọi `create_page` ban đầu (bắt buộc bởi backend), sau đó đặt `slug` và `is_homepage` qua một lời gọi `update_page` tiếp theo; bước `updatePageSource` riêng biệt bị lỗi trước đây đã được loại bỏ.
- `create_product` nay luôn gửi `categories` và `ribbons` dưới dạng mảng, tránh lỗi 500 từ backend khi một trong hai trường là nil; id sản phẩm mới nay được phân tích chính xác từ `res.product.id`.
- `publish_site` nay lấy cài đặt site hiện tại trước khi publish và gửi chúng dưới dạng chuỗi JSON, tránh lỗi 422/500 từng làm mất toàn bộ settings (vô hiệu hoá `use_store`, `use_blog` và các flag tương tự) sau mỗi lần publish.

## [1.5.0] - 2026-06-23

### Added
- Tool mới `create_product` tạo sản phẩm cho storefront (đơn giản với tên + giá, hoặc nâng cao với `attributes` và `variations` theo từng SKU); nhận URL ảnh đã lưu trữ và `category_ids` để các binding `grid-product` / `slider-product` có hàng hoá thực để hiển thị.
- Tool mới `create_product_category` tạo danh mục sản phẩm và trả về `category_id` mới để truyền vào `create_product`.
- Tool mới `create_blog_category` tạo danh mục bài viết/blog và trả về `category_id` mới để truyền vào `create_article`.

### Changed
- `create_article` được viết lại để sử dụng command pipeline của dashboard: `category_ids` (mảng) thay thế `category_id`, các tham số `slug` / `tags` / `is_hidden` bị xoá, tất cả trường ngoài `name` là tuỳ chọn, và backend tự sinh id cùng slug cho bài viết.
- Hướng dẫn server nay ghi lại luồng khuyến nghị để điền dữ liệu cho một site mới: `create_site` → `create_product_category` / `create_blog_category` → `create_product` / `create_article` → `build_page` → `publish_site`.

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

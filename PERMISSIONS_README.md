# Hướng dẫn chi tiết Quyền API Meta (Facebook & Instagram) trong Social Desk

Tài liệu này giải thích chi tiết mục đích, cơ chế hoạt động, phân loại của từng quyền (scopes) trong Meta Graph API, nguyên nhân quyền `pages_manage_engagement` bị Facebook hạn chế/cấm, cùng các giải pháp thay thế tối ưu trong Social Desk.

---

## 1. Bảng tra cứu toàn bộ Quyền API (Scopes)

### A. Quyền dành cho Facebook Fanpage

| Tên quyền (Scope) | Phân loại | Mục đích & Chức năng trong Social Desk | Trạng thái & Khả năng cấp |
| :--- | :---: | :--- | :--- |
| `pages_show_list` | **Cơ bản** | Lấy danh sách tất cả các Fanpage mà tài khoản Facebook đang làm Quản trị viên (Admin) hoặc Biên tập viên. | ✅ Dễ xin, khả dụng cho mọi App. |
| `pages_read_engagement` | **Cơ bản / Phổ biến** | Đọc danh sách bài viết, số lượt thích (likes), thả tim, chia sẻ, và nội dung các bình luận trên Fanpage. Phục vụ tab **Bình luận** và **Phân tích chỉ số**. | ✅ Khả dụng, không bị hạn chế, khuyên dùng. |
| `pages_manage_posts` | **Xuất bản** | Cho phép Social Desk đăng bài viết bán hàng (kèm văn bản, nhiều ảnh sản phẩm) trực tiếp lên Fanpage trong 1-2 giây qua Graph API. | ✅ Khả dụng với Page Access Token. |
| `pages_messaging` | **Tin nhắn** | Đọc cuộc trò chuyện và gửi/nhận tin nhắn trực tiếp với khách hàng trên Fanpage Messenger trong tab **Tin nhắn**. | ✅ Khả dụng cho Fanpage. |
| `pages_manage_metadata` | **Cấu hình** | Đăng ký nhận webhook thông báo khi có tin nhắn mới hoặc bình luận mới phát sinh trên Fanpage. | ✅ Khả dụng cho App quản lý Page. |
| `pages_manage_engagement` | ⚠️ **Hạn chế cao (Restricted)** | Trả lời bình luận, ẩn/xóa bình luận, bấm thích bình luận trên danh nghĩa Fanpage. | ❌ **Bị Meta kiểm soát gắt gao**, gây lỗi `Invalid Scopes` nếu App chưa duyệt. *(Xem mục 2)* |

---

### B. Quyền dành cho Instagram (Doanh nghiệp / Creator)

| Tên quyền (Scope) | Phân loại | Mục đích & Chức năng trong Social Desk | Trạng thái & Khả năng cấp |
| :--- | :---: | :--- | :--- |
| `instagram_basic` | **Cơ bản** | Đọc thông tin tài khoản Instagram (Username, ID, ảnh đại diện, số bài đăng). | ✅ Khả dụng khi liên kết Fanpage. |
| `instagram_content_publish` | **Xuất bản** | Đăng ảnh đơn và bài đăng nhiều ảnh (Carousel Container) trực tiếp lên bảng tin Instagram. | ✅ Hoạt động ổn định cho tài khoản Professional. |
| `instagram_manage_comments` | **Bình luận** | Đọc toàn bộ bình luận dưới bài viết Instagram và gửi câu trả lời (reply) trực tiếp cho khách hàng. | ✅ Khả dụng và hoạt động tốt. |
| `instagram_manage_contents` | **Nội dung** | Đọc thông tin chi tiết các bài đăng, hashtag và media đã đăng của tài khoản Instagram. | ✅ Khả dụng cho tài khoản Business/Creator. |
| `instagram_manage_messages` | **Tin nhắn** | Đọc hộp thư Direct Message (DM) và gửi tin nhắn phản hồi khách hàng trên Instagram. | ✅ Khả dụng khi bật tính năng "Cho phép truy cập tin nhắn". |

---

### C. Quyền Doanh nghiệp (Business)

| Tên quyền (Scope) | Phân loại | Mục đích & Chức năng | Trạng thái |
| :--- | :---: | :--- | :--- |
| `business_management` | **Nâng cao** | Quản lý tài nguyên, Fanpage và tài khoản Instagram thông qua Meta Business Suite / Trình quản lý kinh doanh. | Cần thiết khi dùng System User Token. |

---

## 2. Vấn đề với quyền `pages_manage_engagement` (Facebook Cấm / Hạn chế)

### Nguyên nhân Meta siết chặt:
1. **Phân loại Restricted Permission**: Meta xếp `pages_manage_engagement` vào nhóm quyền nhạy cảm cao vì nó cho phép ứng dụng tự động thực hiện các hành động can thiệp như xóa bình luận, ẩn bài, like và spam phản hồi.
2. **Yêu cầu App Review & Business Verification**: Nếu App Meta của bạn là tài khoản cá nhân, mới tạo, hoặc chưa hoàn tất quy trình **Xác minh doanh nghiệp (Business Verification)** với giấy phép kinh doanh, Meta sẽ **chặn hoàn toàn** quyền này.
3. **Lỗi khi đăng nhập OAuth**: Khi truyền `pages_manage_engagement` vào tham số `scope` của đường dẫn đăng nhập, Meta sẽ chặn đứng và hiển thị thông báo lỗi:
   > `Invalid Scopes: pages_manage_engagement. This permission cannot be used by this app.`

---

## 3. Giải pháp thay thế triệt để trong Social Desk

Social Desk được thiết kế với cơ chế hoạt động linh hoạt, giúp bạn vận hành 100% tính năng mà không bị phụ thuộc vào quyền bị cấm:

```
                  ┌──────────────────────────────────────────────┐
                  │          NHU CẦU QUẢN TRỊ NỘI DUNG           │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
     ┌───────────────────────┐                       ┌───────────────────────┐
     │   FACEBOOK FANPAGE    │                       │   INSTAGRAM BUSINESS  │
     └───────────┬───────────┘                       └───────────┬───────────┘
                 │                                               │
   ┌─────────────┴─────────────┐                                 │
   ▼                           ▼                                 ▼
[Đọc bình luận/Likes]     [Trả lời bình luận]           [Đăng/Bình luận/Inbox]
   │                           │                                 │
   ├─► pages_read_engagement   ├─► Nếu có Token duyệt:           ├─► instagram_basic
   │   (Chuẩn Meta, KHÔNG CẤM) │   Dùng Graph API bình thường.   ├─► instagram_content_publish
   │                           │                                 ├─► instagram_manage_comments
   │                           └─► Nếu KHÔNG CÓ Token duyệt:     ├─► instagram_manage_messages
   │                               Dùng CHROME EXTENSION         │   (Đầy đủ, KHÔNG BỊ CẤM)
   │                               (100% không bị Meta cấm!)     │
```

1. **Đọc bình luận & Thống kê tương tác Fanpage**:
   - Chỉ cần quyền **`pages_read_engagement`** (quyền này Meta cho phép sử dụng bình thường, không bị cấm).
   - Social Desk vẫn hiển thị đầy đủ danh sách bình luận của khách, tên khách hàng và thời gian bình luận.
2. **Trả lời bình luận Fanpage**:
   - Nếu App của bạn đã được duyệt `pages_manage_engagement`: Bạn có thể trả lời trực tiếp qua API.
   - Nếu App bị Meta từ chối `pages_manage_engagement`: **Sử dụng Chrome Extension của Social Desk** (Mã kết nối `SD-xxxx`). Extension hoạt động trực tiếp trên phiên đăng nhập trình duyệt thật của bạn, trả lời bình luận tự nhiên mà Meta không thể cấm hay đòi hỏi xét duyệt.
3. **Instagram không bị ảnh hưởng**:
   - Quyền `instagram_manage_comments` và `instagram_manage_messages` của Instagram vẫn hoạt động bình thường, cho phép đọc và trả lời bình luận/tin nhắn trực tiếp qua API.
4. **Hệ thống OAuth an toàn**:
   - Social Desk đã tự động tách `pages_manage_engagement` khỏi danh sách quyền bắt buộc của OAuth URL, đảm bảo việc bấm kết nối tài khoản Facebook không bao giờ bị báo lỗi `Invalid Scopes`.

---

## 4. Hướng dẫn thiết lập Token API chuẩn cho Fanpage & Instagram

### Cách 1: Sử dụng Graph API Explorer (Khuyên dùng cho cá nhân/shop)

1. Truy cập [Meta for Developers Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Chọn **Meta App** của bạn ở góc trên bên phải.
3. Tại ô **User or Page**, chọn **Page Access Token** tương ứng với Fanpage cần quản lý.
4. Tại mục **Add a Permission**, thêm các quyền an toàn sau:
   - **Facebook Page**: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_messaging`.
   - **Instagram**: `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`.
   *(Bỏ qua `pages_manage_engagement` nếu tài khoản của bạn bị Meta báo đỏ hoặc không cho chọn)*.
5. Bấm **Generate Access Token** và cấp quyền.
6. Sao chép Token và dán vào nút **"Cài đặt Token API"** trên giao diện Social Desk.

---

### Cách 2: Sử dụng System User (Dành cho Doanh nghiệp / Agency)

Nếu bạn có Meta Business Suite (Trình quản lý kinh doanh):
1. Vào **Cài đặt cho doanh nghiệp** $\rightarrow$ **Người dùng hệ thống (System Users)**.
2. Tạo một System User (vai trò Quản trị viên).
3. Gán tài nguyên Fanpage và tài khoản Instagram cho System User với toàn quyền quản lý.
4. Bấm **Tạo mã mới (Generate New Token)**, tick chọn các quyền trên, chọn thời hạn token là **Không bao giờ hết hạn (Never Expire)**.
5. Dán token này vào Social Desk để sử dụng vĩnh viễn không cần làm mới.


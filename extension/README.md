# Hướng dẫn cài đặt & sử dụng Extension — Social Desk Connector (v1.1.0)

Extension này giúp kết nối trực tiếp các **Profile Chrome / Antidetect Browser** (GPM Login, GenLogin, Hidemyacc, v.v.) với phần mềm **Social Desk** để tự động hóa đăng bài đa tài khoản Facebook an toàn và chính xác 100%.

---

## 1. Cài đặt vào Chrome hoặc GPM Login / Antidetect

Bạn có 2 cách cài đặt:

### Cách A: Cài đặt từ thư mục giải nén (Khuyên dùng khi lập trình)
1. Mở cửa sổ trình duyệt (đúng profile có tài khoản Facebook muốn đăng).
2. Nhập vào thanh địa chỉ:
   ```text
   chrome://extensions
   ```
3. Bật công tắc **Developer mode** (Chế độ cho nhà phát triển) ở góc trên bên phải.
4. Bấm nút **Load unpacked** (Tải tiện ích đã giải nén).
5. Chọn thư mục `extension` trong dự án Social Desk:
   ```text
   c:\Users\Admin\Downloads\code\socialdesk\extension
   ```
6. Bấm biểu tượng **Mảnh ghép (Extensions)** trên thanh công cụ và ghim biểu tượng **Social Desk** ra ngoài.

### Cách B: Cài đặt bằng file ZIP (Khuyên dùng cho GPM Login / GenLogin)
1. Sử dụng file **`socialdesk-extension.zip`** (đã được đóng gói sẵn trong thư mục dự án).
2. Trong phần mềm GPM Login / Antidetect:
   - Vào mục quản lý Extension của profile hoặc toàn hệ thống.
   - Chọn tải lên file ZIP `socialdesk-extension.zip`.
   - Bật extension cho profile mong muốn.

---

## 2. Lấy mã và liên kết với Social Desk

1. Bấm vào biểu tượng **Social Desk** trên thanh công cụ của Chrome.
2. Cửa sổ Popup sẽ hiển thị:
   - **MÃ KẾT NỐI CHROME NÀY** (ví dụ: `SD-8492` hoặc bạn có thể bấm **Đổi mã** để đặt tên dễ nhớ như `CHROME-1`, `FB-DUC`, `NICK-LEXUS`).
   - Bấm nút **Sao chép** mã.
3. Mở ứng dụng **Social Desk** trên trình duyệt (http://localhost:5173 hoặc http://localhost:3000):
   - Vào mục **Tài khoản**.
   - Tại tài khoản Facebook tương ứng, dán mã vừa sao chép vào ô **Mã Extension (Chrome)** và bấm **Lưu mã**.
   - Biểu tượng trạng thái sẽ chuyển sang 🟢 **Chrome đang Online**!

---

## 3. Các cải tiến bảo mật & độ tin cậy trong phiên bản v1.1.0

- **Xác minh kết quả đăng bài thực tế**: Không chỉ đợi vài giây rồi báo ảo, extension theo dõi trạng thái modal Facebook, bắt chính xác các lỗi từ chối, cảnh báo spam hoặc trạng thái "Chờ quản trị viên duyệt".
- **Bảo toàn ảnh đính kèm**: Nếu một trong các ảnh tải về thất bại, extension sẽ chủ động dừng lại và báo lỗi chi tiết, không tự ý đăng bài thiếu ảnh.
- **Tự động phục hồi kết nối (Exponential Backoff)**: Tự động kết nối lại thông minh khi máy chủ khởi động lại hoặc mạng chập chờn.
- **Heartbeat & Phát hiện kết nối chết**: Kiểm tra PING/PONG định kỳ để luôn giữ kết nối thông suốt.
- **Chống xử lý trùng lặp (Idempotency)**: Bộ đệm `taskId` ngăn ngừa việc đăng 2 lần cho cùng một tác vụ.
- **Bảo mật Popup**: Toàn bộ nhật ký được hiển thị qua DOM API an toàn, loại bỏ nguy cơ chèn mã độc HTML injection.
- **Đầy đủ bộ Icon PNG chuẩn**: Cung cấp các kích thước 16x16, 32x32, 48x48, 128x128 pixel theo chuẩn của Google Chrome Web Store.

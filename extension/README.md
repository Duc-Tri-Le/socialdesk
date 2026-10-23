# Hướng dẫn cài đặt Chrome Extension — Social Desk Connector

Extension này giúp kết nối trực tiếp các **Profile Chrome** (mỗi profile đăng nhập 1 nick Facebook riêng) với phần mềm **Social Desk** để tự động hóa đăng bài.

---

## 1. Cài đặt Extension vào Chrome

Bạn chỉ cần thực hiện 1 lần trên mỗi Profile Chrome bạn muốn dùng để đăng:

1. Mở cửa sổ trình duyệt **Chrome** (đúng Profile có tài khoản Facebook cần đăng).
2. Nhập vào thanh địa chỉ:
   ```text
   chrome://extensions
   ```
3. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
4. Bấm nút **Load unpacked** (Tải tiện ích đã giải nén).
5. Chọn thư mục:
   ```text
   c:\Users\Admin\Downloads\code\socialdesk\extension
   ```
6. Bấm chọn biểu tượng **Mảnh ghép (Extensions)** trên thanh công cụ của Chrome và ghim biểu tượng **Social Desk** ra ngoài để tiện xem.

---

## 2. Lấy mã và liên kết với Social Desk

1. Bấm vào biểu tượng **Social Desk** trên thanh công cụ của Chrome.
2. Cửa sổ Popup sẽ hiện ra:
   - Bạn sẽ thấy **MÃ KẾT NỐI CHROME NÀY** (ví dụ: `SD-8492` hoặc bạn có thể bấm **Đổi mã** để đặt tên dễ nhớ như `CHROME-1`, `FB-DUC`).
   - Bấm nút **Sao chép** mã.
3. Mở ứng dụng **Social Desk** trên trình duyệt (http://localhost:5173 hoặc http://localhost:3000):
   - Vào mục **Tài khoản**.
   - Tại tài khoản Facebook tương ứng, dán mã vừa sao chép vào ô **Mã Extension (Chrome)** và bấm **Lưu mã**.
   - Biểu tượng trạng thái sẽ chuyển sang 🟢 **Chrome đang Online**!

---

## 3. Cơ chế đăng bài tự động

- Khi bạn vào mục **Hàng đợi** và bấm **Đăng Bài**:
  - Hệ thống tự động kiểm tra tài khoản cần đăng thuộc mã Chrome nào.
  - Nếu Chrome đó đang mở: Lệnh đăng bài được gửi tức thì qua WebSocket tới Chrome đó.
  - Chrome sẽ tự mở tab Facebook, điền nội dung, đính kèm ảnh và bấm đăng bài hoàn toàn tự động!
- Nếu bạn có **nhiều tài khoản Facebook**:
  - Mỗi tài khoản đăng nhập ở 1 Profile Chrome riêng.
  - Mỗi Profile Chrome mở extension và có một mã riêng (ví dụ `CHROME-1`, `CHROME-2`).
  - Gán đúng mã vào từng tài khoản trong Social Desk là xong!

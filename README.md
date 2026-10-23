# Social Desk — Hướng dẫn cài đặt & chạy bằng Bun

Ứng dụng quản lý bán hàng mô hình xe trên Facebook / Instagram của **ĐỨC GARAGE**:
- Đồng bộ và quản lý sản phẩm tự động từ Google Sheets.
- Soạn bài bán hàng thông minh, hàng đợi duyệt bài (Chờ duyệt — Đã duyệt — Lịch sử bài đăng).
- Xuất gói đăng bài, quản lý hội nhóm Facebook và tài khoản bán hàng.
- Phân tích chỉ số, quản lý kho ảnh/video.

> **Độc lập 100%**: Ứng dụng chạy trực tiếp trên máy tính (Windows / macOS / Linux) qua **Bun**, không cần cài máy ảo, không phụ thuộc vào Muse hay Docker.

---

## 1. Cấu trúc thư mục

```
client/                 Giao diện người dùng (React 19 + TypeScript + Tailwind CSS 4)
  src/App.tsx           Toàn bộ giao diện các phân hệ của app
  src/api.ts            Lớp gọi API / actions tới server
  src/main.tsx          Điểm khởi chạy frontend
  src/theme.css         Giao diện và bảng màu
server/
  src/actions.ts        Backend: toàn bộ action nghiệp vụ (sản phẩm, bản nháp,
                        duyệt bài, gói đăng, đăng bài, tài khoản, nhóm...)
  src/schema.ts         Khai báo lược đồ bảng dữ liệu (Drizzle ORM)
packages/space-sdk/     Thư viện RPC nội bộ kết nối Frontend & Backend
server.ts               Server chính chạy độc lập bằng Bun (API, SQLite, Web Server)
drizzle/                23 file migration SQL — cấu trúc database
social-desk-database.db File database SQLite kèm dữ liệu hoạt động
package.json            Khai báo dependency và các lệnh script chạy app
vite.config.ts          Cấu hình Vite và proxy cho môi trường dev
DATA-PLAN.md            Tài liệu thiết kế cấu trúc dữ liệu chi tiết
```

---

## 2. Yêu cầu môi trường

- **Runtime**: [Bun](https://bun.sh) (khuyến nghị phiên bản 1.1+ hoặc mới nhất).
- **Hệ điều hành**: Windows 10/11, macOS, hoặc Linux.

### Cài đặt Bun (nếu máy chưa có)

- **Trên Windows (PowerShell)**:
  ```powershell
  irm bun.sh/install.ps1 | iex
  ```
  *(Sau khi cài xong, tắt và mở lại PowerShell hoặc terminal)*

- **Trên macOS / Linux (Terminal)**:
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

- **Hoặc qua npm** (nếu máy đã có sẵn Node.js):
  ```bash
  npm install -g bun
  ```

Kiểm tra sau khi cài đặt:
```bash
bun --version
```

---

## 3. Cài đặt thư viện

Mở terminal tại thư mục dự án và chạy:

```bash
bun install
```

Tất cả các gói (bao gồm thư viện kết nối RPC nội bộ trong `packages/space-sdk`) sẽ được cài đặt trực tiếp, nhanh chóng chỉ trong vài giây.

---

## 4. Hướng dẫn chạy ứng dụng

### Cách 1: Chạy bản hoàn chỉnh (Khuyên dùng)

Chỉ cần build một lần và khởi động server:

```bash
# 1. Build cả frontend và backend
bun run build

# 2. Khởi chạy server
bun start
```

Mở trình duyệt web và truy cập:
👉 **[http://localhost:3000](http://localhost:3000)**

---

### Cách 2: Chạy ở chế độ phát triển (Development / Hot-Reload)

Nếu bạn muốn chỉnh sửa code và xem thay đổi ngay lập tức:

1. **Terminal 1** — Khởi chạy backend server:
   ```bash
   bun run dev:server
   ```
   *(Backend chạy tại http://localhost:3000)*

2. **Terminal 2** — Khởi chạy Vite frontend:
   ```bash
   bun run dev
   ```
   *(Truy cập frontend tại http://localhost:5173 — Vite sẽ tự động proxy API sang port 3000)*

---

## 5. Các lệnh thường dùng

| Lệnh | Ý nghĩa |
|---|---|
| `bun install` | Cài đặt toàn bộ thư viện dependencies |
| `bun run build` | Build cả backend actions (`server/dist/`) và frontend (`client/dist/`) |
| `bun start` | Chạy ứng dụng sản phẩm tại cổng 3000 (`bun run server.ts`) |
| `bun run dev:server` | Chạy backend với chế độ tự reload khi sửa code (`--watch`) |
| `bun run dev` | Chạy frontend Vite development server |
| `bun run typecheck` | Kiểm tra lỗi kiểu TypeScript cho cả frontend và backend |

---

## 6. Kiến trúc & Cơ chế hoạt động

Ứng dụng được thiết kế chạy độc lập hoàn toàn với `server.ts`:

1. **HTTP & API RPC**:
   - `server.ts` tích hợp sẵn HTTP server hiệu năng cao của Bun (`Bun.serve`).
   - Xử lý các lệnh nghiệp vụ qua endpoint `/actions` (gọi các action từ `server/src/actions.ts`).
2. **Cơ sở dữ liệu SQLite**:
   - Kết nối trực tiếp file `social-desk-database.db` qua `bun:sqlite` và `drizzle-orm`.
   - Mọi thay đổi dữ liệu được lưu trực tiếp vào file database cục bộ.
3. **Đồng bộ Google Sheets & Drive**:
   - Đọc dữ liệu bảng tính Google Sheets và ảnh từ Google Drive trực tiếp qua API web độc lập, không phụ thuộc vào công cụ dòng lệnh bên ngoài.
4. **Phục vụ Static Web**:
   - Tự động phân phối giao diện React tĩnh từ `client/dist/` và lưu trữ/phục vụ media tải lên tại thư mục `/uploads/`.

---

## 7. Cơ sở dữ liệu (Database)

- Toàn bộ dữ liệu nằm trong file `social-desk-database.db`.
- Lược đồ bảng (schema) được định nghĩa tại `server/src/schema.ts`.
- Lịch sử cấu trúc database nằm tại thư mục `drizzle/` (23 bản migration).
- Đọc hoặc sao lưu database bất cứ lúc nào bằng cách copy file `social-desk-database.db` hoặc dùng SQLite CLI / công cụ GUI như DBeaver, DB Browser for SQLite.

---

## 8. Bảo mật

- File database đi kèm chứa dữ liệu sản phẩm, bài đăng và thông tin nội bộ của shop. Hãy bảo quản cẩn thận, không upload công khai lên repository công cộng.

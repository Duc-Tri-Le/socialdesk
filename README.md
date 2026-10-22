# Social Desk — Hướng dẫn cài đặt & chạy

Tool quản lý bán hàng mô hình xe trên Facebook / Instagram của ĐỨC GARAGE:
quản lý sản phẩm từ Google Sheet, soạn bài bán hàng, hàng đợi duyệt bài,
xuất gói đăng, đăng bài (Fanpage / Instagram / nhóm Facebook), quản lý hội nhóm và tài khoản.

Tài liệu này đi kèm gói mã nguồn `social-desk-full-source.zip`
(bản chụp ngày 22/10/2026).

---

## 1. Cấu trúc thư mục

```
client/                 Giao diện (React 19 + TypeScript)
  src/App.tsx           Toàn bộ giao diện và các mục của app
  src/api.ts            Lớp gọi action lên server
  src/main.tsx          Điểm khởi chạy frontend
  src/theme.css         Giao diện / theme
  build.mjs             Script build frontend (qua @hatch/space-sdk)
  dist/                 Bản build frontend đã sẵn sàng
server/
  src/actions.ts        Backend: toàn bộ action nghiệp vụ (sản phẩm, bản nháp,
                        duyệt bài, gói đăng, đăng bài, tài khoản, nhóm...)
  src/privileged.ts     Các lệnh chạy nền đặc quyền: gọi CLI của Facebook /
                        Instagram / Google (Sheets, Drive) và tác vụ trình duyệt
  src/schema.ts         Khai báo bảng dữ liệu (Drizzle ORM)
drizzle/                23 file migration SQL (0001 → 0023) — cấu trúc database
social-desk-database.db File database SQLite kèm dữ liệu thật hiện tại
package.json            Khai báo dependency và script
space.json              Cấu hình runtime của app trên nền tảng Muse
DATA-PLAN.md            Tài liệu thiết kế dữ liệu chi tiết của tool
```

Các mục chính trong app: Tổng quan / Nghiên cứu / Hội nhóm / Soạn bài /
Hàng đợi (Chờ duyệt — Đã duyệt — Lịch sử bài đăng) / Ảnh-video / Tài khoản / Sản phẩm / Phân tích.

## 2. Yêu cầu môi trường

| Thành phần | Yêu cầu |
|---|---|
| Runtime | **Bun 1.3.10** (khai báo trong `packageManager` của package.json) |
| Ngôn ngữ | TypeScript 5.6 |
| Nền tảng chạy | **Môi trường web artifact của Muse (Hatch runtime)** — xem mục 5, rất quan trọng |
| Database | SQLite (file đi kèm), quản lý schema bằng Drizzle ORM 0.45 |

Nếu chưa có Bun: tải và cài từ trang chủ của Bun (bun.sh), hoặc qua npm: `npm install -g bun`.

## 3. Cài đặt

```bash
unzip social-desk-full-source.zip -d social-desk
cd social-desk
bun install
```

Lưu ý: dependency `@hatch/space-sdk` trong `package.json` trỏ tới một file cục bộ
trong thư mục `/opt/hatch/` — file này chỉ tồn tại bên trong môi trường Muse.
Vì vậy `bun install` chạy trọn vẹn **trong môi trường Muse**; trên máy/VPS ngoài,
bước này sẽ lỗi ở đúng dependency đó (xem mục 5).

## 4. Kiểm tra & build

```bash
# Kiểm tra kiểu dữ liệu (cả client và server)
bun run typecheck

# Build cả hai phần
bun run build

# Build riêng từng phần
bun run build:server   # đóng gói server/src/actions.ts → server/dist/actions.js
bun run build:client   # build giao diện → client/dist/
```

Điểm vào của app được khai báo trong `space.json`:
`entry: client/dist/index.html`, runtime `typescript`.

## 5. Cách app chạy — và giới hạn khi tự host

Social Desk được xây để chạy trên nền tảng web artifact của Muse, không phải
một web server độc lập thông thường. Cụ thể:

- **Frontend** là React app tĩnh sau khi build (`client/dist/`).
- **Backend** không mở cổng HTTP riêng: các hàm trong `server/src/actions.ts`
  được runtime của Muse gọi trực tiếp từ giao diện qua `@hatch/space-sdk`.
- **`server/src/privileged.ts`** gọi các công cụ dòng lệnh của nền tảng tại
  `/opt/hatch/bin/` (Facebook CLI, Instagram CLI, Google Workspace CLI) để đọc
  Google Sheet/Drive, kiểm tra phiên và đăng bài. Các tài khoản này được liên kết
  qua hệ thống kết nối của Muse, không lưu mật khẩu trong code hay database.
- Một số luồng chạy **tác vụ nền của Muse** (ví dụ: đăng bài vào nhóm Facebook
  bằng trình duyệt, đăng Instagram ở chế độ nền, mở cửa sổ trình duyệt Muse để
  đăng nhập Facebook) — các luồng này phụ thuộc vào agent/trình duyệt của Muse.

Hệ quả thực tế:

- Muốn chạy **đầy đủ tính năng như hiện tại**, hãy chạy trong môi trường Muse
  (chính là bản Social Desk đang dùng trong app).
- Nếu mang code ra VPS/máy riêng: phần giao diện và logic thuần (quản lý sản
  phẩm, bản nháp, gói đăng) có thể dựng lại được, nhưng phải tự thay thế
  `@hatch/space-sdk`, các CLI ở `/opt/hatch/bin/` và cơ chế tác vụ nền bằng
  dịch vụ tương đương của bạn. Đây là việc phát triển thêm, không có sẵn trong gói.

## 6. Database

- File `social-desk-database.db` là SQLite chứa toàn bộ dữ liệu hiện tại:
  tài khoản, Page, nhóm, quan hệ tham gia nhóm, sản phẩm, bản nháp,
  bản ghi đăng bài, nguồn Sheet, chỉ số bài đăng...
- Cấu trúc bảng khai báo tại `server/src/schema.ts`; lịch sử thay đổi cấu trúc
  nằm trong `drizzle/` (23 migration, bảng `__drizzle_migrations` trong DB ghi
  lại các migration đã áp dụng).
- Xem nhanh dữ liệu (chỉ đọc để tránh ghi nhầm):

```bash
sqlite3 "file:social-desk-database.db?mode=ro" ".tables"
sqlite3 "file:social-desk-database.db?mode=ro" "SELECT * FROM products LIMIT 5;"
```

- Khi app chạy trên Muse, dữ liệu sống nằm trong file `app.db` do app quản lý —
  file `.db` trong gói này là bản sao tại thời điểm đóng gói, không tự đồng bộ hai chiều.

## 7. Bảo mật

- Gói này chứa **dữ liệu thật của shop** (tài khoản, sản phẩm, bản nháp, lịch sử
  đăng bài) trong file database. Giữ như tài liệu nội bộ, không đăng công khai.
- Code không chứa mật khẩu/token: việc đăng nhập Facebook/Instagram/Google do
  hệ thống kết nối của Muse quản lý riêng.

## 8. Thông tin bản gói

- Tên app: Social Desk (slug: `social-desk`)
- Đóng gói: 22/10/2026, từ bản đang chạy trong Muse
- Công nghệ: Bun + TypeScript, React 19, Drizzle ORM + SQLite,
  TanStack React Query, Recharts, Tailwind CSS 4

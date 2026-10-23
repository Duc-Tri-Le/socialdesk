// Drizzle schema for Social Desk.
//
// Mirrors the data model of the local socdesk tool: products being sold,
// research runs (Marketplace price analysis), Facebook groups, post drafts
// moving through draft → approved → packed, and uploaded media files.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Mã quản lý do người dùng đặt trong Sheet (cột STT) — mỗi xe một mã.
  stt: text("stt").notNull().default(""),
  // Mã sản phẩm nội bộ (SKU) theo quy định của shop: "STT-Tên sản
  // phẩm" (ví dụ "1-LEXUS LX600") — sản phẩm KHÔNG còn tách theo
  // màu nên SKU không chứa màu; dùng để đối chiếu nội bộ, không in
  // vào caption. (Bản nháp vẫn giữ SKU riêng "STT-Tên-Màu" cho màu
  // cụ thể được soạn bài.)
  sku: text("sku").notNull().default(""),
  name: text("name").notNull(),
  scale: text("scale").notNull().default("1:18"),
  maker: text("maker").notNull().default(""),
  // Kích thước thật của mẫu (cột "Kích thước" trong Sheet, ví dụ 25cm) —
  // khác với tỉ lệ/kích cỡ (scale). Khi viết bài luôn ghi dạng ~.
  size: text("size").notNull().default(""),
  // Phân loại sản phẩm khi đọc từ Sheet = Hãng + Mẫu (name) + Tỉ lệ +
  // Kích thước + Màu sắc. Mỗi màu là MỘT sản phẩm (biến thể) riêng:
  // color = màu duy nhất của biến thể, colors = JSON mảng một phần
  // tử chứa đúng màu đó.
  color: text("color").notNull().default(""),
  colors: text("colors").notNull().default("[]"),
  price: text("price").notNull().default(""),
  stock: integer("stock").notNull().default(1),
  ship: text("ship").notNull().default(""),
  // Ảnh / video lấy từ Sheet (link) — nhóm dùng ảnh, fanpage dùng video.
  imageUrl: text("image_url").notNull().default(""),
  videoUrl: text("video_url").notNull().default(""),
  // Ảnh THẬT đã liệt kê từ thư mục Google Drive (cột Link ảnh là link
  // thư mục): drive_images là JSON mảng {id,name,mime,size,jpeg_url,
  // view_url,original_mime} — jpeg_url là bản kết xuất JPEG của Drive
  // (thumbnail) dùng được để đăng, vì file gốc phần lớn là HEIC.
  // drive_status: "" chưa kiểm tra · "ok" có ≥1 ảnh thật ·
  // "empty" thư mục rỗng · "no_link" không có link thư mục ·
  // "error" link lỗi/không có quyền/Drive chưa kết nối.
  driveFolderId: text("drive_folder_id").notNull().default(""),
  driveStatus: text("drive_status").notNull().default(""),
  driveError: text("drive_error").notNull().default(""),
  driveCheckedAt: text("drive_checked_at").notNull().default(""),
  driveImages: text("drive_images").notNull().default("[]"),
  source: text("source").notNull().default("manual"),
  externalKey: text("external_key").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  platform: text("platform", { enum: ["Facebook", "Instagram"] })
    .notNull()
    .default("Facebook"),
  name: text("name").notNull(),
  handle: text("handle").notNull().default(""),
  profileUrl: text("profile_url").notNull().default(""),
  linked: integer("linked").notNull().default(1),
  selected: integer("selected").notNull().default(0),
  extensionCode: text("extension_code").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Facebook Pages thuộc về một tài khoản Facebook cá nhân: 1 nick có thể
// quản trị nhiều Page. Page được chọn (selected) sẽ là nơi đăng bài thay
// cho / cùng với trang cá nhân của nick đó.
export const fbPages = sqliteTable("fb_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull().default(""),
  role: text("role").notNull().default(""),
  selected: integer("selected").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});

// Danh sách nguồn Google Sheet đã lưu: mỗi nguồn có TÊN riêng (do người
// dùng đặt, ví dụ "Kho xe 1:18") kèm link/ID file, tab và phạm vi đọc,
// để chọn đúng nguồn mà đồng bộ thay vì chỉ gắn một link duy nhất.
export const sheetSources = sqliteTable("sheet_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default(""),
  spreadsheetId: text("spreadsheet_id").notNull(),
  sheetName: text("sheet_name").notNull().default(""),
  range: text("range").notNull().default(""),
  title: text("title").notNull().default(""),
  lastSyncAt: text("last_sync_at").notNull().default(""),
  lastSyncStatus: text("last_sync_status").notNull().default(""),
  lastSyncMessage: text("last_sync_message").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const researchRuns = sqliteTable("research_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  query: text("query").notNull(),
  ranAt: integer("ran_at", { mode: "timestamp_ms" }).notNull(),
  marketplaceCount: integer("marketplace_count").notNull().default(0),
  priceCount: integer("price_count").notNull().default(0),
  priceMin: integer("price_min"),
  priceMedian: integer("price_median"),
  priceMax: integer("price_max"),
  groupsFound: integer("groups_found").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const fbGroups = sqliteTable("fb_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull().default(""),
  members: integer("members").notNull().default(0),
  // Cột này CHỈ phản ánh trạng thái tham gia của tài khoản
  // Facebook chính với nhóm — trạng thái của từng Page con nằm
  // riêng trong group_memberships và không gộp vào đây (Page và
  // tài khoản chính có thể khác trạng thái với cùng một nhóm).
  joined: integer("joined").notNull().default(0),
  isTarget: integer("is_target").notNull().default(0),
  // Cột giữ lại từ migration 0014 (nhãn "đã thêm bởi" đã bị người
  // dùng hủy bỏ — không còn hiển thị hay ghi nữa).
  addedBy: text("added_by").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Trạng thái tham gia của TỪNG tài khoản Facebook / Page đối với
// TỪNG nhóm: mỗi dòng là một cặp (nhóm, tài khoản/Page) với trạng
// thái joined / not_joined — CHỈ hai trạng thái này (người dùng
// chốt: không có trạng thái "Chưa rõ"). Không có dòng = "Chưa tham
// gia" (not_joined).
export const groupMemberships = sqliteTable("group_memberships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull(),
  // "account" = tài khoản Facebook (bảng accounts), "page" = Page
  // (bảng fb_pages).
  identityKind: text("identity_kind").notNull().default("account"),
  identityId: integer("identity_id").notNull(),
  status: text("status", { enum: ["joined", "not_joined"] })
    .notNull()
    .default("not_joined"),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const drafts = sqliteTable("drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  // Mã chống trùng của MỘT lượt soạn bài: client sinh một mã cho mỗi
  // lượt bấm soạn và gửi kèm; gửi lại CÙNG mã (ví dụ bấm "Thử lại"
  // sau khi cổng kết nối báo timeout trong lúc máy chủ vẫn chạy tiếp
  // và đã lưu nháp) thì máy chủ trả về đúng bản nháp đã tạo thay vì
  // tạo thêm bản thứ hai giống hệt. Rỗng = lượt soạn cũ không có mã.
  idempotencyKey: text("idempotency_key").notNull().default(""),
  stt: text("stt").notNull().default(""),
  // SKU nội bộ của biến thể màu được soạn bài ("STT-Tên-Màu").
  sku: text("sku").notNull().default(""),
  productName: text("product_name").notNull(),
  scale: text("scale").notNull().default("1:18"),
  maker: text("maker").notNull().default(""),
  color: text("color").notNull().default(""),
  price: text("price").notNull().default(""),
  stock: text("stock").notNull().default("1"),
  ship: text("ship").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  videoUrl: text("video_url").notNull().default(""),
  // Ảnh thật từ Drive gắn vào bản nháp/gói đăng lúc soạn bài: cùng
  // định dạng JSON như products.drive_images.
  driveFolderId: text("drive_folder_id").notNull().default(""),
  driveStatus: text("drive_status").notNull().default(""),
  driveError: text("drive_error").notNull().default(""),
  driveImages: text("drive_images").notNull().default("[]"),
  // 1 = người dùng đã TỰ thêm/xóa ảnh trong form soạn bài. Dù 0
  // hay 1, tập ảnh trong drive_images là BẢN CHỐT cuối cùng của
  // bản nháp: khi xuất gói đăng KHÔNG quét lại Drive — gói dùng
  // đúng tập này, không gắn lại ảnh đã xóa, không thêm ảnh mới.
  imagesCustomized: integer("images_customized").notNull().default(0),
  // Điểm nhấn do người dùng cung cấp để người viết content đưa vào bài
  // (chỉ dùng đúng giá trị này, không tự bịa thêm) + góc viết đã chọn.
  sellingPoint: text("selling_point").notNull().default(""),
  angle: text("angle").notNull().default("chot_don"),
  // Kích thước thật của mẫu (cm, chữ người dùng nhập — để trống nếu chưa
  // đo) và số ngày của đợt mở bán giới hạn (để trống nếu bán thường
  // xuyên). Chỉ hiện trong caption khi có giá trị.
  sizeCm: text("size_cm").notNull().default(""),
  saleDays: text("sale_days").notNull().default(""),
  caption: text("caption").notNull(),
  // Nguồn của caption hiện tại: "ai" (người viết AI), "template"
  // (mẫu dự phòng khi bài AI bị loại/không khả dụng) hoặc "manual"
  // (người bán tự sửa tay). Rỗng = bản nháp cũ chưa ghi nguồn.
  captionSource: text("caption_source").notNull().default(""),
  reels: text("reels").notNull(),
  status: text("status", { enum: ["draft", "approved", "packed"] })
    .notNull()
    .default("draft"),
  packText: text("pack_text").notNull().default(""),
  packedAt: integer("packed_at", { mode: "timestamp_ms" }),
  // Đích đăng người dùng đã chọn cho RIÊNG bản nháp này (JSON:
  // {group_ids, page_ids, instagram_account_ids}) — lưu bền để
  // cả trang "Chờ duyệt" và trang "Đã duyệt" dùng lại đúng lựa
  // chọn cũ, không bắt chọn lại từ mặc định mỗi lần mở. Rỗng =
  // chưa từng lưu lựa chọn (client tự suy từ các cờ chọn mặc
  // định).
  packTargets: text("pack_targets").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Chỉ số sau khi đăng bài — ghi theo từng kênh (hội nhóm, fanpage
// hoặc tài khoản Instagram) và từng khung giờ, để hệ thống tính khung
// giờ tốt nhất RIÊNG cho từng nhóm / từng page / từng nick Instagram
// (không dùng một khung giờ chung cho tất cả). Với kênh Instagram,
// channel_id là id của tài khoản Instagram trong bảng accounts.
export const postMetrics = sqliteTable("post_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  draftId: integer("draft_id"),
  productName: text("product_name").notNull().default(""),
  stt: text("stt").notNull().default(""),
  channelType: text("channel_type", { enum: ["group", "page", "instagram"] })
    .notNull()
    .default("group"),
  channelId: integer("channel_id").notNull().default(0),
  channelName: text("channel_name").notNull().default(""),
  mediaKind: text("media_kind", { enum: ["image", "video", "none"] })
    .notNull()
    .default("image"),
  postedAt: integer("posted_at", { mode: "timestamp_ms" }).notNull(),
  hourSlot: text("hour_slot").notNull().default(""),
  reach: integer("reach").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  inquiries: integer("inquiries").notNull().default(0),
  orders: integer("orders").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Lịch sử ĐĂNG THẬT từ nút "Đăng Bài" trong Hàng đợi: mỗi dòng là
// kết quả đăng lên MỘT đích (một Page, một tài khoản Instagram,
// hoặc một nhóm). status: published = đã đăng thành công
// (post_url là link bài thật), failed = đăng lỗi (message là lý
// do thật), queued = đích đang được xử lý NỀN như khi người
// dùng nhắn trực tiếp (nhóm — Meta không có API đăng bài nhóm —
// đăng bằng trình duyệt qua reportBrowserPublish; Instagram —
// tải ảnh + đăng qua CLI tốn hơn ngân sách 30 giây của một lượt
// gọi action nên chạy ở tác vụ agent riêng qua
// reportInstagramPublish), needs_login = đích đăng bằng trình
// duyệt Muse (nhóm / Page caption dài) đang CHỜ người dùng
// đăng nhập Facebook trong CHÍNH cửa sổ trình duyệt Muse mà
// tác vụ đăng vừa mở (phiên đăng nhập được lưu trong hồ sơ của
// trình duyệt đó cho mọi lần đăng sau — người dùng đăng nhập 1
// lần rồi bấm "Đăng Bài" lại là đăng tiếp, KHÔNG tính là đăng
// lỗi), uncertain = lượt đăng Instagram bị ngắt giữa chừng (quá
// thời gian chờ) nên CHƯA RÕ bài đã lên hay chưa — phải kiểm tra
// trên Instagram trước khi đăng lại, skipped = đích đã đăng
// thành công / đang xử lý nên lượt này bỏ qua để chống đăng
// trùng.
export const publishRecords = sqliteTable("publish_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  draftId: integer("draft_id").notNull(),
  targetKind: text("target_kind", {
    enum: ["page", "instagram", "group", "account"],
  })
    .notNull()
    .default("page"),
  targetName: text("target_name").notNull().default(""),
  status: text("status", {
    enum: [
      "published",
      "failed",
      "unsupported",
      "skipped",
      "queued",
      "uncertain",
      "needs_login",
    ],
  })
    .notNull()
    .default("failed"),
  postUrl: text("post_url").notNull().default(""),
  message: text("message").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const mediaItems = sqliteTable("media_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  blobKey: text("blob_key").notNull(),
  mime: text("mime").notNull().default(""),
  size: integer("size").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

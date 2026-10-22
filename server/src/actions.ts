// Actions for Social Desk.
//
// Port of the local socdesk.py workflow into artifact actions:
//   draft → approve+pack trong MỘT thao tác (duyệt bị chặn khi còn
//   [...] placeholders; duyệt xong là gói đăng được sinh luôn,
//   trạng thái packed — không còn bước xuất gói riêng).
// Caption generation follows the shop's business rules: hãng xe đọc
// từ Sheet và ĐƯỢC nhắc trong bài, tên sản phẩm luôn giữ nguyên văn,
// giá in dạng che (3xx.xxxđ), kích thước ghi dạng ~, khuyến mãi =
// ngày đăng + 7 ngày và chỉ thể hiện trong khối thông tin sản phẩm,
// kèm hộp + đế mica, quy tắc mở theo tỉ lệ (1:18 và 1:24 mở được
// cốp/cửa/capo, 1:32 sealed), không in STT/SKU vào caption, hashtag
// theo tỉ lệ ở cuối bài.
// Phong cách viết bài: ĐỨC GARAGE — Content bán hàng kết hợp cảm
// xúc và thúc đẩy chuyển đổi (Emotional Sales Copywriting) pha
// Luxury Product Marketing cho sản phẩm sưu tầm, học từ 6 bài mẫu
// của shop: tiêu đề (emoji chủ đề + tên xe nguyên văn + tagline IN
// HOA) → 1–2 đoạn mở đầu gợi cảm xúc (khí chất dòng xe, giá trị
// trưng bày, quà tặng, giọng gọi "anh em") → mục ĐIỂM NỔI BẬT (~5
// dòng ✅ về thiết kế đặc trưng) → 📌 THÔNG TIN SẢN PHẨM (Hãng xe /
// Dòng xe / Tỷ lệ / Màu sắc / Chất liệu Die-cast / Kích thước /
// Chức năng mở / Phụ kiện, rồi 💰 giá / 🎁 ưu đãi / ⏰ thời gian
// khuyến mãi / 📦 tình trạng / 🚚 vận chuyển) → CTA "📩 Inbox ĐỨC
// GARAGE…" → hashtag cuối bài (#DucGarage đứng đầu + tag mẫu xe /
// hãng / tỉ lệ). KHÔNG banner khuyến mãi ở dòng 2 — khuyến mãi chỉ
// nằm trong khối thông tin sản phẩm.
//
// Đồng bộ Sheet theo file "BUSINESS" (tab "Trang tính1"): cột STT /
// Hãng xe / Mẫu / Tỉ lệ / Kích thước (Dài x Rộng x Cao) / Màu / Giá
// bán / Tồn kho / Link ảnh (link THƯ MỤC Drive). Mỗi STT gồm nhiều
// dòng màu — dòng con chỉ có Màu + Tồn kho, kế thừa các cột còn lại
// từ dòng mẹ; tên sản phẩm = Hãng xe + Mẫu. SKU nội bộ của mỗi biến
// thể màu: "STT-Tên sản phẩm-Màu". Không có cột vận chuyển — mặc
// định COD. Quy tắc tỉ lệ: 1:18 và 1:24 mở được cửa/cốp/capo; 1:32
// sealed không mở.

import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { privileged } from "@space/privileged";
import { and, asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

const MAX_POSTS_PER_DAY = 3;
const MIN_INTERVAL_MINUTES = 30;

// Settings helpers (app_settings key/value table).
import type { Ctx } from "@hatch/space-sdk";

type Db = ReturnType<typeof getDb>;
function getDb(ctx: Ctx) {
  return ctx.db<typeof schema>();
}

async function getSetting(db: Db, key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key));
  return row?.value ?? "";
}

async function setSetting(
  db: Db,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value },
    });
}

async function getSheetSettings(db: Db) {
  const [id, name, range, title, lastAt, lastStatus, lastMsg] =
    await Promise.all([
      getSetting(db, "sheet_spreadsheet_id"),
      getSetting(db, "sheet_name"),
      getSetting(db, "sheet_range"),
      getSetting(db, "sheet_title"),
      getSetting(db, "sheet_last_sync_at"),
      getSetting(db, "sheet_last_sync_status"),
      getSetting(db, "sheet_last_sync_message"),
    ]);
  return {
    spreadsheet_id: id,
    sheet_name: name,
    range,
    title,
    last_sync_at: lastAt,
    last_sync_status: lastStatus,
    last_sync_message: lastMsg,
    configured: id.length > 0,
  };
}

type SheetSourceRow = typeof schema.sheetSources.$inferSelect;

async function loadSheetSources(db: Db): Promise<SheetSourceRow[]> {
  return db
    .select()
    .from(schema.sheetSources)
    .orderBy(asc(schema.sheetSources.id));
}

// Nguồn Sheet "chính" (đang chọn): nguồn được đánh dấu trong cài đặt,
// chưa có thì lấy nguồn đầu tiên trong danh sách đã lưu. Trả 0 khi chưa
// lưu nguồn nào.
async function getActiveSourceId(
  db: Db,
  sources: SheetSourceRow[],
): Promise<number> {
  const n = Number(await getSetting(db, "sheet_active_source_id"));
  if (Number.isInteger(n) && sources.some((s) => s.id === n)) return n;
  return sources[0]?.id ?? 0;
}

// Gương một nguồn đã lưu xuống các khóa cài đặt cũ (sheet_*) để Tổng quan
// và các chỗ đọc cài đặt đơn lẻ vẫn thấy đúng nguồn đang chọn.
async function mirrorSourceToSettings(
  db: Db,
  s: SheetSourceRow,
): Promise<void> {
  await setSetting(db, "sheet_spreadsheet_id", s.spreadsheetId);
  await setSetting(db, "sheet_name", s.sheetName);
  await setSetting(db, "sheet_range", s.range);
  await setSetting(db, "sheet_title", s.title);
  await setSetting(db, "sheet_last_sync_at", s.lastSyncAt);
  await setSetting(db, "sheet_last_sync_status", s.lastSyncStatus);
  await setSetting(db, "sheet_last_sync_message", s.lastSyncMessage);
  await setSetting(db, "sheet_active_source_id", String(s.id));
}

async function updateSourceSyncState(
  db: Db,
  sourceId: number,
  patch: { status?: string; message?: string; at?: string; title?: string },
): Promise<void> {
  if (sourceId <= 0) return;
  const set: Partial<SheetSourceRow> = {};
  if (patch.status !== undefined) set.lastSyncStatus = patch.status;
  if (patch.message !== undefined) set.lastSyncMessage = patch.message;
  if (patch.at !== undefined) set.lastSyncAt = patch.at;
  if (patch.title !== undefined && patch.title) set.title = patch.title;
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.sheetSources)
    .set(set)
    .where(eq(schema.sheetSources.id, sourceId));
}

// Mã sản phẩm nội bộ (SKU) theo quy định của shop: "STT-Tên sản
// phẩm-Màu" — ví dụ "1-LEXUS LX600-Trắng". Mỗi biến thể màu có mã
// riêng. Thiếu STT hoặc tên thì không dựng mã (trả "").
function buildSku(stt: string, name: string, color: string): string {
  const s = stt.trim();
  const n = name.trim().replace(/\s+/g, " ");
  const c = color.trim().replace(/\s+/g, " ");
  if (!s || !n) return "";
  return c ? `${s}-${n}-${c}` : `${s}-${n}`;
}

function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return "";
}

// Link Google Drive dạng trang xem (…/file/d/<ID>/view) trả về trang HTML
// chứ không phải file ảnh, nên trình duyệt không hiển thị được trong thẻ
// ảnh. Dạng thumbnail?id=<ID> mới tải được ảnh trực tiếp (vẫn cần file đã
// bật chia sẻ "bất kỳ ai có đường link").
function extractDriveFileId(raw: string): string {
  const s = raw.trim();
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /drive\.google\.com\/(?:open|uc|thumbnail)\?[^#]*\bid=([a-zA-Z0-9_-]{10,})/,
    /docs\.google\.com\/uc\?[^#]*\bid=([a-zA-Z0-9_-]{10,})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) return m[1];
  }
  return "";
}

function normalizeSheetImageUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const id = extractDriveFileId(s);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
  return s;
}

// Link ảnh trong Sheet mới là link THƯ MỤC Google Drive
// (…/drive/folders/<ID>) chứ không phải link một file ảnh. Google
// Drive ĐÃ kết nối (tài khoản alexsander01102000@gmail.com): app tự
// mở đúng thư mục đó qua Drive (privileged listDriveFolder) khi
// đồng bộ Sheet và khi bấm "Quét lại ảnh Drive" trên thẻ sản phẩm,
// liệt kê các file ảnh THẬT bên trong và lưu vào sản phẩm. Khi
// SOẠN BÀI và khi XUẤT GÓI ĐĂNG thì KHÔNG quét lại Drive nữa:
// bản nháp dùng thẳng tập ảnh đã lưu sẵn trong sản phẩm từ lần
// đồng bộ gần nhất (hoặc tập ảnh người dùng đã chốt trong form),
// và gói đăng dùng đúng tập ảnh đã chốt trong bản nháp — người
// dùng đã kiểm soát thêm/bớt ảnh ở form soạn bài nên quét lại chỉ
// làm lượt gửi nặng thêm (từng gây lỗi "Gateway request timed
// out" dù bài vẫn được lưu) và có thể gắn thêm/bớt ảnh ngoài ý
// muốn.
function extractDriveFolderId(raw: string): string {
  const m = raw
    .trim()
    .match(/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]{10,})/);
  return m?.[1] ?? "";
}

// Một file ảnh thật lấy từ thư mục Drive. File gốc phần lớn là HEIC
// (Facebook/Instagram KHÔNG đăng được HEIC) — bản dùng để đăng là
// jpeg_url: bản kết xuất JPEG do Drive tự sinh (thumbnail), luôn là
// JPEG. original_mime giữ định dạng gốc để giao diện ghi rõ trạng
// thái định dạng, không để người dùng cầm file HEIC đi đăng rồi lỗi.
interface DriveImage {
  id: string;
  name: string;
  mime: string;
  size: number;
  jpeg_url: string;
  view_url: string;
  is_heic: boolean;
}

const driveImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  jpeg_url: z.string(),
  view_url: z.string(),
  is_heic: z.boolean(),
});

function parseDriveImages(raw: string): DriveImage[] {
  try {
    const v = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is DriveImage =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as DriveImage).id === "string" &&
        typeof (x as DriveImage).jpeg_url === "string",
    );
  } catch {
    return [];
  }
}

// Danh sách màu của một sản phẩm (JSON mảng trong cột colors).
// Sản phẩm phân loại theo cả màu sắc nên danh sách thường chỉ có
// đúng một màu; dữ liệu cũ chưa có cột này thì suy ra từ cột color
// đơn lẻ.
function parseColors(raw: string, fallbackColor: string): string[] {
  try {
    const v = JSON.parse(raw || "[]") as unknown;
    if (Array.isArray(v)) {
      const list = v
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (list.length > 0) return list;
    }
  } catch {
    // JSON hỏng — rơi xuống dùng màu đơn lẻ bên dưới.
  }
  const single = fallbackColor.trim();
  return single ? [single] : [];
}

type DriveFetchResult =
  | { status: "ok"; folderId: string; images: DriveImage[] }
  | { status: "empty"; folderId: string; images: DriveImage[] }
  | { status: "no_link"; folderId: string; images: DriveImage[]; error: string }
  | { status: "error"; folderId: string; images: DriveImage[]; error: string };

// Mở thư mục Drive của một link ảnh (hoặc folder id) và liệt kê ảnh
// thật bên trong. Chỉ tính file image/* là ảnh. Lỗi quyền/không tìm
// thấy/Drive chưa kết nối được dịch thành thông báo rõ ràng.
async function fetchDriveImages(
  ctx: Ctx,
  imageUrl: string,
): Promise<DriveFetchResult> {
  const url = imageUrl.trim();
  if (!url)
    return {
      status: "no_link",
      folderId: "",
      images: [],
      error: "Sản phẩm chưa có link thư mục ảnh trong Sheet.",
    };
  const folderId = extractDriveFolderId(url);
  if (!folderId) {
    // Link ảnh không phải thư mục Drive (ví dụ link một file ảnh):
    // không liệt kê được — coi như chưa có ảnh thật từ Drive.
    return {
      status: "no_link",
      folderId: "",
      images: [],
      error:
        "Link ảnh không phải link thư mục Google Drive nên app chưa liệt kê được file ảnh thật bên trong.",
    };
  }
  let res: { ok: boolean; stdout: string; stderr: string };
  try {
    res = await ctx.executePrivileged(privileged.listDriveFolder, {
      folderId,
    });
  } catch (e) {
    return {
      status: "error",
      folderId,
      images: [],
      error: friendlyDriveError(e instanceof Error ? e.message : String(e)),
    };
  }
  if (!res.ok)
    return {
      status: "error",
      folderId,
      images: [],
      error: friendlyDriveError(res.stderr || res.stdout),
    };
  let files: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    thumbnailLink?: string;
    webViewLink?: string;
  }> = [];
  try {
    const j = JSON.parse(res.stdout) as { files?: typeof files };
    files = j.files ?? [];
  } catch {
    return {
      status: "error",
      folderId,
      images: [],
      error: "Drive trả dữ liệu không hợp lệ khi liệt kê thư mục ảnh.",
    };
  }
  const images: DriveImage[] = [];
  for (const f of files) {
    const mime = f.mimeType ?? "";
    if (!mime.startsWith("image/") || !f.id) continue;
    const isHeic = /heic|heif/i.test(mime) || /\.hei[cf]$/i.test(f.name ?? "");
    images.push({
      id: f.id,
      name: f.name ?? f.id,
      mime,
      size: Number(f.size ?? 0) || 0,
      // Bản JPEG dùng để đăng: Drive tự kết xuất JPEG từ file gốc
      // (kể cả HEIC) qua thumbnail — ép cỡ lớn w1600.
      jpeg_url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`,
      view_url: f.webViewLink ?? "",
      is_heic: isHeic,
    });
  }
  if (images.length === 0)
    return { status: "empty", folderId, images: [] };
  return { status: "ok", folderId, images };
}

function friendlyDriveError(raw: string): string {
  const s = raw.toLowerCase();
  if (
    s.includes("not_connected") ||
    s.includes("not connected") ||
    s.includes("unauthenticated") ||
    s.includes("401")
  )
    return "Google Drive chưa được cấu hình API (hoặc link thư mục chưa được chia sẻ công khai). Hãy chia sẻ thư mục Drive ở chế độ 'Bất kỳ ai có đường link' (Người xem) rồi thử lại.";
  if (s.includes("404") || s.includes("not_found") || s.includes("not found"))
    return "Không tìm thấy thư mục Drive — link thư mục trong Sheet có thể đã bị xóa hoặc sai.";
  if (
    s.includes("403") ||
    s.includes("permission") ||
    s.includes("forbidden")
  )
    return "Không có quyền mở thư mục Drive này — thư mục cần được chia sẻ cho tài khoản Google đã kết nối (alexsander01102000@gmail.com, quyền Xem là đủ).";
  const tail = raw.trim().slice(0, 200);
  return tail
    ? `Không đọc được thư mục Drive: ${tail}`
    : "Không đọc được thư mục Drive không rõ lý do.";
}

// Ghi kết quả liệt kê Drive vào một sản phẩm (theo id).
async function storeProductDriveImages(
  db: Db,
  productId: number,
  r: DriveFetchResult,
): Promise<void> {
  await db
    .update(schema.products)
    .set({
      driveFolderId: r.folderId,
      driveStatus: r.status,
      driveError: "error" in r ? r.error : "",
      driveCheckedAt: new Date().toISOString(),
      driveImages: JSON.stringify(r.images),
    })
    .where(eq(schema.products.id, productId));
}

// ------------------------------------------------------------ sheet import
// Logic nhập sản phẩm dùng chung cho hai đường đồng bộ:
//  - syncSheetNow: app tự đọc Sheet ngay trong lần bấm (privileged CLI).
//  - importProductsFromSheet: task nền gọi lại với dữ liệu đã đọc.

interface SheetProductInput {
  stt: string;
  sku: string;
  name: string;
  model: string;
  scale: string;
  maker: string;
  size: string;
  color: string;
  price: string;
  stock: number;
  ship: string;
  image_url: string;
  video_url: string;
  external_key: string;
}

interface SheetImportResult {
  ok: boolean;
  inserted: number;
  updated: number;
  total: number;
  message: string;
  // Khóa ngoài (external_key) của các sản phẩm vừa nhập — bước quét
  // ảnh Drive sau đồng bộ dùng để xác định đúng các dòng vừa nhập
  // trong kho sản phẩm.
  keys: string[];
}

async function applySheetImport(
  ctx: Ctx,
  input: {
    source_id: number;
    sheet_title: string;
    products: SheetProductInput[];
  },
): Promise<SheetImportResult> {
  const db = ctx.db<typeof schema>();
  // PHÂN LOẠI SẢN PHẨM (theo yêu cầu người dùng): khóa phân loại là
  // Hãng + Mẫu (tên sản phẩm) + Tỉ lệ + Kích thước + MÀU SẮC. Mỗi tổ
  // hợp 5 trường khác nhau là MỘT sản phẩm riêng — mỗi màu là một
  // biến thể riêng với tồn kho riêng. Chỉ các dòng trùng CẢ 5 trường
  // mới gộp vào nhau (cộng dồn tồn kho); giá / vận chuyển / link ảnh
  // / link video lấy giá trị đầu tiên có trong nhóm (dòng mẹ của STT
  // đứng đầu nhóm nên thường mang đủ các giá trị này).
  const normPart = (s: string): string =>
    s.trim().toLowerCase().replace(/\s+/g, " ");
  interface GroupedProduct {
    key: string;
    stt: string;
    name: string;
    scale: string;
    maker: string;
    size: string;
    color: string;
    price: string;
    stock: number;
    ship: string;
    imageUrl: string;
    videoUrl: string;
  }
  const groups = new Map<string, GroupedProduct>();
  const prefixes = new Set<string>();
  for (const p of input.products) {
    // Tên sản phẩm = "Hãng xe" + "Mẫu" (cắt khoảng trắng thừa) khi
    // Sheet không có cột tên riêng — đúng cấu trúc Sheet BUSINESS.
    const composedName = [p.maker.trim(), p.model.trim()]
      .filter((s) => s.length > 0)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const finalName = p.name.trim() || composedName;
    if (!finalName) continue;
    const maker = p.maker.trim();
    const scale = p.scale.trim();
    const size = p.size.trim();
    // Tiền tố nguồn trong external_key của dòng (ID file Sheet) —
    // đưa vào khóa nhóm để sản phẩm của các nguồn Sheet khác nhau
    // không gộp nhầm vào nhau.
    const rawKey = p.external_key.trim();
    const colonIdx = rawKey.indexOf(":");
    const head = colonIdx > 0 ? rawKey.slice(0, colonIdx) : "";
    const prefix =
      head && head !== "stt" && head !== "name" && head !== "grp"
        ? head
        : "";
    prefixes.add(prefix);
    const color = p.color.trim();
    const groupId = [
      normPart(maker),
      normPart(finalName),
      normPart(scale),
      normPart(size),
      normPart(color),
    ].join("|");
    const key = `${prefix ? `${prefix}:` : ""}grp:${groupId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        stt: "",
        name: finalName,
        scale,
        maker,
        size,
        color,
        price: "",
        stock: 0,
        ship: "",
        imageUrl: "",
        videoUrl: "",
      };
      groups.set(key, g);
    }
    if (!g.stt && p.stt.trim()) g.stt = p.stt.trim();
    g.stock += Number.isFinite(p.stock) ? Math.max(0, p.stock) : 0;
    if (!g.price && p.price.trim()) g.price = p.price.trim();
    if (!g.ship && p.ship.trim()) g.ship = p.ship.trim();
    if (!g.imageUrl) {
      const u = normalizeSheetImageUrl(p.image_url);
      if (u) g.imageUrl = u;
    }
    if (!g.videoUrl && p.video_url.trim()) g.videoUrl = p.video_url.trim();
  }

  let inserted = 0;
  let updated = 0;
  const groupKeys: string[] = [];
  for (const g of groups.values()) {
    const values = {
      stt: g.stt,
      // SKU của từng biến thể: "STT-Tên-Màu" — màu nằm trong khóa
      // phân loại nên mỗi màu có mã riêng.
      sku: buildSku(g.stt, g.name, g.color),
      name: g.name,
      scale: g.scale,
      maker: g.maker,
      size: g.size,
      // Mỗi sản phẩm chỉ có đúng một màu; colors giữ danh sách một
      // phần tử để giao diện/soạn bài đọc thống nhất.
      color: g.color,
      colors: JSON.stringify(g.color ? [g.color] : []),
      price: g.price,
      stock: g.stock,
      // Sheet mới không có cột vận chuyển — mặc định COD (chỉ khi
      // Sheet có ghi cách vận chuyển khác mới dùng giá trị đó).
      ship: g.ship || "COD",
      imageUrl: g.imageUrl,
      videoUrl: g.videoUrl,
    };
    groupKeys.push(g.key);
    const [existing] = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.externalKey, g.key));
    if (existing) {
      await db
        .update(schema.products)
        .set({ ...values, source: "sheet" })
        .where(eq(schema.products.id, existing.id));
      updated += 1;
    } else {
      await db.insert(schema.products).values({
        ...values,
        source: "sheet",
        externalKey: g.key,
      });
      inserted += 1;
    }
  }

  // Dọn các dòng sản phẩm Sheet CŨ của cùng nguồn không còn nằm
  // trong danh sách phân loại hiện tại (điển hình: các dòng gộp
  // không theo màu của các lần đồng bộ trước, khi khóa phân loại
  // chưa gồm màu sắc) — để lại thì danh sách sẽ vừa có dòng cũ vừa
  // có biến thể theo màu trùng nhau. Chỉ xóa dòng source = "sheet"
  // thuộc đúng nguồn này; sản phẩm nhập tay không đụng vào. Bản
  // nháp / gói đăng lưu bản sao dữ kiện riêng nên không bị ảnh hưởng.
  if (groupKeys.length > 0) {
    const keySet = new Set(groupKeys);
    const allRows = await db.select().from(schema.products);
    for (const row of allRows) {
      if (row.source !== "sheet") continue;
      if (keySet.has(row.externalKey)) continue;
      const belongs =
        row.externalKey.startsWith("stt:") ||
        row.externalKey.startsWith("name:") ||
        row.externalKey.startsWith("grp:") ||
        [...prefixes].some(
          (pr) => pr !== "" && row.externalKey.startsWith(`${pr}:`),
        );
      if (belongs)
        await db
          .delete(schema.products)
          .where(eq(schema.products.id, row.id));
    }
  }

  const importedTotal = inserted + updated;
  const groupList = [...groups.values()];
  const withImageLink = groupList.filter((g) => g.imageUrl).length;
  const withoutImage = groupList.length - withImageLink;
  // Thông điệp đồng bộ NGẮN GỌN theo yêu cầu người dùng: chỉ giữ số
  // nhập / thêm mới / cập nhật và số có / chưa có link ảnh. Tab và
  // thời gian đồng bộ do giao diện hiển thị riêng cạnh thông điệp này.
  // (Sau bước quét Drive, syncSheetNow ghi đè lại bằng số ảnh THẬT.)
  const syncMessage =
    `Nhập ${importedTotal} · Mới ${inserted} · Cập nhật ${updated}` +
    ` · Có link ảnh: ${withImageLink} · Chưa có link ảnh: ${withoutImage}`;
  const syncAt = new Date().toISOString();
  await setSetting(db, "sheet_last_sync_at", syncAt);
  await setSetting(db, "sheet_last_sync_status", "success");
  await setSetting(db, "sheet_last_sync_message", syncMessage);
  if (input.sheet_title.trim())
    await setSetting(db, "sheet_title", input.sheet_title.trim());
  // Ghi trạng thái đồng bộ vào đúng nguồn trong danh sách đã lưu:
  // theo source_id nếu biết, nếu không thì khớp theo ID file trong
  // external_key của sản phẩm đầu tiên.
  let targetSourceId = input.source_id;
  if (targetSourceId <= 0) {
    const firstKey = input.products
      .map((p) => p.external_key.trim())
      .find((k) => k.includes(":"));
    const sid = firstKey ? firstKey.split(":")[0] : "";
    if (sid) {
      const sources = await loadSheetSources(db);
      targetSourceId = sources.find((s) => s.spreadsheetId === sid)?.id ?? 0;
    }
  }
  await updateSourceSyncState(db, targetSourceId, {
    status: "success",
    message: syncMessage,
    at: syncAt,
    title: input.sheet_title.trim(),
  });
  ctx.invalidateQueries();
  return {
    ok: true,
    inserted,
    updated,
    total: inserted + updated,
    message: syncMessage,
    keys: groupKeys,
  };
}

async function markSyncFailed(
  ctx: Ctx,
  sourceId: number,
  message: string,
): Promise<void> {
  const db = ctx.db<typeof schema>();
  await setSetting(db, "sheet_last_sync_status", "error");
  await setSetting(db, "sheet_last_sync_message", message);
  await updateSourceSyncState(db, sourceId, {
    status: "error",
    message,
  });
  ctx.invalidateQueries();
}

// ---- Phân tích lưới dữ liệu trả về từ spreadsheets.get (includeGridData)

interface SheetCell {
  formattedValue?: string;
  hyperlink?: string;
  userEnteredValue?: {
    stringValue?: string;
    numberValue?: number;
    formulaValue?: string;
  };
}

interface SheetMergeRange {
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
}

interface SheetGridJson {
  properties?: { title?: string };
  error?: unknown;
  sheets?: Array<{
    properties?: { title?: string };
    merges?: SheetMergeRange[];
    data?: Array<{
      startRow?: number;
      startColumn?: number;
      rowData?: Array<{ values?: SheetCell[] }>;
    }>;
  }>;
}

type SheetField =
  | "stt"
  | "name"
  | "model"
  | "scale"
  | "maker"
  | "size"
  | "color"
  | "price"
  | "stock"
  | "ship"
  | "image_url"
  | "video_url";

function normalizeHeaderText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function mapSheetHeader(raw: string): SheetField | "" {
  // "Mẫu" (dòng xe) và "Màu" (màu xe) sau khi bỏ dấu đều thành "mau"
  // nên phải phân biệt TRƯỚC bằng chữ gốc còn dấu: cột "Mẫu" là dòng
  // xe (tên sản phẩm = Hãng xe + Mẫu), cột "Màu" là màu xe.
  const rawLower = raw.toLowerCase();
  if (rawLower.includes("mẫu")) return "model";
  if (rawLower.includes("màu")) return "color";
  const h = normalizeHeaderText(raw);
  if (!h) return "";
  const table: Record<string, SheetField> = {
    stt: "stt",
    ma: "stt",
    code: "stt",
    "ma sp": "stt",
    "ma san pham": "stt",
    "ten san pham": "name",
    ten: "name",
    "ten sp": "name",
    "san pham": "name",
    product: "name",
    name: "name",
    // Cột "Mẫu" (dòng xe) khi người dùng gõ không dấu.
    model: "model",
    dong: "model",
    "dong xe": "model",
    "ti le": "scale",
    "kich co": "scale",
    "ty le": "scale",
    scale: "scale",
    // Cột hãng xe (Lamborghini, Mercedes-Benz…) — đọc lại theo yêu
    // cầu mới: bài viết được nhắc hãng, tên sản phẩm giữ nguyên văn.
    "hang xe": "maker",
    hang: "maker",
    "hang san xuat": "maker",
    "thuong hieu": "maker",
    maker: "maker",
    brand: "maker",
    make: "maker",
    // Cột kích thước THẬT của mẫu — cột riêng, khác tỉ lệ/kích cỡ.
    // Sheet BUSINESS ghi dạng "Kích thước (Dài x Rộng x Cao)" với giá
    // trị kiểu "21 x 8 x 8" (giữ nguyên dạng chữ như trong Sheet).
    "kich thuoc": "size",
    "kich thuoc (cm)": "size",
    "kich thuoc cm": "size",
    "kich thuoc (dai x rong x cao)": "size",
    "kich thuoc dai x rong x cao": "size",
    "chieu dai": "size",
    "chieu dai (cm)": "size",
    mau: "color",
    "mau xe": "color",
    "mau sac": "color",
    color: "color",
    gia: "price",
    "gia ban": "price",
    price: "price",
    "ton kho": "stock",
    stock: "stock",
    "so luong": "stock",
    ton: "stock",
    ship: "ship",
    "van chuyen": "ship",
    shipping: "ship",
    anh: "image_url",
    "hinh anh": "image_url",
    "anh san pham": "image_url",
    hinh: "image_url",
    image: "image_url",
    photo: "image_url",
    // Sheet BUSINESS dùng cột "Link ảnh" — link THƯ MỤC Google Drive.
    "link anh": "image_url",
    "link hinh anh": "image_url",
    "link hinh": "image_url",
    "thu muc anh": "image_url",
    video: "video_url",
    "link video": "video_url",
    "video url": "video_url",
  };
  return table[h] ?? "";
}

// URL của ô media, theo thứ tự ưu tiên: hyperlink của ô → URL trong công
// thức =IMAGE("…") / =HYPERLINK("…") → chính nội dung ô nếu là URL.
function extractCellUrl(cell: SheetCell | undefined): string {
  if (!cell) return "";
  if (cell.hyperlink && cell.hyperlink.trim()) return cell.hyperlink.trim();
  const formula = cell.userEnteredValue?.formulaValue ?? "";
  const fromFormula = formula.match(/https?:\/\/[^"'\s)]+/);
  if (fromFormula && fromFormula[0]) return fromFormula[0];
  const str = (cell.userEnteredValue?.stringValue ?? "").trim();
  if (/^https?:\/\//i.test(str)) return str;
  const fv = (cell.formattedValue ?? "").trim();
  if (/^https?:\/\//i.test(fv)) return fv;
  return "";
}

// Ô GỘP (merged cells): Sheets API chỉ trả giá trị ở ô GÓC TRÊN-TRÁI
// của vùng gộp; mọi ô còn lại trong vùng gộp về trống. Trong Sheet
// BUSINESS, cột "Hãng xe" được gộp dọc XUYÊN NHIỀU STT (ô "LEXUS" gộp
// chung STT 1 + 2, ô "BMW" gộp chung STT 4 + 5) và nhiều cột khác cũng
// gộp trong nhóm — nếu không điền giá trị của ô góc xuống toàn bộ vùng
// gộp TRƯỚC khi phân tích, các STT nằm dưới vùng gộp (LX570, X5) sẽ bị
// đọc thiếu hãng xe dù Sheet có đủ. Hàm này nhận mảng merges (chỉ số
// tuyệt đối 0-based, end là exclusive) và trả về lưới đã điền: ô trống
// thuộc vùng gộp nhận nguyên ô góc (kể cả hyperlink/công thức).
function expandMergedCells(
  rawRows: Array<{ values?: SheetCell[] }>,
  merges: SheetMergeRange[],
  startRow: number,
  startColumn: number,
): Array<{ values?: SheetCell[] }> {
  if (merges.length === 0) return rawRows;
  const rows = rawRows.map((r) => ({ values: [...(r.values ?? [])] }));
  const cellHasContent = (c: SheetCell | undefined): boolean =>
    !!c &&
    ((c.formattedValue ?? "").trim() !== "" ||
      !!c.hyperlink ||
      !!c.userEnteredValue);
  for (const m of merges) {
    const sr = m.startRowIndex ?? 0;
    const sc = m.startColumnIndex ?? 0;
    const er = m.endRowIndex ?? sr + 1;
    const ec = m.endColumnIndex ?? sc + 1;
    if (er - sr <= 1 && ec - sc <= 1) continue;
    const anchorRowIdx = sr - startRow;
    const anchorColIdx = sc - startColumn;
    if (anchorRowIdx < 0 || anchorColIdx < 0) continue;
    const anchor = rows[anchorRowIdx]?.values?.[anchorColIdx];
    if (!cellHasContent(anchor) || !anchor) continue;
    for (let ar = sr; ar < er; ar += 1) {
      const ri = ar - startRow;
      // Chỉ điền vào các dòng API đã trả về — không tự nới lưới quá
      // vùng dữ liệu, tránh sinh dòng ma từ vùng gộp kéo dài xuống
      // dưới bảng thật.
      if (ri < 0 || ri >= rows.length) continue;
      const rowObj = rows[ri];
      if (!rowObj) continue;
      for (let ac = sc; ac < ec; ac += 1) {
        const ci = ac - startColumn;
        if (ci < 0) continue;
        if (cellHasContent(rowObj.values?.[ci])) continue;
        rowObj.values[ci] = anchor;
      }
    }
  }
  return rows;
}

function parseSheetGrid(
  json: SheetGridJson,
  spreadsheetId: string,
): { sheetTitle: string; products: SheetProductInput[] } {
  const sheetTitle = json.properties?.title ?? "";
  const sheet = json.sheets?.[0];
  const data = sheet?.data?.[0];
  const startRow = data?.startRow ?? 0;
  const startColumn = data?.startColumn ?? 0;
  const rows = expandMergedCells(
    data?.rowData ?? [],
    sheet?.merges ?? [],
    startRow,
    startColumn,
  );
  const headerCells = rows[0]?.values ?? [];
  const colIndex = new Map<SheetField, number>();
  headerCells.forEach((cell, i) => {
    const field = mapSheetHeader(cell.formattedValue ?? "");
    if (field && !colIndex.has(field)) colIndex.set(field, i);
  });
  const cellAt = (
    row: { values?: SheetCell[] } | undefined,
    field: SheetField,
  ): SheetCell | undefined => {
    const idx = colIndex.get(field);
    if (idx === undefined) return undefined;
    return row?.values?.[idx];
  };
  const text = (
    row: { values?: SheetCell[] } | undefined,
    field: SheetField,
  ): string => (cellAt(row, field)?.formattedValue ?? "").trim();
  // Cấu trúc Sheet BUSINESS: mỗi STT gồm NHIỀU dòng màu. Dòng đầu của
  // STT (dòng mẹ) có đủ các cột; các dòng con phía dưới chỉ điền Màu
  // và Tồn kho — mọi cột còn lại (Hãng xe, Mẫu, Tỉ lệ, Kích thước,
  // Giá bán, Link ảnh) KẾ THỪA từ dòng mẹ. Tên sản phẩm = "Hãng xe"
  // + "Mẫu", cắt khoảng trắng thừa. Mỗi dòng (mẹ và từng con) phát
  // ra một bản ghi riêng ở tầng này; applySheetImport phân loại các
  // bản ghi theo Hãng + Mẫu + Tỉ lệ + Kích thước + Màu sắc — mỗi
  // màu là một sản phẩm riêng. Sheet cũ một dòng một sản phẩm (có
  // cột tên riêng) vẫn đọc được: dòng nào có STT/Mẫu/Tên thì là dòng
  // mẹ của chính nó.
  interface ParentRow {
    stt: string;
    name: string;
    model: string;
    maker: string;
    scale: string;
    size: string;
    price: string;
    ship: string;
    image_url: string;
    video_url: string;
  }
  let parent: ParentRow | null = null;
  const seenKeys = new Set<string>();
  const products: SheetProductInput[] = [];
  for (let r = 1; r < rows.length && products.length < 500; r += 1) {
    const row = rows[r];
    const stt = text(row, "stt");
    const rowName = text(row, "name");
    const rowModel = text(row, "model");
    const isParentRow = stt !== "" || rowName !== "" || rowModel !== "";
    if (isParentRow) {
      parent = {
        stt,
        name: rowName,
        model: rowModel,
        maker: text(row, "maker"),
        scale: text(row, "scale"),
        size: text(row, "size"),
        price: text(row, "price"),
        ship: text(row, "ship"),
        image_url: extractCellUrl(cellAt(row, "image_url")),
        video_url: extractCellUrl(cellAt(row, "video_url")),
      };
    }
    if (!parent) continue; // dòng con mồ côi trước mọi dòng mẹ — bỏ qua.
    // Giá trị riêng của dòng (nếu có) thắng; trống thì kế thừa dòng mẹ.
    const pick = (own: string, inherited: string): string =>
      own !== "" ? own : inherited;
    const maker = pick(text(row, "maker"), parent.maker);
    const model = pick(rowModel, parent.model);
    const nameCol = pick(rowName, parent.name);
    const name = nameCol
      ? nameCol.replace(/\s+/g, " ").trim()
      : [maker, model]
          .filter((s) => s.trim().length > 0)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
    if (!name) continue;
    const effStt = pick(stt, parent.stt);
    const color = text(row, "color");
    const stockRaw = text(row, "stock");
    const stockParsed = Number.parseInt(stockRaw.replace(/[^\d-]/g, ""), 10);
    const sheetRowNumber = startRow + r + 1;
    // Ở tầng đọc lưới, mỗi dòng vẫn phát ra một bản ghi riêng (kèm
    // màu + tồn kho của dòng đó); việc PHÂN LOẠI thành sản phẩm
    // theo Hãng + Mẫu + Tỉ lệ + Kích thước + Màu sắc diễn ra ở
    // applySheetImport. Khóa dòng ở đây chỉ để khử trùng trong lưới
    // và mang tiền tố ID file cho khóa phân loại.
    const colorKey = color.toLowerCase().replace(/\s+/g, " ").trim();
    let key = effStt
      ? `${spreadsheetId}:stt:${effStt}:${colorKey || `row${sheetRowNumber}`}`
      : `${spreadsheetId}:${sheetRowNumber}`;
    if (seenKeys.has(key)) key = `${key}:r${sheetRowNumber}`;
    seenKeys.add(key);
    products.push({
      stt: effStt,
      sku: buildSku(effStt, name, color),
      name,
      model,
      scale: pick(text(row, "scale"), parent.scale),
      maker,
      size: pick(text(row, "size"), parent.size),
      color,
      price: pick(text(row, "price"), parent.price),
      stock: Number.isNaN(stockParsed) ? 1 : Math.max(0, stockParsed),
      ship: pick(text(row, "ship"), parent.ship),
      image_url: pick(
        extractCellUrl(cellAt(row, "image_url")),
        parent.image_url,
      ),
      video_url: pick(
        extractCellUrl(cellAt(row, "video_url")),
        parent.video_url,
      ),
      external_key: key,
    });
  }
  return { sheetTitle, products };
}

function friendlySheetError(raw: string): string {
  const s = raw.toLowerCase();
  if (
    s.includes("403") ||
    s.includes("permission_denied") ||
    s.includes("permission denied") ||
    s.includes("forbidden")
  )
    return "Không đọc được file Sheet (lỗi quyền truy cập 403) — file chưa được chia sẻ cho tài khoản Google đã kết nối. Mở file Sheet → Chia sẻ → “Bất kỳ ai có đường link” → Người xem, rồi bấm đồng bộ lại.";
  if (
    s.includes("not_connected") ||
    s.includes("not connected") ||
    s.includes("chưa kết nối") ||
    s.includes("unauthenticated") ||
    s.includes("401")
  )
    return "Không thể kết nối đến Google Sheets (hoặc file chưa được chia sẻ công khai). Hãy mở file Sheet → Chia sẻ → chọn “Bất kỳ ai có đường link” (Quyền Người xem) rồi bấm đồng bộ lại.";
  if (s.includes("404") || s.includes("not_found") || s.includes("not found"))
    return "Không tìm thấy file Sheet — kiểm tra lại link của nguồn Sheet đã lưu.";
  const tail = raw.trim().slice(0, 300);
  return tail
    ? `Đọc Sheet thất bại: ${tail}`
    : "Đọc Sheet thất bại không rõ lý do — thử bấm đồng bộ lại.";
}

function fmtVnd(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "₫";
}

// Giá in trong bài đăng luôn ở dạng CHE theo yêu cầu của shop: giữ chữ
// số đầu tiên, các chữ số còn lại thành x — 300 (nghìn) → "3xx.xxxđ",
// 280 → "2xx.xxxđ", 1.250.000 → "1.xxx.xxxđ". Giá trị ≤ 3 chữ số được
// hiểu là đơn vị nghìn đồng như cách shop ghi trong Sheet.
function maskPrice(price: string): string {
  const raw = price.trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "").replace(/^0+/, "");
  if (!digits) return raw;
  let n = digits;
  if (n.length <= 3) n = `${n}000`;
  const groups: string[] = [];
  let rest = n;
  while (rest.length > 3) {
    groups.unshift("xxx");
    rest = rest.slice(0, -3);
  }
  const first =
    rest.length > 1 ? rest.charAt(0) + "x".repeat(rest.length - 1) : rest;
  return [first, ...groups].join(".") + "đ";
}

// Thời gian khuyến mãi của bài đăng: tính từ ngày đăng (ngày soạn/viết
// lại bài) cộng thêm 7 ngày, hiển thị dd/mm/yyyy theo giờ VN.
function vnDateLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function promoLine(from: Date = new Date()): string {
  const end = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  return `Thời gian khuyến mãi: ${vnDateLabel(from)} – ${vnDateLabel(end)}`;
}

// Dòng ưu đãi trong khối thông tin sản phẩm: sau dòng giá luôn có
// một dòng Ưu đãi riêng (chỉ nằm trong khối thông tin).
function promoOfferLine(): string {
  return "Ưu đãi: Giá ưu đãi trong đợt khuyến mãi, kèm hộp + đế mica trưng bày";
}

// Dòng "Chức năng" trong mục Thông tin sản phẩm: khả năng mở theo
// đúng quy tắc tỉ lệ shop đã xác nhận; tỉ lệ chưa có quy tắc hoặc
// chưa rõ tỉ lệ thì ghi "Cần xác nhận" (và chặn duyệt).
function functionLine(f: DraftFields): string {
  if (opensFully(f.scale)) return "Mở được nắp capo, cửa và cốp";
  if (isConfirmedSealedScale(f.scale))
    return "Bản sealed, thân xe liền khối — không mở nắp capo, cửa, cốp";
  return "Cần xác nhận";
}

function vnDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function vnStamp(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}${get("second")}`;
}

function findPlaceholders(text: string): string[] {
  const found: string[] = text.match(/\[[^\]]+\]/g) ?? [];
  // Thông tin sản phẩm nào chưa có thì ghi "Cần xác nhận" trong mục
  // Thông tin sản phẩm — và mục đó vẫn CHẶN duyệt như placeholder
  // cho tới khi người bán điền đủ.
  for (const line of text.split("\n")) {
    if (!line.includes("Cần xác nhận")) continue;
    // Dòng thông tin có thể bắt đầu bằng "- " hoặc emoji (📌/💰…)
    // — gỡ phần đầu đó rồi lấy nhãn trước dấu ":".
    const label = line.replace(/^[^\p{L}\p{N}]+/u, "");
    const m = label.match(/^([^:]+):\s*Cần xác nhận/);
    found.push(m && m[1] ? `[Cần xác nhận: ${m[1].trim()}]` : "Cần xác nhận");
  }
  return [...new Set(found)].sort();
}

interface DraftFields {
  stt: string;
  productName: string;
  scale: string;
  maker: string;
  color: string;
  price: string;
  stock: string;
  ship: string;
  imageUrl: string;
  videoUrl: string;
  sellingPoint: string;
  sizeCm: string;
}

// Bỏ dấu tiếng Việt + bỏ ký tự không phải chữ/số để dựng slug cho
// hashtag (ví dụ "LEXUS LX600" → "lexuslx600", "Đen" → "den",
// "Mercedes-AMG" → "mercedesamg").
function tagSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

// Bộ hashtag của bài: các tag LIÊN QUAN tới chính bài viết, sinh
// riêng theo từng xe. #DucGarage luôn ĐỨNG ĐẦU (đúng bài mẫu của
// shop), rồi tới: (1) tag cộng đồng diecast/sưu tầm Việt + Anh,
// (2) tag đúng tỉ lệ của xe (xe 1:32 tuyệt đối không gắn tag 1:18),
// (3) tag từ tên sản phẩm giữ nguyên văn (slug gộp cả tên + từng từ
// khóa có chữ/số như lx600, 911, gtr), (4) tag hãng xe, (5) tag màu
// xe, (6) tag khuyến mãi vì bài đang trong đợt khuyến mãi. Thứ tự
// cố định, khử trùng, tối đa 25 tag.
function hashtagsForFields(f: DraftFields): string {
  const tags: string[] = ["#DucGarage"];
  const push = (t: string) => {
    const slug = tagSlug(t);
    if (slug.length < 2 || slug === "ducgarage") return;
    const tag = `#${slug}`;
    if (!tags.includes(tag)) tags.push(tag);
  };
  // (1) Cộng đồng / chủ đề chung của bài bán mô hình.
  for (const t of [
    "mohinhxe",
    "diecast",
    "mohinh",
    "mohinhoto",
    "scalemodel",
    "diecastvietnam",
    "suutam",
    "diecastcollector",
    "mohinhdiecast",
    "xemohinh",
    "diecastmodel",
    "mohinhtrangtri",
  ])
    push(t);
  // (2) Tỉ lệ — chỉ đúng tỉ lệ của xe này.
  const digits = f.scale.replace(/[^\d]/g, "");
  if (digits) {
    push(`mohinh${digits}`);
    push(`xe${digits}`);
    push(`diecast${digits}`);
    push(`scale${digits}`);
  }
  // (3)+(4) Tên sản phẩm + hãng xe: slug gộp và từng từ khóa riêng.
  const nameSlug = tagSlug(f.productName);
  if (nameSlug) push(nameSlug);
  const makerSlug = tagSlug(f.maker);
  if (makerSlug && makerSlug !== nameSlug) push(makerSlug);
  const tokens = `${f.productName} ${f.maker}`
    .split(/[^A-Za-zÀ-ỹ0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  for (const w of tokens) {
    const slug = tagSlug(w);
    // Từ khóa riêng chỉ lấy từ đủ dài hoặc có chứa số (mã dòng xe
    // như LX600, 911, X5) — bỏ các từ nối ngắn vô nghĩa.
    if (slug.length >= 3 || /\d/.test(slug)) push(slug);
  }
  // (5) Màu xe.
  const colorSlug = tagSlug(f.color);
  if (colorSlug) push(`mau${colorSlug}`);
  // (6) Khuyến mãi — bài đang chạy ưu đãi thì tag cũng nói rõ.
  push("khuyenmai");
  push("uudai");
  push("giatot");
  return tags.slice(0, 25).join(" ");
}

function stockText(stock: string): string {
  const n = Number.parseInt(stock, 10);
  if (Number.isNaN(n)) return `còn ${stock} chiếc`;
  if (n === 1) return "chỉ còn đúng 1 chiếc";
  if (n <= 0) return "đã hết hàng";
  return `còn ${n} chiếc`;
}

// Các hãng xe thật phổ biến: khi bài đã có hãng xe, validator dùng
// danh sách này để chặn bài AI nhắc sang một hãng xe KHÁC với hãng
// đã cho (viết sai hãng là sai dữ kiện, phải loại).
const OTHER_CAR_BRANDS = [
  "Lamborghini",
  "Mercedes",
  "Ferrari",
  "Porsche",
  "BMW",
  "Audi",
  "Toyota",
  "Honda",
  "Ford",
  "Nissan",
  "Mazda",
  "Hyundai",
  "Kia",
  "VinFast",
  "Bentley",
  "Rolls-Royce",
  "McLaren",
  "Bugatti",
  "Maserati",
  "Lexus",
  "Volkswagen",
  "Chevrolet",
  "Land Rover",
  "Range Rover",
  "Mini",
  "Peugeot",
  "Volvo",
  "Subaru",
  "Mitsubishi",
];

// Các HỌ hãng cùng một nhà: tên gọi trong cùng họ KHÔNG tính là
// "hãng khác". Land Rover và Range Rover là cùng một nhà — tên sản
// phẩm "LAND ROVER Range Rover SV" buộc phải chứa cả hai tên, nên
// nếu coi "Range Rover" là hãng lạ thì MỌI bài AI cho xe này đều bị
// loại (điều kiện bắt buộc chứa tên sản phẩm và điều kiện cấm nhắc
// "Range Rover" triệt nhau) và bài luôn rơi về mẫu dự phòng cố
// định — bấm viết lại bao nhiêu lần cũng ra y hệt.
const BRAND_FAMILIES: string[][] = [["Land Rover", "Range Rover"]];

// Một hãng được coi là hãng CỦA CHÍNH XE khi: nó nằm trong hãng đã
// khai báo, nó nằm ngay trong tên sản phẩm (tên sản phẩm bắt buộc
// xuất hiện nguyên văn nên mọi tên hãng trong đó đều hợp lệ), hoặc
// nó cùng họ với một tên hãng thỏa hai điều trên.
function isOwnBrand(brand: string, f: DraftFields): boolean {
  const identity = `${f.maker} ${f.productName}`.toLowerCase();
  const family = BRAND_FAMILIES.find((fam) =>
    fam.some((m) => m.toLowerCase() === brand.toLowerCase()),
  );
  const names = family ?? [brand];
  return names.some((n) => identity.includes(n.toLowerCase()));
}

// Tách ô "điểm nhấn" thành từng chi tiết riêng cho mục ĐIỂM NỔI BẬT:
// mỗi dòng là một ý; một đoạn văn không xuống dòng thì tách theo
// dấu chấm phẩy. Gạch đầu dòng / ký hiệu người dùng lỡ gõ sẵn được
// gỡ để không trùng.
function detailBullets(sellingPoint: string): string[] {
  const raw = sellingPoint
    .split(/\n|;/)
    .map((s) =>
      s
        .replace(/^\s*(?:✅|✔|[-*•·])\s*/u, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((s) => s.length > 0);
  return [...new Set(raw)];
}

function cleanDetailLine(s: string): string {
  return s
    .replace(/^\s*(?:✅|✔|[-*•·])\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Quy tắc cấu tạo theo tỉ lệ do người bán XÁC NHẬN: xe tỉ lệ 1:18
// và 1:24 mở được cửa, cốp và nắp capo như nhau; xe tỉ lệ 1:32 là
// bản sealed — thân xe liền khối, KHÔNG mở cửa/cốp/capo. Đây là dữ
// kiện của shop, không phải suy đoán của AI: generator khẳng định mở
// được cho 1:18/1:24 và không bao giờ claim mở cho 1:32.
function scaleDenominator(scale: string): number | null {
  const m = scale.replace(/\s/g, "").match(/^1[:/](\d+)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? "", 10);
  return Number.isNaN(n) ? null : n;
}

function opensFully(scale: string): boolean {
  const d = scaleDenominator(scale);
  return d === 18 || d === 24;
}

// Tỉ lệ đã được người bán XÁC NHẬN là bản sealed: chỉ 1:32. Các tỉ
// lệ chưa có quy tắc của shop (không phải 1:18/1:24/1:32) thì bài
// viết thận trọng: không claim mở bộ phận nào, cũng không khẳng
// định là sealed.
function isConfirmedSealedScale(scale: string): boolean {
  return scaleDenominator(scale) === 32;
}

function isCautiousScale(scale: string): boolean {
  const d = scaleDenominator(scale);
  return d !== null && !opensFully(scale) && d !== 32;
}

// Một dòng chi tiết có đang khẳng định một bộ phận mở được không
// (không tính câu phủ định kiểu "không mở ...").
function claimsOpening(line: string): boolean {
  if (/không mở/i.test(line)) return false;
  return /(mở\s+(được|nắp|cửa|cốp|capo)|cửa.{0,12}mở|cốp.{0,12}mở|capo.{0,12}mở)/i.test(
    line,
  );
}

// ---- Phong cách ĐỨC GARAGE: các mảnh ghép của bài mẫu -------------

// Emoji chủ đề mở đầu tiêu đề, chọn theo tính chất dòng xe như các
// bài mẫu (👑 xe sang, 🔥/🏎️ siêu xe–thể thao, 🔴 Ferrari, 🏁 BMW M,
// 💪 SUV địa hình, 🖤 mặc định sang trọng).
function titleEmojiFor(f: DraftFields): string {
  const n = `${f.productName} ${f.maker}`.toUpperCase();
  if (/MAYBACH|ROLLS|BENTLEY|S680|S-CLASS/.test(n)) return "👑";
  if (/FERRARI/.test(n)) return "🔴";
  if (/LAMBORGHINI/.test(n)) return "🔥";
  if (/PORSCHE/.test(n)) return "🏎️";
  if (/BMW/.test(n) && /\bM[2-8]\b|M PERFORMANCE/.test(n)) return "🏁";
  if (/LAND CRUISER|PRADO|OFF-?ROAD|PICKUP|RAPTOR/.test(n)) return "💪";
  return "🖤";
}

// Tagline IN HOA sau tên xe ở tiêu đề, theo đúng giọng các bài mẫu.
function taglineFor(f: DraftFields): string {
  const n = `${f.productName} ${f.maker}`.toUpperCase();
  if (/MAYBACH|S680/.test(n)) return "ĐẲNG CẤP XE SANG THU NHỎ";
  if (/ROLLS|CULLINAN/.test(n))
    return "KHÍ CHẤT SUV SIÊU SANG TRONG TẦM TAY";
  if (/LAMBORGHINI/.test(n)) return "ĐAM MÊ TỐC ĐỘ, PHONG CÁCH KHÁC BIỆT";
  if (/FERRARI/.test(n)) return "SẮC MÀU CỦA ĐAM MÊ SIÊU XE";
  if (/BMW/.test(n)) return "CHẤT THỂ THAO ĐỨC, CÁ TÍNH RIÊNG CỦA ANH EM";
  if (/LAND CRUISER/.test(n)) return "BẢN LĨNH SUV, PHONG THÁI MẠNH MẼ";
  if (/PORSCHE/.test(n)) return "HUYỀN THOẠI THỂ THAO TRONG TẦM TAY";
  if (/RANGE ROVER/.test(n)) return "KHÍ CHẤT SUV SANG TRONG TẦM TAY";
  if (/LEXUS|LX600|LX570/.test(n)) return "KHÍ CHẤT SUV, ĐẲNG CẤP TRƯNG BÀY";
  if (/CADILLAC/.test(n)) return "PHONG THÁI SUV MỸ ĐẦY CUỐN HÚT";
  return "ĐIỂM NHẤN SƯU TẦM CHO ANH EM MÊ XE";
}

// Dòng xe = tên sản phẩm bỏ phần hãng xe ở đầu (tên sản phẩm vốn là
// "Hãng xe + Mẫu"). Không tách được thì dùng nguyên tên sản phẩm.
function modelLineFor(f: DraftFields): string {
  const name = f.productName.trim();
  const maker = f.maker.trim();
  if (
    maker &&
    name.toLowerCase().startsWith(maker.toLowerCase() + " ")
  )
    return name.slice(maker.length).trim() || name;
  return name;
}

// Hai đoạn mở đầu gợi cảm xúc của mẫu dự phòng, theo giọng bài mẫu:
// mở bằng khí chất dòng xe + gọi "anh em", rồi giá trị trưng bày và
// quà tặng. Chỉ dùng dữ kiện đã có (tên, tỉ lệ, màu) — không bịa
// chi tiết riêng của từng xe.
function introParagraphsFor(f: DraftFields): string[] {
  const model = modelLineFor(f);
  const scalePhrase = f.scale
    ? `Tỷ lệ ${f.scale}`
    : "Phiên bản thu nhỏ này";
  const color = f.color ? ` màu ${f.color}` : "";
  return [
    `Không cần sở hữu ${model} ngoài đời, anh em vẫn có thể mang khí chất của dòng xe này về ngay góc trưng bày của mình!`,
    `${f.productName}${color} gây ấn tượng với vóc dáng bề thế, những đường nét đặc trưng và phong thái riêng khó lẫn. ${scalePhrase} giúp mẫu xe trở nên nổi bật khi trưng bày trên bàn làm việc, trong tủ kính hoặc tại góc garage riêng — cũng là lựa chọn quà tặng ý nghĩa cho anh em đam mê xe.`,
  ];
}

// Các dòng ✅ của mục ĐIỂM NỔI BẬT ở mẫu dự phòng, suy ra từ quy tắc
// tỉ lệ đã xác nhận — mẫu tĩnh không bịa chi tiết riêng của từng xe,
// chỉ nêu đúng cấu tạo theo tỉ lệ và các nhóm thiết kế đặc trưng
// chung như bài mẫu (ngoại thất, lưới tản nhiệt, nội thất, mâm,
// chức năng mở theo tỉ lệ).
function scaleDetailLines(f: DraftFields): string[] {
  const opening = opensFully(f.scale)
    ? "Mở được nắp capo, cửa và cốp — khám phá khoang máy và nội thất như xe thật."
    : isConfirmedSealedScale(f.scale)
      ? "Bản sealed thân xe liền khối, không mở capo/cửa/cốp — đường nét và màu sơn tái hiện sắc nét."
      : "Các chi tiết thân xe được tạo hình liền mạch, đúng phong cách của dòng xe.";
  return [
    "Thiết kế ngoại thất tái hiện đúng phong cách đặc trưng của dòng xe.",
    "Lưới tản nhiệt và cụm đèn tạo điểm nhấn cho phần đầu xe.",
    "Nội thất được mô phỏng tỉ mỉ, đúng chất của dòng xe.",
    "Bộ mâm và tỷ lệ thân xe cân đối, chân thực.",
    opening,
  ];
}

// Kích thước trong bài luôn ghi dạng ~ theo yêu cầu. Sheet BUSINESS
// ghi kích thước dạng "Dài x Rộng x Cao" (ví dụ "21 x 8 x 8") — giữ
// nguyên ba số, thêm đơn vị cm: "~21 x 8 x 8 cm". Một số đo đơn lẻ
// giữ dạng gọn "~25cm" như trước.
function sizeLine(sizeCm: string): string {
  const s = sizeCm.trim().replace(/^~+\s*/, "").replace(/\s+/g, " ");
  if (!s) return "";
  if (/cm/i.test(s)) return `~${s}`;
  return /\s/.test(s) ? `~${s} cm` : `~${s}cm`;
}

// Mẫu dự phòng khi người viết AI không khả dụng: bài viết đúng
// cấu trúc ĐỨC GARAGE như bài mẫu — tiêu đề emoji + tên nguyên văn
// + tagline IN HOA, 2 đoạn mở đầu gợi cảm xúc, mục ĐIỂM NỔI BẬT với
// các dòng ✅, mục 📌 THÔNG TIN SẢN PHẨM đầy đủ rồi 💰🎁⏰📦🚚, CTA
// inbox ĐỨC GARAGE và hashtag (#DucGarage đứng đầu). Các dòng ✅ ở
// mẫu dự phòng đến từ ô chi tiết người bán tự ghi đè (nếu có);
// không có ghi đè thì mẫu tĩnh dùng các dòng thiết kế theo tỉ lệ do
// shop xác nhận (scaleDetailLines) — không tự nghĩ chi tiết riêng
// của từng xe. Trường hợp thường, chính AI writer tự soạn toàn bộ
// bài theo cùng cấu trúc này (xem writeProfessionalCopy) và người
// bán chỉ xem lại khi duyệt.
function buildCaption(f: DraftFields): { caption: string } {
  const priceLine = f.price ? maskPrice(f.price) : "[GIÁ]";
  const scaleLine = f.scale || "[TỈ LỆ]";
  // Vận chuyển mặc định COD (Sheet mới không có cột vận chuyển —
  // người bán quy định mọi sản phẩm đều giao COD).
  const shipLine = f.ship || "COD";
  const tags = hashtagsForFields(f);
  // Dòng người bán tự ghi đè có nhắc kẹp phanh thì bỏ hẳn dòng đó —
  // bài không có chi tiết kẹp phanh. Không có ghi đè thì dùng các
  // dòng thiết kế theo tỉ lệ đã xác nhận (1:18 và 1:24 mở
  // cửa/cốp/capo, 1:32 sealed).
  const overrideBullets = detailBullets(f.sellingPoint).filter(
    (b) => !/kẹp phanh/i.test(b),
  );
  const bullets =
    overrideBullets.length > 0 ? overrideBullets : scaleDetailLines(f);

  // Tiêu đề: emoji chủ đề + tên sản phẩm giữ nguyên văn + tỉ lệ
  // (nếu tên chưa chứa tỉ lệ) + tagline IN HOA — đúng bài mẫu.
  const nameWithScale = f.productName
    .toLowerCase()
    .includes(scaleLine.toLowerCase())
    ? f.productName
    : `${f.productName} ${scaleLine}`;
  const title = `${titleEmojiFor(f)} ${nameWithScale} – ${taglineFor(f)}`;
  const size = sizeLine(f.sizeCm);
  const lines: string[] = [
    title,
    "",
    ...introParagraphsFor(f).flatMap((p) => [p, ""]).slice(0, -1),
    "",
    "✨ ĐIỂM NỔI BẬT",
    "",
    ...bullets.map((b) => `✅ ${b}`),
    "",
    "📌 THÔNG TIN SẢN PHẨM",
    `- Hãng xe: ${f.maker || "Cần xác nhận"}`,
    `- Dòng xe: ${modelLineFor(f)}`,
    `- Tỷ lệ: ${f.scale || "Cần xác nhận"}`,
    `- Màu sắc: ${f.color || "Cần xác nhận"}`,
    "- Chất liệu: Die-cast",
    `- Kích thước: ${size || "Cần xác nhận"}`,
    `- Chức năng: ${functionLine(f)}`,
    "- Phụ kiện đi kèm: Hộp + đế mica trưng bày",
    `💰 Giá bán: ${priceLine} (giá khuyến mãi)`,
    `🎁 ${promoOfferLine()}`,
    `⏰ ${promoLine()}`,
    `📦 Tình trạng: ${stockText(f.stock)}`,
    `🚚 Vận chuyển: ${shipLine}`,
    "",
    "📩 Inbox ĐỨC GARAGE để xem ảnh thực tế, video chi tiết và nhận báo giá nhé!",
    "",
    tags,
  ];
  // Chỉ một bài đăng chính cho Facebook (nhóm + fanpage) — không kèm
  // bản ngắn TikTok/Reels theo yêu cầu của người dùng. Mẫu dự phòng
  // tự nó không sinh "[màu]", nhưng dòng chi tiết người bán tự ghi
  // đè có thể chứa — quét gỡ để bài xuất ra luôn sạch placeholder màu.
  return { caption: stripColorPlaceholders(lines.join("\n"), f.color) };
}

const professionalCopySchema = z.object({
  caption: z.string().min(40).max(3200),
});

// Các dòng chi tiết của bài: những dòng ✅ nằm trong mục "ĐIỂM
// NỔI BẬT" (từ dòng tiêu đề mục — có thể có emoji dẫn như ✨/🔥 —
// tới trước mục 📌 THÔNG TIN SẢN PHẨM). Validator dùng để kiểm số
// lượng chi tiết và quy tắc mở theo tỉ lệ.
function detailLinesOf(caption: string): string[] {
  const lines = caption.split("\n");
  const start = lines.findIndex((l) => /ĐIỂM NỔI BẬT/i.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const t = (lines[i] ?? "").trim();
    if (/THÔNG TIN SẢN PHẨM/i.test(t)) break;
    if (t === "") continue;
    if (!t.startsWith("✅") && !t.startsWith("-")) {
      if (out.length > 0) break;
      continue;
    }
    const cleaned = cleanDetailLine(t.replace(/^-\s*/u, ""));
    if (cleaned) out.push(cleaned);
  }
  return out;
}

// Gỡ placeholder màu khỏi caption: người bán yêu cầu bài xuất ra
// TUYỆT ĐỐI không còn chuỗi "[màu]" (hay biến thể [mau]/[color]/
// [màu sắc]...) ở bất cứ đâu. AI lỡ viết kiểu "tông [màu]" /
// "nội thất [màu]" thì gỡ cả cụm dẫn ("tông", "gam", "màu" đứng
// ngay trước placeholder) để câu không bị cụt nghĩa, rồi dọn
// khoảng trắng/dấu câu lơ lửng do việc gỡ để lại. Chỉ chạm vào
// placeholder LIÊN QUAN TỚI MÀU — [GIÁ]/[TỈ LỆ] là placeholder
// nghiệp vụ có chủ đích ở mục thông tin, giữ nguyên.
//
// Riêng dòng "- Màu sắc: [màu]" ở mục Thông tin sản phẩm: đó là
// màu NGOẠI THẤT của chính xe — đã biết màu của bản nháp thì điền
// đúng màu đó (knownColor), chưa biết thì ghi "Cần xác nhận" theo
// đúng quy ước mục thông tin (vẫn chặn duyệt cho tới khi điền đủ)
// thay vì để lại placeholder hay dòng cụt "- Màu sắc:".
function stripColorPlaceholders(caption: string, knownColor = ""): string {
  if (!/\[[^\]]*(?:màu|mau|color)[^\]]*\]/i.test(caption)) return caption;
  const cleaned = caption
    // Dòng Màu sắc chỉ chứa placeholder màu → điền màu đã biết
    // của bản nháp, chưa biết thì "Cần xác nhận".
    .replace(
      /^(\s*-\s*Màu sắc\s*:\s*)\[[^\]]*(?:màu|mau|color)[^\]]*\]\s*$/gim,
      (_m, label: string) =>
        `${label}${knownColor.trim() || "Cần xác nhận"}`,
    )
    // Cụm dẫn + placeholder: "tông [màu]", "gam màu [màu]",
    // "màu [màu]"… — bỏ cả cụm để khỏi còn từ lơ lửng.
    .replace(
      /(?:tông màu|tông|gam màu|gam|màu sắc|màu)\s*\[[^\]]*(?:màu|mau|color)[^\]]*\]/gi,
      "",
    )
    // Placeholder màu đứng một mình ở bất kỳ vị trí nào còn lại.
    .replace(/\[[^\]]*(?:màu|mau|color)[^\]]*\]/gi, "");
  return cleaned
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.;:!?…])/g, "$1")
        .replace(/\(\s*\)/g, "")
        .replace(/\s+—\s*$/u, "")
        .trimEnd(),
    )
    // Dòng chi tiết bị gỡ rỗng hẳn (chỉ còn "✅" / "-") thì bỏ cả
    // dòng — để lại dòng trống trơ icon còn tệ hơn placeholder.
    // (Dòng trắng phân đoạn vẫn giữ nguyên.)
    .filter((line) => !/^\s*(?:✅|-)\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

// Caption còn chứa placeholder màu không (kiểm tra nhanh dùng cho
// khâu dọn bản nháp cũ và các chốt chặn trước khi lưu/duyệt/xuất
// gói — khớp đúng họ placeholder mà stripColorPlaceholders gỡ).
function hasColorPlaceholder(text: string): boolean {
  return /\[[^\]]*(?:màu|mau|color)[^\]]*\]/i.test(text);
}

// Kiểm tra bài AI viết có bám đúng dữ kiện mua bán không; sai là bỏ,
// dùng mẫu dự phòng. Dữ kiện mua bán nào chưa có thì phải giữ ở dạng
// [ngoặc] hoặc "Cần xác nhận" để bước duyệt chặn lại. Riêng các dòng
// chi tiết thiết kế trong mục ĐIỂM NỔI BẬT: AI writer TỰ soạn theo mẫu xe
// thật (người bán không phải gõ), nên validator chỉ kiểm số
// lượng/cấu trúc tối thiểu và QUY TẮC MỞ THEO TỈ LỆ người bán đã xác
// nhận (1:18 và 1:24 phải khẳng định mở cửa/cốp; 1:32 sealed không
// được claim mở), rồi để người bán đối chiếu với ảnh/video thật ở
// bước duyệt. Nếu người bán đã tự ghi đè ở ô chi tiết, các dòng đó là
// chuẩn bắt buộc: phải xuất hiện nguyên văn trong mục ĐIỂM NỔI BẬT và
// mục đó không được có dòng nào ngoài chúng.
function validateAiCopy(
  raw: { caption: string },
  f: DraftFields,
): { caption: string } | null {
  let caption = raw.caption.trim();
  // Caption tuyệt đối không in mã STT.
  caption = caption.replace(/STT\s*\S+/gi, "").trim();
  // Bài xuất ra không được còn "[màu]": gỡ placeholder màu (kèm
  // cụm dẫn kiểu "tông [màu]") trước mọi bước kiểm tra khác.
  caption = stripColorPlaceholders(caption, f.color);
  if (caption.length < 40) return null;
  // Cấu trúc ĐỨC GARAGE bắt buộc: phải có mục ĐIỂM NỔI BẬT, mục
  // THÔNG TIN SẢN PHẨM và giọng gọi "anh em" trong phần mở đầu —
  // thiếu là loại, dùng mẫu dự phòng vốn luôn đúng cấu trúc.
  if (!/ĐIỂM NỔI BẬT/i.test(caption)) return null;
  if (!/THÔNG TIN SẢN PHẨM/i.test(caption)) return null;
  if (!/anh em/i.test(caption)) return null;
  // Giá chỉ in dạng che: nếu giá thật lọt vào bài thì thay bằng dạng che.
  const masked = maskPrice(f.price);
  if (f.price && masked && masked !== f.price && caption.includes(f.price))
    caption = caption.split(f.price).join(masked);
  // Bỏ hẳn mọi dòng chi tiết về kẹp phanh và mọi dòng điểm nhấn riêng
  // về tông màu ("Tông … nổi bật") — cả hai đều không có trong bài.
  caption = caption
    .split("\n")
    .filter((l) => !/kẹp phanh/i.test(l))
    .filter((l) => !/^\s*(?:-\s*)?Tông\s.+nổi bật/i.test(l))
    .join("\n")
    .trim();
  // Tên sản phẩm phải xuất hiện nguyên văn trong bài (so khớp không
  // phân biệt hoa/thường) — AI viết tắt, đổi thứ tự từ hay thay bằng
  // tên gọi khác là loại, dùng mẫu dự phòng vốn luôn in đúng tên.
  if (!caption.toLowerCase().includes(f.productName.toLowerCase()))
    return null;
  // Đã có hãng xe thì bài không được nhắc sang hãng xe khác —
  // trừ tên hãng nằm ngay trong tên sản phẩm và tên cùng họ hãng
  // (xem isOwnBrand: Land Rover / Range Rover là một nhà).
  if (f.maker) {
    const otherBrand = OTHER_CAR_BRANDS.find(
      (b) =>
        !isOwnBrand(b, f) && caption.toLowerCase().includes(b.toLowerCase()),
    );
    if (otherBrand) return null;
  }
  const overrideBullets = detailBullets(f.sellingPoint).filter(
    (b) => !/kẹp phanh/i.test(b),
  );
  const aiBullets = detailLinesOf(caption);
  if (overrideBullets.length > 0) {
    // Chế độ ghi đè thủ công: dùng đúng dòng người bán tự ghi.
    for (const b of overrideBullets) {
      if (!caption.includes(b)) return null;
    }
    if (aiBullets.some((b) => !overrideBullets.includes(b))) return null;
  } else {
    // Chế độ mặc định AI tự viết chi tiết: mục ĐIỂM NỔI BẬT phải có ít
    // nhất 3 dòng chi tiết và không phình quá 7 dòng.
    if (aiBullets.length < 3 || aiBullets.length > 7) return null;
    // Quy tắc tỉ lệ do người bán xác nhận: 1:18 và 1:24 PHẢI có
    // dòng khẳng định mở được cửa/cốp (thiếu là loại bài); mọi tỉ
    // lệ đã biết khác (1:32 sealed, tỉ lệ chưa có quy tắc) TUYỆT
    // ĐỐI không được claim mở bộ phận nào (có là loại bài). Cả hai
    // trường hợp đều rơi về mẫu dự phòng vốn viết đúng cấu tạo
    // theo tỉ lệ.
    if (opensFully(f.scale) && !aiBullets.some((b) => claimsOpening(b)))
      return null;
    if (
      scaleDenominator(f.scale) !== null &&
      !opensFully(f.scale) &&
      aiBullets.some((b) => claimsOpening(b))
    )
      return null;
  }
  if (f.price) {
    // Bài phải in giá ở dạng che (3xx.xxxđ) — giá thật nguyên văn là sai.
    if (!masked || !caption.includes(masked)) return null;
  } else if (!caption.includes("[GIÁ]")) {
    caption = caption.replace(
      /Giá[^:\n]*:[^\n]*/i,
      "Giá bán: [GIÁ] (giá khuyến mãi)",
    );
    if (!caption.includes("[GIÁ]"))
      caption = `${caption}\n- Giá bán: [GIÁ] (giá khuyến mãi)`;
  }
  // Vận chuyển mặc định COD — không còn placeholder [SHIP]: AI lỡ
  // để dạng chờ điền thì thay bằng giá trị thật (f.ship hoặc COD).
  if (caption.includes("[SHIP"))
    caption = caption.replace(/\[[^\]]*SHIP[^\]]*\]/gi, f.ship || "COD");
  // Kích thước: có giá trị thì giá trị dạng ~ phải có mặt trong bài
  // (nằm ở mục Kích thước của Thông tin sản phẩm).
  const size = sizeLine(f.sizeCm);
  if (size && !caption.includes(size))
    caption = `${caption}\n- Kích thước: ${size}`;
  // Phụ kiện: mọi xe đều kèm hộp + đế mica — thiếu thì bổ sung đúng
  // mục "Phụ kiện đi kèm" của Thông tin sản phẩm.
  if (!/đế mica/i.test(caption))
    caption = `${caption}\n- Phụ kiện đi kèm: Hộp + đế mica trưng bày`;
  // Khuyến mãi: bỏ mọi dòng Ưu đãi / Thời gian khuyến mãi AI tự viết
  // (có thể có emoji 🎁/⏰ hoặc gạch đầu dòng ở đầu), rồi chèn dòng
  // chuẩn — thời gian từ ngày đăng cộng thêm 7 ngày — vào khối
  // thông tin, ngay sau dòng giá. Khuyến mãi chỉ nằm trong khối
  // thông tin, không chèn ở nơi nào khác trong bài (không banner ở
  // dòng 2).
  caption = caption
    .split("\n")
    .filter((l) => !/^[^\p{L}]*(Ưu đãi|Thời gian khuyến mãi)\s*:/u.test(l))
    .join("\n")
    .trim();
  const capLines = caption.split("\n");
  const priceLineIdx = capLines.findIndex((l) => /Giá bán\s*:/.test(l));
  if (priceLineIdx >= 0) {
    capLines.splice(
      priceLineIdx + 1,
      0,
      `🎁 ${promoOfferLine()}`,
      `⏰ ${promoLine()}`,
    );
    caption = capLines.join("\n");
  } else {
    caption = `${caption}\n🎁 ${promoOfferLine()}\n⏰ ${promoLine()}`;
  }
  // CTA cuối bài: bắt buộc là lời kêu gọi inbox ĐỨC GARAGE như bài
  // mẫu — thiếu thì bổ sung trước phần hashtag.
  if (!/Inbox ĐỨC GARAGE/i.test(caption))
    caption = `${caption}\n\n📩 Inbox ĐỨC GARAGE để xem ảnh thực tế, video chi tiết và nhận báo giá nhé!`;
  // Hashtag: gỡ mọi dòng chỉ gồm hashtag mà AI tự viết (thường ít
  // và chung chung), rồi gắn bộ tag sinh riêng theo xe này ở cuối
  // bài (gồm tag theo đúng tỉ lệ của xe).
  caption = caption
    .split("\n")
    .filter((l) => !/^(\s*#\S+\s*)+$/.test(l.trim()) || l.trim() === "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  caption = `${caption}\n\n${hashtagsForFields(f)}`;
  // Bảo hiểm cuối trước khi bài được lưu: (1) chuỗi "[màu]" không
  // được tồn tại ở bất cứ đâu trong caption; (2) vùng nội dung
  // (mọi dòng trước mục 📌 THÔNG TIN SẢN PHẨM) không được còn
  // placeholder [ngoặc vuông] nào ngoài [TỈ LỆ] ở tiêu đề khi tỉ
  // lệ chưa có. Dính một trong hai là loại bài AI này — bước gọi
  // sẽ thử viết lại hoặc rơi về mẫu dự phòng vốn không sinh
  // placeholder màu.
  if (/\[màu\]/i.test(caption)) return null;
  const infoIdx = caption.search(/THÔNG TIN SẢN PHẨM/i);
  const contentRegion = infoIdx >= 0 ? caption.slice(0, infoIdx) : caption;
  const strayPlaceholders = (
    contentRegion.match(/\[[^\]]+\]/g) ?? []
  ).filter((p) => p !== "[TỈ LỆ]");
  if (strayPlaceholders.length > 0) return null;
  return { caption };
}

// Người viết bài: viết bài bán mô hình từ các giá trị người dùng đã
// cho (tên, hãng xe, tỉ lệ, màu, giá, tồn kho, vận chuyển, kích
// thước) theo phong cách ĐỨC GARAGE — Emotional Sales Copywriting
// pha Luxury Product Marketing: tiêu đề emoji + tagline IN HOA,
// đoạn mở đầu gợi cảm xúc gọi "anh em", mục ĐIỂM NỔI BẬT, mục 📌
// THÔNG TIN SẢN PHẨM, CTA inbox ĐỨC GARAGE, hashtag #DucGarage
// đứng đầu. Tên sản phẩm giữ nguyên văn trong bài và hãng xe được
// nhắc nguyên văn khi có. PHẦN CHI TIẾT
// THIẾT KẾ (các dòng ✅ trong mục ĐIỂM NỔI BẬT) do chính AI writer TỰ SOẠN
// — dựa trên kiến thức về mẫu xe thật ở tỉ lệ đó — người bán không
// phải gõ; họ chỉ đối chiếu với ảnh/video của chiếc xe khi duyệt.
// Riêng việc bộ phận nào mở được thì theo QUY TẮC TỈ LỆ người bán
// đã xác nhận: 1:18 và 1:24 mở được cửa, cốp và nắp capo; 1:32 là
// bản sealed không mở — generator khẳng định theo quy tắc này và
// validateAiCopy chặn bài viết sai quy tắc. Chỉ khi người bán đã tự
// ghi ở ô chi tiết (ghi đè thủ công) thì dùng đúng các dòng đó.
async function writeProfessionalCopy(
  ctx: Ctx,
  f: DraftFields,
  opts?: { previousCaption?: string },
): Promise<{ caption: string; writer: "ai" | "template" }> {
  const hasOverride = detailBullets(f.sellingPoint).length > 0;
  const given = [
    `- Tên sản phẩm (GIỮ NGUYÊN VĂN từng chữ trong bài — đúng hoa/thường, đúng thứ tự từ, không viết tắt, không đổi thành tên gọi khác): ${f.productName}`,
    `- Tên hãng xe (ĐƯỢC nhắc trong bài, dùng lại nguyên văn giá trị này, không tự suy ra hãng khác): ${f.maker || "(chưa cung cấp — ở mục Hãng xe ghi đúng 'Cần xác nhận')"}`,
    `- Tỉ lệ: ${f.scale || "(chưa cung cấp — ở dòng đầu giữ nguyên văn thành [TỈ LỆ], ở mục Tỷ lệ ghi đúng 'Cần xác nhận')"}`,
    `- Cấu tạo theo tỉ lệ (người bán ĐÃ XÁC NHẬN — áp dụng đúng, không cần đắn đo): ${
      opensFully(f.scale)
        ? `tỉ lệ ${f.scale} của shop MỞ ĐƯỢC cửa, cốp và nắp capo (1:18 và 1:24 cùng quy tắc) — hãy viết khẳng định mở được ở các dòng chi tiết tương ứng`
        : isConfirmedSealedScale(f.scale)
          ? `tỉ lệ ${f.scale} của shop là bản SEALED — thân xe liền khối, KHÔNG mở cửa/cốp/capo; tuyệt đối không khẳng định mở được bất kỳ bộ phận nào`
          : isCautiousScale(f.scale)
            ? `tỉ lệ ${f.scale} chưa có quy tắc cấu tạo của shop — viết thận trọng: không khẳng định mở được bộ phận nào, cũng không khẳng định là bản sealed; chỉ mô tả thiết kế`
            : "chưa rõ cấu tạo theo tỉ lệ — không khẳng định mở được bộ phận nào"
    }`,
    `- Màu xe: ${f.color || "(chưa cung cấp — ở mục Màu sắc ghi đúng 'Cần xác nhận')"}`,
    `- Giá bán (CHỈ in đúng dạng che này trong bài, không in giá thật): ${f.price ? maskPrice(f.price) : "(chưa cung cấp — giữ nguyên văn thành [GIÁ] trong dòng Giá bán)"}`,
    `- Tồn kho: ${f.stock || "1"} chiếc`,
    `- Vận chuyển: ${f.ship || "COD"} (mặc định COD — in đúng giá trị này ở dòng Vận chuyển, không để placeholder)`,
    `- Kích thước: ${f.sizeCm.trim() ? sizeLine(f.sizeCm) : "(chưa cung cấp — trong mục Kích thước ghi đúng 'Cần xác nhận')"}`,
    `- Chức năng (ghi vào mục Chức năng của Thông tin sản phẩm): ${functionLine(f)}`,
    `- Thời gian khuyến mãi (in nguyên văn dòng này vào mục Thông tin sản phẩm, ngay sau dòng Ưu đãi): ${promoLine()}`,
    `- Ưu đãi (in nguyên văn dòng này ngay sau dòng Giá bán): ${promoOfferLine()}`,
    `- Hashtag cuối bài (in nguyên văn cả dòng này, không rút gọn, không thay tag khác): ${hashtagsForFields(f)}`,
    `- Ảnh sản phẩm: ${f.imageUrl ? "có ảnh của chính chiếc xe này (người bán sẽ đối chiếu bài với ảnh này khi duyệt)" : "(chưa có ảnh)"}`,
    `- Video sản phẩm: ${f.videoUrl ? "có video của chính chiếc xe này (người bán sẽ đối chiếu bài với video này khi duyệt)" : "(chưa có video)"}`,
    hasOverride
      ? `- Chi tiết người bán TỰ GHI ĐÈ (dùng đúng các dòng này trong mục ĐIỂM NỔI BẬT, nguyên văn, mỗi dòng bắt đầu bằng '✅ ', không thêm dòng nào khác): ${f.sellingPoint}`
      : "- Chi tiết thiết kế: (người bán không ghi — bạn TỰ SOẠN toàn bộ các dòng ✅ trong mục ĐIỂM NỔI BẬT theo hướng dẫn ở dưới)",
  ].join("\n");
  const fullyOpening = opensFully(f.scale);
  const sealed = isConfirmedSealedScale(f.scale);
  const detailGuide = hasOverride
    ? [
        "Mục ĐIỂM NỔI BẬT: dùng ĐÚNG các dòng chi tiết người bán tự ghi đè ở trên, mỗi dòng bắt đầu bằng '✅ ' nguyên văn, không thêm, không bớt, không diễn giải lại.",
      ]
    : [
        "Mục '✨ ĐIỂM NỔI BẬT' — BẠN TỰ SOẠN khoảng 5 dòng, mỗi dòng mở đầu bằng '✅ ', viết ngắn gọn, giàu cảm xúc như bài mẫu (mô tả thiết kế đặc trưng và cấu tạo: dáng xe, lưới tản nhiệt, cụm đèn, nội thất, bộ mâm), theo đúng thứ tự sau (chỉ gồm các nhóm này — TUYỆT ĐỐI không viết dòng nào về kẹp phanh, và không viết dòng điểm nhấn riêng về tông màu kiểu 'Tông … nổi bật'):",
        fullyOpening
          ? "  - Dòng 1 — Capo & động cơ: mẫu tỉ lệ này (1:18/1:24) MỞ ĐƯỢC nắp capo — viết khẳng định việc mở nắp capo và khoang động cơ của mẫu mô hình, kèm loại động cơ ĐÚNG của xe thật (chỉ nêu loại động cơ khi bạn chắc chắn đúng với mẫu xe thật này; không chắc thì chỉ viết về khoang động cơ chi tiết, không nêu loại động cơ)."
          : sealed
            ? "  - Dòng 1 — Thân xe & động cơ: mẫu này là bản SEALED (thân xe liền khối, không mở nắp capo) — viết về đường nét thân xe và khoang máy tạo hình dưới nắp capo liền khối; TUYỆT ĐỐI không khẳng định mở được nắp capo hay bất kỳ bộ phận nào. Có thể nêu loại động cơ ĐÚNG của xe thật như một nét thiết kế được tái hiện (chỉ khi chắc chắn đúng với mẫu xe thật này)."
            : "  - Dòng 1 — Capo & động cơ: khoang động cơ của mẫu mô hình được tái hiện chi tiết, kèm loại động cơ ĐÚNG của xe thật (chỉ nêu khi chắc chắn đúng với mẫu xe thật này). Không khẳng định mở được nắp capo.",
        fullyOpening
          ? "  - Dòng 2 — Cửa & cốp: mẫu tỉ lệ này (1:18/1:24) MỞ ĐƯỢC cửa và cốp — viết khẳng định số cửa mở được và cốp mở được, kèm chi tiết ngoại thất đi kèm nếu có (cánh gió, ống xả...). Dòng này BẮT BUỘC có trong bài, không được bỏ qua hay viết lảng sang mô tả thiết kế."
          : sealed
            ? "  - Dòng 2 — Thân xe liền khối: nêu rõ bản sealed thân xe liền khối, không mở cửa/cốp — tập trung vào đường nét thân xe, các khe cửa/cốp tạo hình và chi tiết ngoại thất đi kèm nếu có (cánh gió, ống xả...). TUYỆT ĐỐI không viết cửa/cốp mở được."
            : "  - Dòng 2 — Cửa & cốp: mô tả đường nét cửa và cốp được tái hiện trên thân xe, kèm chi tiết ngoại thất đi kèm nếu có (cánh gió, ống xả...). Không khẳng định mở được.",
        "  - Dòng 3 — Nội thất: đặc điểm nội thất của dòng xe thật (ghế, vô lăng, bảng điều khiển...). Màu nội thất: CHỈ nêu khi bạn chắc chắn đúng với phiên bản xe thật này; nếu không chắc màu nội thất thì viết mô tả nội thất mà KHÔNG nhắc tới màu sắc (bỏ hẳn ý màu trong dòng này) — TUYỆT ĐỐI không để placeholder dạng [màu] hay bất kỳ chuỗi trong ngoặc vuông nào trong dòng này.",
        "  - Dòng 4 — Mâm & lốp: kiểu/màu mâm đặc trưng của mẫu xe thật và lốp cao su. Chỉ mâm và lốp — không nhắc tới phanh/kẹp phanh trong dòng này hay bất kỳ dòng nào khác.",
        "  - Dòng 5 — Đèn & mặt trước: chi tiết đèn pha và lưới tản nhiệt/mặt ca-lăng đặc trưng của mẫu xe thật — chỉ nêu chi tiết đặc trưng có thật của dòng xe này.",
        "  - Dòng 6 (chỉ khi còn thông tin đáng nói) — Tổng thể: nhận xét gợi cảm xúc về dáng xe và giá trị trưng bày/sưu tầm. KHÔNG viết phụ kiện thành dòng chi tiết — hộp + đế mica nằm ở mục 'Phụ kiện đi kèm' trong Thông tin sản phẩm.",
        "Căn cứ soạn chi tiết (không bịa): dùng kiến thức của bạn về mẫu xe thật — động cơ, thiết kế đèn/lưới tản nhiệt, phong cách nội thất, mâm đặc trưng. Riêng việc BỘ PHẬN NÀO MỞ ĐƯỢC thì theo đúng quy tắc tỉ lệ người bán đã xác nhận ở trên (1:18 và 1:24 mở cửa/cốp/capo; 1:32 sealed không mở) — đó là dữ kiện của shop, cứ áp dụng, không tự đắn đo hay hạ xuống mức mô tả chung. Người bán sẽ đối chiếu từng dòng với ảnh/video của chiếc xe thật ở bước duyệt, nên chi tiết riêng của xe (loại động cơ, chi tiết đặc trưng) nào không chắc thì viết mô tả chung đúng sự thật thay vì khẳng định cụ thể.",
      ];
  const prompt = [
    "Bạn viết bài bán mô hình xe (diecast) cho shop ĐỨC GARAGE. Hãy viết MỘT bài đăng chính (dùng cho cả hội nhóm, fanpage và Instagram) bằng tiếng Việt, theo phong cách của shop: Content bán hàng kết hợp cảm xúc và thúc đẩy chuyển đổi (Emotional Sales Copywriting) pha Luxury Product Marketing dành cho sản phẩm sưu tầm — văn phong văn vở, giàu cảm xúc, giọng gọi khách là 'anh em', đúng cấu trúc bài mẫu ĐỨC GARAGE dưới đây. Chỉ viết bài chính, không viết thêm bản ngắn TikTok/Reels nào:",
    "",
    given,
    "",
    "Bố cục bắt buộc (đúng thứ tự này):",
    "1. Tiêu đề: MỘT emoji chủ đề hợp với dòng xe (xe sang 👑, siêu xe 🔥/🏎️, Ferrari 🔴, BMW M 🏁, SUV địa hình 💪, mặc định 🖤) + TÊN SẢN PHẨM giữ nguyên văn (đúng hoa/thường như đã cho, không thêm/bớt từ) + tỉ lệ + ' – ' + một TAGLINE IN HOA do bạn sáng tác hợp khí chất dòng xe (kiểu 'ĐẲNG CẤP XE SANG THU NHỎ', 'ĐAM MÊ TỐC ĐỘ, PHONG CÁCH KHÁC BIỆT', 'BẢN LĨNH SUV, PHONG THÁI MẠNH MẼ'). Không thêm năm hay thông tin nào ngoài tên, tỉ lệ và tagline (năm CHỈ xuất hiện khi đã nằm sẵn trong tên sản phẩm). TUYỆT ĐỐI không chèn dòng banner khuyến mãi ngay dưới tiêu đề — khuyến mãi chỉ nằm trong khối thông tin sản phẩm.",
    "2. Đoạn mở đầu: 1–2 đoạn văn gợi cảm xúc ngay sau tiêu đề — mở bằng khí chất/phong thái của dòng xe, gọi khách là 'anh em', gợi giá trị trưng bày (bàn làm việc, tủ kính, góc garage) và giá trị quà tặng cho người mê xe. Văn vở, cuốn hút như bài mẫu, nhưng không bịa dữ kiện mua bán.",
    "3. Mục '✨ ĐIỂM NỔI BẬT' (dòng tiêu đề mục đúng như vậy), rồi các dòng chi tiết bắt đầu bằng '✅ ' theo hướng dẫn chi tiết ở dưới.",
    "4. Mục '📌 THÔNG TIN SẢN PHẨM' (dòng tiêu đề mục đúng như vậy) liệt kê theo đúng thứ tự: '- Hãng xe: ...', '- Dòng xe: <tên dòng xe — tên sản phẩm bỏ phần hãng xe ở đầu; không tách được thì dùng nguyên tên sản phẩm>', '- Tỷ lệ: ...', '- Màu sắc: ...', '- Chất liệu: Die-cast', '- Kích thước: <dạng ~ như đã cho>', '- Chức năng: <theo đúng quy tắc tỉ lệ đã cho ở trên>', '- Phụ kiện đi kèm: Hộp + đế mica trưng bày', rồi các dòng emoji: '💰 Giá bán: <giá dạng che> (giá khuyến mãi)', '🎁 Ưu đãi: ...' (in nguyên văn như đã cho), '⏰ Thời gian khuyến mãi: ...' (in nguyên văn như đã cho), '📦 Tình trạng: <tình trạng tồn kho>', '🚚 Vận chuyển: <giá trị đã cho, mặc định COD>'. Thông tin nào ghi (chưa cung cấp) thì ở mục đó ghi đúng 'Cần xác nhận' — không bỏ mục, không bịa giá trị (riêng giá và tỉ lệ chưa có thì giữ placeholder [GIÁ] / [TỈ LỆ] như đã hướng dẫn ở phần giá trị). Khuyến mãi chỉ xuất hiện trong mục này, không nhắc ở bất kỳ đâu khác trong bài.",
    ...detailGuide.map((l, i) => `${i + 5}. ${l}`),
    "Cuối bài: dòng CTA '📩 Inbox ĐỨC GARAGE để xem ảnh thực tế, video chi tiết và nhận báo giá nhé!' (có thể biến tấu nhẹ câu chữ nhưng phải giữ đúng mẫu '📩 Inbox ĐỨC GARAGE…' và lời mời xem ảnh thực tế/video), rồi dòng hashtag cuối bài.",
    "",
    "Yêu cầu bắt buộc:",
    "0. TUYỆT ĐỐI không xuất hiện placeholder dạng [ngoặc vuông] trong các dòng nội dung của bài (đoạn mở đầu, các dòng ✅ ở mục ĐIỂM NỔI BẬT, CTA) — đặc biệt chuỗi '[màu]' không được xuất hiện ở BẤT CỨ ĐÂU trong bài. Chưa biết một chi tiết nội dung nào (như màu nội thất) thì viết câu mô tả bỏ hẳn chi tiết đó, không để chỗ trống chờ điền. Hai placeholder duy nhất được phép là [GIÁ] và [TỈ LỆ], và chỉ ở đúng vị trí đã hướng dẫn (dòng Giá bán / dòng đầu và mục Tỷ lệ) khi giá/tỉ lệ chưa được cung cấp; thông tin còn thiếu khác thể hiện bằng 'Cần xác nhận' ở mục Thông tin sản phẩm.",
    "1. Dữ kiện mua bán (giá ở dạng che, tồn kho, vận chuyển, màu xe, tỉ lệ) chỉ dùng đúng giá trị đã cho ở trên — không đổi, không tự điền, không in giá thật. Dữ kiện nào ghi (chưa cung cấp) thì xử lý đúng như hướng dẫn ở từng mục. Không bịa năm sản xuất, số lượng sản xuất giới hạn hay giá trị sưu tầm. Tên sản phẩm phải xuất hiện nguyên văn ít nhất ở dòng đầu (trong tiêu đề) và trong phần mở đầu/mục thông tin — không viết tắt, không đổi thứ tự từ, không thay bằng tên gọi khác. Tên hãng xe (nếu có) chỉ dùng đúng nguyên văn giá trị đã cho, không tự nghĩ ra hãng khác.",
    "2. Emoji chỉ dùng đúng các vị trí trong bố cục trên (emoji chủ đề ở tiêu đề, ✨ ở mục ĐIỂM NỔI BẬT, ✅ ở các dòng chi tiết, 📌 ở mục thông tin, 💰🎁⏰📦🚚 ở các dòng giá/ưu đãi/khuyến mãi/tình trạng/vận chuyển, 📩 ở CTA) — không rải emoji ở nơi khác. Không in mã STT/SKU của xe vào bài.",
    `3. Bài dài khoảng 180–300 từ, xuống dòng hợp lý giữa các phần, kết thúc bằng dòng hashtag ĐẦY ĐỦ đã cho ở trên (#DucGarage đứng đầu, rồi các tag liên quan tới chính chiếc xe này — tên xe, hãng xe, dòng xe, màu, tỉ lệ, cộng đồng diecast và khuyến mãi; in nguyên văn, không rút gọn): ${hashtagsForFields(f)}.`,
  ].join("\n");
  // Viết lại (có bản cũ): dặn AI viết KHÁC bản cũ và thử tối đa 2
  // lượt — bài bị validator loại hoặc trùng hệt bản cũ ở lượt đầu
  // thì viết lại lần nữa với yêu cầu nhấn mạnh hơn, thay vì rơi
  // ngay về mẫu dự phòng cố định (vốn luôn cho ra đúng một văn bản
  // nên người bán bấm viết lại mà "không thấy thay đổi gì").
  const previous = (opts?.previousCaption ?? "").trim();
  const fullPrompt = previous
    ? [
        prompt,
        "",
        "LƯU Ý VIẾT LẠI: người bán đang bấm VIẾT LẠI bản nháp này. Bản hiện tại là:",
        "---",
        previous,
        "---",
        "Hãy viết một bài MỚI khác hẳn bản trên về cách diễn đạt (cách trình bày đoạn mở đầu và các dòng ✅ trong mục ĐIỂM NỔI BẬT, thứ tự câu chữ) nhưng giữ nguyên mọi dữ kiện mua bán và đúng bố cục bắt buộc. TUYỆT ĐỐI không chép lại nguyên văn các dòng chi tiết của bản trên.",
      ].join("\n")
    : prompt;
  const attempts = previous ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const out = await ctx.inference.complete(
        attempt === 0
          ? fullPrompt
          : `${fullPrompt}\n\nQUAN TRỌNG: bài lần trước hoặc không đạt chuẩn dữ kiện hoặc trùng với bản cũ — viết lại từ đầu, đổi hẳn cách diễn đạt, vẫn bám đúng mọi dữ kiện đã cho.`,
        { schema: professionalCopySchema },
      );
      const valid = validateAiCopy(out, f);
      if (!valid) continue;
      // Bài AI trùng hệt bản cũ thì coi như chưa viết lại được —
      // thử lượt nữa (hoặc rơi về mẫu và để bước gọi báo rõ).
      if (previous && valid.caption.trim() === previous) continue;
      return { ...valid, writer: "ai" as const };
    } catch {
      // Người viết AI không khả dụng — thử thêm cũng vô ích.
      break;
    }
  }
  return { ...buildCaption(f), writer: "template" as const };
}
// Khung giờ chuẩn để phân tích: mọi bài đăng được xếp vào 1 trong 7 khung
// này theo giờ VN, và điểm tương tác được tính riêng cho từng kênh.
const HOUR_SLOTS = [
  "06:00–09:00",
  "09:00–12:00",
  "12:00–13:00",
  "13:00–17:00",
  "17:00–19:00",
  "19:00–21:00",
  "21:00–23:00",
] as const;

function hourSlotOf(d: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      hour12: false,
    }).format(d),
  );
  if (hour < 9) return "06:00–09:00";
  if (hour < 12) return "09:00–12:00";
  if (hour < 13) return "12:00–13:00";
  if (hour < 17) return "13:00–17:00";
  if (hour < 19) return "17:00–19:00";
  if (hour < 21) return "19:00–21:00";
  return "21:00–23:00";
}

// Điểm tương tác gộp: inbox hỏi mua và đơn chốt nặng nhất, rồi tới
// share/comment (tín hiệu mua thật) hơn like đơn thuần.
function engagementScore(m: {
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  inquiries: number;
  orders: number;
}): number {
  return (
    m.likes +
    m.comments * 3 +
    m.shares * 4 +
    m.clicks * 2 +
    m.inquiries * 8 +
    m.orders * 20
  );
}

const productOut = z.object({
  id: z.number(),
  stt: z.string(),
  sku: z.string(),
  name: z.string(),
  scale: z.string(),
  maker: z.string(),
  size: z.string(),
  color: z.string(),
  // Danh sách màu của sản phẩm (phân loại theo Hãng + Mẫu + Tỉ lệ
  // + Kích thước + Màu sắc — mỗi sản phẩm một màu duy nhất): color
  // là màu của sản phẩm, colors là danh sách một phần tử chứa màu đó.
  colors: z.array(z.string()),
  price: z.string(),
  stock: z.number(),
  ship: z.string(),
  image_url: z.string(),
  video_url: z.string(),
  // Ảnh thật từ Drive: chỉ "có ảnh" khi drive_status = "ok"
  // (đã liệt kê được ≥1 file ảnh thật từ thư mục).
  drive_folder_id: z.string(),
  drive_status: z.string(),
  drive_error: z.string(),
  drive_checked_at: z.string(),
  drive_images: z.array(driveImageSchema),
  has_real_image: z.boolean(),
  source: z.string(),
  created_at: z.string(),
});

const accountOut = z.object({
  id: z.number(),
  platform: z.string(),
  name: z.string(),
  handle: z.string(),
  profile_url: z.string(),
  linked: z.boolean(),
  selected: z.boolean(),
});

type AccountRow = typeof schema.accounts.$inferSelect;

// Link mở thẳng tới trang của tài khoản khi người dùng bấm vào nick:
// - Ưu tiên link trang cá nhân đã lưu (profile_url).
// - Instagram: suy ra từ username dạng @… ở tên/ghi chú.
// - Facebook đang đăng nhập (đã liên kết + đang chọn dùng): facebook.com/me
//   tự chuyển tới đúng trang cá nhân của nick đang đăng nhập trên trình duyệt.
// Ngoài các trường hợp trên trả "" — giao diện hiện ô nhập link để bổ sung.
function deriveProfileUrl(r: AccountRow): string {
  const stored = r.profileUrl.trim();
  if (stored) return stored;
  if (r.platform === "Instagram") {
    const candidate = [r.name, r.handle].find((v) => v.trim().startsWith("@"));
    const username = candidate?.trim().slice(1).split(/\s/)[0] ?? "";
    if (/^[\w.]+$/.test(username))
      return `https://www.instagram.com/${username}/`;
    return "";
  }
  if (r.linked === 1 && r.selected === 1) return "https://www.facebook.com/me";
  return "";
}

function toAccountOut(r: AccountRow): z.infer<typeof accountOut> {
  return {
    id: r.id,
    platform: r.platform,
    name: r.name,
    handle: r.handle,
    profile_url: deriveProfileUrl(r),
    linked: r.linked === 1,
    selected: r.selected === 1,
  };
}

const pageOut = z.object({
  id: z.number(),
  account_id: z.number(),
  account_name: z.string(),
  name: z.string(),
  url: z.string(),
  role: z.string(),
  selected: z.boolean(),
});

type PageRow = typeof schema.fbPages.$inferSelect;

function toPageOut(
  r: PageRow,
  accountName: string,
): z.infer<typeof pageOut> {
  return {
    id: r.id,
    account_id: r.accountId,
    account_name: accountName,
    name: r.name,
    url: r.url,
    role: r.role,
    selected: r.selected === 1,
  };
}

const sheetSourceOut = z.object({
  id: z.number(),
  name: z.string(),
  spreadsheet_id: z.string(),
  sheet_name: z.string(),
  range: z.string(),
  title: z.string(),
  url: z.string(),
  last_sync_at: z.string(),
  last_sync_status: z.string(),
  last_sync_message: z.string(),
  product_count: z.number(),
  is_active: z.boolean(),
});

function toSheetSourceOut(
  r: SheetSourceRow,
  productCount: number,
  isActive: boolean,
): z.infer<typeof sheetSourceOut> {
  return {
    id: r.id,
    name: r.name,
    spreadsheet_id: r.spreadsheetId,
    sheet_name: r.sheetName,
    range: r.range,
    title: r.title,
    url: `https://docs.google.com/spreadsheets/d/${r.spreadsheetId}/edit`,
    last_sync_at: r.lastSyncAt,
    last_sync_status: r.lastSyncStatus,
    last_sync_message: r.lastSyncMessage,
    product_count: productCount,
    is_active: isActive,
  };
}

const sheetConfigOut = z.object({
  configured: z.boolean(),
  spreadsheet_id: z.string(),
  sheet_name: z.string(),
  range: z.string(),
  title: z.string(),
  last_sync_at: z.string(),
  last_sync_status: z.string(),
  last_sync_message: z.string(),
  sheet_product_count: z.number(),
  active_source_id: z.number(),
  sources: z.array(sheetSourceOut),
});

const runOut = z.object({
  id: z.number(),
  query: z.string(),
  ran_at: z.string(),
  marketplace_count: z.number(),
  price_count: z.number(),
  price_min: z.number().nullable(),
  price_median: z.number().nullable(),
  price_max: z.number().nullable(),
  price_min_fmt: z.string(),
  price_median_fmt: z.string(),
  price_max_fmt: z.string(),
  groups_found: z.number(),
  notes: z.string(),
});

const groupMembershipOut = z.object({
  identity_kind: z.enum(["account", "page", "instagram"]),
  identity_id: z.number(),
  identity_name: z.string(),
  // CHỈ hai trạng thái (người dùng chốt — không có "Chưa rõ"):
  // joined = đã tham gia · not_joined = chưa tham gia.
  status: z.enum(["joined", "not_joined"]),
});

type MembershipStatus = "joined" | "not_joined";

// ------------------------------------------------- trạng thái tham gia nhóm
// Trạng thái tham gia là của TỪNG cặp (nhóm, danh tính) — tài
// khoản Facebook chính và từng Page con là các danh tính ĐỘC LẬP:
// Page đã tham gia một nhóm KHÔNG có nghĩa tài khoản chính cũng
// đã tham gia nhóm đó, và ngược lại (người dùng chốt: "page con
// và tài khoản chính có thể không cùng trạng thái"). Vì vậy toàn
// app KHÔNG còn một cờ "nhóm đã tham gia" gộp chung:
//   - Trạng thái của một cặp (nhóm, danh tính) lấy từ bảng
//     group_memberships của ĐÚNG danh tính đó; chưa có dòng thì
//     là "chưa tham gia" — ngoại lệ duy nhất: tài khoản Facebook
//     chính (nick đang chọn, rồi tới nick có id nhỏ nhất) khi cờ
//     joined của nhóm đang bật, vì sau migration 0021 cờ đó chỉ
//     còn phản ánh đúng trạng thái của tài khoản chính.
//   - Cột fb_groups.joined từ nay CHỈ là trạng thái của tài
//     khoản chính (không OR trạng thái của Page vào nữa).
//   - Điều kiện đăng được vào một nhóm xét theo danh tính sẽ
//     đăng: chỉ đăng bằng danh tính nào có trạng thái joined với
//     nhóm đó; gói đăng ghi trạng thái RIÊNG của từng danh tính
//     cho từng nhóm để không ai hiểu nhầm Page và tài khoản
//     chính cùng một trạng thái.
type JoinIdentity = {
  kind: "account" | "page";
  id: number;
  name: string;
  // true = danh tính sẽ đăng bài (đang chọn dùng để đăng).
  posting: boolean;
};

type JoinContext = {
  identities: JoinIdentity[];
  memMap: Map<string, string>;
  primaryAccountId: number;
};

async function loadJoinContext(db: Db): Promise<JoinContext> {
  const fbAccounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.platform, "Facebook"))
    .orderBy(desc(schema.accounts.selected), asc(schema.accounts.id));
  const pages = await db
    .select()
    .from(schema.fbPages)
    .orderBy(asc(schema.fbPages.id));
  const memRows = await db.select().from(schema.groupMemberships);
  const memMap = new Map<string, string>();
  for (const m of memRows)
    memMap.set(`${m.groupId}|${m.identityKind}|${m.identityId}`, m.status);
  const identities: JoinIdentity[] = [];
  for (const a of fbAccounts)
    identities.push({
      kind: "account",
      id: a.id,
      name: a.name,
      posting: a.selected === 1,
    });
  // "Danh tính đang chọn đăng" xét theo CHÍNH danh tính đó: Page
  // được chọn đăng thì tính là danh tính sẽ đăng theo cờ chọn của
  // Page — KHÔNG kèm điều kiện tài khoản chủ sở hữu cũng đang
  // chọn (trước đây có "cổng kép" này nên Page đã chọn đăng vẫn bị
  // loại khỏi danh sách nhóm đích khi nick chủ đang tắt chọn, trong
  // khi mục Fanpage chỉ xét cờ chọn của Page nên hai mục không
  // đồng nhất). Trạng thái của Page và tài khoản chính tính riêng.
  for (const p of pages)
    identities.push({
      kind: "page",
      id: p.id,
      name: p.name,
      posting: p.selected === 1,
    });
  return { identities, memMap, primaryAccountId: fbAccounts[0]?.id ?? 0 };
}

type GroupRowForJoin = { id: number; joined: number };

function membershipStatusOf(
  jc: JoinContext,
  group: GroupRowForJoin,
  identity: JoinIdentity,
): MembershipStatus {
  const stored = jc.memMap.get(`${group.id}|${identity.kind}|${identity.id}`);
  if (stored === "joined" || stored === "not_joined") return stored;
  if (
    identity.kind === "account" &&
    identity.id === jc.primaryAccountId &&
    group.joined === 1
  )
    return "joined";
  return "not_joined";
}

function buildMemberships(
  jc: JoinContext,
  group: GroupRowForJoin,
): z.infer<typeof groupMembershipOut>[] {
  return jc.identities.map((identity) => ({
    identity_kind: identity.kind,
    identity_id: identity.id,
    identity_name: identity.name,
    status: membershipStatusOf(jc, group, identity),
  }));
}

// Danh tính sẽ đăng nào ĐÃ tham gia nhóm này — danh sách theo
// TỪNG danh tính (Page con và tài khoản chính tách riêng, không
// gộp thành một trạng thái của cả nhóm). Rỗng = chưa có danh
// tính sẽ đăng nào tham gia nhóm này nên chưa đăng được.
function postingJoinedIdentities(
  jc: JoinContext,
  group: GroupRowForJoin,
): JoinIdentity[] {
  return jc.identities.filter(
    (i) => i.posting && membershipStatusOf(jc, group, i) === "joined",
  );
}

// Danh tính tài khoản Facebook chính (nick đang chọn dùng, rồi
// tới nick có id nhỏ nhất) — chủ của cờ fb_groups.joined.
function mainAccountIdentity(jc: JoinContext): JoinIdentity | undefined {
  return jc.identities.find(
    (i) => i.kind === "account" && i.id === jc.primaryAccountId,
  );
}

// Trạng thái tham gia của RIÊNG tài khoản chính với nhóm này —
// KHÔNG suy từ trạng thái của bất kỳ Page con nào.
function accountCountsAsJoined(
  jc: JoinContext,
  group: GroupRowForJoin,
): boolean {
  const main = mainAccountIdentity(jc);
  if (!main) return false;
  return membershipStatusOf(jc, group, main) === "joined";
}

// Các Page con đang chọn đăng ĐÃ tham gia nhóm này (từng Page
// tính riêng — Page này tham gia không kéo theo Page khác hay
// tài khoản chính).
function joinedPostingPages(
  jc: JoinContext,
  group: GroupRowForJoin,
): JoinIdentity[] {
  return postingJoinedIdentities(jc, group).filter((i) => i.kind === "page");
}

// Đồng bộ cột fb_groups.joined theo trạng thái của RIÊNG tài
// khoản chính, để cột này không bao giờ mang trạng thái của một
// Page con (trước đây cột này là OR của mọi danh tính sẽ đăng
// nên Page tham gia cũng làm tài khoản chính trông như đã tham
// gia). Mọi luồng cần trạng thái của danh tính nào thì đọc đúng
// danh tính đó qua các hàm trên.
async function syncStoredGroupJoined(
  db: Db,
  groupId: number,
): Promise<void> {
  const [group] = await db
    .select()
    .from(schema.fbGroups)
    .where(eq(schema.fbGroups.id, groupId));
  if (!group) return;
  const jc = await loadJoinContext(db);
  const joined = accountCountsAsJoined(jc, group);
  if ((group.joined === 1) !== joined) {
    await db
      .update(schema.fbGroups)
      .set({ joined: joined ? 1 : 0 })
      .where(eq(schema.fbGroups.id, groupId));
  }
}

const groupOut = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string(),
  members: z.number(),
  // joined / account_joined = trạng thái tham gia của RIÊNG tài
  // khoản Facebook chính với nhóm này — không gộp trạng thái của
  // Page con vào (Page và tài khoản chính có thể khác trạng thái).
  joined: z.boolean(),
  account_joined: z.boolean(),
  // Các Page con đang chọn đăng ĐÃ tham gia nhóm này (từng Page
  // riêng) — để Hàng đợi/gói đăng ghi rõ đăng được bằng Page nào,
  // tách khỏi trạng thái của tài khoản chính.
  joined_pages: z.array(z.object({ id: z.number(), name: z.string() })),
  is_target: z.boolean(),
  created_at: z.string(),
  // Trạng thái tham gia của TỪNG tài khoản Facebook / Page đối với
  // nhóm này (Đức Trí, Hôm nay xem gì, Ở đây có xe đẹp…).
  memberships: z.array(groupMembershipOut),
});

// Tên tài khoản Facebook ĐÃ LIÊN KẾT sẽ thực hiện việc thêm nhóm:
// ưu tiên nick đang được chọn dùng (selected), rồi tới nick liên kết
// có id nhỏ nhất. Chưa liên kết nick nào → "" (giao diện báo rõ cần
// liên kết trước, và nhóm thêm lúc đó không mang nhãn tài khoản).
async function linkedFbAccountName(db: Db): Promise<string> {
  const rows = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.platform, "Facebook"),
        eq(schema.accounts.linked, 1),
      ),
    )
    .orderBy(desc(schema.accounts.selected), asc(schema.accounts.id));
  return rows[0]?.name.trim() ?? "";
}

const foundGroupOut = z.object({
  fb_id: z.string(),
  name: z.string(),
  url: z.string(),
  members: z.number(),
  description: z.string(),
  already_added: z.boolean(),
});

const findGroupsAttempt = z.object({
  keywords: z.string(),
  sort_by: z.string(),
  status: z.string(),
  raw_count: z.number(),
  matched_count: z.number(),
  note: z.string(),
});

const findGroupsResponse = z.object({
  ok: z.boolean(),
  message: z.string(),
  raw_count: z.number(),
  matched_count: z.number(),
  results: z.array(foundGroupOut),
  attempts: z.array(findGroupsAttempt),
});

// ------------------------------------------------- hội nhóm theo LINK
// Người dùng chốt luồng hiện tại (thay toàn bộ các luồng tìm nhóm
// trước — tìm bằng CLI, spawn task đọc web, extension Chrome đều đã
// gỡ): người dùng tự gửi LINK nhóm Facebook vào app, bấm "Lưu" →
// action `saveGroupLinks` QUÉT từng link:
//   1) đọc chi tiết thật của nhóm (tên, số thành viên, mô tả, tính
//      công khai) bằng lệnh `groups details` qua tài khoản Facebook
//      ĐÃ LIÊN KẾT;
//   2) kiểm tra trạng thái tham gia của nick Facebook đó bằng hai
//      bằng chứng kênh liên kết thật sự cung cấp được: (a) nhóm nằm
//      trong danh sách `groups search --role connected`, (b) nhóm
//      KÍN mà tài khoản đọc được bài bên trong (`groups posts`) —
//      chỉ thành viên mới đọc được. Có bằng chứng mới ghi trạng
//      thái joined; không có bằng chứng thì lượt quét báo "chưa
//      tham gia" (người dùng chốt CHỈ hai trạng thái — không còn
//      "Chưa rõ") và ghi chú của lượt quét nói rõ đây là do chưa
//      thấy bằng chứng để người dùng đặt lại tay nếu nick đã tham
//      gia thật.
//   3) Page: kênh liên kết không có bề mặt đọc trạng thái tham gia
//      nhóm của Page, nên trên thẻ nhóm Page mặc định là "Chưa tham
//      gia" — người dùng đặt tay sau khi kiểm tra trên Facebook.
//      Instagram không tham gia được nhóm Facebook nên không hiển
//      thị trên thẻ nhóm.
// Nhóm được LƯU THẲNG vào danh sách (trùng link thì cập nhật tên/số
// thành viên, không nhân đôi, không ghi đè trạng thái tham gia người
// dùng đã đặt tay) và danh sách hiển thị theo TÊN nhóm.

function asGroupRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

// Bộ đọc khoan dung cho kết quả `groups search`: CLI từng trả mảng nhóm
// ở khóa `groups` tại gốc, nhưng các biến thể (bọc trong `data`, khóa
// `results`/`items`, mảng trần) đều phải đọc được — lệch định dạng
// không được phép nuốt lặng kết quả như trước.
function extractGroupRows(parsed: unknown): Record<string, unknown>[] {
  const candidates: unknown[] = [];
  if (Array.isArray(parsed)) candidates.push(parsed);
  const root = asGroupRecord(parsed);
  if (root) {
    candidates.push(root.groups, root.results, root.items);
    const data = asGroupRecord(root.data);
    if (data) candidates.push(data.groups, data.results, data.items);
  }
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c
        .map((x) => asGroupRecord(x))
        .filter((x): x is Record<string, unknown> => x !== null);
    }
  }
  return [];
}

function pickStr(rec: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

// Số thành viên có thể là số, hoặc chuỗi "16,000" / "16.000" / "16K" /
// "1.2M" / "1,2 Tr" / "12 N" tùy biến thể đầu ra — đọc được hết theo
// đúng cách hiển thị rút gọn của Facebook VN (N = nghìn, Tr = triệu)
// như bộ đọc phía client, không đọc được thì 0.
function parseMemberCount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.round(v));
  }
  if (typeof v !== "string") return 0;
  const s = v.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return 0;
  let mult = 1;
  let core = s;
  if (s.endsWith("tr")) {
    mult = 1_000_000;
    core = s.slice(0, -2);
  } else if (s.endsWith("k") || s.endsWith("n")) {
    mult = 1000;
    core = s.slice(0, -1);
  } else if (s.endsWith("m")) {
    mult = 1_000_000;
    core = s.slice(0, -1);
  }
  let n: number;
  if (mult > 1) {
    n = parseFloat(core.replace(/,/g, "."));
  } else {
    n = parseFloat(
      core.replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", "."),
    );
  }
  return Number.isFinite(n) ? Math.max(0, Math.round(n * mult)) : 0;
}

// Một lần ĐĂNG THẬT lên một đích (từ nút "Đăng thật"): kết quả
// thật từ connector, kèm link bài khi đăng thành công.
const publishRecordOut = z.object({
  id: z.number(),
  target_kind: z.enum(["page", "instagram", "group", "account"]),
  target_name: z.string(),
  status: z.enum([
    "published",
    "failed",
    "unsupported",
    "skipped",
    "queued",
    "uncertain",
    "needs_login",
  ]),
  post_url: z.string(),
  message: z.string(),
  created_at: z.string(),
});

// Dấu hiệu một lượt đăng bị NGẮT GIỮA CHỪNG vì quá ngân sách thời
// gian của lượt gọi (daemon request … wall-clock budget) chứ không
// phải lỗi nghiệp vụ rõ ràng: hệ thống tự cắt request trong khi
// lệnh đăng ở phía Instagram có thể đã chạy xong hoặc chưa — kết
// quả thật KHÔNG xác định được từ phía app.
function isPublishTimeoutMessage(message: string): boolean {
  return /wall-clock budget|exceeded \d+\s*ms|timed?\s?out|quá thời gian chờ/i.test(
    message,
  );
}

// Dấu hiệu một lượt đăng bằng TRÌNH DUYỆT (nhóm / Page caption
// dài) bị chặn ở MÀN HÌNH ĐĂNG NHẬP Facebook: trình duyệt Muse
// của tác vụ đăng chưa có phiên facebook.com đã lưu. Đây không
// phải "đăng lỗi" — là trạng thái CHỜ người dùng đăng nhập 1 lần
// trong chính cửa sổ trình duyệt đó (phiên được lưu cho các lần
// đăng sau), nên khi đọc ra giao diện được chuẩn hoá thành
// "needs_login" kèm hướng dẫn, dữ liệu gốc giữ nguyên.
function isFbLoginWallMessage(message: string): boolean {
  return /chưa đăng nhập|chưa có đăng nhập đã lưu|không có đăng nhập đã lưu|log into facebook|màn hình.{0,30}đăng nhập|hộp thoại đăng nhập|trang đăng nhập/i.test(
    message,
  );
}

// Trạng thái HIỆU LỰC của một bản ghi đăng: bản ghi cũ "failed"
// kèm lỗi quá thời gian chờ (Instagram) hoặc bị chặn ở màn hình
// đăng nhập Facebook (nhóm/Page) được chuẩn hoá khi hiển thị
// thành "uncertain" / "needs_login" (xem toPublishRecordOut) —
// mọi nơi cần phân loại bản ghi (hiển thị lịch sử, chống đăng
// trùng, dọn bản ghi cũ) đều phải dùng trạng thái hiệu lực này
// thay cho trạng thái thô lưu trong DB.
function effectivePublishStatus(r: {
  targetKind: string;
  status: string;
  message: string;
}): string {
  if (
    r.targetKind === "instagram" &&
    r.status === "failed" &&
    isPublishTimeoutMessage(r.message)
  )
    return "uncertain";
  if (
    (r.targetKind === "group" || r.targetKind === "page") &&
    r.status === "failed" &&
    isFbLoginWallMessage(r.message)
  )
    return "needs_login";
  return r.status;
}

// Khóa nhận diện MỘT ĐÍCH đăng của một bản nháp (theo kênh + tên
// đích, chuẩn hoá tên như các lần so khớp chống trùng khác).
function publishTargetKey(r: {
  targetKind: string;
  targetName: string;
}): string {
  return `${r.targetKind}:${normalizeNameKey(r.targetName)}`;
}

// Các trạng thái CHƯA thành công và có thể bị bản ghi mới của
// cùng một đích THAY THẾ: đăng lỗi, chờ đăng nhập, bị bỏ qua.
// Khi một đích có bản ghi mới, các bản ghi cũ ở các trạng thái
// này của cùng đích bị XÓA HẲN để Lịch sử đăng Bài chỉ còn
// thông tin mới nhất theo từng đích (người dùng chốt: "chỉ nên
// hiện thông tin mới thôi, còn cũ sẽ tự động xóa"). TUYỆT ĐỐI
// KHÔNG xóa: bản ghi "published" (bằng chứng đã đăng + link bài
// thật, và là căn cứ chống đăng trùng), bản ghi "queued" (đang
// chờ kết quả) và "uncertain" (lượt đăng Instagram chưa xác
// định — căn cứ bắt buộc kiểm tra trùng trước khi đăng lại).
const SUPERSEDABLE_PUBLISH_STATUSES = new Set([
  "failed",
  "needs_login",
  "skipped",
  "unsupported",
]);

// Sau khi một bản ghi đăng MỚI được ghi cho một đích (theo id
// bản ghi vừa ghi), xóa các bản ghi CŨ bị thay thế của CÙNG
// đích trong CÙNG bản nháp. Trả về số bản ghi đã xóa.
async function pruneSupersededPublishRecords(
  db: Db,
  keepRecordId: number,
): Promise<number> {
  if (keepRecordId <= 0) return 0;
  const [keep] = await db
    .select()
    .from(schema.publishRecords)
    .where(eq(schema.publishRecords.id, keepRecordId));
  if (!keep) return 0;
  const key = publishTargetKey(keep);
  const rows = await db
    .select()
    .from(schema.publishRecords)
    .where(eq(schema.publishRecords.draftId, keep.draftId));
  let removed = 0;
  for (const r of rows) {
    if (r.id === keep.id) continue;
    if (publishTargetKey(r) !== key) continue;
    if (!SUPERSEDABLE_PUBLISH_STATUSES.has(effectivePublishStatus(r)))
      continue;
    await db
      .delete(schema.publishRecords)
      .where(eq(schema.publishRecords.id, r.id));
    removed += 1;
  }
  return removed;
}

// Dọn TOÀN BỘ bản ghi đăng hiện có (áp dụng khi đọc danh sách
// bản nháp): với MỖI bản nháp + MỖI đích, chỉ giữ bản ghi MỚI
// NHẤT ở nhóm trạng thái có thể bị thay thế; các bản ghi cũ hơn
// trong nhóm đó bị xóa hẳn. Bản ghi "published" / "queued" /
// "uncertain" không bao giờ bị xóa bởi cơ chế này. Nhờ vậy dữ
// liệu tích lũy từ các lượt đăng trước bản sửa này cũng được
// dọn ngay ở lần đọc đầu tiên, và Lịch sử đăng Bài không còn
// chồng thông tin cũ lên thông tin mới.
async function pruneAllSupersededPublishRecords(db: Db): Promise<number> {
  const rows = await db
    .select()
    .from(schema.publishRecords)
    .orderBy(desc(schema.publishRecords.id));
  const seen = new Set<string>();
  let removed = 0;
  for (const r of rows) {
    if (!SUPERSEDABLE_PUBLISH_STATUSES.has(effectivePublishStatus(r)))
      continue;
    const key = `${r.draftId}|${publishTargetKey(r)}`;
    if (seen.has(key)) {
      await db
        .delete(schema.publishRecords)
        .where(eq(schema.publishRecords.id, r.id));
      removed += 1;
    } else {
      seen.add(key);
    }
  }
  return removed;
}

// Đích đăng đã lưu cho một bản nháp (cột pack_targets, JSON).
// saved = false khi bản nháp chưa từng có lựa chọn nào được lưu —
// client khi đó mới suy lựa chọn từ các cờ chọn mặc định (nhóm
// đích / Page đang chọn / nick IG đang chọn); một khi đã lưu thì
// lựa chọn đã lưu THẮNG mặc định, kể cả khi người dùng bỏ chọn hết.
const packTargetsOut = z.object({
  saved: z.boolean(),
  group_ids: z.array(z.number()),
  page_ids: z.array(z.number()),
  instagram_account_ids: z.array(z.number()),
});

type PackTargets = z.infer<typeof packTargetsOut>;

function parsePackTargets(raw: string): PackTargets {
  const empty: PackTargets = {
    saved: false,
    group_ids: [],
    page_ids: [],
    instagram_account_ids: [],
  };
  if (!raw.trim()) return empty;
  try {
    const parsed = JSON.parse(raw) as {
      group_ids?: unknown;
      page_ids?: unknown;
      instagram_account_ids?: unknown;
    };
    const ids = (v: unknown): number[] =>
      Array.isArray(v)
        ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0)
        : [];
    return {
      saved: true,
      group_ids: ids(parsed.group_ids),
      page_ids: ids(parsed.page_ids),
      instagram_account_ids: ids(parsed.instagram_account_ids),
    };
  } catch {
    return empty;
  }
}

function serializePackTargets(t: {
  group_ids: number[];
  page_ids: number[];
  instagram_account_ids: number[];
}): string {
  return JSON.stringify({
    group_ids: t.group_ids,
    page_ids: t.page_ids,
    instagram_account_ids: t.instagram_account_ids,
  });
}

type PublishRecordRow = typeof schema.publishRecords.$inferSelect;

function toPublishRecordOut(
  r: PublishRecordRow,
): z.infer<typeof publishRecordOut> {
  // Chuẩn hoá trạng thái khi đọc (xem effectivePublishStatus):
  // lượt Instagram "failed" kèm lỗi quá thời gian chờ → "uncertain"
  // (chưa xác định bài đã lên hay chưa, không phải đăng lỗi chắc
  // chắn); lượt nhóm/Page "failed" bị chặn ở màn hình đăng nhập
  // Facebook → "needs_login" (chờ đăng nhập, không phải đăng lỗi).
  const effective = effectivePublishStatus(r);
  const timedOut = effective === "uncertain" && r.status === "failed";
  const loginWall = effective === "needs_login" && r.status === "failed";
  const status = effective as typeof r.status;
  return {
    id: r.id,
    target_kind: r.targetKind,
    target_name: r.targetName,
    status,
    post_url: r.postUrl,
    message: timedOut
      ? `Instagram ${r.targetName}: lượt đăng bị ngắt giữa chừng vì quá thời gian chờ của hệ thống — CHƯA XÁC ĐỊNH được bài đã lên Instagram hay chưa. Mở Instagram kiểm tra trước khi bấm đăng lại; khi đăng lại, hệ thống sẽ kiểm tra bài trùng trên Instagram trước rồi mới đăng tiếp.`
      : loginWall
        ? `${r.targetKind === "group" ? "Nhóm" : "Fanpage"} ${r.targetName}: đang chờ bạn đăng nhập Facebook trong cửa sổ trình duyệt Muse (cửa sổ tác vụ đăng mở ra, KHÔNG phải tab Facebook trong Chrome của bạn và KHÔNG phải trạng thái “Đã liên kết” ở mục Tài khoản). Đăng nhập bằng tài khoản quản trị Page trong cửa sổ đó — chỉ cần 1 lần, phiên được lưu cho mọi lần đăng sau — rồi bấm “Đăng Bài” lại là bài đăng tiếp bằng phiên đã lưu.`
        : r.message,
    created_at: r.createdAt.toISOString(),
  };
}

const draftOut = z.object({
  id: z.number(),
  code: z.string(),
  idempotency_key: z.string(),
  publish_records: z.array(publishRecordOut),
  stt: z.string(),
  sku: z.string(),
  product_name: z.string(),
  scale: z.string(),
  maker: z.string(),
  color: z.string(),
  price: z.string(),
  stock: z.string(),
  ship: z.string(),
  image_url: z.string(),
  video_url: z.string(),
  drive_folder_id: z.string(),
  drive_status: z.string(),
  drive_error: z.string(),
  drive_images: z.array(driveImageSchema),
  has_real_image: z.boolean(),
  selling_point: z.string(),
  angle: z.string(),
  size_cm: z.string(),
  sale_days: z.string(),
  caption: z.string(),
  caption_source: z.enum(["ai", "template", "manual", ""]),
  status: z.enum(["draft", "approved", "packed"]),
  pack_text: z.string(),
  packed_at: z.string().nullable(),
  pack_targets: packTargetsOut,
  created_at: z.string(),
  placeholders: z.array(z.string()),
});

type DraftRow = typeof schema.drafts.$inferSelect;

function toDraftOut(
  r: DraftRow,
  publishRecords: PublishRecordRow[] = [],
): z.infer<typeof draftOut> {
  return {
    id: r.id,
    code: r.code,
    idempotency_key: r.idempotencyKey,
    publish_records: publishRecords.map(toPublishRecordOut),
    stt: r.stt,
    sku: r.sku || buildSku(r.stt, r.productName, r.color),
    product_name: r.productName,
    scale: r.scale,
    maker: r.maker,
    color: r.color,
    price: r.price,
    stock: r.stock,
    ship: r.ship,
    image_url: normalizeSheetImageUrl(r.imageUrl),
    video_url: r.videoUrl,
    drive_folder_id: r.driveFolderId,
    drive_status: r.driveStatus,
    drive_error: r.driveError,
    drive_images: parseDriveImages(r.driveImages),
    has_real_image:
      r.driveStatus === "ok" && parseDriveImages(r.driveImages).length > 0,
    selling_point: r.sellingPoint,
    angle: r.angle,
    size_cm: r.sizeCm,
    sale_days: r.saleDays,
    caption: r.caption,
    caption_source:
      r.captionSource === "ai" ||
      r.captionSource === "template" ||
      r.captionSource === "manual"
        ? r.captionSource
        : "",
    status: r.status,
    pack_text: r.packText,
    packed_at: r.packedAt ? r.packedAt.toISOString() : null,
    pack_targets: parsePackTargets(r.packTargets),
    created_at: r.createdAt.toISOString(),
    placeholders: findPlaceholders(r.caption),
  };
}

// Dọn placeholder màu còn sót trong các bản nháp CŨ (soạn từ trước
// khi khâu viết bài có chốt chặn "[màu]", hoặc do người bán dán tay
// vào caption ở các bản cũ): quét MỌI bản nháp ở mọi trạng thái,
// bản nào caption hoặc gói đăng đã xuất còn placeholder màu thì
// viết lại bằng bản đã gỡ — dòng "Màu sắc:" được điền đúng màu của
// chính bản nháp đó — và LƯU BỀN xuống dữ liệu, không chỉ che ở
// lớp hiển thị. Trả về số bản nháp đã dọn. seedDesk gọi hàm này
// mỗi lần mở app: sau lần dọn đầu tiên không còn bản nào khớp nữa
// nên các lần mở sau không ghi thêm gì.
async function cleanupLegacyDraftColorPlaceholders(
  ctx: Ctx,
): Promise<number> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.drafts);
  let cleanedCount = 0;
  for (const r of rows) {
    const caption = hasColorPlaceholder(r.caption)
      ? stripColorPlaceholders(r.caption, r.color)
      : r.caption;
    const packText = hasColorPlaceholder(r.packText)
      ? stripColorPlaceholders(r.packText, r.color)
      : r.packText;
    if (caption !== r.caption || packText !== r.packText) {
      await db
        .update(schema.drafts)
        .set({ caption, packText })
        .where(eq(schema.drafts.id, r.id));
      cleanedCount += 1;
    }
  }
  return cleanedCount;
}

const metricOut = z.object({
  id: z.number(),
  draft_id: z.number().nullable(),
  product_name: z.string(),
  stt: z.string(),
  channel_type: z.enum(["group", "page", "instagram"]),
  channel_id: z.number(),
  channel_name: z.string(),
  media_kind: z.enum(["image", "video", "none"]),
  posted_at: z.string(),
  hour_slot: z.string(),
  reach: z.number(),
  likes: z.number(),
  comments: z.number(),
  shares: z.number(),
  clicks: z.number(),
  inquiries: z.number(),
  orders: z.number(),
  score: z.number(),
  notes: z.string(),
});

type MetricRow = typeof schema.postMetrics.$inferSelect;

function toMetricOut(r: MetricRow): z.infer<typeof metricOut> {
  return {
    id: r.id,
    draft_id: r.draftId,
    product_name: r.productName,
    stt: r.stt,
    channel_type: r.channelType,
    channel_id: r.channelId,
    channel_name: r.channelName,
    media_kind: r.mediaKind,
    posted_at: r.postedAt.toISOString(),
    hour_slot: r.hourSlot,
    reach: r.reach,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    clicks: r.clicks,
    inquiries: r.inquiries,
    orders: r.orders,
    score: engagementScore(r),
    notes: r.notes,
  };
}

const channelInsightOut = z.object({
  channel_type: z.enum(["group", "page", "instagram"]),
  channel_id: z.number(),
  channel_name: z.string(),
  posts: z.number(),
  total_score: z.number(),
  avg_score: z.number(),
  total_reach: z.number(),
  total_inquiries: z.number(),
  total_orders: z.number(),
  best_slot: z.string(),
  best_slot_avg: z.number(),
  best_slot_posts: z.number(),
  recommendation: z.string(),
  slots: z.array(
    z.object({
      slot: z.string(),
      posts: z.number(),
      avg_score: z.number(),
      total_score: z.number(),
    }),
  ),
});

// ------------------------------------------------------- ĐĂNG THẬT
// Nút "Đăng thật" trong Hàng đợi: đăng trực tiếp từ app qua
// connector chính thức, không qua khâu chép gói/gửi agent nữa.
//  - Fanpage: facebook-cli `pages posts create` (caption tối đa
//    1.024 ký tự theo giới hạn của connector — dài hơn thì KHÔNG
//    cắt xén nội dung đã duyệt mà chuyển sang xử lý bằng trình
//    duyệt như khi người dùng nhắn trực tiếp, cùng cơ chế nhóm).
//  - Instagram: instagram-cli `post-feed` (caption tối đa 2.200
//    ký tự, bắt buộc có ít nhất một ảnh — dùng đúng các ảnh JPEG
//    đã chốt trong bản nháp, tải về máy qua privileged trước).
//  - Hội nhóm: Meta KHÔNG có API đăng bài nhóm — đích nhóm được
//    xử lý như khi người dùng nhắn trực tiếp: ghi yêu cầu
//    "queued" rồi kích hoạt tác vụ agent đăng bằng trình duyệt,
//    agent gọi lại reportGroupPublish để cập nhật kết quả.
// Mỗi kết quả được lưu vào publish_records; đích nào đã đăng
// thành công thì các lần bấm sau tự bỏ qua để chống đăng trùng.

// Giới hạn ký tự caption của từng kênh (theo tài liệu connector).
const FB_PAGE_CAPTION_LIMIT = 1024;
const IG_CAPTION_LIMIT = 2200;

function normalizeNameKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// CLI của connector in JSON (có thể kèm khối _meta) — lấy JSON
// object cuối cùng parse được từ stdout.
function parseCliJson(stdout: string): Record<string, unknown> | null {
  const text = stdout.trim();
  if (!text) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === "object" && v !== null
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const v = JSON.parse(text.slice(start, end + 1)) as unknown;
        return typeof v === "object" && v !== null
          ? (v as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function cliErrorText(res: { stdout: string; stderr: string }): string {
  const j = parseCliJson(res.stdout);
  const err =
    (typeof j?.error === "string" && j.error) ||
    (typeof (j?.error as { message?: unknown } | undefined)?.message ===
      "string" &&
      ((j?.error as { message: string }).message as string)) ||
    "";
  const raw = (err || res.stderr || res.stdout || "").trim();
  return raw.slice(0, 400);
}

// Tìm link/ID bài đã đăng trong JSON trả về của lệnh đăng — chỉ
// lấy giá trị connector THẬT SỰ trả về, không tự dựng link.
function extractPostRef(j: Record<string, unknown> | null): {
  url: string;
  state: string;
} {
  if (!j) return { url: "", state: "" };
  const data =
    typeof j.data === "object" && j.data !== null
      ? (j.data as Record<string, unknown>)
      : j;
  const pick = (o: Record<string, unknown>, keys: string[]): string => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const url =
    pick(data, ["post_url", "url", "permalink", "postUrl"]) ||
    pick(j, ["post_url", "url", "permalink"]);
  const state = pick(data, ["state", "status"]) || pick(j, ["state", "status"]);
  return { url, state };
}

interface FbPageRef {
  page_id: string;
  name: string;
}

function parseFbPages(stdout: string): FbPageRef[] {
  const j = parseCliJson(stdout);
  const arr = Array.isArray(j?.data) ? j.data : [];
  const out: FbPageRef[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const pageId =
      typeof o.page_id === "string" || typeof o.page_id === "number"
        ? String(o.page_id)
        : "";
    const name = typeof o.name === "string" ? o.name : "";
    if (pageId) out.push({ page_id: pageId, name });
  }
  return out;
}

interface IgAccountRef {
  user_fbid: string;
  username: string;
}

function parseIgAccounts(stdout: string): IgAccountRef[] {
  const j = parseCliJson(stdout);
  const arr = Array.isArray(j?.accounts) ? j.accounts : [];
  const out: IgAccountRef[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const fbid =
      typeof o.user_fbid === "string" || typeof o.user_fbid === "number"
        ? String(o.user_fbid)
        : "";
    const username = typeof o.username === "string" ? o.username : "";
    if (fbid) out.push({ user_fbid: fbid, username });
  }
  return out;
}

// Username Instagram suy từ tài khoản trong app: handle (@tên /
// tên) hoặc link hồ sơ instagram.com/<tên>/.
function igUsernameOf(a: {
  name: string;
  handle: string;
  profileUrl: string;
}): string {
  const fromUrl = a.profileUrl.match(/instagram\.com\/([^/?#]+)/);
  if (fromUrl && fromUrl[1]) return fromUrl[1].replace(/^@/, "").toLowerCase();
  const h = a.handle.trim().replace(/^@/, "");
  if (h && !/\s/.test(h)) return h.toLowerCase();
  const n = a.name.trim();
  return /\s/.test(n) ? "" : n.toLowerCase();
}

type PackTargetsInput = {
  group_ids: number[];
  page_ids: number[];
  instagram_account_ids: number[];
};

type BuildPackResult =
  | {
      ok: true;
      packText: string;
      cleanCaption: string;
      driveImageCount: number;
      hasMedia: boolean;
      hasVideo: boolean;
    }
  | { ok: false; message: string };

// Sinh text gói đăng cho một bản nháp — dùng CHUNG cho duyệt bài
// (tự xuất gói ngay khi duyệt), cho buildPack (giữ tương thích) và
// cho saveDraftTargets (đổi đích thì gói tự cập nhật theo). KHÔNG
// quét lại Drive: dùng đúng tập ảnh đã chốt trong bản nháp.
async function buildPackTextForDraft(
  db: Db,
  row: DraftRow,
  args: PackTargetsInput,
  opts?: { explicit?: boolean },
): Promise<BuildPackResult> {
  const cleanCaption = hasColorPlaceholder(row.caption)
    ? stripColorPlaceholders(row.caption, row.color)
    : row.caption;
  const imagesCustomized = row.imagesCustomized === 1;
  const driveImages = parseDriveImages(row.driveImages);
  const packStatus = row.driveStatus;
  const packError = row.driveError;
  const driveImageLines =
    driveImages.length > 0
      ? driveImages
          .map((im, i) =>
            im.id.startsWith("upload-")
              ? `- Ảnh ${i + 1}: ${im.name} (tải lên từ thiết bị): ${im.jpeg_url}`
              : `- Ảnh ${i + 1}: ${im.name}${im.is_heic ? " (JPEG từ HEIC — đăng bản JPEG này)" : ""}: ${im.jpeg_url}${im.view_url ? ` · Drive: ${im.view_url}` : ""}`,
          )
          .join("\n")
      : "";
  const allGroups = await db
    .select()
    .from(schema.fbGroups)
    .orderBy(asc(schema.fbGroups.id));
  const chosen = allGroups.filter((g) => args.group_ids.includes(g.id));
  const joinCtx = await loadJoinContext(db);
  const joinedByGroup = new Map(
    chosen.map((g) => [g.id, postingJoinedIdentities(joinCtx, g)]),
  );
  const notJoined = chosen.filter(
    (g) => (joinedByGroup.get(g.id) ?? []).length === 0,
  );
  if (notJoined.length > 0)
    return {
      ok: false,
      message:
        "Chỉ đăng vào nhóm bằng danh tính đã tham gia nhóm đó (trạng thái của tài khoản chính và từng Page con tính riêng). Chưa có danh tính sẽ đăng nào đã tham gia: " +
        notJoined.map((g) => g.name).join(", "),
    };
  const media = await db.select().from(schema.mediaItems);
  const selectedAccounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.selected, 1));
  const postingAccounts = selectedAccounts.filter((a) => a.linked === 1);
  const allAccounts = await db.select().from(schema.accounts);
  const accountById = new Map(allAccounts.map((a) => [a.id, a]));
  const selectedPages = await db
    .select()
    .from(schema.fbPages)
    .where(eq(schema.fbPages.selected, 1));
  const postingPages = selectedPages;
  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const allPages = await db.select().from(schema.fbPages);
  const chosenPages = opts?.explicit
    ? allPages.filter((p) => args.page_ids.includes(p.id))
    : args.page_ids.length > 0
      ? allPages.filter((p) => args.page_ids.includes(p.id))
      : postingPages;
  const igAccounts = allAccounts.filter(
    (a) => a.platform === "Instagram" && a.linked === 1,
  );
  const chosenIgAccounts = opts?.explicit
    ? igAccounts.filter((a) => args.instagram_account_ids.includes(a.id))
    : args.instagram_account_ids.length > 0
      ? igAccounts.filter((a) => args.instagram_account_ids.includes(a.id))
      : igAccounts.filter((a) => a.selected === 1);
  const targetLines =
    chosen.length > 0
      ? chosen
          .map((g) => {
            const posting = joinCtx.identities.filter((i) => i.posting);
            const statusLines = posting
              .map((i) => {
                const label =
                  i.kind === "page"
                    ? `Page “${i.name}”`
                    : `Tài khoản chính ${i.name}`;
                return membershipStatusOf(joinCtx, g, i) === "joined"
                  ? `  - ${label}: Đã tham gia — đăng được bằng danh tính này`
                  : `  - ${label}: Chưa tham gia — KHÔNG đăng bằng danh tính này`;
              })
              .join("\n");
            return `- ${g.name}${g.url ? ` — ${g.url}` : ""}\n${statusLines}`;
          })
          .join("\n")
      : "";
  const uploadedImages = media.filter((m) => m.mime.startsWith("image/"));
  const uploadedVideos = media.filter((m) => m.mime.startsWith("video/"));
  const mediaParts: string[] = [];
  if (driveImages.length > 0) {
    mediaParts.push(
      `Ảnh đã chốt trong bản nháp (${driveImages.length} ảnh${row.sku ? `, SKU ${row.sku}` : ""}):\n${driveImageLines}`,
    );
  } else if (uploadedImages.length > 0) {
    mediaParts.push(
      uploadedImages.map((m) => `- Ảnh đã tải lên: ${m.name}`).join("\n"),
    );
  }
  if (row.videoUrl.trim()) {
    mediaParts.push(
      `- Video của sản phẩm${row.stt ? ` (STT ${row.stt})` : ""}: ${row.videoUrl.trim()}`,
    );
  }
  if (uploadedVideos.length > 0) {
    mediaParts.push(
      uploadedVideos.map((m) => `- Video đã tải lên: ${m.name}`).join("\n"),
    );
  }
  const packMediaLines =
    mediaParts.length > 0
      ? mediaParts.join("\n")
      : imagesCustomized
        ? "- Chưa gắn ảnh/video nào."
        : packStatus === "empty"
          ? "- Chưa gắn ảnh/video nào (thư mục Drive đang rỗng)."
          : packError
            ? `- Chưa gắn ảnh/video nào (${packError}).`
            : "- Chưa gắn ảnh/video nào.";
  const accountLines =
    postingAccounts.length > 0
      ? postingAccounts
          .map((a) => `- ${a.platform}: ${a.name}${a.handle ? ` (${a.handle})` : ""}`)
          .join("\n")
      : "";
  const pageLines =
    chosenPages.length > 0
      ? chosenPages
          .map((p) => {
            const owner = accountById.get(p.accountId);
            return `- Page “${p.name}”${p.url ? ` — ${p.url}` : ""} (quản trị bằng nick ${owner?.name ?? "?"})`;
          })
          .join("\n")
      : "";
  const igLines =
    chosenIgAccounts.length > 0
      ? chosenIgAccounts
          .map((a) => {
            const url = deriveProfileUrl(a);
            return `- Instagram ${a.name}${a.handle ? ` (${a.handle})` : ""}${url ? ` — ${url}` : ""}`;
          })
          .join("\n")
      : "";
  const hasDestination =
    postingAccounts.length > 0 ||
    chosen.length > 0 ||
    chosenPages.length > 0 ||
    chosenIgAccounts.length > 0;
  const packText = [
    `# Gói đăng bài — ${row.code}`,
    `Sản phẩm: ${row.productName}${row.sku ? ` | SKU: ${row.sku}` : row.stt ? ` | STT: ${row.stt}` : ""} | Tỉ lệ: ${row.scale} | Màu: ${row.color || "—"} | Xuất gói: ${dateFmt.format(now)} (giờ VN)`,
    "",
    "## Đích đăng",
    ...(postingAccounts.length > 0 ? ["Tài khoản đăng:", accountLines] : []),
    ...(chosen.length > 0 ? ["Nhóm:", targetLines] : []),
    ...(chosenPages.length > 0 ? ["Fanpage:", pageLines] : []),
    ...(chosenIgAccounts.length > 0 ? ["Instagram:", igLines] : []),
    ...(!hasDestination ? ["- Chưa chọn đích đăng nào."] : []),
    "",
    "## Media của bài",
    packMediaLines,
    "",
    "## Nội dung đã duyệt",
    "```",
    cleanCaption,
    "```",
  ].join("\n");
  return {
    ok: true,
    packText,
    cleanCaption,
    driveImageCount: driveImages.length,
    hasMedia: mediaParts.length > 0,
    hasVideo: !!row.videoUrl.trim(),
  };
}

// Đích đăng MẶC ĐỊNH dùng khi duyệt bài (chưa từng chọn tay cho
// bài này): nhóm đích đã đánh dấu là đích VÀ có ít nhất một danh
// tính sẽ đăng đã tham gia nhóm đó, Page đang chọn đăng, nick
// Instagram đã liên kết đang chọn. Khớp đúng mặc định phía client
// ở Hàng đợi (nhóm đích / Page đang chọn / IG đang chọn, chỉ tính
// nhóm đăng được theo từng danh tính).
async function defaultPackTargets(db: Db): Promise<PackTargetsInput> {
  const allGroups = await db
    .select()
    .from(schema.fbGroups)
    .orderBy(asc(schema.fbGroups.id));
  const joinCtx = await loadJoinContext(db);
  const group_ids = allGroups
    .filter(
      (g) =>
        g.isTarget === 1 && postingJoinedIdentities(joinCtx, g).length > 0,
    )
    .map((g) => g.id);
  const allPages = await db.select().from(schema.fbPages);
  const page_ids = allPages.filter((p) => p.selected === 1).map((p) => p.id);
  const allAccounts = await db.select().from(schema.accounts);
  const instagram_account_ids = allAccounts
    .filter((a) => a.platform === "Instagram" && a.linked === 1 && a.selected === 1)
    .map((a) => a.id);
  return { group_ids, page_ids, instagram_account_ids };
}

export const Actions = {
  // ------------------------------------------------------------------ seed
  seedDesk: defineAction({
    request: z.object({}),
    response: z.object({ seeded: z.boolean() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      let seededAny = false;

      const existingAccounts = await db
        .select()
        .from(schema.accounts)
        .limit(1);
      if (existingAccounts.length === 0) {
        await db.insert(schema.accounts).values([
          {
            platform: "Facebook",
            name: "Đức Trí",
            handle: "Tài khoản cá nhân đã liên kết",
            profileUrl: "",
            linked: 1,
            selected: 1,
          },
          {
            platform: "Instagram",
            name: "@alexsander01102000",
            handle: "Tài khoản đã liên kết",
            profileUrl: "https://www.instagram.com/alexsander01102000/",
            linked: 1,
            selected: 1,
          },
        ]);
        seededAny = true;
      }

      // Không gắn sẵn link Sheet nào: nguồn Sheet do người dùng tự lưu
      // vào danh sách nguồn (sheet_sources) kèm tên nguồn trong mục
      // Sản phẩm. Nguồn cũ gắn bằng cài đặt đơn lẻ đã được migration
      // 0007 chuyển thành một mục trong danh sách đó.

      // TUYỆT ĐỐI không tự chèn giá trị ví dụ (theo yêu cầu của người
      // dùng: chỉ có giá trị thật). Sản phẩm chỉ đến từ đồng bộ Google
      // Sheet hoặc người dùng tự thêm; lượt nghiên cứu chỉ đến từ kết
      // quả quét thật được ghi lại; hội nhóm chỉ do người dùng thêm.
      // Bản seed cũ từng tự thêm 1 sản phẩm và 2 lượt nghiên cứu mẫu
      // mỗi khi bảng sản phẩm trống — các dòng mẫu đó, nếu còn nguyên
      // vẹn chưa bị người dùng sửa, sẽ bị xóa tại đây để không bao
      // giờ hiện lại. Dòng nào đã bị sửa dù chỉ một trường cũng được
      // giữ nguyên (coi là dữ liệu của người dùng).
      let cleaned = false;
      const allProducts = await db.select().from(schema.products);
      for (const p of allProducts) {
        if (
          p.name === "Lexus LX 600 1:18" &&
          p.scale === "1:18" &&
          p.maker === "" &&
          p.color === "đen" &&
          p.price === "" &&
          p.stock === 1 &&
          p.ship === "" &&
          p.stt === "" &&
          p.imageUrl === "" &&
          p.videoUrl === "" &&
          p.source === "manual" &&
          p.externalKey === ""
        ) {
          await db
            .delete(schema.products)
            .where(eq(schema.products.id, p.id));
          cleaned = true;
        }
      }
      const legacyRun1At = new Date("2026-10-18T04:18:26+07:00").getTime();
      const legacyRun2At = new Date("2026-10-18T04:09:17+07:00").getTime();
      const allRuns = await db.select().from(schema.researchRuns);
      for (const r of allRuns) {
        const isLegacyRun1 =
          r.query === "mô hình xe" &&
          r.ranAt.getTime() === legacyRun1At &&
          r.marketplaceCount === 20 &&
          r.priceCount === 9 &&
          r.priceMin === 120000 &&
          r.priceMedian === 500000 &&
          r.priceMax === 7000000 &&
          r.groupsFound === 0;
        const isLegacyRun2 =
          r.query === "diecast 1:18" &&
          r.ranAt.getTime() === legacyRun2At &&
          r.marketplaceCount === 0 &&
          r.priceCount === 0 &&
          r.priceMin === null &&
          r.priceMedian === null &&
          r.priceMax === null &&
          r.groupsFound === 5;
        if (isLegacyRun1 || isLegacyRun2) {
          await db
            .delete(schema.researchRuns)
            .where(eq(schema.researchRuns.id, r.id));
          cleaned = true;
        }
      }

      // Dọn placeholder "[màu]" còn sót trong các bản nháp cũ:
      // bản nháp nào caption / gói đăng còn placeholder màu thì
      // viết lại sạch và lưu bền (xem
      // cleanupLegacyDraftColorPlaceholders) — người bán mở app
      // là các bản cũ tự sạch, hết dòng "Chưa điền: [màu]" và hết
      // bị chặn duyệt vì placeholder màu.
      const draftsCleaned =
        await cleanupLegacyDraftColorPlaceholders(ctx);
      if (draftsCleaned > 0) cleaned = true;

      if (seededAny || cleaned) ctx.invalidateQueries();
      return { seeded: seededAny || cleaned };
    },
  }),

  // -------------------------------------------------------------- overview
  getOverview: defineAction({
    request: z.object({}),
    response: z.object({
      accounts: z.array(accountOut),
      pages: z.array(pageOut),
      sheet: z.object({
        configured: z.boolean(),
        title: z.string(),
        sheet_name: z.string(),
        last_sync_at: z.string(),
        last_sync_status: z.string(),
        product_count: z.number(),
      }),
      limits: z.object({
        max_posts_per_day: z.number(),
        min_interval_minutes: z.number(),
        windows: z.array(z.string()),
      }),
      counts: z.object({
        accounts_total: z.number(),
        accounts_selected: z.number(),
        pages_total: z.number(),
        pages_selected: z.number(),
        products: z.number(),
        groups: z.number(),
        // Đếm TÁCH RIÊNG theo danh tính: số nhóm tài khoản chính
        // đã tham gia và số nhóm có ít nhất một Page con (đang
        // chọn đăng) đã tham gia — hai con số này có thể khác
        // nhau vì Page và tài khoản chính không cùng trạng thái.
        groups_joined_by_account: z.number(),
        groups_joined_by_page: z.number(),
        groups_target: z.number(),
        drafts_pending: z.number(),
        drafts_approved: z.number(),
        drafts_packed: z.number(),
        media: z.number(),
        packed_today: z.number(),
        metrics_posts: z.number(),
        products_with_image: z.number(),
        products_with_video: z.number(),
      }),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [prods, grps, drfts, media, packed, accs, pgs, mets] =
        await Promise.all([
          db.select().from(schema.products),
          db.select().from(schema.fbGroups),
          db.select().from(schema.drafts),
          db.select().from(schema.mediaItems),
          db
            .select()
            .from(schema.drafts)
            .where(eq(schema.drafts.status, "packed")),
          db
            .select()
            .from(schema.accounts)
            .orderBy(asc(schema.accounts.id)),
          db
            .select()
            .from(schema.fbPages)
            .orderBy(asc(schema.fbPages.id)),
          db.select().from(schema.postMetrics),
        ]);
      const accountNameById = new Map(accs.map((a) => [a.id, a.name]));
      // Số nhóm đã tham gia đếm TÁCH RIÊNG theo danh tính: tài
      // khoản chính một số, Page con một số — không gộp chung vì
      // hai phía có thể khác trạng thái với cùng một nhóm.
      const joinCtx = await loadJoinContext(db);
      const sheet = await getSheetSettings(db);
      const today = vnDateKey(new Date());
      const packedToday = packed.filter(
        (d) => d.packedAt && vnDateKey(d.packedAt) === today,
      ).length;
      return {
        accounts: accs.map(toAccountOut),
        pages: pgs.map((p) =>
          toPageOut(p, accountNameById.get(p.accountId) ?? ""),
        ),
        sheet: {
          configured: sheet.configured,
          title: sheet.title,
          sheet_name: sheet.sheet_name,
          last_sync_at: sheet.last_sync_at,
          last_sync_status: sheet.last_sync_status,
          product_count: prods.filter((p) => p.source === "sheet").length,
        },
        limits: {
          max_posts_per_day: MAX_POSTS_PER_DAY,
          min_interval_minutes: MIN_INTERVAL_MINUTES,
          windows: ["12:00–13:00", "19:00–21:00"],
        },
        counts: {
          accounts_total: accs.length,
          accounts_selected: accs.filter(
            (a) => a.linked === 1 && a.selected === 1,
          ).length,
          pages_total: pgs.length,
          pages_selected: pgs.filter((p) => p.selected === 1).length,
          products: prods.length,
          groups: grps.length,
          groups_joined_by_account: grps.filter((g) =>
            accountCountsAsJoined(joinCtx, g),
          ).length,
          groups_joined_by_page: grps.filter(
            (g) => joinedPostingPages(joinCtx, g).length > 0,
          ).length,
          groups_target: grps.filter((g) => g.isTarget === 1).length,
          drafts_pending: drfts.filter((d) => d.status === "draft").length,
          drafts_approved: drfts.filter((d) => d.status === "approved").length,
          drafts_packed: drfts.filter((d) => d.status === "packed").length,
          media: media.length,
          packed_today: packedToday,
          metrics_posts: mets.length,
          // "Có ảnh" CHỈ tính khi đã liệt kê được ≥1 file ảnh thật
          // từ thư mục Drive (không đếm theo ô link không trống như
          // trước — link thư mục rỗng/lỗi vẫn bị tính nhầm là có ảnh).
          products_with_image: prods.filter(
            (p) =>
              p.driveStatus === "ok" &&
              parseDriveImages(p.driveImages).length > 0,
          ).length,
          products_with_video: prods.filter((p) => p.videoUrl.trim()).length,
        },
      };
    },
  }),

  // -------------------------------------------------------------- accounts
  listAccounts: defineAction({
    request: z.object({}),
    response: z.object({ accounts: z.array(accountOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.accounts)
        .orderBy(asc(schema.accounts.id));
      return { accounts: rows.map(toAccountOut) };
    },
  }),

  addAccount: defineAction({
    request: z.object({
      platform: z.enum(["Facebook", "Instagram"]),
      name: z.string().min(1),
      handle: z.string().default(""),
      profile_url: z.string().default(""),
      linked: z.boolean().default(true),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      // Tự bật "dùng để đăng" cho tài khoản mới THEO TỪNG NỀN TẢNG, để
      // không tài khoản nào bị ẩn lặng lẽ khỏi Tổng quan và gói đăng:
      // - Facebook chỉ chọn được 1 tài khoản tại một thời điểm → tự bật
      //   khi chưa có nick Facebook nào đang được chọn dùng.
      // - Instagram chọn được nhiều nick cùng lúc → tài khoản đã liên
      //   kết mới thêm được tự bật luôn.
      const existing = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.platform, args.platform));
      const autoSelect =
        args.linked &&
        (args.platform === "Instagram" ||
          !existing.some((a) => a.selected === 1));
      const name = args.name.trim();
      await db.insert(schema.accounts).values({
        platform: args.platform,
        name,
        handle: args.handle.trim(),
        profileUrl: args.profile_url.trim(),
        linked: args.linked ? 1 : 0,
        selected: autoSelect ? 1 : 0,
      });
      ctx.invalidateQueries();
      return {
        ok: true,
        message: autoSelect
          ? `Đã thêm tài khoản ${args.platform} — ${name} và đang chọn dùng để đăng bài.`
          : args.linked
            ? `Đã thêm tài khoản ${args.platform} — ${name} (đã liên kết, chưa chọn dùng để đăng — nick Facebook đang dùng vẫn giữ nguyên; bật “Đăng nhập bằng nick này” khi muốn chuyển).`
            : `Đã thêm tài khoản ${args.platform} — ${name} (chưa liên kết — liên kết xong hãy bật dùng để đăng ở mục Tài khoản).`,
      };
    },
  }),

  setAccountSelected: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      selected: z.boolean(),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy tài khoản." };
      if (args.selected && row.linked !== 1)
        return {
          ok: false,
          message:
            "Tài khoản chưa được đánh dấu đã liên kết — liên kết trong Meta Accounts Center trước.",
        };
      if (args.selected && row.platform === "Facebook") {
        // Facebook: một lúc một tài khoản — bỏ chọn các nick Facebook khác.
        const others = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.platform, "Facebook"));
        for (const o of others) {
          if (o.id !== row.id && o.selected === 1) {
            await db
              .update(schema.accounts)
              .set({ selected: 0 })
              .where(eq(schema.accounts.id, o.id));
          }
        }
      }
      await db
        .update(schema.accounts)
        .set({ selected: args.selected ? 1 : 0 })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: args.selected
          ? `Đã chọn dùng ${row.platform} — ${row.name}.`
          : `Đã bỏ chọn ${row.platform} — ${row.name}.`,
      };
    },
  }),

  setAccountLinked: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      linked: z.boolean(),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy tài khoản." };
      // Khi đánh dấu đã liên kết mà nick chưa được chọn dùng, áp dụng
      // cùng mặc định như lúc thêm mới (theo từng nền tảng) để nick
      // không bị ẩn lặng lẽ: Instagram tự bật; Facebook chỉ tự bật khi
      // chưa có nick Facebook nào đang dùng.
      let selected = args.linked ? row.selected : 0;
      let autoSelected = false;
      if (args.linked && selected !== 1) {
        if (row.platform === "Instagram") {
          selected = 1;
          autoSelected = true;
        } else {
          const siblings = await db
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.platform, row.platform));
          if (!siblings.some((a) => a.id !== row.id && a.selected === 1)) {
            selected = 1;
            autoSelected = true;
          }
        }
      }
      await db
        .update(schema.accounts)
        .set({
          linked: args.linked ? 1 : 0,
          selected,
        })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: args.linked
          ? autoSelected
            ? `Đã đánh dấu ${row.name} là đã liên kết và đang chọn dùng để đăng bài.`
            : `Đã đánh dấu ${row.name} là đã liên kết.`
          : `Đã gỡ liên kết ${row.name} (và bỏ chọn dùng).`,
      };
    },
  }),

  deleteAccount: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.fbPages)
        .where(eq(schema.fbPages.accountId, args.id));
      await db
        .delete(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  setAccountProfileUrl: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      profile_url: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy tài khoản." };
      const url = args.profile_url.trim();
      if (url && !/^https:\/\/(www\.)?(facebook\.com|instagram\.com)\//.test(url))
        return {
          ok: false,
          message:
            "Link chưa đúng — dán link trang cá nhân bắt đầu bằng https://www.facebook.com/… hoặc https://www.instagram.com/…",
        };
      await db
        .update(schema.accounts)
        .set({ profileUrl: url })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: url
          ? `Đã lưu link trang của ${row.name} — bấm vào tên nick là mở thẳng trang đó.`
          : `Đã xóa link trang của ${row.name}.`,
      };
    },
  }),

  // ------------------------------------------------------ facebook pages
  // Một tài khoản Facebook cá nhân có thể quản trị nhiều Page. Page thuộc
  // về đúng 1 tài khoản; chọn Page nào thì gói đăng ghi đăng bằng Page đó.
  listPages: defineAction({
    request: z.object({}),
    response: z.object({ pages: z.array(pageOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [rows, accs] = await Promise.all([
        db.select().from(schema.fbPages).orderBy(asc(schema.fbPages.id)),
        db.select().from(schema.accounts),
      ]);
      const nameById = new Map(accs.map((a) => [a.id, a.name]));
      return {
        pages: rows.map((r) => toPageOut(r, nameById.get(r.accountId) ?? "")),
      };
    },
  }),

  addPage: defineAction({
    request: z.object({
      account_id: z.number().int().positive(),
      name: z.string().min(1),
      url: z.string().default(""),
      role: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [acc] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.account_id));
      if (!acc)
        return { ok: false, message: "Không tìm thấy tài khoản Facebook." };
      if (acc.platform !== "Facebook")
        return {
          ok: false,
          message: "Page chỉ thuộc về tài khoản Facebook, không phải Instagram.",
        };
      const url = args.url.trim();
      if (url && !/^https:\/\/(www\.)?facebook\.com\//.test(url))
        return {
          ok: false,
          message:
            "Link Page chưa đúng — dán link bắt đầu bằng https://www.facebook.com/…",
        };
      await db.insert(schema.fbPages).values({
        accountId: acc.id,
        name: args.name.trim(),
        url,
        role: args.role.trim(),
        selected: 1,
      });
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã thêm Page “${args.name.trim()}” vào nick ${acc.name} và đang chọn để đăng.`,
      };
    },
  }),

  setPageSelected: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      selected: z.boolean(),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.fbPages)
        .where(eq(schema.fbPages.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy Page." };
      await db
        .update(schema.fbPages)
        .set({ selected: args.selected ? 1 : 0 })
        .where(eq(schema.fbPages.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: args.selected
          ? `Đã chọn Page “${row.name}” để đăng bài.`
          : `Đã bỏ chọn Page “${row.name}”.`,
      };
    },
  }),

  deletePage: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.fbPages)
        .where(eq(schema.fbPages.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // ----------------------------------------------------- google sheet sync
  // Danh sách nguồn Sheet đã lưu: các trường "đang gắn" (spreadsheet_id…)
  // phản ánh nguồn đang chọn (active); mảng sources là toàn bộ danh sách
  // để giao diện liệt kê và đồng bộ từng nguồn.
  getSheetConfig: defineAction({
    request: z.object({}),
    response: sheetConfigOut,
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const sources = await loadSheetSources(db);
      const activeId = await getActiveSourceId(db, sources);
      const sheetProducts = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.source, "sheet"));
      const countFor = (spreadsheetId: string) =>
        sheetProducts.filter((p) =>
          p.externalKey.startsWith(`${spreadsheetId}:`),
        ).length;
      const active = sources.find((s) => s.id === activeId);
      const legacy = active ? null : await getSheetSettings(db);
      return {
        configured: active ? true : (legacy?.configured ?? false),
        spreadsheet_id: active?.spreadsheetId ?? legacy?.spreadsheet_id ?? "",
        sheet_name: active?.sheetName ?? legacy?.sheet_name ?? "",
        range: active?.range ?? legacy?.range ?? "",
        title: active?.title ?? legacy?.title ?? "",
        last_sync_at: active?.lastSyncAt ?? legacy?.last_sync_at ?? "",
        last_sync_status:
          active?.lastSyncStatus ?? legacy?.last_sync_status ?? "",
        last_sync_message:
          active?.lastSyncMessage ?? legacy?.last_sync_message ?? "",
        sheet_product_count: sheetProducts.length,
        active_source_id: activeId,
        sources: sources.map((s) =>
          toSheetSourceOut(s, countFor(s.spreadsheetId), s.id === activeId),
        ),
      };
    },
  }),

  // Lưu một nguồn Sheet mới vào danh sách (hoặc cập nhật nguồn trùng link).
  saveSheetConfig: defineAction({
    request: z.object({
      name: z.string().default(""),
      spreadsheet: z.string().min(1),
      sheet_name: z.string().default(""),
      range: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const id = parseSpreadsheetId(args.spreadsheet);
      if (!id)
        return {
          ok: false,
          message:
            "Không nhận ra ID Google Sheet — dán nguyên link file Sheet (dạng docs.google.com/spreadsheets/d/…) hoặc ID của file.",
        };
      const db = ctx.db<typeof schema>();
      const name = args.name.trim();
      const sheetName = args.sheet_name.trim();
      const range = args.range.trim();
      const sources = await loadSheetSources(db);
      const existing = sources.find((s) => s.spreadsheetId === id);
      let saved: SheetSourceRow;
      if (existing) {
        await db
          .update(schema.sheetSources)
          .set({
            name: name || existing.name,
            sheetName,
            range,
          })
          .where(eq(schema.sheetSources.id, existing.id));
        saved = { ...existing, name: name || existing.name, sheetName, range };
      } else {
        const [row] = await db
          .insert(schema.sheetSources)
          .values({
            name: name || "Nguồn Sheet chưa đặt tên",
            spreadsheetId: id,
            sheetName,
            range,
          })
          .returning();
        if (!row)
          return { ok: false, message: "Không lưu được nguồn Sheet." };
        saved = row;
      }
      await mirrorSourceToSettings(db, saved);
      ctx.invalidateQueries();
      return {
        ok: true,
        message: existing
          ? `Đã cập nhật nguồn Sheet “${saved.name}” trong danh sách đã lưu và đặt làm nguồn đang chọn.`
          : `Đã lưu nguồn Sheet “${saved.name}” vào danh sách và đặt làm nguồn đang chọn. Bấm “Đồng bộ nguồn này” để lấy sản phẩm.`,
      };
    },
  }),

  setActiveSheetSource: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const sources = await loadSheetSources(db);
      const row = sources.find((s) => s.id === args.id);
      if (!row) return { ok: false, message: "Không tìm thấy nguồn Sheet." };
      await mirrorSourceToSettings(db, row);
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã chọn nguồn Sheet “${row.name}” làm nguồn chính.`,
      };
    },
  }),

  deleteSheetSource: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const sources = await loadSheetSources(db);
      const row = sources.find((s) => s.id === args.id);
      if (!row) return { ok: false, message: "Không tìm thấy nguồn Sheet." };
      const wasActive =
        (await getActiveSourceId(db, sources)) === row.id;
      await db
        .delete(schema.sheetSources)
        .where(eq(schema.sheetSources.id, row.id));
      if (wasActive) {
        const rest = sources.filter((s) => s.id !== row.id);
        const next = rest[0];
        if (next) {
          await mirrorSourceToSettings(db, next);
        } else {
          await setSetting(db, "sheet_active_source_id", "");
          await setSetting(db, "sheet_spreadsheet_id", "");
          await setSetting(db, "sheet_name", "");
          await setSetting(db, "sheet_range", "");
          await setSetting(db, "sheet_title", "");
        }
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã xóa nguồn Sheet “${row.name}” khỏi danh sách. Sản phẩm đã đồng bộ từ nguồn này vẫn giữ nguyên.`,
      };
    },
  }),

  requestSheetSync: defineAction({
    request: z.object({
      source_id: z.number().int().min(0).default(0),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const sources = await loadSheetSources(db);
      const activeId = await getActiveSourceId(db, sources);
      const source =
        args.source_id > 0
          ? sources.find((s) => s.id === args.source_id)
          : sources.find((s) => s.id === activeId);
      const legacy = source ? null : await getSheetSettings(db);
      const s = source
        ? {
            configured: true,
            spreadsheet_id: source.spreadsheetId,
            sheet_name: source.sheetName,
            range: source.range,
            title: source.title,
            last_sync_at: source.lastSyncAt,
            last_sync_status: source.lastSyncStatus,
            last_sync_message: source.lastSyncMessage,
          }
        : legacy;
      if (!s || !s.configured)
        return {
          ok: false,
          message:
            "Chưa có nguồn Google Sheet nào trong danh sách đã lưu — lưu một nguồn Sheet trước.",
        };
      const sourceId = source?.id ?? 0;
      if (source) await mirrorSourceToSettings(db, source);
      await setSetting(db, "sheet_last_sync_status", "syncing");
      await setSetting(
        db,
        "sheet_last_sync_message",
        "Đang đọc file Google Sheet…",
      );
      await updateSourceSyncState(db, sourceId, {
        status: "syncing",
        message: "Đang đọc file Google Sheet…",
      });
      const rangeDesc = s.range
        ? `phạm vi ${s.range}`
        : s.sheet_name
          ? `tab "${s.sheet_name}", toàn bộ dữ liệu`
          : "tab đầu tiên, toàn bộ dữ liệu";
      const message = [
        `Đọc danh sách sản phẩm bán mô hình xe từ Google Sheet của người dùng và nhập vào artifact Social Desk.`,
        `Spreadsheet ID: ${s.spreadsheet_id}. Đọc ${rangeDesc}.`,
        `Dùng connector Google Sheets (lệnh /opt/hatch/bin/hatch_gws_cli sheets spreadsheets get) với params gồm spreadsheetId ở trên, ranges là phạm vi cần đọc, includeGridData=true và fields để lấy cả giá trị hiển thị, hyperlink và công thức của từng ô — fields phải bao gồm sheets.data.rowData.values(formattedValue,hyperlink,userEnteredValue) VÀ sheets.merges — đọc tối đa 500 dòng đầu. Nếu Google Sheets chưa được kết nối, hoặc file chưa được chia sẻ cho tài khoản đã kết nối (lỗi 403), hãy báo rõ lỗi đó trong kết quả và tuyệt đối không bịa dữ liệu sản phẩm.`,
        `LƯU Ý Ô GỘP (merged cells) — RẤT QUAN TRỌNG: trong Sheet, nhiều cột được GỘP DỌC xuyên nhiều dòng, kể cả XUYÊN NHIỀU STT: ô "Hãng xe" giá trị "LEXUS" gộp chung cho cả STT 1 (LX600) và STT 2 (LX570); "BMW" gộp chung STT 4 (M3) và STT 5 (X5); nhiều cột khác (Tỉ lệ, Kích thước, Giá bán, Link ảnh…) cũng gộp tương tự trong nhóm. API chỉ trả giá trị ở ô GÓC TRÊN-TRÁI của vùng gộp, các ô còn lại trong vùng gộp trả về TRỐNG — TUYỆT ĐỐI không kết luận dòng đó thiếu thông tin chỉ vì ô trống. Hãy đọc mảng sheets[].merges (mỗi merge có startRowIndex/endRowIndex/startColumnIndex/endColumnIndex, chỉ số 0-based, end là exclusive) và ĐIỀN giá trị của ô góc trên-trái xuống MỌI ô thuộc vùng gộp trước khi phân tích dòng mẹ/dòng con. Ví dụ: LX570 phải có maker "LEXUS" và X5 phải có maker "BMW" nhờ vùng gộp, không được để trống.`,
        `Hàng đầu tiên là tiêu đề cột. Cấu trúc Sheet hiện tại (file "BUSINESS"): STT / Hãng xe / Mẫu / Tỉ lệ / Kích thước (Dài x Rộng x Cao) / Màu / Giá bán / Tồn kho / Link ảnh — KHÔNG có cột vận chuyển (vận chuyển mặc định COD, cứ để ship rỗng, app tự ghi COD) và không có cột tên sản phẩm riêng: name = "Hãng xe" + " " + "Mẫu", cắt khoảng trắng thừa (ví dụ hãng "LEXUS" + mẫu "LX600" → name "LEXUS LX600"). Mỗi STT gồm NHIỀU dòng màu: dòng đầu của STT (dòng mẹ) có đủ các cột, các dòng con phía dưới chỉ điền Màu và Tồn kho — mọi cột còn lại (Hãng xe, Mẫu, Tỉ lệ, Kích thước, Giá bán, Link ảnh) KẾ THỪA từ dòng mẹ của STT đó. Cứ gửi MỖI DÒNG (mẹ và từng con) thành một bản ghi riêng kèm đúng màu và tồn kho của dòng đó — phía app sẽ tự PHÂN LOẠI sản phẩm theo Hãng + Mẫu + Tỉ lệ + Kích thước + Màu sắc: mỗi màu là MỘT sản phẩm (biến thể) riêng với tồn kho riêng của chính dòng màu đó, SKU nội bộ dạng \"STT-Tên-Màu\"; vì vậy đừng tự gộp các dòng khác màu vào nhau và đừng tự chế SKU. Ánh xạ cột theo tên (không phân biệt hoa thường, chấp nhận cả tiếng Việt và tiếng Anh): stt = "STT"/"Mã"/"Code" (giữ nguyên dạng chữ); maker = "Hãng xe"/"Hãng"/"Hãng sản xuất"/"Thương hiệu"/"Maker"/"Brand" (giữ nguyên dạng chữ như trong Sheet); model = "Mẫu"/"Dòng xe"/"Model"; scale = "Tỉ lệ"/"Kích cỡ"/"Scale" (ví dụ 1:18, 1:24, 1:32); size = "Kích thước"/"Kích thước (Dài x Rộng x Cao)"/"Chiều dài" — giữ nguyên dạng chữ như trong Sheet (ví dụ "21 x 8 x 8"); color = "Màu"/"Màu xe"/"Color" (chú ý phân biệt với cột "Mẫu"); price = "Giá"/"Giá bán"/"Price" (giữ nguyên dạng chữ như trong sheet); stock = "Tồn kho"/"Stock"/"Số lượng" (số nguyên, mặc định 1); image_url = cột "Link ảnh"/"Ảnh"/"Hình ảnh"/"Ảnh sản phẩm"/"Image"/"Photo" — trong Sheet hiện tại đây là link THƯ MỤC Google Drive (…/drive/folders/…), cứ gửi nguyên link thư mục đó làm image_url (app sẽ tự mở thư mục qua Drive đã kết nối để liệt kê từng file ảnh thật khi đồng bộ); video_url = cột "Video"/"Link video"/"Video URL" (Sheet hiện tại không có — để rỗng). Cách lấy URL cho image_url và video_url, theo thứ tự ưu tiên: (1) hyperlink của ô nếu có; (2) URL trong công thức của ô ở userEnteredValue — công thức =IMAGE("...") hoặc =HYPERLINK("...";...) thì lấy URL trong cặp ngoặc kép đầu tiên; (3) nếu formattedValue tự nó là một URL http(s) thì dùng URL đó; ô chứa nhiều URL thì lấy URL đầu tiên. Nếu ô chỉ chứa ảnh/video CHÈN TRỰC TIẾP vào Sheet (không có hyperlink, không có công thức, formattedValue rỗng) thì để URL rỗng — ảnh chèn trực tiếp không có URL nên app không hiển thị được. Bỏ qua dòng không dựng được tên sản phẩm.`,
        `Với mỗi DÒNG, đặt external_key = "${s.spreadsheet_id}:<số thứ tự dòng trong sheet, tính cả dòng tiêu đề>". Nếu cột STT có giá trị, ưu tiên external_key = "${s.spreadsheet_id}:stt:<STT>:<Màu>" để mỗi dòng có một khóa riêng, không bị khử trùng nhầm trước khi app phân loại (app phân loại theo Hãng + Mẫu + Tỉ lệ + Kích thước + Màu sắc ở phía máy chủ, khóa dòng chỉ cần bắt đầu bằng đúng ID file Sheet này). Đồng thời gửi sheet_title là tiêu đề file Sheet nếu đọc được. Khi gọi importProductsFromSheet, BẮT BUỘC truyền source_id = ${sourceId} để app ghi trạng thái đồng bộ vào đúng nguồn Sheet này trong danh sách đã lưu.`,
      ].join("\n");
      try {
        const res = await ctx.agent.spawnTask(message, {
          expectsAction: "importProductsFromSheet",
          dedupeKey: `sheet-sync-${sourceId}-${s.spreadsheet_id}-${s.sheet_name}-${s.range}`,
        });
        if (!res.ok) {
          await setSetting(db, "sheet_last_sync_status", "error");
          await setSetting(db, "sheet_last_sync_message", res.error);
          await updateSourceSyncState(db, sourceId, {
            status: "error",
            message: res.error,
          });
          ctx.invalidateQueries();
          return {
            ok: false,
            message: `Không khởi động được đồng bộ: ${res.error}`,
          };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await setSetting(db, "sheet_last_sync_status", "error");
        await setSetting(db, "sheet_last_sync_message", msg);
        await updateSourceSyncState(db, sourceId, {
          status: "error",
          message: msg,
        });
        ctx.invalidateQueries();
        return {
          ok: false,
          message: `Không khởi động được đồng bộ: ${msg}`,
        };
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        message: source
          ? `Đã bắt đầu đồng bộ từ nguồn Sheet “${source.name}” — danh sách sản phẩm sẽ tự cập nhật sau ít phút, tải lại trang để xem.`
          : "Đã bắt đầu đồng bộ từ Google Sheet — danh sách sản phẩm sẽ tự cập nhật sau ít phút, tải lại trang để xem.",
      };
    },
  }),

  importProductsFromSheet: defineAction({
    request: z.object({
      source_id: z.number().int().min(0).default(0),
      sheet_title: z.string().default(""),
      products: z.array(
        z.object({
          stt: z.string().default(""),
          sku: z.string().default(""),
          name: z.string().default(""),
          model: z.string().default(""),
          scale: z.string().default(""),
          maker: z.string().default(""),
          size: z.string().default(""),
          color: z.string().default(""),
          price: z.string().default(""),
          stock: z.number().int().min(0).default(1),
          ship: z.string().default(""),
          image_url: z.string().default(""),
          video_url: z.string().default(""),
          external_key: z.string().default(""),
        }),
      ),
    }),
    response: z.object({
      ok: z.boolean(),
      inserted: z.number(),
      updated: z.number(),
      total: z.number(),
    }),
    async handler(ctx, args) {
      const r = await applySheetImport(ctx, args);
      return {
        ok: r.ok,
        inserted: r.inserted,
        updated: r.updated,
        total: r.total,
      };
    },
  }),

  // Đồng bộ NGAY trong lần bấm: app tự đọc file Google Sheet qua CLI của
  // connector (privileged) rồi nhập sản phẩm luôn, trả kết quả/lỗi thật
  // cho người dùng — thay cho đường cũ giao cho task nền vốn có thể không
  // bao giờ chạy (trạng thái kẹt ở "syncing", danh sách không hề tải).
  syncSheetNow: defineAction({
    request: z.object({
      source_id: z.number().int().min(0).default(0),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      inserted: z.number(),
      updated: z.number(),
      total: z.number(),
    }),
    privileged: [privileged.fetchSheetGrid, privileged.listDriveFolder],
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const zero = { inserted: 0, updated: 0, total: 0 };
      const sources = await loadSheetSources(db);
      const activeId = await getActiveSourceId(db, sources);
      const source =
        args.source_id > 0
          ? sources.find((s) => s.id === args.source_id)
          : sources.find((s) => s.id === activeId);
      const legacy = source ? null : await getSheetSettings(db);
      const cfg = source
        ? {
            spreadsheetId: source.spreadsheetId,
            sheetName: source.sheetName,
            range: source.range,
            title: source.title,
          }
        : legacy && legacy.configured
          ? {
              spreadsheetId: legacy.spreadsheet_id,
              sheetName: legacy.sheet_name,
              range: legacy.range,
              title: legacy.title,
            }
          : null;
      if (!cfg)
        return {
          ok: false,
          message:
            "Chưa có nguồn Google Sheet nào trong danh sách đã lưu — lưu một nguồn Sheet trước.",
          ...zero,
        };
      const sourceId = source?.id ?? 0;
      if (source) await mirrorSourceToSettings(db, source);
      await setSetting(db, "sheet_last_sync_status", "syncing");
      await setSetting(
        db,
        "sheet_last_sync_message",
        "Đang đọc file Google Sheet…",
      );
      await updateSourceSyncState(db, sourceId, {
        status: "syncing",
        message: "Đang đọc file Google Sheet…",
      });

      // Bước 1: đọc metadata để biết tiêu đề file + danh sách tab, phòng
      // khi nguồn chưa ghi tên tab (lấy tab đầu tiên).
      let fileTitle = cfg.title;
      let tabTitles: string[] = [];
      try {
        const meta = await ctx.executePrivileged(privileged.fetchSheetGrid, {
          spreadsheetId: cfg.spreadsheetId,
          ranges: [],
          includeGridData: false,
          fields: "properties(title),sheets(properties(title))",
        });
        if (meta.ok) {
          const j = JSON.parse(meta.stdout) as SheetGridJson;
          if (typeof j.properties?.title === "string" && j.properties.title)
            fileTitle = j.properties.title;
          tabTitles = (j.sheets ?? [])
            .map((s) => s.properties?.title ?? "")
            .filter((t) => t.length > 0);
        }
      } catch {
        // Không đọc được metadata cũng chưa kết luận — bước đọc lưới bên
        // dưới sẽ báo lỗi thật nếu có.
      }
      const wantedTab = cfg.sheetName.trim();
      const tab = wantedTab || tabTitles[0] || "";
      const rawRange = cfg.range.trim();
      let rangeArg = "";
      if (rawRange && rawRange.includes("!")) rangeArg = rawRange;
      else if (rawRange && tab)
        rangeArg = `'${tab.replace(/'/g, "''")}'!${rawRange}`;
      else if (tab) rangeArg = `'${tab.replace(/'/g, "''")}'`;

      // Bước 2: đọc lưới dữ liệu của tab/phạm vi đã chọn.
      let grid: { ok: boolean; stdout: string; stderr: string };
      try {
        grid = await ctx.executePrivileged(privileged.fetchSheetGrid, {
          spreadsheetId: cfg.spreadsheetId,
          ranges: rangeArg ? [rangeArg] : [],
          includeGridData: true,
          fields:
            "properties(title),sheets(properties(title),merges,data(startRow,startColumn,rowData(values(formattedValue,hyperlink,userEnteredValue))))",
        });
      } catch (e) {
        const msg = friendlySheetError(
          e instanceof Error ? e.message : String(e),
        );
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      if (!grid.ok) {
        const msg = friendlySheetError(grid.stderr || grid.stdout);
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      let parsed: SheetGridJson;
      try {
        parsed = JSON.parse(grid.stdout) as SheetGridJson;
      } catch {
        const msg =
          "Đọc Sheet thất bại: dữ liệu trả về không hợp lệ — thử bấm đồng bộ lại.";
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      if (parsed.error !== undefined) {
        const msg = friendlySheetError(JSON.stringify(parsed.error));
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      const { sheetTitle, products } = parseSheetGrid(
        parsed,
        cfg.spreadsheetId,
      );
      if (products.length === 0) {
        const msg =
          "Đã đọc được file Sheet nhưng không thấy dòng sản phẩm nào dựng được tên — kiểm tra hàng tiêu đề (dòng đầu cần có các cột STT / Hãng xe / Mẫu / Màu như Sheet BUSINESS, hoặc cột “Tên sản phẩm”) và tab/phạm vi của nguồn đã lưu.";
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      const r = await applySheetImport(ctx, {
        source_id: sourceId,
        sheet_title: sheetTitle || fileTitle,
        products,
      });
      // Bước 3: TỰ lấy ảnh thật từ Drive — mở từng thư mục Drive
      // phân biệt theo link ảnh của các sản phẩm vừa đồng bộ, liệt kê
      // file ảnh thật và gắn vào mọi biến thể dùng chung thư mục đó.
      // Thư mục rỗng/lỗi/không có link → trạng thái "Chưa có ảnh"
      // kèm lý do, không tính là có ảnh.
      // Kết quả cuối hiển thị NGẮN GỌN (theo yêu cầu người dùng): chỉ
      // Nhập / Mới / Cập nhật / Có ảnh / Chưa có ảnh — số ảnh tính
      // theo ảnh THẬT đã lấy được từ Drive cho đúng các sản phẩm vừa
      // nhập ở lần đồng bộ này.
      let finalMessage = r.message;
      try {
        const allProds = await db.select().from(schema.products);
        const byFolder = new Map<string, typeof allProds>();
        for (const p of allProds) {
          const fid = extractDriveFolderId(p.imageUrl);
          if (!fid) {
            if (p.driveStatus !== "no_link") {
              await storeProductDriveImages(db, p.id, {
                status: "no_link",
                folderId: "",
                images: [],
                error: p.imageUrl.trim()
                  ? "Link ảnh không phải link thư mục Google Drive nên app chưa liệt kê được file ảnh thật bên trong."
                  : "Sản phẩm chưa có link thư mục ảnh trong Sheet.",
              });
            }
            continue;
          }
          const arr = byFolder.get(fid) ?? [];
          arr.push(p);
          byFolder.set(fid, arr);
        }
        for (const [fid, prods] of byFolder) {
          const fr = await fetchDriveImages(
            ctx,
            `https://drive.google.com/drive/folders/${fid}`,
          );
          for (const p of prods)
            await storeProductDriveImages(db, p.id, fr);
        }
        // Sản phẩm vừa nhập là các biến thể phân loại theo Hãng +
        // Mẫu + Tỉ lệ + Kích thước + Màu sắc — khóa của chúng do
        // applySheetImport trả về (khóa theo từng dòng thô trong
        // Sheet không còn khớp nữa).
        const importedKeys = new Set(r.keys);
        const after = await db.select().from(schema.products);
        const importedRows =
          importedKeys.size > 0
            ? after.filter((p) => importedKeys.has(p.externalKey))
            : after.filter((p) =>
                p.externalKey.startsWith(`${cfg.spreadsheetId}:`),
              );
        if (importedRows.length > 0) {
          const withRealImage = importedRows.filter(
            (p) =>
              p.driveStatus === "ok" &&
              parseDriveImages(p.driveImages).length > 0,
          ).length;
          const withoutRealImage = importedRows.length - withRealImage;
          finalMessage =
            `Nhập ${r.total} · Mới ${r.inserted} · Cập nhật ${r.updated}` +
            ` · Có ảnh: ${withRealImage} · Chưa có ảnh: ${withoutRealImage}`;
          await setSetting(db, "sheet_last_sync_message", finalMessage);
          await updateSourceSyncState(db, sourceId, {
            status: "success",
            message: finalMessage,
          });
        }
        ctx.invalidateQueries();
      } catch {
        finalMessage = `${r.message} · Chưa quét được ảnh Drive`;
      }
      return {
        ok: r.ok,
        message: finalMessage,
        inserted: r.inserted,
        updated: r.updated,
        total: r.total,
      };
    },
  }),

  // -------------------------------------------------------------- products
  listProducts: defineAction({
    request: z.object({}),
    response: z.object({ products: z.array(productOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.products)
        .orderBy(desc(schema.products.id));
      return {
        products: rows.map((r) => ({
          id: r.id,
          stt: r.stt,
          // Sản phẩm cũ chưa có SKU thì dựng tại chỗ theo quy định
          // "STT-Tên-Màu" để giao diện luôn có mã đối chiếu.
          sku: r.sku || buildSku(r.stt, r.name, r.color),
          name: r.name,
          scale: r.scale,
          maker: r.maker,
          size: r.size,
          color: r.color,
          colors: parseColors(r.colors, r.color),
          price: r.price,
          stock: r.stock,
          ship: r.ship,
          image_url: normalizeSheetImageUrl(r.imageUrl),
          video_url: r.videoUrl,
          drive_folder_id: r.driveFolderId,
          drive_status: r.driveStatus,
          drive_error: r.driveError,
          drive_checked_at: r.driveCheckedAt,
          drive_images: parseDriveImages(r.driveImages),
          has_real_image:
            r.driveStatus === "ok" &&
            parseDriveImages(r.driveImages).length > 0,
          source: r.source,
          created_at: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  // Liệt kê lại ảnh thật từ thư mục Drive của MỘT sản phẩm (nút
  // "Quét lại ảnh Drive" / dùng khi thư mục vừa được bổ sung ảnh).
  refreshProductImages: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      drive_status: z.string(),
      image_count: z.number(),
    }),
    privileged: [privileged.listDriveFolder],
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, args.id));
      if (!row)
        return {
          ok: false,
          message: "Không tìm thấy sản phẩm.",
          drive_status: "",
          image_count: 0,
        };
      const r = await fetchDriveImages(ctx, row.imageUrl);
      await storeProductDriveImages(db, row.id, r);
      ctx.invalidateQueries();
      const n = r.images.length;
      return {
        ok: r.status === "ok",
        message:
          r.status === "ok"
            ? `Đã lấy ${n} ảnh thật từ thư mục Drive của ${row.name}. Ảnh gốc ${r.images.some((i) => i.is_heic) ? "gồm file HEIC — " : ""}bản dùng để đăng là bản JPEG do Drive kết xuất.`
            : r.status === "empty"
              ? `Thư mục Drive của ${row.name} đang RỖNG — chưa có file ảnh nào, sản phẩm hiện “Chưa có ảnh”.`
              : "error" in r
                ? r.error
                : "Sản phẩm chưa có link thư mục Drive.",
        drive_status: r.status,
        image_count: n,
      };
    },
  }),

  saveProduct: defineAction({
    request: z.object({
      id: z.number().int().positive().optional(),
      stt: z.string().default(""),
      name: z.string().min(1),
      scale: z.string().default(""),
      maker: z.string().default(""),
      size: z.string().default(""),
      color: z.string().default(""),
      price: z.string().default(""),
      stock: z.number().int().min(0).default(1),
      ship: z.string().default(""),
      image_url: z.string().default(""),
      video_url: z.string().default(""),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const values = {
        stt: args.stt.trim(),
        // SKU nội bộ dựng lại mỗi lần lưu theo "STT-Tên-Màu".
        sku: buildSku(args.stt, args.name, args.color),
        name: args.name.trim(),
        scale: args.scale.trim(),
        maker: args.maker.trim(),
        size: args.size.trim(),
        color: args.color.trim(),
        // Sản phẩm nhập tay có một màu duy nhất — danh sách màu là
        // đúng màu đó (đồng bộ với cách sản phẩm Sheet được phân
        // loại theo từng màu).
        colors: JSON.stringify(
          args.color.trim() ? [args.color.trim()] : [],
        ),
        price: args.price.trim(),
        stock: args.stock,
        // Vận chuyển để trống = mặc định COD.
        ship: args.ship.trim() || "COD",
        imageUrl: args.image_url.trim(),
        videoUrl: args.video_url.trim(),
      };
      if (args.id) {
        await db
          .update(schema.products)
          .set(values)
          .where(eq(schema.products.id, args.id));
        ctx.invalidateQueries();
        return { id: args.id };
      }
      const [row] = await db
        .insert(schema.products)
        .values(values)
        .returning({ id: schema.products.id });
      if (!row) throw new Error("saveProduct: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  deleteProduct: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.products).where(eq(schema.products.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // -------------------------------------------------------------- research
  listResearch: defineAction({
    request: z.object({}),
    response: z.object({ runs: z.array(runOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.researchRuns)
        .orderBy(desc(schema.researchRuns.ranAt));
      return {
        runs: rows.map((r) => ({
          id: r.id,
          query: r.query,
          ran_at: r.ranAt.toISOString(),
          marketplace_count: r.marketplaceCount,
          price_count: r.priceCount,
          price_min: r.priceMin,
          price_median: r.priceMedian,
          price_max: r.priceMax,
          price_min_fmt: r.priceMin != null ? fmtVnd(r.priceMin) : "—",
          price_median_fmt: r.priceMedian != null ? fmtVnd(r.priceMedian) : "—",
          price_max_fmt: r.priceMax != null ? fmtVnd(r.priceMax) : "—",
          groups_found: r.groupsFound,
          notes: r.notes,
        })),
      };
    },
  }),

  addResearch: defineAction({
    request: z.object({
      query: z.string().min(1),
      marketplace_count: z.number().int().min(0).default(0),
      price_count: z.number().int().min(0).default(0),
      price_min: z.number().int().min(0).optional(),
      price_median: z.number().int().min(0).optional(),
      price_max: z.number().int().min(0).optional(),
      groups_found: z.number().int().min(0).default(0),
      notes: z.string().default(""),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .insert(schema.researchRuns)
        .values({
          query: args.query.trim(),
          ranAt: new Date(),
          marketplaceCount: args.marketplace_count,
          priceCount: args.price_count,
          priceMin: args.price_min ?? null,
          priceMedian: args.price_median ?? null,
          priceMax: args.price_max ?? null,
          groupsFound: args.groups_found,
          notes: args.notes.trim(),
        })
        .returning({ id: schema.researchRuns.id });
      if (!row) throw new Error("addResearch: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  deleteResearch: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.researchRuns)
        .where(eq(schema.researchRuns.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // ---------------------------------------------------------------- groups
  listGroups: defineAction({
    request: z.object({}),
    response: z.object({ groups: z.array(groupOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.fbGroups)
        .orderBy(asc(schema.fbGroups.name));
      // Các danh tính đối chiếu trạng thái tham gia nhóm: mọi tài
      // khoản Facebook + mọi Page thuộc các tài khoản đó. Instagram
      // không tham gia được nhóm Facebook nên không đưa vào danh
      // sách này. Trạng thái trả về TÁCH RIÊNG theo danh tính:
      // joined/account_joined chỉ là của tài khoản chính, còn
      // joined_pages liệt kê từng Page con đang chọn đăng đã tham
      // gia — Page và tài khoản chính có thể khác trạng thái nên
      // không gộp thành một cờ của cả nhóm.
      const jc = await loadJoinContext(db);
      return {
        groups: rows.map((r) => ({
          id: r.id,
          name: r.name,
          url: r.url,
          members: r.members,
          joined: accountCountsAsJoined(jc, r),
          account_joined: accountCountsAsJoined(jc, r),
          joined_pages: joinedPostingPages(jc, r).map((p) => ({
            id: p.id,
            name: p.name,
          })),
          is_target: r.isTarget === 1,
          created_at: r.createdAt.toISOString(),
          memberships: buildMemberships(jc, r),
        })),
      };
    },
  }),

  // Đặt trạng thái tham gia của MỘT tài khoản/Page đối với MỘT nhóm
  // (người dùng xác nhận sau khi kiểm tra trên Facebook) — chỉ hai
  // trạng thái: đã tham gia / chưa tham gia. Đặt cho danh tính nào
  // chỉ ghi cho ĐÚNG danh tính đó: đặt ở dòng Page không đổi trạng
  // thái của tài khoản chính và ngược lại. Sau đó cột
  // fb_groups.joined được đồng bộ lại theo RIÊNG tài khoản chính.
  setGroupMembership: defineAction({
    request: z.object({
      group_id: z.number().int().positive(),
      identity_kind: z.enum(["account", "page"]),
      identity_id: z.number().int().positive(),
      status: z.enum(["joined", "not_joined"]),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [existing] = await db
        .select()
        .from(schema.groupMemberships)
        .where(
          and(
            eq(schema.groupMemberships.groupId, args.group_id),
            eq(schema.groupMemberships.identityKind, args.identity_kind),
            eq(schema.groupMemberships.identityId, args.identity_id),
          ),
        );
      if (existing) {
        await db
          .update(schema.groupMemberships)
          .set({ status: args.status, updatedAt: Date.now() })
          .where(eq(schema.groupMemberships.id, existing.id));
      } else {
        await db.insert(schema.groupMemberships).values({
          groupId: args.group_id,
          identityKind: args.identity_kind,
          identityId: args.identity_id,
          status: args.status,
          updatedAt: Date.now(),
        });
      }
      await syncStoredGroupJoined(db, args.group_id);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // Tài khoản Facebook đã liên kết sẽ thực hiện việc thêm nhóm —
  // giao diện mục Hội nhóm hiển thị dòng xác nhận này trong panel
  // dán link để người dùng biết nhóm sắp thêm mang tên nick nào.
  getGroupAdderAccount: defineAction({
    request: z.object({}),
    response: z.object({ linked: z.boolean(), name: z.string() }),
    async handler(ctx): Promise<{ linked: boolean; name: string }> {
      const db = ctx.db<typeof schema>();
      const name = await linkedFbAccountName(db);
      return { linked: name.length > 0, name };
    },
  }),

  addGroup: defineAction({
    request: z.object({
      name: z.string().min(1),
      url: z.string().default(""),
      members: z.number().int().min(0).default(0),
      joined: z.boolean().default(false),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .insert(schema.fbGroups)
        .values({
          name: args.name.trim(),
          url: args.url.trim(),
          members: args.members,
          joined: args.joined ? 1 : 0,
          isTarget: 0,
        })
        .returning({ id: schema.fbGroups.id });
      if (!row) throw new Error("addGroup: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  setGroupFlags: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      joined: z.boolean().optional(),
      is_target: z.boolean().optional(),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const patch: { joined?: number; isTarget?: number } = {};
      if (args.joined !== undefined) patch.joined = args.joined ? 1 : 0;
      if (args.is_target !== undefined)
        patch.isTarget = args.is_target ? 1 : 0;
      if (Object.keys(patch).length > 0) {
        await db
          .update(schema.fbGroups)
          .set(patch)
          .where(eq(schema.fbGroups.id, args.id));
      }
      // Bật/tắt cờ joined = đặt trạng thái tham gia của tài
      // khoản Facebook chính (cột joined chỉ nói về tài khoản
      // chính, không liên quan trạng thái của các Page con), rồi
      // đồng bộ lại cột theo đúng tài khoản chính để hai nơi
      // không lệch nhau.
      if (args.joined !== undefined) {
        const fbAccounts = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.platform, "Facebook"))
          .orderBy(desc(schema.accounts.selected), asc(schema.accounts.id));
        const primary = fbAccounts[0];
        if (primary) {
          const status = args.joined ? "joined" : "not_joined";
          const [existing] = await db
            .select()
            .from(schema.groupMemberships)
            .where(
              and(
                eq(schema.groupMemberships.groupId, args.id),
                eq(schema.groupMemberships.identityKind, "account"),
                eq(schema.groupMemberships.identityId, primary.id),
              ),
            );
          if (existing) {
            await db
              .update(schema.groupMemberships)
              .set({ status, updatedAt: Date.now() })
              .where(eq(schema.groupMemberships.id, existing.id));
          } else {
            await db.insert(schema.groupMemberships).values({
              groupId: args.id,
              identityKind: "account",
              identityId: primary.id,
              status,
              updatedAt: Date.now(),
            });
          }
        }
        await syncStoredGroupJoined(db, args.id);
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteGroup: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.fbGroups).where(eq(schema.fbGroups.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // Dán LINK nhóm Facebook → bấm Lưu → app QUÉT từng link rồi LƯU
  // THẲNG vào danh sách nhóm (xem ghi chú "hội nhóm theo LINK" ở
  // trên): tách mã nhóm từ từng link, đọc chi tiết thật (tên, số
  // thành viên, mô tả) bằng `groups details` qua tài khoản Facebook
  // đã liên kết, kiểm tra trạng thái tham gia của nick đó bằng các
  // bằng chứng kênh liên kết cung cấp được (danh sách nhóm đã kết
  // nối; nhóm kín đọc được bài bên trong). Có bằng chứng "đã tham
  // gia" thì ghi trạng thái joined cho đúng nick đó; không có bằng
  // chứng thì lượt quét báo "chưa tham gia" (chỉ hai trạng thái —
  // không có "Chưa rõ") nhưng KHÔNG ghi đè trạng thái người dùng
  // đã đặt tay. Nhóm trùng link được cập nhật tên/số thành viên
  // thay vì nhân đôi.
  saveGroupLinks: defineAction({
    request: z.object({
      links_text: z.string().min(1).max(20000),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      parsed_links: z.number(),
      inserted: z.number(),
      updated: z.number(),
      scanned: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          url: z.string(),
          members: z.number(),
          description: z.string(),
          detail_ok: z.boolean(),
          fb_status: z.enum(["joined", "not_joined"]),
          note: z.string(),
        }),
      ),
    }),
    privileged: [
      privileged.getFbGroupDetails,
      privileged.searchFbGroups,
      privileged.getFbGroupPosts,
    ],
    async handler(
      ctx,
      args,
    ): Promise<{
      ok: boolean;
      message: string;
      parsed_links: number;
      inserted: number;
      updated: number;
      scanned: Array<{
        id: number;
        name: string;
        url: string;
        members: number;
        description: string;
        detail_ok: boolean;
        fb_status: "joined" | "not_joined";
        note: string;
      }>;
    }> {
      const db = ctx.db<typeof schema>();
      type Scanned = {
        id: number;
        name: string;
        url: string;
        members: number;
        description: string;
        detail_ok: boolean;
        fb_status: "joined" | "not_joined";
        note: string;
      };
      // 1) Tách mã nhóm từ mọi link facebook.com/groups/<mã> trong
      // văn bản đã dán; cũng chấp nhận dòng chỉ gồm mã/tên vanity.
      const segments: string[] = [];
      const seenSeg = new Set<string>();
      const pushSeg = (seg: string) => {
        const s = seg.trim().replace(/\/+$/, "");
        if (!s || s === "search" || seenSeg.has(s)) return;
        seenSeg.add(s);
        segments.push(s);
      };
      const linkRe = /facebook\.com\/groups\/([A-Za-z0-9._-]+)/g;
      for (const m of args.links_text.matchAll(linkRe)) {
        if (m[1]) pushSeg(m[1]);
      }
      if (segments.length === 0) {
        for (const line of args.links_text.split(/\r?\n/)) {
          const t = line.trim();
          if (/^[A-Za-z0-9._-]{3,}$/.test(t)) pushSeg(t);
        }
      }
      if (segments.length === 0) {
        const msg =
          "Chưa thấy link nhóm nào trong nội dung đã dán. Hãy dán link các nhóm (dạng facebook.com/groups/…), mỗi link một dòng.";
        return {
          ok: false,
          message: msg,
          parsed_links: 0,
          inserted: 0,
          updated: 0,
          scanned: [],
        };
      }

      // 2) Nick Facebook ĐANG HÀNH ĐỘNG (đã liên kết, ưu tiên nick
      // đang chọn dùng) — kênh liên kết quét nhóm dưới danh tính
      // nick này, nên bằng chứng tham gia chỉ áp cho nick này.
      const fbAccounts = await db
        .select()
        .from(schema.accounts)
        .where(
          and(
            eq(schema.accounts.platform, "Facebook"),
            eq(schema.accounts.linked, 1),
          ),
        )
        .orderBy(desc(schema.accounts.selected), asc(schema.accounts.id));
      const acting = fbAccounts[0];

      // 3) Bằng chứng (a): danh sách nhóm nick đã kết nối theo kênh
      // liên kết (`groups search --role connected`). Chỉ mục này có
      // thể trả rỗng — khi đó bước này đơn giản là không cho bằng
      // chứng nào, KHÔNG suy ra "chưa tham gia".
      const connectedIds = new Set<string>();
      const connectedNames = new Set<string>();
      if (acting) {
        try {
          const res = await ctx.executePrivileged(
            privileged.searchFbGroups,
            {
              keywords: "",
              role: "connected",
              sortBy: "MOST_RELEVANT",
              status: "any",
              limit: 25,
            },
          );
          if (res.ok && res.stdout.trim()) {
            const parsed = JSON.parse(res.stdout) as unknown;
            for (const row of extractGroupRows(parsed)) {
              const id = pickStr(row, ["group_id", "id", "fb_id", "groupId"]);
              if (id) connectedIds.add(id);
              const u = pickStr(row, ["group_url", "url", "link"]);
              const um = u.match(/groups\/([^/?#]+)/);
              if (um?.[1]) connectedIds.add(um[1]);
              const nm = pickStr(row, ["name", "title"]);
              if (nm) connectedNames.add(nm.toLowerCase());
            }
          }
        } catch {
          // Bằng chứng phụ — lỗi thì bỏ qua, coi như không có bằng chứng.
        }
      }

      // 4) Quét từng link: chi tiết thật + trạng thái tham gia +
      // lưu/cập nhật vào danh sách.
      const existing = await db.select().from(schema.fbGroups);
      const bySeg = new Map<string, (typeof existing)[number]>();
      for (const g of existing) {
        const gm = g.url.match(/groups\/([^/?#]+)/);
        if (gm?.[1]) bySeg.set(gm[1], g);
      }
      let inserted = 0;
      let updated = 0;
      const scanned: Scanned[] = [];
      for (const seg of segments.slice(0, 25)) {
        const url = `https://www.facebook.com/groups/${seg}`;
        let name = "";
        let members = 0;
        let description = "";
        let detailOk = false;
        let isPublic = true;
        try {
          const res = await ctx.executePrivileged(
            privileged.getFbGroupDetails,
            { groupId: seg },
          );
          if (res.ok && res.stdout.trim()) {
            const p = JSON.parse(res.stdout) as Record<string, unknown>;
            name = pickStr(p, ["name", "title"]);
            members = parseMemberCount(
              p.member_count ?? p.members ?? p.memberCount,
            );
            description = pickStr(p, ["about", "description"]);
            const visibility = pickStr(p, ["visibility"]);
            const audience = pickStr(p, [
              "audience_label",
              "audience_description",
            ]);
            isPublic =
              visibility.toUpperCase() === "OPEN" ||
              /công khai/i.test(audience);
            detailOk = name.length > 0;
          }
        } catch {
          detailOk = false;
        }

        let fbStatus: "joined" | "not_joined" = "not_joined";
        let note = "";
        if (!acting) {
          note =
            "Chưa liên kết tài khoản Facebook nên chưa quét được trạng thái tham gia — đang để Chưa tham gia.";
        } else if (
          connectedIds.has(seg) ||
          (name && connectedNames.has(name.toLowerCase()))
        ) {
          fbStatus = "joined";
          note = `${acting.name} đã tham gia — nhóm nằm trong danh sách nhóm đã kết nối của tài khoản.`;
        } else if (!isPublic && detailOk) {
          // Bằng chứng (b): nhóm KÍN — chỉ thành viên mới đọc được
          // bài bên trong.
          try {
            const pres = await ctx.executePrivileged(
              privileged.getFbGroupPosts,
              { groupId: seg },
            );
            if (pres.ok && pres.stdout.trim()) {
              const pp = JSON.parse(pres.stdout) as Record<
                string,
                unknown
              >;
              if (Array.isArray(pp.data) && pp.data.length > 0)
                fbStatus = "joined";
            }
          } catch {
            // Không có bằng chứng — giữ "chưa tham gia".
          }
          note =
            fbStatus === "joined"
              ? `${acting.name} đã tham gia — nhóm kín nhưng tài khoản đọc được bài đăng bên trong nhóm.`
              : `Chưa thấy bằng chứng ${acting.name} đã tham gia (nhóm kín, kênh liên kết chưa kết luận được) — đang để Chưa tham gia; nếu nick đã tham gia, đặt lại trên thẻ nhóm.`;
        } else {
          note = `Chưa thấy bằng chứng ${acting.name} đã tham gia — kênh Facebook đã liên kết không liệt kê được danh sách nhóm tài khoản đã tham gia — đang để Chưa tham gia; nếu nick đã tham gia, đặt lại trên thẻ nhóm.`;
        }
        if (!detailOk) {
          note =
            "Chưa đọc được chi tiết nhóm này bằng tài khoản Facebook đã liên kết — nhóm vẫn được lưu bằng link đã dán. " +
            note;
        }

        const prev = bySeg.get(seg);
        let groupId = 0;
        if (prev) {
          const patch: { name?: string; members?: number; url?: string } =
            {};
          if (detailOk && name) patch.name = name;
          if (members > 0) patch.members = members;
          if (!prev.url.trim()) patch.url = url;
          if (Object.keys(patch).length > 0) {
            await db
              .update(schema.fbGroups)
              .set(patch)
              .where(eq(schema.fbGroups.id, prev.id));
          }
          groupId = prev.id;
          updated += 1;
        } else {
          const [row] = await db
            .insert(schema.fbGroups)
            .values({
              name: detailOk && name ? name : seg,
              url,
              members,
              joined: fbStatus === "joined" ? 1 : 0,
              isTarget: 0,
            })
            .returning({ id: schema.fbGroups.id });
          if (!row)
            throw new Error("saveGroupLinks: insert returned no rows");
          groupId = row.id;
          inserted += 1;
        }

        // Có bằng chứng đã tham gia → ghi trạng thái joined cho
        // đúng nick đang hành động (chỉ nick đó — không suy ra
        // trạng thái cho Page con hay tài khoản khác) + đồng bộ
        // cột joined của nhóm theo riêng tài khoản chính.
        if (fbStatus === "joined" && acting) {
          const [mem] = await db
            .select()
            .from(schema.groupMemberships)
            .where(
              and(
                eq(schema.groupMemberships.groupId, groupId),
                eq(schema.groupMemberships.identityKind, "account"),
                eq(schema.groupMemberships.identityId, acting.id),
              ),
            );
          if (mem) {
            if (mem.status !== "joined") {
              await db
                .update(schema.groupMemberships)
                .set({ status: "joined", updatedAt: Date.now() })
                .where(eq(schema.groupMemberships.id, mem.id));
            }
          } else {
            await db.insert(schema.groupMemberships).values({
              groupId,
              identityKind: "account",
              identityId: acting.id,
              status: "joined",
              updatedAt: Date.now(),
            });
          }
          await syncStoredGroupJoined(db, groupId);
        }

        scanned.push({
          id: groupId,
          name: detailOk && name ? name : (prev?.name ?? seg),
          url,
          members: members > 0 ? members : (prev?.members ?? 0),
          description,
          detail_ok: detailOk,
          fb_status: fbStatus,
          note,
        });
      }

      const detailCount = scanned.filter((s) => s.detail_ok).length;
      const joinedCount = scanned.filter(
        (s) => s.fb_status === "joined",
      ).length;
      const message =
        `Đã quét ${scanned.length} link nhóm và lưu vào danh sách: ` +
        `thêm mới ${inserted}, cập nhật ${updated} · đọc được chi tiết ` +
        `${detailCount} nhóm` +
        (acting
          ? ` · xác minh được ${joinedCount} nhóm ${acting.name} đã tham gia (số còn lại đang để “Chưa tham gia” — đặt lại trên thẻ nhóm nếu đã tham gia).`
          : " · chưa liên kết tài khoản Facebook nên chưa quét được trạng thái tham gia.") +
        " Danh sách nhóm bên dưới hiển thị theo tên nhóm.";
      ctx.invalidateQueries();
      return {
        ok: true,
        message,
        parsed_links: segments.length,
        inserted,
        updated,
        scanned,
      };
    },
  }),

  // Tìm hội nhóm Facebook theo những điều kiện người dùng chọn (từ khóa,
  // phạm vi, sắp xếp, trạng thái, số kết quả, số thành viên tối thiểu) —
  // chạy facebook-cli qua privileged ngay trong lần bấm, trả kết quả thật
  // kèm cờ "đã có trong danh sách" để giao diện không thêm trùng.
  //
  // LƯU Ý: action này là kênh lập trình CLI CŨ — giao diện KHÔNG
  // còn dùng nữa. Người dùng đã kiểm chứng kết quả tìm bằng từ khóa
  // của CLI khác hẳn ô tìm kiếm trên web Facebook (từ khóa tiếng
  // Việt trả 0 nhóm trong khi web có kết quả) và nay chốt luồng hội
  // nhóm theo LINK: dán link nhóm → saveGroupLinks quét từng link
  // (chi tiết + trạng thái tham gia) → lưu thẳng vào danh sách.
  // Giữ action này chỉ để tương thích.
  //
  // Nguyên tắc TÌM KIẾM CHUẨN FACEBOOK (người dùng chốt): mỗi lần bấm
  // tìm = đúng MỘT lần gọi `groups search` — đường tìm nhóm gốc của
  // Facebook — với từ khóa nguyên văn và đúng điều kiện đã chọn, hệt
  // như gõ vào ô tìm nhóm trên Facebook. App không tự nới điều kiện,
  // không sinh biến thể từ khóa, không tự thử lại (cơ chế cũ từng biến
  // "mô hình xe" thành "hình xe mô" và làm kết quả lệch hẳn khỏi tìm
  // tay trên Facebook). Mặc định cũng theo chuẩn Facebook/CLI: sắp xếp
  // MOST_RELEVANT (liên quan nhất — cách Facebook xếp kết quả tìm
  // kiếm), trạng thái non_archived, tối đa 25 kết quả (mức trần của
  // lệnh gốc).
  //
  // Chẩn đoán vẫn giữ: 1) kiểm tra phiên Facebook (lệnh `me`) TRƯỚC khi
  // tìm — phiên chết thì báo rõ phiên, không giả vờ "0 nhóm"; 2) bộ đọc
  // chấp nhận các định dạng kết quả của CLI (groups/results ở gốc hoặc
  // trong data, id/group_id, member_count dạng số hoặc chuỗi
  // "16,000"/"16K"); 3) thông báo phân biệt "Facebook trả N nhóm, 0
  // nhóm khớp sau lọc" với "Facebook trả 0 nhóm".
  findGroups: defineAction({
    request: z.object({
      keywords: z.string().max(200).default(""),
      role: z
        .enum(["any", "connected", "admin", "admod"])
        .default("any"),
      sort_by: z
        .enum([
          "MOST_RELEVANT",
          "LARGEST",
          "RECENT_ACTIVITY",
          "LAST_VISITED",
          "ALPHABETICAL",
        ])
        .default("MOST_RELEVANT"),
      status: z
        .enum(["any", "weekly_active", "non_archived", "archived"])
        .default("non_archived"),
      limit: z.number().int().min(1).max(25).default(25),
      min_members: z.number().int().min(0).default(0),
    }),
    response: findGroupsResponse,
    privileged: [privileged.searchFbGroups, privileged.checkFbSession],
    async handler(ctx, args): Promise<z.infer<typeof findGroupsResponse>> {
      const db = ctx.db<typeof schema>();
      const empty: z.infer<typeof foundGroupOut>[] = [];
      const attempts: z.infer<typeof findGroupsAttempt>[] = [];
      const kw = args.keywords.trim();
      const filtersDesc =
        `từ khóa "${kw || "(trống)"}", phạm vi ${args.role}, ` +
        `sắp xếp ${args.sort_by}, trạng thái ${args.status}, tối đa ${args.limit}, ` +
        `thành viên tối thiểu ${args.min_members}`;
      const finish = async (
        ok: boolean,
        message: string,
        rawCount: number,
        results: z.infer<typeof foundGroupOut>[],
        detail: string,
      ): Promise<z.infer<typeof findGroupsResponse>> => {
        void filtersDesc;
        void detail;
        return {
          ok,
          message,
          raw_count: rawCount,
          matched_count: results.length,
          results,
          attempts,
        };
      };

      // 1) Kiểm tra phiên Facebook trước khi tìm.
      let sessionName = "";
      let sessionErr = "";
      try {
        const s = await ctx.executePrivileged(privileged.checkFbSession, {});
        if (s.ok) {
          try {
            const p = JSON.parse(s.stdout) as {
              name?: unknown;
              fb_user_id?: unknown;
            };
            if (typeof p.fb_user_id === "string" && p.fb_user_id) {
              sessionName = typeof p.name === "string" ? p.name : "";
            } else {
              sessionErr = "lệnh kiểm tra phiên không trả về tài khoản";
            }
          } catch {
            sessionErr = "dữ liệu kiểm tra phiên không hợp lệ";
          }
        } else {
          sessionErr = (s.stderr || s.stdout || "").trim().slice(0, 300);
        }
      } catch (e) {
        sessionErr = e instanceof Error ? e.message : String(e);
      }
      if (!sessionName && sessionErr) {
        return finish(
          false,
          "Không kiểm tra được phiên đăng nhập Facebook trên máy chủ — phiên có thể đã hết hạn. Mở mục Tài khoản để kiểm tra tài khoản Facebook đã liên kết, rồi thử tìm lại." +
            (sessionErr ? ` Chi tiết lỗi: ${sessionErr}` : ""),
          0,
          empty,
          `kiểm tra phiên thất bại: ${sessionErr}`,
        );
      }

      // 2) Tìm kiếm CHUẨN FACEBOOK: đúng MỘT lần tìm bằng lệnh
      // `groups search` của facebook-cli — đường tìm kiếm nhóm gốc của
      // Facebook — với từ khóa NGUYÊN VĂN người dùng nhập và đúng các
      // điều kiện đã chọn (phạm vi, sắp xếp, trạng thái, số kết quả).
      // App KHÔNG tự nới điều kiện, KHÔNG sinh biến thể từ khóa, KHÔNG
      // tự thử lại: Facebook trả gì thì hiển thị đúng như vậy, hệt như
      // gõ từ khóa vào ô tìm nhóm trên Facebook. (Người dùng chốt yêu
      // cầu này sau khi cơ chế tự thử bằng biến thể từ khóa — đảo thứ
      // tự từ, thêm "1:18" — làm kết quả lệch hẳn khỏi tìm tay trên
      // Facebook.)
      let res: { ok: boolean; stdout: string; stderr: string } | null = null;
      let callErr = "";
      try {
        res = await ctx.executePrivileged(privileged.searchFbGroups, {
          keywords: kw,
          role: args.role,
          sortBy: args.sort_by,
          status: args.status,
          limit: args.limit,
        });
      } catch (e) {
        callErr = e instanceof Error ? e.message : String(e);
      }
      if (callErr || !res || !res.ok) {
        const rawErr = callErr
          ? callErr
          : (res?.stderr || res?.stdout || "").trim();
        const lastError = (rawErr || "CLI lỗi không rõ").slice(0, 300);
        attempts.push({
          keywords: kw,
          sort_by: args.sort_by,
          status: args.status,
          raw_count: 0,
          matched_count: 0,
          note: `lỗi: ${lastError}`,
        });
        const hint = /login|log in|session|auth|đăng nhập/i.test(lastError)
          ? "Phiên Facebook trên máy chủ đã hết hạn hoặc chưa đăng nhập — kiểm tra mục Tài khoản rồi thử lại."
          : /timeout|timed out/i.test(lastError)
            ? "Facebook phản hồi quá chậm (timeout) khi tìm nhóm — thử lại sau ít giây."
            : `Tìm nhóm thất bại. Lỗi từ Facebook: ${lastError}`;
        return finish(
          false,
          hint,
          0,
          empty,
          `tìm chuẩn Facebook bị lỗi: ${lastError}`,
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(res.stdout) as unknown;
      } catch {
        const lastError = "dữ liệu Facebook trả về không phải JSON hợp lệ";
        attempts.push({
          keywords: kw,
          sort_by: args.sort_by,
          status: args.status,
          raw_count: 0,
          matched_count: 0,
          note: `lỗi: ${lastError}`,
        });
        return finish(
          false,
          `Tìm nhóm thất bại: ${lastError}.`,
          0,
          empty,
          `lỗi đọc dữ liệu · stdout 200 ký tự đầu: ${res.stdout.slice(0, 200)}`,
        );
      }
      const rows = extractGroupRows(parsed);

      // 3) Facebook trả 0 nhóm cho đúng từ khóa + điều kiện này → báo
      // đúng như vậy. App không tự thử cụm từ nào khác — muốn kết quả
      // khác, người dùng đổi từ khóa/điều kiện như khi tìm trên
      // Facebook.
      if (rows.length === 0) {
        attempts.push({
          keywords: kw,
          sort_by: args.sort_by,
          status: args.status,
          raw_count: 0,
          matched_count: 0,
          note: "tìm kiếm chuẩn Facebook",
        });
        const suggestion =
          args.role === "any" && !kw
            ? "Phạm vi “Tất cả nhóm trên Facebook” bắt buộc phải có từ khóa — hãy nhập từ khóa rồi tìm lại."
            : args.role !== "any"
              ? `Phạm vi này chỉ gồm nhóm của tài khoản đang đăng nhập${sessionName ? ` (${sessionName})` : ""} — nếu nhóm chưa tham gia, hãy chọn phạm vi “Tất cả nhóm trên Facebook”.`
              : "Hãy kiểm tra lại từ khóa hoặc nới điều kiện (phạm vi, trạng thái) — app tìm đúng nguyên văn như trên Facebook, không tự sửa cụm từ.";
        return finish(
          true,
          `Facebook không trả về nhóm nào cho từ khóa “${kw || "(trống)"}” với điều kiện đã chọn. ${suggestion}`,
          0,
          empty,
          `Facebook trả 0 nhóm cho từ khóa nguyên văn` +
            (sessionName ? ` · phiên: ${sessionName}` : ""),
        );
      }

      // 4) Lọc kết quả Facebook trả về theo điều kiện của người dùng
      // (thành viên tối thiểu), đếm riêng từng lý do bị loại để thông
      // báo nói rõ Facebook trả bao nhiêu nhóm và bộ lọc giữ lại bao
      // nhiêu.
      const rawCount = rows.length;
      const saved = await db.select().from(schema.fbGroups);
      const savedKeys = new Set<string>();
      for (const g of saved) {
        const m = g.url.match(/groups\/([^/?#]+)/);
        if (m?.[1]) savedKeys.add(m[1]);
        if (g.url.trim()) savedKeys.add(g.url.trim().replace(/\/$/, ""));
      }
      const seen = new Set<string>();
      const results: z.infer<typeof foundGroupOut>[] = [];
      let droppedNoId = 0;
      let droppedDup = 0;
      let droppedMembers = 0;
      for (const g of rows) {
        const fbId = pickStr(g, ["group_id", "id", "fb_id", "groupId"]);
        if (!fbId) {
          droppedNoId += 1;
          continue;
        }
        if (seen.has(fbId)) {
          droppedDup += 1;
          continue;
        }
        seen.add(fbId);
        const members = parseMemberCount(
          g.member_count ?? g.members ?? g.memberCount ?? g.member_count_fmt,
        );
        if (members < args.min_members) {
          droppedMembers += 1;
          continue;
        }
        const url = pickStr(g, ["group_url", "url", "link"]);
        results.push({
          fb_id: fbId,
          name: pickStr(g, ["name", "title"]) || "(Không tên)",
          url,
          members,
          description: pickStr(g, ["description", "about"]),
          already_added:
            savedKeys.has(fbId) ||
            (url ? savedKeys.has(url.replace(/\/$/, "")) : false),
        });
      }
      attempts.push({
        keywords: kw,
        sort_by: args.sort_by,
        status: args.status,
        raw_count: rawCount,
        matched_count: results.length,
        note: "tìm kiếm chuẩn Facebook",
      });
      const dropDetail =
        `Facebook trả ${rawCount} nhóm · khớp ${results.length} · ` +
        `loại: thiếu mã ${droppedNoId}, trùng ${droppedDup}, ` +
        `dưới ${args.min_members} thành viên ${droppedMembers}` +
        (sessionName ? ` · phiên: ${sessionName}` : "");
      if (results.length > 0) {
        return finish(
          true,
          `Tìm thấy ${results.length} nhóm khớp điều kiện` +
            (rawCount > results.length
              ? ` (Facebook trả về ${rawCount} nhóm, ${rawCount - results.length} nhóm bị loại bởi bộ lọc).`
              : "."),
          rawCount,
          results,
          dropDetail,
        );
      }
      return finish(
        true,
        `Facebook trả về ${rawCount} nhóm nhưng 0 nhóm khớp sau khi lọc: ${droppedMembers} nhóm dưới mức tối thiểu ${args.min_members} thành viên${droppedNoId ? `, ${droppedNoId} nhóm thiếu mã định danh` : ""}${droppedDup ? `, ${droppedDup} nhóm trùng lặp` : ""}. Hãy giảm “Thành viên tối thiểu” rồi tìm lại.`,
        rawCount,
        empty,
        dropDetail,
      );
    },
  }),

  // ---------------------------------------------------------------- drafts
  listDrafts: defineAction({
    request: z.object({}),
    response: z.object({ drafts: z.array(draftOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      // Lịch sử đăng Bài chỉ hiện thông tin MỚI NHẤT theo từng
      // đích: dọn các bản ghi cũ đã bị bản ghi mới của cùng đích
      // thay thế (chỉ nhóm trạng thái chưa thành công — xem
      // pruneAllSupersededPublishRecords) trước khi đọc, để dữ
      // liệu tích lũy từ trước bản sửa này cũng được dọn ngay.
      await pruneAllSupersededPublishRecords(db);
      const rows = await db
        .select()
        .from(schema.drafts)
        .orderBy(desc(schema.drafts.id));
      const records = await db
        .select()
        .from(schema.publishRecords)
        .orderBy(desc(schema.publishRecords.id));
      const byDraft = new Map<number, PublishRecordRow[]>();
      for (const rec of records) {
        const list = byDraft.get(rec.draftId) ?? [];
        list.push(rec);
        byDraft.set(rec.draftId, list);
      }
      return {
        drafts: rows.map((r) => toDraftOut(r, byDraft.get(r.id) ?? [])),
      };
    },
  }),

  // Đối soát sau lỗi timeout: client hỏi lại theo mã chống trùng xem
  // lượt soạn đó đã kịp lưu bản nháp chưa. Có → client báo "đã vào
  // Hàng đợi duyệt" thay vì báo lỗi kèm nút Thử lại mù (bấm thử lại
  // mù từng sinh bản nháp trùng). Không có mã / chưa có bản nháp nào
  // mang mã đó → found = false.
  findDraftByKey: defineAction({
    request: z.object({ idempotency_key: z.string().default("") }),
    response: z.object({
      found: z.boolean(),
      id: z.number(),
      code: z.string(),
      writer: z.enum(["ai", "template", ""]),
      drive_status: z.string(),
      drive_image_count: z.number(),
    }),
    async handler(ctx, args) {
      const key = args.idempotency_key.trim();
      const empty = {
        found: false,
        id: 0,
        code: "",
        writer: "" as const,
        drive_status: "",
        drive_image_count: 0,
      };
      if (!key) return empty;
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.idempotencyKey, key));
      if (!row) return empty;
      const writer: "ai" | "template" | "" =
        row.captionSource === "ai"
          ? "ai"
          : row.captionSource === "template"
            ? "template"
            : "";
      return {
        found: true,
        id: row.id,
        code: row.code,
        writer,
        drive_status: row.driveStatus,
        drive_image_count: parseDriveImages(row.driveImages).length,
      };
    },
  }),

  createDraft: defineAction({
    request: z.object({
      // Mã chống trùng của lượt soạn này (client sinh, giữ nguyên khi
      // thử lại). Để trống = không chống trùng (tương thích cũ).
      idempotency_key: z.string().default(""),
      stt: z.string().default(""),
      sku: z.string().default(""),
      product_name: z.string().min(1),
      scale: z.string().default(""),
      maker: z.string().default(""),
      color: z.string().default(""),
      price: z.string().default(""),
      stock: z.string().default("1"),
      ship: z.string().default(""),
      image_url: z.string().default(""),
      video_url: z.string().default(""),
      selling_point: z.string().default(""),
      size_cm: z.string().default(""),
      // Tập ảnh đang gắn trong form soạn bài: mặc định là tập ảnh
      // Drive ĐÃ LƯU trong sản phẩm từ lần đồng bộ gần nhất (soạn
      // bài không quét lại Drive nữa); khi images_customized = true
      // thì đây là tập NGƯỜI DÙNG đã tự chốt (thêm ảnh tải lên / xóa
      // bớt ảnh Drive) — dùng ĐÚNG tập này, ảnh đã xóa không được
      // gắn lại, kể cả khi xuất gói đăng.
      images: z.array(driveImageSchema).default([]),
      images_customized: z.boolean().default(false),
    }),
    response: z.object({
      id: z.number(),
      code: z.string(),
      writer: z.enum(["ai", "template"]),
      drive_status: z.string(),
      drive_image_count: z.number(),
      drive_message: z.string(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const idemKey = args.idempotency_key.trim();
      // CHỐNG TRÙNG: lượt soạn này đã có bản nháp (lượt gửi trước bị
      // cổng kết nối báo timeout trong lúc máy chủ vẫn chạy tiếp và
      // đã lưu xong, hoặc người dùng bấm "Thử lại" sau timeout) thì
      // trả về ĐÚNG bản nháp đó — không viết lại, không tạo bản thứ
      // hai giống hệt.
      if (idemKey) {
        const [existing] = await db
          .select()
          .from(schema.drafts)
          .where(eq(schema.drafts.idempotencyKey, idemKey));
        if (existing) {
          const imgs = parseDriveImages(existing.driveImages);
          return {
            id: existing.id,
            code: existing.code,
            writer:
              existing.captionSource === "template"
                ? ("template" as const)
                : ("ai" as const),
            drive_status: existing.driveStatus,
            drive_image_count: imgs.length,
            drive_message:
              "Bài của lượt soạn này đã có sẵn trong Hàng đợi duyệt — app dùng lại đúng bản đó, không tạo bản trùng.",
          };
        }
      }
      // ẢNH CỦA BẢN NHÁP — KHÔNG quét lại Drive khi soạn bài: khi
      // đồng bộ Sheet, app đã mở thư mục Drive và lưu tập ảnh thật
      // vào chính sản phẩm; form soạn bài mang theo đúng tập đó
      // (args.images). Quét lại Drive ở khâu này từng là một trong
      // hai việc nặng khiến lượt soạn vượt thời gian chờ của cổng
      // kết nối (báo timeout dù bài vẫn được lưu). Drive chỉ còn
      // được quét ở hai thời điểm: khi đồng bộ Sheet và khi bấm
      // "Quét lại ảnh Drive" trên thẻ sản phẩm — xuất gói đăng
      // (buildPack) dùng đúng tập ảnh đã chốt trong bản nháp, cũng
      // không quét lại. Nếu client không mang theo tập ảnh nào,
      // lấy tập đã lưu trong sản phẩm khớp link thư mục này.
      const folderId = extractDriveFolderId(args.image_url);
      let stored: {
        status: string;
        error: string;
        images: DriveImage[];
      } | null = null;
      if (!args.images_customized && args.images.length === 0 && folderId) {
        const prods = await db.select().from(schema.products);
        const match = prods.find(
          (p) => extractDriveFolderId(p.imageUrl) === folderId,
        );
        if (match)
          stored = {
            status: match.driveStatus,
            error: match.driveError,
            images: parseDriveImages(match.driveImages),
          };
      }
      // Tập ảnh CUỐI CÙNG của bản nháp: người dùng đã tự thêm/xóa
      // ảnh trong form thì chỉnh tay thắng — dùng đúng tập người
      // dùng chốt (kể cả khi tập rỗng vì đã xóa hết); chưa chỉnh tay
      // thì dùng tập ảnh đã lưu từ lần đồng bộ (client mang theo
      // hoặc đọc từ sản phẩm khớp thư mục).
      const finalImages: DriveImage[] = args.images_customized
        ? args.images
        : args.images.length > 0
          ? args.images
          : (stored?.images ?? []);
      const finalStatus = args.images_customized
        ? finalImages.length > 0
          ? "ok"
          : "empty"
        : finalImages.length > 0
          ? "ok"
          : stored
            ? stored.status || "no_link"
            : "no_link";
      const finalError = args.images_customized
        ? finalImages.length > 0
          ? ""
          : "Bạn đã bỏ hết ảnh khỏi bài này trong form soạn bài."
        : finalImages.length > 0
          ? ""
          : stored?.error
            ? stored.error
            : folderId
              ? "Chưa có ảnh thật đã lưu cho thư mục Drive này — đồng bộ Sheet hoặc bấm “Quét lại ảnh Drive” trên thẻ sản phẩm để lấy ảnh."
              : "Sản phẩm chưa có link thư mục Drive — bài soạn chưa có ảnh thật.";
      const fields: DraftFields = {
        stt: args.stt.trim(),
        productName: args.product_name.trim(),
        scale: args.scale.trim(),
        maker: args.maker.trim(),
        color: args.color.trim(),
        price: args.price.trim(),
        stock: args.stock.trim() || "1",
        // Vận chuyển mặc định COD khi không ghi gì khác.
        ship: args.ship.trim() || "COD",
        // Với AI writer, "có ảnh" chỉ đúng khi có ảnh trong tập
        // cuối cùng (ảnh Drive thật hoặc ảnh người dùng tự gắn).
        imageUrl: finalImages[0] ? finalImages[0].jpeg_url : "",
        videoUrl: args.video_url.trim(),
        sellingPoint: args.selling_point.trim(),
        sizeCm: args.size_cm.trim(),
      };
      const { caption, writer } = await writeProfessionalCopy(ctx, fields);
      const code = "d-" + vnStamp(new Date());
      const [row] = await db
        .insert(schema.drafts)
        .values({
          code,
          idempotencyKey: idemKey,
          stt: fields.stt,
          sku:
            args.sku.trim() ||
            buildSku(fields.stt, fields.productName, fields.color),
          productName: fields.productName,
          scale: fields.scale,
          maker: fields.maker,
          color: fields.color,
          price: fields.price,
          stock: fields.stock,
          ship: fields.ship,
          imageUrl: args.image_url.trim(),
          videoUrl: args.video_url.trim(),
          driveFolderId: folderId,
          driveStatus: finalStatus,
          driveError: finalError,
          driveImages: JSON.stringify(finalImages),
          imagesCustomized: args.images_customized ? 1 : 0,
          sellingPoint: fields.sellingPoint,
          // Cột angle cũ giữ giá trị mặc định cho tương thích dữ
          // liệu — cột angle giữ mặc định, bài viết theo phong cách ĐỨC GARAGE.
          angle: "chot_don",
          sizeCm: fields.sizeCm,
          // Đợt "chỉ mở bán" đã bỏ — thay bằng thời gian khuyến mãi tự
          // tính trong caption (ngày đăng + 7 ngày); cột cũ giữ rỗng.
          saleDays: "",
          caption,
          captionSource: writer,
          // Cột reels cũ giữ rỗng: bài soạn chỉ còn bài đăng chính
          // Facebook, không còn bản ngắn TikTok/Reels.
          reels: "",
          status: "draft",
        })
        .returning({ id: schema.drafts.id });
      if (!row) throw new Error("createDraft: insert returned no rows");
      ctx.invalidateQueries();
      return {
        id: row.id,
        code,
        writer,
        drive_status: finalStatus,
        drive_image_count: finalImages.length,
        drive_message: args.images_customized
          ? finalImages.length > 0
            ? `Đã dùng đúng ${finalImages.length} ảnh bạn đã chốt trong form soạn bài (ảnh Drive còn giữ + ảnh bạn tự thêm) — tập ảnh này được giữ nguyên khi xuất gói đăng, không quét lại Drive để gắn thêm/bớt.`
            : "Bạn đã bỏ hết ảnh khỏi bài này trong form soạn bài — bài đăng sẽ không kèm ảnh nào."
          : finalImages.length > 0
            ? `Đã dùng ${finalImages.length} ảnh thật đã lưu sẵn trong sản phẩm từ lần đồng bộ gần nhất — soạn bài không quét lại Drive; tập ảnh này được giữ nguyên khi xuất gói đăng, gói đăng cũng không quét lại Drive. Bản dùng để đăng là JPEG do Drive kết xuất${finalImages.some((i) => i.is_heic) ? " (file gốc có HEIC — không đăng trực tiếp file HEIC)" : ""}.`
            : finalStatus === "empty"
              ? "Thư mục Drive của sản phẩm đang RỖNG (theo lần quét gần nhất) — bài soạn chưa có ảnh thật; bổ sung ảnh vào thư mục rồi đồng bộ lại hoặc bấm “Quét lại ảnh Drive” trên thẻ sản phẩm."
              : finalError,
      };
    },
  }),

  // Viết lại một bản nháp đang chờ duyệt theo phong cách ĐỨC
  // GARAGE, từ đúng các giá trị đã lưu của bản nháp đó.
  rewriteDraft: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy bản nháp." };
      if (row.status !== "draft")
        return {
          ok: false,
          message:
            "Bản nháp đã duyệt/xuất gói — không viết lại nội dung được nữa.",
        };
      const { caption, writer } = await writeProfessionalCopy(
        ctx,
        {
          stt: row.stt,
          productName: row.productName,
          scale: row.scale,
          maker: row.maker,
          color: row.color,
          price: row.price,
          stock: row.stock,
          ship: row.ship,
          imageUrl: row.imageUrl,
          videoUrl: row.videoUrl,
          sellingPoint: row.sellingPoint,
          sizeCm: row.sizeCm,
        },
        // Truyền bản hiện tại để AI viết khác đi; bài trùng hệt bản
        // cũ bị coi là chưa viết lại được (xem writeProfessionalCopy).
        { previousCaption: row.caption },
      );
      // Chống "viết lại mà như không": bài mới trùng hệt bài hiện
      // tại (thường vì bài AI bị loại và mẫu dự phòng cố định theo
      // dữ kiện + ngày sinh ra đúng một văn bản) thì KHÔNG ghi đè
      // và báo rõ là chưa có thay đổi, thay vì báo thành công giả.
      if (caption.trim() === row.caption.trim()) {
        return {
          ok: false,
          message:
            writer === "template"
              ? "Chưa viết lại được bản mới: bài AI chưa đạt chuẩn nên hệ thống dùng mẫu dự phòng — mà mẫu này sinh ra đúng nội dung hiện tại nên không có gì thay đổi. Thử bấm viết lại lần nữa; nếu vẫn vậy, hãy bổ sung/sửa thông tin sản phẩm (màu, kích thước, chi tiết tự ghi) rồi viết lại."
              : "Bài viết lại trùng hệt bản hiện tại nên chưa có thay đổi — bấm viết lại lần nữa để lấy một bản diễn đạt khác.",
        };
      }
      await db
        .update(schema.drafts)
        // reels: "" — viết lại cũng bỏ luôn bản ngắn cũ còn lưu.
        .set({ caption, captionSource: writer, reels: "" })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message:
          writer === "ai"
            ? "Đã viết lại bài theo phong cách ĐỨC GARAGE từ đúng giá trị của sản phẩm này."
            : "Đã viết lại bài theo mẫu ĐỨC GARAGE (người viết AI tạm thời không khả dụng).",
      };
    },
  }),

  updateDraft: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      caption: z.string().min(1),
    }),
    response: z.object({ ok: z.boolean(), error: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) return { ok: false, error: "Không tìm thấy bản nháp." };
      if (row.status !== "draft")
        return {
          ok: false,
          error: "Bản nháp đã duyệt/xuất gói — không sửa nội dung được nữa.",
        };
      // Sửa tay cũng không được để lại placeholder màu: người bán
      // dán caption có "[màu]" vào thì gỡ ngay lúc lưu (dòng Màu
      // sắc điền đúng màu của bản nháp) — bài lưu xuống luôn sạch.
      const caption = stripColorPlaceholders(args.caption, row.color);
      await db
        .update(schema.drafts)
        .set({ caption, captionSource: "manual", reels: "" })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true, error: "" };
    },
  }),

  deleteDraft: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.drafts).where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  approveDraft: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      missing: z.array(z.string()),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row)
        return { ok: false, message: "Không tìm thấy bản nháp.", missing: [] };
      if (row.status !== "draft")
        return {
          ok: false,
          message: `Bản nháp đang ở trạng thái ${row.status}, không duyệt lại.`,
          missing: [],
        };
      // Chốt chặn duyệt: placeholder màu KHÔNG bao giờ là lý do
      // chặn duyệt — bản nháp cũ còn sót "[màu]" thì gỡ và lưu
      // bền ngay tại đây rồi mới kiểm các placeholder nghiệp vụ
      // thật ([GIÁ]/[TỈ LỆ]/Cần xác nhận).
      const caption = hasColorPlaceholder(row.caption)
        ? stripColorPlaceholders(row.caption, row.color)
        : row.caption;
      const missing = findPlaceholders(caption);
      if (missing.length > 0) {
        if (caption !== row.caption) {
          await db
            .update(schema.drafts)
            .set({ caption })
            .where(eq(schema.drafts.id, args.id));
          ctx.invalidateQueries();
        }
        return {
          ok: false,
          message: "Còn mục chưa điền: " + missing.join(", "),
          missing,
        };
      }
      // DUYỆT = XUẤT GÓI LUÔN (gộp hai bước theo yêu cầu người
      // dùng): không còn bước xuất gói riêng sau khi duyệt.
      // Gói được sinh ngay tại đây theo đích đăng ĐÃ CHỌN cho
      // bài này ngay từ trang "Chờ duyệt" (bộ chọn "Chọn đích
      // đăng" có ở cả trang chờ duyệt; lựa chọn được lưu bền qua
      // saveDraftTargets) — bài chưa từng chọn tay mới dùng đích
      // mặc định đang chọn (nhóm đích đã tham gia / Page đang
      // chọn / IG đang chọn). Gói lưu cùng lúc với trạng thái
      // packed — bài duyệt xong là sẵn sàng bấm "Đăng Bài" ngay
      // ở trang "Đã duyệt", gói đăng đã có sẵn trên thẻ bài. Đổi
      // đích đăng sau đó thì gói tự cập nhật theo (xem
      // saveDraftTargets), không cần bấm nút nào nữa.
      const savedTargets = parsePackTargets(row.packTargets);
      const targets = savedTargets.saved
        ? {
            group_ids: savedTargets.group_ids,
            page_ids: savedTargets.page_ids,
            instagram_account_ids: savedTargets.instagram_account_ids,
          }
        : await defaultPackTargets(db);
      const rowForPack: DraftRow = { ...row, caption };
      const built = await buildPackTextForDraft(db, rowForPack, targets, {
        explicit: true,
      });
      if (!built.ok) {
        // Sinh gói lỗi (ví dụ nhóm mặc định không còn danh tính
        // đã tham gia) thì vẫn duyệt bài nhưng CHƯA có gói — báo
        // rõ lý do để người dùng chọn lại đích ở trang sẵn sàng
        // đăng (đổi đích sẽ tự sinh gói), không chặn duyệt.
        await db
          .update(schema.drafts)
          .set(
            caption !== row.caption
              ? { status: "approved", caption }
              : { status: "approved" },
          )
          .where(eq(schema.drafts.id, args.id));
        ctx.invalidateQueries();
        return {
          ok: true,
          message: `Đã duyệt ${row.code}. Chưa sinh được gói đăng tự động: ${built.message} Chọn lại đích đăng ở trang “Đã duyệt” thì gói sẽ tự được tạo.`,
          missing: [],
        };
      }
      const now = new Date();
      await db
        .update(schema.drafts)
        .set({
          status: "packed",
          caption: built.cleanCaption,
          packText: built.packText,
          packedAt: now,
          packTargets: serializePackTargets(targets),
        })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: built.hasMedia
          ? `Đã duyệt bài viết ${row.code} — gói đăng đã có trên thẻ bài ở trang “Đã duyệt”, bấm “Đăng Bài” để đăng ngay lên các đích đã chọn.`
          : `Đã duyệt bài viết ${row.code} — gói đăng đã có trên thẻ bài ở trang “Đã duyệt” (bài chưa gắn ảnh/video nào), bấm “Đăng Bài” để đăng ngay lên các đích đã chọn.`,
        missing: [],
      };
    },
  }),

  // Lưu lựa chọn đích đăng của RIÊNG một bản nháp: bộ chọn "Chọn
  // đích đăng" có ở CẢ trang "Chờ duyệt" lẫn trang "Đã duyệt" —
  // chọn ở đâu thì lưu ngay ở đó, mở lại app vẫn giữ đúng lựa
  // chọn cũ — không còn cảnh chọn xong phải chọn lại từ mặc
  // định. Bài đang CHỜ DUYỆT thì chỉ lưu đích (chưa có gói đăng);
  // khi bấm "Duyệt bài viết", approveDraft sinh gói ngay theo
  // đúng bộ đích đã lưu này. Bài ĐÃ DUYỆT thì đổi đích cũng TỰ
  // CẬP NHẬT gói đăng theo bộ đích mới (duyệt đã xuất gói luôn,
  // đổi đích thì gói tự theo) — phần cập nhật theo đích này ĐƯỢC
  // GIỮ LẠI theo yêu cầu người dùng, và nút "Cập nhật gói đăng"
  // thủ công (buildPack) vẫn còn để bấm cập nhật khi cần.
  saveDraftTargets: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy bản nháp." };
      const targets: PackTargetsInput = {
        group_ids: args.group_ids,
        page_ids: args.page_ids,
        instagram_account_ids: args.instagram_account_ids,
      };
      // Bài đang chờ duyệt: chỉ LƯU đích đăng đã chọn — gói đăng
      // được sinh khi duyệt bài (approveDraft đọc đúng bộ đích đã
      // lưu này), không sinh gói cho bài chưa duyệt.
      if (row.status === "draft") {
        await db
          .update(schema.drafts)
          .set({ packTargets: serializePackTargets(targets) })
          .where(eq(schema.drafts.id, args.id));
        ctx.invalidateQueries();
        return {
          ok: true,
          message: "Đã lưu đích đăng cho bài chờ duyệt — gói đăng sẽ xuất theo đích này khi duyệt bài.",
        };
      }
      if (row.status !== "approved" && row.status !== "packed")
        return {
          ok: false,
          message: "Chỉ lưu đích đăng cho bài chờ duyệt hoặc đã duyệt.",
        };
      // Tự cập nhật gói đăng theo bộ đích mới: sinh lại text gói
      // bằng đúng bộ đích vừa chọn. Sinh lỗi (nhóm chưa có danh
      // tính đã tham gia) thì chỉ lưu đích và báo rõ — gói cũ giữ
      // nguyên để không mất nội dung đã có.
      const built = await buildPackTextForDraft(db, row, targets, {
        explicit: true,
      });
      if (!built.ok) {
        await db
          .update(schema.drafts)
          .set({ packTargets: serializePackTargets(targets) })
          .where(eq(schema.drafts.id, args.id));
        ctx.invalidateQueries();
        return {
          ok: false,
          message: `Đã lưu đích đăng nhưng chưa cập nhật được gói đăng: ${built.message}`,
        };
      }
      await db
        .update(schema.drafts)
        .set({
          status: "packed",
          caption: built.cleanCaption,
          packText: built.packText,
          packedAt: new Date(),
          packTargets: serializePackTargets(targets),
        })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: "Đã lưu đích đăng và tự cập nhật gói đăng theo đích mới.",
      };
    },
  }),

  buildPack: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      pack_text: z.string(),
    }),
    // KHÔNG khai privileged nào: cập nhật gói KHÔNG quét lại
    // Drive. Gói đăng nay được sinh TỰ ĐỘNG ngay khi duyệt bài
    // (approveDraft) và tự cập nhật khi đổi đích đăng
    // (saveDraftTargets). Action này là đường bấm tay của nút
    // "Cập nhật gói đăng" ĐƯỢC GIỮ LẠI trên thẻ bài ở trang "Đã
    // duyệt" (nội dung gói thay đổi theo đích đăng nên người dùng
    // vẫn bấm cập nhật tay theo bộ đích đang chọn được — nút luôn
    // mang tên "Cập nhật gói đăng", không còn nhãn "Xuất gói
    // đăng"). Logic sinh gói dùng chung buildPackTextForDraft.
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy bản nháp.", pack_text: "" };
      if (row.status !== "approved" && row.status !== "packed")
        return {
          ok: false,
          message: `Bản nháp chưa được duyệt (trạng thái: ${row.status}). Duyệt bài trước khi cập nhật gói đăng.`,
          pack_text: "",
        };
      const built = await buildPackTextForDraft(db, row, {
        group_ids: args.group_ids,
        page_ids: args.page_ids,
        instagram_account_ids: args.instagram_account_ids,
      });
      if (!built.ok) return { ok: false, message: built.message, pack_text: "" };
      await db
        .update(schema.drafts)
        .set({
          status: "packed",
          packText: built.packText,
          packedAt: new Date(),
          caption: built.cleanCaption,
          packTargets: serializePackTargets({
            group_ids: args.group_ids,
            page_ids: args.page_ids,
            instagram_account_ids: args.instagram_account_ids,
          }),
        })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: built.hasMedia
          ? `Đã cập nhật gói đăng — gói đăng ở ngay trên thẻ bài này; đăng đúng các đích đã chọn, dùng đúng media đã gắn trong bản nháp (${built.driveImageCount} ảnh${built.hasVideo ? ", có video" : ""}; không quét lại Drive, không thêm/bớt media).`
          : `Đã cập nhật gói đăng — gói đăng ở ngay trên thẻ bài này; đăng đúng các đích đã chọn; bài này chưa gắn ảnh/video nào.`,
        pack_text: built.packText,
      };
    },
  }),

  // ------------------------------------------------- ĐĂNG THẬT
  // Đăng trực tiếp bài đã duyệt/đã xuất gói lên các đích đã chọn
  // trong Hàng đợi — không qua khâu chép gói/gửi agent nữa:
  //  - Page đích → facebook-cli pages posts create (đúng caption
  //    đã duyệt + đúng ảnh đã chốt; caption > 1.024 ký tự thì
  //    chuyển sang xử lý bằng trình duyệt như đích nhóm).
  //  - Instagram đích → ghi yêu cầu "queued" và kích hoạt tác vụ
  //    agent chạy instagram-cli post-feed Ở NỀN (bắt buộc có ảnh;
  //    dùng đúng tập ảnh đã chốt trong bản nháp), kết quả được
  //    cập nhật qua reportInstagramPublish. KHÔNG đăng đồng bộ
  //    trong action này: tải nhiều ảnh + đăng Instagram thường
  //    tốn hơn ngân sách 30 giây của một lượt gọi action — chạy
  //    đồng bộ từng bị daemon cắt giữa chừng và ghi "đăng lỗi"
  //    dù chưa rõ bài đã lên hay chưa.
  //  - Nhóm đích → Meta không có API đăng bài nhóm: ghi yêu cầu
  //    "queued" và kích hoạt tác vụ agent xử lý như khi người
  //    dùng nhắn trực tiếp (đăng bằng trình duyệt), kết quả được
  //    cập nhật qua reportGroupPublish.
  // Đích đăng bằng trình duyệt (nhóm + Page caption dài) chạy
  // ĐÚNG NHƯ KHI NGƯỜI DÙNG NHẮN TRỰC TIẾP TRONG CHAT: tác vụ
  // agent mở cửa sổ trình duyệt Muse (cửa sổ người dùng nhìn
  // thấy được, hồ sơ phiên bền vững) và kiểm tra đăng nhập
  // Facebook TRƯỚC. Nếu trình duyệt đó chưa có phiên
  // facebook.com, tác vụ KHÔNG ghi "đăng lỗi" và KHÔNG bỏ cuộc:
  // nó để cửa sổ dừng ở trang đăng nhập Facebook rồi báo trạng
  // thái "needs_login" (chờ đăng nhập) qua reportBrowserPublish
  // — người dùng đăng nhập 1 lần ngay trong cửa sổ đó (phiên
  // được lưu trong hồ sơ trình duyệt cho mọi lần sau) rồi bấm
  // "Đăng Bài" lại là đăng tiếp bằng phiên đã lưu, không cần
  // nhắn lại trong chat.
  // Kết quả TỪNG đích được lưu vào publish_records và trả về ngay;
  // đích đã đăng thành công ở các lần trước bị bỏ qua (skipped)
  // để chống đăng trùng khi bấm lại.
  publishDraft: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()).default([]),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      results: z.array(
        z.object({
          kind: z.enum(["page", "instagram", "group", "account"]),
          name: z.string(),
          status: z.enum([
            "published",
            "failed",
            "unsupported",
            "skipped",
            "queued",
            "needs_login",
          ]),
          message: z.string(),
          post_url: z.string(),
        }),
      ),
    }),
    privileged: [
      privileged.listFbPages,
      privileged.publishFbPagePost,
      privileged.listIgAccounts,
      privileged.preparePublishMedia,
    ],
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      type ResultItem = {
        kind: "page" | "instagram" | "group" | "account";
        name: string;
        status:
          | "published"
          | "failed"
          | "unsupported"
          | "skipped"
          | "queued"
          | "needs_login";
        message: string;
        post_url: string;
      };
      const results: ResultItem[] = [];
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row)
        return { ok: false, message: "Không tìm thấy bản nháp.", results };
      if (row.status !== "approved" && row.status !== "packed")
        return {
          ok: false,
          message:
            "Bài chưa được duyệt — duyệt bài trước khi đăng Bài.",
          results,
        };
      const caption = hasColorPlaceholder(row.caption)
        ? stripColorPlaceholders(row.caption, row.color)
        : row.caption;
      const missing = findPlaceholders(caption);
      if (missing.length > 0)
        return {
          ok: false,
          message:
            "Chưa đăng được — bài còn mục chưa điền: " + missing.join(", "),
          results,
        };
      if (
        args.page_ids.length === 0 &&
        args.instagram_account_ids.length === 0 &&
        args.group_ids.length === 0
      )
        return {
          ok: false,
          message:
            "Chưa chọn đích đăng nào — mở “Chọn đích đăng” và chọn ít nhất một fanpage, tài khoản Instagram hoặc nhóm đích.",
          results,
        };
      // Bộ đích dùng cho lượt đăng này trở thành lựa chọn đã lưu
      // của bài — lần mở sau vẫn giữ đúng bộ đích này.
      await db
        .update(schema.drafts)
        .set({
          packTargets: serializePackTargets({
            group_ids: args.group_ids,
            page_ids: args.page_ids,
            instagram_account_ids: args.instagram_account_ids,
          }),
        })
        .where(eq(schema.drafts.id, args.id));

      const prior = await db
        .select()
        .from(schema.publishRecords)
        .where(eq(schema.publishRecords.draftId, row.id));
      const alreadyPublished = (kind: string, name: string): boolean =>
        prior.some(
          (p) =>
            p.targetKind === kind &&
            normalizeNameKey(p.targetName) === normalizeNameKey(name) &&
            p.status === "published",
        );
      const alreadyQueued = (kind: string, name: string): boolean =>
        prior.some(
          (p) =>
            p.targetKind === kind &&
            normalizeNameKey(p.targetName) === normalizeNameKey(name) &&
            p.status === "queued",
        );
      // Lượt đăng Instagram trước đó bị ngắt giữa chừng vì quá
      // thời gian chờ (trạng thái "uncertain", hoặc bản ghi cũ
      // "failed" kèm lỗi timeout của daemon): chưa rõ bài đã lên
      // hay chưa — lượt đăng lại phải kiểm tra trùng trên
      // Instagram trước khi đăng tiếp.
      const alreadyUncertain = (kind: string, name: string): boolean =>
        prior.some(
          (p) =>
            p.targetKind === kind &&
            normalizeNameKey(p.targetName) === normalizeNameKey(name) &&
            (p.status === "uncertain" ||
              (p.status === "failed" && isPublishTimeoutMessage(p.message))),
        );
      const record = async (r: ResultItem): Promise<number> => {
        results.push(r);
        const [ins] = await db
          .insert(schema.publishRecords)
          .values({
            draftId: row.id,
            targetKind: r.kind,
            targetName: r.name,
            status: r.status,
            postUrl: r.post_url,
            message: r.message,
          })
          .returning({ id: schema.publishRecords.id });
        const newId = ins?.id ?? 0;
        // Bản ghi mới THAY THẾ các bản ghi cũ chưa thành công của
        // cùng đích: xóa hẳn chúng để Lịch sử đăng Bài chỉ còn
        // thông tin mới nhất theo từng đích.
        await pruneSupersededPublishRecords(db, newId);
        return newId;
      };

      // Ảnh đã chốt trong bản nháp — tải về file local MỘT lần khi
      // có ít nhất một đích Page/Instagram cần đăng kèm ảnh.
      const driveImages = parseDriveImages(row.driveImages);
      const needsMedia =
        args.page_ids.length > 0 || args.instagram_account_ids.length > 0;
      let localFiles: string[] = [];
      let mediaNote = "";
      if (needsMedia && driveImages.length > 0) {
        try {
          const prep = await ctx.executePrivileged(
            privileged.preparePublishMedia,
            {
              code: row.code,
              urls: driveImages.map((im) => ({
                url: im.jpeg_url,
                name: im.name,
              })),
            },
          );
          const parsed = parseCliJson(prep.stdout) as {
            files?: Array<{ path?: string; ok?: boolean; error?: string }>;
          } | null;
          const files = parsed?.files ?? [];
          localFiles = files
            .filter((f) => f.ok && typeof f.path === "string" && f.path)
            .map((f) => f.path as string);
          const failedCount = files.length - localFiles.length;
          if (failedCount > 0)
            mediaNote = ` (${failedCount} ảnh tải về không thành công nên không đính kèm)`;
        } catch (e) {
          mediaNote = ` (không tải được ảnh đính kèm: ${e instanceof Error ? e.message.slice(0, 160) : "lỗi không rõ"})`;
        }
      }

      // Các đích phải xử lý bằng trình duyệt như khi người dùng
      // nhắn trực tiếp (nhóm — Meta không có API đăng bài nhóm;
      // Page có caption dài hơn giới hạn của API đăng Page): ghi
      // nhận "queued" ở từng đích rồi kích hoạt MỘT tác vụ agent
      // sau khi xử lý xong mọi đích API (ở cuối action này).
      const browserQueue: Array<{
        recordId: number;
        kind: "group" | "page";
        name: string;
        url: string;
        via: string[];
        note: string;
      }> = [];

      // Các đích Instagram chờ xử lý NỀN: ghi nhận "queued" ở
      // từng đích rồi kích hoạt MỘT tác vụ agent chạy instagram-cli
      // post-feed ngoài ngân sách 30 giây của action này, sau khi
      // xử lý xong mọi đích đồng bộ (ở cuối action).
      const igQueue: Array<{
        recordId: number;
        name: string;
        accountId: string;
        username: string;
        files: string[];
        hadUncertain: boolean;
      }> = [];

      // ---- Fanpage đích: đăng qua API Page chính thức.
      if (args.page_ids.length > 0) {
        const allPages = await db.select().from(schema.fbPages);
        const chosenPages = allPages.filter((p) =>
          args.page_ids.includes(p.id),
        );
        let fbPages: FbPageRef[] | null = null;
        let fbPagesError = "";
        if (chosenPages.length > 0) {
          try {
            const res = await ctx.executePrivileged(privileged.listFbPages, {});
            if (res.ok) fbPages = parseFbPages(res.stdout);
            else fbPagesError = cliErrorText(res);
          } catch (e) {
            fbPagesError = e instanceof Error ? e.message : String(e);
          }
        }
        for (const p of chosenPages) {
          const label = `Page “${p.name}”`;
          if (alreadyPublished("page", p.name)) {
            await record({
              kind: "page",
              name: p.name,
              status: "skipped",
              message: `${label} đã đăng thành công ở lần trước — bỏ qua để không đăng trùng.`,
              post_url: "",
            });
            continue;
          }
          if (alreadyQueued("page", p.name)) {
            await record({
              kind: "page",
              name: p.name,
              status: "skipped",
              message: `${label} đang được xử lý đăng bằng trình duyệt từ lần bấm trước — không tạo thêm yêu cầu trùng, chờ kết quả cập nhật ở Lịch sử đăng Bài.`,
              post_url: "",
            });
            continue;
          }
          if (caption.length > FB_PAGE_CAPTION_LIMIT) {
            // Caption dài hơn giới hạn của API đăng Page: KHÔNG
            // cắt bớt nội dung đã duyệt và KHÔNG bỏ cuộc — chuyển
            // sang xử lý bằng trình duyệt như khi người dùng nhắn
            // trực tiếp (cùng cơ chế với đích nhóm ở dưới).
            const recordId = await record({
              kind: "page",
              name: p.name,
              status: "queued",
              message: `${label}: caption dài ${caption.length} ký tự, vượt giới hạn ${FB_PAGE_CAPTION_LIMIT} ký tự của API đăng Page nên không đăng qua API được — đang xử lý đăng bằng trình duyệt Muse như khi bạn nhắn trực tiếp trong chat. Nếu cửa sổ trình duyệt đó chưa đăng nhập Facebook, bài sẽ chuyển sang trạng thái “Chờ đăng nhập”: bạn đăng nhập 1 lần ngay trong cửa sổ trình duyệt Muse đó (phiên được lưu cho lần sau) rồi bấm Đăng Bài lại. Kết quả và link bài sẽ cập nhật ngay tại đây.`,
              post_url: "",
            });
            browserQueue.push({
              recordId,
              kind: "page",
              name: p.name,
              url: p.url,
              via: [`Page “${p.name}”`],
              note: `caption dài ${caption.length} ký tự (vượt giới hạn API Page) — đăng bằng trình duyệt`,
            });
            continue;
          }
          if (!fbPages) {
            await record({
              kind: "page",
              name: p.name,
              status: "failed",
              message: `${label}: không đọc được danh sách Page từ Facebook${fbPagesError ? ` — ${fbPagesError}` : ""}. Kiểm tra kết nối Facebook rồi thử lại.`,
              post_url: "",
            });
            continue;
          }
          const match = fbPages.find(
            (fp) => normalizeNameKey(fp.name) === normalizeNameKey(p.name),
          );
          if (!match) {
            await record({
              kind: "page",
              name: p.name,
              status: "failed",
              message: `${label}: không thấy Page này trong các Page tài khoản Facebook đã liên kết đang quản trị — kiểm tra lại tên Page ở mục Tài khoản.`,
              post_url: "",
            });
            continue;
          }
          try {
            const res = await ctx.executePrivileged(
              privileged.publishFbPagePost,
              {
                pageId: match.page_id,
                text: caption,
                files: localFiles,
              },
            );
            const ref = extractPostRef(parseCliJson(res.stdout));
            if (res.ok && ref.state !== "scheduled") {
              await record({
                kind: "page",
                name: p.name,
                status: "published",
                message: `${label}: đã đăng thật${localFiles.length > 0 ? ` kèm ${localFiles.length} ảnh` : " (bài chữ, không đính ảnh)"}${mediaNote}.`,
                post_url: ref.url,
              });
            } else if (res.ok && ref.state === "scheduled") {
              await record({
                kind: "page",
                name: p.name,
                status: "published",
                message: `${label}: bài đã lên lịch đăng trên Page${mediaNote}.`,
                post_url: ref.url,
              });
            } else {
              await record({
                kind: "page",
                name: p.name,
                status: "failed",
                message: `${label}: đăng không thành công — ${cliErrorText(res) || "Facebook không trả lý do"}. Nếu chưa chắc bài đã lên hay chưa, kiểm tra Page trước khi bấm đăng lại.`,
                post_url: ref.url,
              });
            }
          } catch (e) {
            await record({
              kind: "page",
              name: p.name,
              status: "failed",
              message: `${label}: lỗi khi gọi đăng bài — ${e instanceof Error ? e.message.slice(0, 300) : "không rõ"}. Kiểm tra Page trước khi bấm đăng lại để tránh trùng.`,
              post_url: "",
            });
          }
        }
      }

      // ---- Instagram đích: kiểm tra nhanh tại đây, đăng thật
      // chạy Ở NỀN qua tác vụ agent + instagram-cli (xem igQueue).
      if (args.instagram_account_ids.length > 0) {
        const allAccounts = await db.select().from(schema.accounts);
        const chosenIg = allAccounts.filter(
          (a) =>
            a.platform === "Instagram" &&
            a.linked === 1 &&
            args.instagram_account_ids.includes(a.id),
        );
        let igRefs: IgAccountRef[] | null = null;
        let igError = "";
        if (chosenIg.length > 0) {
          try {
            const res = await ctx.executePrivileged(
              privileged.listIgAccounts,
              {},
            );
            if (res.ok) igRefs = parseIgAccounts(res.stdout);
            else igError = cliErrorText(res);
          } catch (e) {
            igError = e instanceof Error ? e.message : String(e);
          }
        }
        for (const a of chosenIg) {
          const label = `Instagram ${a.name}`;
          if (alreadyPublished("instagram", a.name)) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "skipped",
              message: `${label} đã đăng thành công ở lần trước — bỏ qua để không đăng trùng.`,
              post_url: "",
            });
            continue;
          }
          if (alreadyQueued("instagram", a.name)) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "skipped",
              message: `${label} đang được xử lý đăng ở chế độ nền từ lần bấm trước — không tạo thêm yêu cầu trùng, chờ kết quả cập nhật ở Lịch sử đăng Bài.`,
              post_url: "",
            });
            continue;
          }
          if (caption.length > IG_CAPTION_LIMIT) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "failed",
              message: `${label}: caption dài ${caption.length} ký tự, vượt giới hạn ${IG_CAPTION_LIMIT} ký tự của Instagram — chưa đăng được.`,
              post_url: "",
            });
            continue;
          }
          if (localFiles.length === 0) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "failed",
              message:
                driveImages.length === 0
                  ? `${label}: bài chưa có ảnh nào đã chốt — Instagram chỉ đăng được bài có ảnh/video. Gắn ảnh vào bài ở khâu soạn rồi đăng lại.`
                  : `${label}: không tải về được ảnh đã chốt để đăng${mediaNote}. Thử lại sau.`,
              post_url: "",
            });
            continue;
          }
          if (!igRefs) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "failed",
              message: `${label}: không đọc được danh sách tài khoản Instagram đã liên kết${igError ? ` — ${igError}` : ""}. Kiểm tra kết nối Instagram rồi thử lại.`,
              post_url: "",
            });
            continue;
          }
          const username = igUsernameOf(a);
          const match =
            igRefs.find(
              (r) => username && r.username.toLowerCase() === username,
            ) ??
            (igRefs.length === 1 && chosenIg.length === 1
              ? igRefs[0]
              : undefined);
          if (!match) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "failed",
              message: `${label}: không khớp được với tài khoản Instagram đã liên kết${username ? ` (@${username})` : ""} — kiểm tra lại handle/link ở mục Tài khoản.`,
              post_url: "",
            });
            continue;
          }
          // KHÔNG đăng đồng bộ ở đây: tải ảnh + đăng Instagram
          // thường tốn hơn ngân sách 30 giây của một lượt gọi
          // action — chạy đồng bộ từng bị hệ thống cắt giữa chừng
          // và ghi "đăng lỗi" trong khi chưa rõ bài đã lên hay
          // chưa. Ghi nhận "queued" rồi để tác vụ agent chạy
          // instagram-cli ở nền (kích hoạt ở cuối action này) và
          // cập nhật kết quả qua reportInstagramPublish.
          const hadUncertain = alreadyUncertain("instagram", a.name);
          const recordId = await record({
            kind: "instagram",
            name: a.name,
            status: "queued",
            message: hadUncertain
              ? `${label}: lượt đăng trước bị ngắt giữa chừng nên chưa rõ bài đã lên Instagram hay chưa — lượt này đang xử lý đăng ở chế độ nền và sẽ KIỂM TRA BÀI TRÙNG trên Instagram trước, thấy bài đã lên thì ghi nhận link bài đó thay vì đăng thêm bài mới. Kết quả cập nhật ngay tại đây.`
              : `${label}: đã tiếp nhận — đang xử lý đăng ở chế độ nền (đăng Instagram cần tải ảnh lên, lâu hơn một lượt bấm nên không chạy ngay trong lượt này). Kết quả và link bài sẽ cập nhật ngay tại đây.`,
            post_url: "",
          });
          igQueue.push({
            recordId,
            name: a.name,
            accountId: match.user_fbid,
            username: match.username,
            files: [...localFiles],
            hadUncertain,
          });
        }
      }

      // ---- Nhóm đích: Meta không có API đăng bài nhóm, nên bấm
      // "Đăng Bài" sẽ XỬ LÝ NHƯ KHI NGƯỜI DÙNG NHẮN TRỰC TIẾP nhờ
      // đăng nhóm: app ghi nhận yêu cầu (trạng thái "queued") rồi
      // kích hoạt một tác vụ agent đăng bằng trình duyệt — đúng
      // caption đã duyệt, đúng ảnh đã chốt, đăng bằng đúng danh
      // tính đã tham gia từng nhóm — và agent gọi lại action
      // reportBrowserPublish để cập nhật kết quả + link bài thật
      // vào đúng các dòng "queued" này (dùng chung với các Page
      // caption dài ở trên). Người dùng không phải chép gói hay
      // nhắn lại nữa.
      if (args.group_ids.length > 0) {
        const allGroups = await db.select().from(schema.fbGroups);
        const chosenGroups = allGroups.filter((g) =>
          args.group_ids.includes(g.id),
        );
        const joinCtx = await loadJoinContext(db);
        for (const g of chosenGroups) {
          if (alreadyPublished("group", g.name)) {
            await record({
              kind: "group",
              name: g.name,
              status: "skipped",
              message: `Nhóm ${g.name} đã ghi nhận đăng thành công ở lần trước — bỏ qua.`,
              post_url: "",
            });
            continue;
          }
          if (alreadyQueued("group", g.name)) {
            await record({
              kind: "group",
              name: g.name,
              status: "skipped",
              message: `Nhóm ${g.name} đang được xử lý đăng từ lần bấm trước — không tạo thêm yêu cầu trùng, chờ kết quả cập nhật ở Lịch sử đăng Bài.`,
              post_url: "",
            });
            continue;
          }
          const viaIdentities = postingJoinedIdentities(joinCtx, g);
          if (viaIdentities.length === 0) {
            await record({
              kind: "group",
              name: g.name,
              status: "failed",
              message: `Nhóm ${g.name}: chưa có danh tính sẽ đăng nào (tài khoản chính hoặc Page đang chọn đăng) được đánh dấu “Đã tham gia” nhóm này — đánh dấu ở mục Hội nhóm rồi bấm Đăng Bài lại.`,
              post_url: "",
            });
            continue;
          }
          const via = viaIdentities.map((i) =>
            i.kind === "page" ? `Page “${i.name}”` : `tài khoản ${i.name}`,
          );
          const recordId = await record({
            kind: "group",
            name: g.name,
            status: "queued",
            message: `Nhóm ${g.name}: đã tiếp nhận — đang xử lý đăng như khi bạn nhắn trực tiếp trong chat (đăng bằng trình duyệt Muse, bằng ${via.join(" / ")}). Nếu cửa sổ trình duyệt Muse chưa đăng nhập Facebook, bài sẽ chuyển sang trạng thái “Chờ đăng nhập”: bạn đăng nhập 1 lần ngay trong cửa sổ đó (phiên được lưu cho lần sau) rồi bấm Đăng Bài lại. Kết quả và link bài sẽ cập nhật ngay tại đây.`,
            post_url: "",
          });
          browserQueue.push({
            recordId,
            kind: "group",
            name: g.name,
            url: g.url,
            via,
            note: "",
          });
        }
      }
      if (browserQueue.length > 0) {
        const targetLines = browserQueue
          .map((t, i) => {
            const kindLabel = t.kind === "group" ? "Nhóm" : "Fanpage";
            return `${i + 1}. ${kindLabel} “${t.name}”${t.url ? ` — ${t.url}` : ""} — đăng bằng: ${t.via.join(" / ")}${t.note ? ` (${t.note})` : ""}`;
          })
          .join("\n");
        const imageLines =
          driveImages.length > 0
            ? driveImages
                .map((im, i) => `- Ảnh ${i + 1}: ${im.jpeg_url}`)
                .join("\n")
            : "(Bài không có ảnh đã chốt — đăng bài chữ kèm link video nếu có: " +
              (row.videoUrl.trim() || "không có") +
              ")";
        const taskMessage = [
          `Người dùng vừa bấm nút “Đăng Bài” trong app Social Desk và ĐÃ XÁC NHẬN đăng công khai bài này vào các đích Facebook dưới đây — xử lý đúng như khi người dùng nhắn trực tiếp trong chat nhờ bạn đăng: dùng cửa sổ TRÌNH DUYỆT Muse mà người dùng nhìn thấy được (cùng hồ sơ trình duyệt bền vững như khi người dùng nhắn trực tiếp — phiên đăng nhập Facebook lưu trong hồ sơ này dùng cho mọi lần đăng sau), KHÔNG cần hỏi lại người dùng.`,
          `Bài: ${row.productName} (mã ${row.code}, draft_id = ${row.id}).`,
          `BƯỚC 0 — KIỂM TRA ĐĂNG NHẬP FACEBOOK TRƯỚC KHI ĐĂNG (bắt buộc, làm đầu tiên): mở https://www.facebook.com/ trong cửa sổ trình duyệt Muse đó và kiểm tra phiên đăng nhập. (a) Nếu đã đăng nhập (thấy trang chủ/bảng tin của tài khoản) thì đăng tiếp như bình thường. (b) Nếu hiện màn hình đăng nhập Facebook ("Log into Facebook", hộp thoại đăng nhập chặn trang, hoặc trang nhóm/Page đòi đăng nhập): TUYỆT ĐỐI KHÔNG tự nhập tài khoản/mật khẩu, KHÔNG bỏ cuộc và ghi "đăng lỗi". Hãy ĐỂ NGUYÊN cửa sổ trình duyệt đang mở ở trang đăng nhập Facebook đó (không đóng cửa sổ, không điều hướng đi nơi khác) để người dùng tự đăng nhập ngay trong cửa sổ đó — người dùng đăng nhập bằng tài khoản quản trị Page, chỉ 1 lần, phiên sẽ được lưu trong hồ sơ trình duyệt cho mọi lần đăng sau. Sau đó gọi action reportBrowserPublish với status "needs_login" cho MỌI đích trong danh sách bên dưới (message: trình duyệt Muse đang mở ở trang đăng nhập Facebook, chờ người dùng đăng nhập 1 lần trong cửa sổ đó rồi bấm Đăng Bài lại trong app) rồi KẾT THÚC lượt này — không cố đăng bài khi chưa có phiên.`,
          `Các đích cần đăng (chỉ đăng vào đúng các đích này, bằng đúng danh tính ghi kèm):\n${targetLines}`,
          `Cách đăng từng đích (chỉ làm sau khi Bước 0 xác nhận đã đăng nhập): với NHÓM — mở nhóm bằng trình duyệt, chuyển sang đúng danh tính đã tham gia nhóm đó (Page/tài khoản ghi ở trên), tạo bài mới trong nhóm. Với FANPAGE — mở Page bằng trình duyệt, chuyển sang danh tính Page đó, tạo bài mới trên Page. Cả hai: dán NGUYÊN VĂN caption bên dưới (không sửa, không thêm bớt chữ), tải các ảnh JPEG ở các link dưới đây về máy rồi đính kèm theo đúng thứ tự (đây là bản JPEG dùng để đăng — KHÔNG đăng file HEIC gốc).`,
          `Ảnh của bài:\n${imageLines}`,
          `Giới hạn an toàn bắt buộc cho NHÓM: chỉ đăng nhóm đã tham gia; tối đa 3 bài nhóm/ngày và mỗi bài cách nhau tối thiểu 30 phút — trước khi đăng nhóm, đọc action listDrafts của artifact social-desk để xem các publish_records kênh group đã "published" hôm nay (giờ VN); nếu đã đủ 3 bài hôm nay hoặc chưa đủ 30 phút từ bài nhóm gần nhất thì KHÔNG đăng vội, báo outcome "failed" kèm lý do rõ ràng cho các nhóm còn lại.`,
          `Sau khi xử lý xong TỪNG đích — đăng thành công, thất bại hay chờ đăng nhập — gọi action reportBrowserPublish của artifact social-desk với draft_id = ${row.id} và outcomes gồm kind ("group" cho nhóm / "page" cho fanpage), name đúng tên đích, status "published" kèm post_url là LINK BÀI THẬT vừa đăng (chỉ ghi khi lấy được link thật, tuyệt đối không bịa link), status "needs_login" khi bị chặn ở màn hình đăng nhập như Bước 0, hoặc status "failed" kèm message là lý do thật. Phải gọi action này cho mọi đích trong danh sách, kể cả khi đăng lỗi hay chờ đăng nhập, để app cập nhật Lịch sử đăng Bài cho người dùng.`,
          `Caption nguyên văn đã duyệt:\n"""\n${caption}\n"""`,
        ].join("\n\n");
        const markSpawnFailed = async (reason: string): Promise<void> => {
          for (const t of browserQueue) {
            const kindLabel = t.kind === "group" ? "Nhóm" : "Page";
            await db
              .update(schema.publishRecords)
              .set({
                status: "failed",
                message: `${kindLabel} ${t.name}: không khởi động được khâu xử lý đăng bằng trình duyệt (${reason}) — bấm Đăng Bài lại để thử lại.`,
              })
              .where(eq(schema.publishRecords.id, t.recordId));
            const item = results.find(
              (r) =>
                r.kind === t.kind &&
                r.name === t.name &&
                r.status === "queued",
            );
            if (item) {
              item.status = "failed";
              item.message = `${kindLabel} ${t.name}: không khởi động được khâu xử lý đăng bằng trình duyệt — bấm Đăng Bài lại để thử lại.`;
            }
          }
        };
        try {
          const res = await ctx.agent.spawnTask(taskMessage, {
            expectsAction: "reportBrowserPublish",
            dedupeKey: `browser-publish-${row.id}-${browserQueue.map((t) => t.recordId).join("-")}`,
          });
          if (!res.ok) await markSpawnFailed(res.error);
        } catch (e) {
          await markSpawnFailed(
            (e instanceof Error ? e.message : String(e)).slice(0, 200),
          );
        }
      }

      // Kích hoạt tác vụ agent đăng Instagram Ở NỀN: chạy
      // instagram-cli ngoài ngân sách 30 giây của action này —
      // trước khi đăng, kiểm tra bài trùng trên chính tài khoản
      // (đặc biệt bắt buộc khi lượt trước bị ngắt giữa chừng,
      // chưa rõ bài đã lên hay chưa); kết quả từng tài khoản được
      // cập nhật qua reportInstagramPublish.
      if (igQueue.length > 0) {
        const targetBlocks = igQueue
          .map((t, i) => {
            const fileLines = t.files.map((f) => `   - ${f}`).join("\n");
            return [
              `${i + 1}. Tài khoản “${t.name}” (@${t.username}) — account-id: ${t.accountId}`,
              `   File ảnh local theo đúng thứ tự đăng:\n${fileLines}`,
              t.hadUncertain
                ? "   ⚠ Lượt đăng trước của tài khoản này bị ngắt giữa chừng vì quá thời gian chờ — CHƯA RÕ bài đã lên hay chưa, nên bước kiểm tra trùng là BẮT BUỘC trước khi đăng."
                : "   Lượt đăng mới — vẫn kiểm tra trùng nhanh ở bước 1 để tránh đăng hai bài giống hệt.",
            ].join("\n");
          })
          .join("\n");
        const igTaskMessage = [
          `Người dùng vừa bấm nút “Đăng Bài” trong app Social Desk và ĐÃ XÁC NHẬN đăng công khai bài này lên Instagram — xử lý đúng như khi người dùng nhắn trực tiếp nhờ bạn đăng bằng công cụ Instagram đã liên kết, KHÔNG cần hỏi lại người dùng.`,
          `Bài: ${row.productName} (mã ${row.code}, draft_id = ${row.id}).`,
          `Các tài khoản Instagram cần đăng (xử lý lần lượt từng tài khoản):\n${targetBlocks}`,
          `Cách xử lý TỪNG tài khoản:\n1) KIỂM TRA TRÙNG TRƯỚC: chạy /opt/hatch/bin/instagram-cli posts --account-id <account-id> --limit 10 để đọc các bài gần nhất của chính tài khoản đó. Nếu thấy một bài có caption trùng với caption nguyên văn bên dưới (so khớp phần đầu caption, chấp nhận khác biệt khoảng trắng/xuống dòng) thì KHÔNG đăng thêm bài mới — ghi outcome "published" kèm post_url là link của bài đã có đó.\n2) Chưa có bài trùng: đăng bằng /opt/hatch/bin/instagram-cli post-feed --account-id <account-id>, tiếp theo là --file cho từng file ảnh theo đúng thứ tự đã liệt kê, và --caption là caption nguyên văn bên dưới (giữ nguyên văn, không sửa, không thêm bớt chữ; KHÔNG truyền --retries vì đăng lại có thể nhân đôi bài). Đọc output của lệnh để lấy link bài thật khi đăng thành công.\n3) Phân loại kết quả THẬT: lệnh báo lỗi rõ ràng TRƯỚC khi đăng (sai tài khoản, file lỗi, Instagram từ chối…) → "failed" kèm lý do thật. Lệnh bị ngắt/timeout/kết nối đứt GIỮA CHỪNG khiến không rõ bài đã lên hay chưa → "uncertain" kèm giải thích — tuyệt đối KHÔNG ghi "failed" cho trường hợp này và KHÔNG tự chạy lại lệnh đăng lần hai.`,
          `Sau khi xử lý xong TỪNG tài khoản — đăng thành công, lỗi hay chưa xác định — gọi action reportInstagramPublish của artifact social-desk với draft_id = ${row.id} và outcomes gồm name đúng tên tài khoản ở trên, status ("published" / "failed" / "uncertain"), post_url là LINK BÀI THẬT (chỉ ghi khi thật sự có link: lấy từ output của lệnh đăng hoặc từ bài trùng tìm được ở bước 1 — tuyệt đối không bịa link), message là tóm tắt kết quả thật bằng tiếng Việt. Phải gọi action này cho MỌI tài khoản trong danh sách, kể cả khi đăng lỗi, để app cập nhật Lịch sử đăng Bài cho người dùng.`,
          `Caption nguyên văn đã duyệt:\n"""\n${caption}\n"""`,
        ].join("\n\n");
        const markIgSpawnFailed = async (reason: string): Promise<void> => {
          for (const t of igQueue) {
            await db
              .update(schema.publishRecords)
              .set({
                status: "failed",
                message: `Instagram ${t.name}: không khởi động được khâu xử lý đăng ở chế độ nền (${reason}) — bấm Đăng Bài lại để thử lại.`,
              })
              .where(eq(schema.publishRecords.id, t.recordId));
            const item = results.find(
              (r) =>
                r.kind === "instagram" &&
                r.name === t.name &&
                r.status === "queued",
            );
            if (item) {
              item.status = "failed";
              item.message = `Instagram ${t.name}: không khởi động được khâu xử lý đăng ở chế độ nền — bấm Đăng Bài lại để thử lại.`;
            }
          }
        };
        try {
          const res = await ctx.agent.spawnTask(igTaskMessage, {
            expectsAction: "reportInstagramPublish",
            dedupeKey: `ig-publish-${row.id}-${igQueue.map((t) => t.recordId).join("-")}`,
          });
          if (!res.ok) await markIgSpawnFailed(res.error);
        } catch (e) {
          await markIgSpawnFailed(
            (e instanceof Error ? e.message : String(e)).slice(0, 200),
          );
        }
      }

      const publishedCount = results.filter(
        (r) => r.status === "published",
      ).length;
      const queuedCount = results.filter(
        (r) => r.status === "queued",
      ).length;
      ctx.invalidateQueries();
      return {
        ok: results.length > 0,
        message:
          publishedCount > 0 && queuedCount > 0
            ? `Đã đăng thành công ${publishedCount} đích; ${queuedCount} đích đang được xử lý đăng như khi bạn nhắn trực tiếp trong chat — kết quả cập nhật ở Lịch sử đăng Bài. Đích đăng bằng trình duyệt: nếu cửa sổ trình duyệt Muse chưa đăng nhập Facebook, đích đó sẽ hiện trạng thái “Chờ đăng nhập” — đăng nhập 1 lần trong cửa sổ đó rồi bấm Đăng Bài lại.`
            : publishedCount > 0
              ? `Đã đăng thành công ${publishedCount}/${results.length} đích. Chi tiết từng đích ở dưới.`
              : queuedCount > 0
                ? `${queuedCount} đích đang được xử lý đăng như khi bạn nhắn trực tiếp trong chat — kết quả và link bài sẽ cập nhật ở Lịch sử đăng Bài, không cần nhắn lại. Đích đăng bằng trình duyệt: nếu cửa sổ trình duyệt Muse chưa đăng nhập Facebook, đích đó sẽ hiện trạng thái “Chờ đăng nhập” — đăng nhập 1 lần trong cửa sổ đó rồi bấm Đăng Bài lại.`
                : "Chưa đăng thành công đích nào — xem lý do của từng đích ở dưới.",
        results,
      };
    },
  }),

  // Kết quả đăng NHÓM do tác vụ agent (được kích hoạt khi người
  // dùng bấm "Đăng Bài") gọi lại sau khi đăng bằng trình duyệt:
  // cập nhật đúng dòng publish_records đang "queued" của từng
  // nhóm thành published (kèm link bài thật), failed (kèm lý
  // do) hoặc needs_login (trình duyệt Muse đang dừng ở trang
  // đăng nhập Facebook, chờ người dùng đăng nhập 1 lần trong
  // cửa sổ đó — không phải đăng lỗi). Không có dòng queued
  // (agent báo muộn/lặp) thì ghi một dòng mới để kết quả không
  // bị mất.
  reportGroupPublish: defineAction({
    request: z.object({
      draft_id: z.number().int().positive(),
      outcomes: z
        .array(
          z.object({
            group_name: z.string().min(1),
            status: z.enum(["published", "failed", "needs_login"]),
            post_url: z.string().default(""),
            message: z.string().default(""),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      let updated = 0;
      for (const o of args.outcomes) {
        const records = await db
          .select()
          .from(schema.publishRecords)
          .where(eq(schema.publishRecords.draftId, args.draft_id));
        const queued = records
          .filter(
            (p) =>
              p.targetKind === "group" &&
              normalizeNameKey(p.targetName) ===
                normalizeNameKey(o.group_name) &&
              p.status === "queued",
          )
          .sort((a, b) => b.id - a.id)[0];
        const message =
          o.message.trim() ||
          (o.status === "published"
            ? `Nhóm ${o.group_name}: đã đăng thành công vào nhóm.`
            : o.status === "needs_login"
              ? `Nhóm ${o.group_name}: đang chờ bạn đăng nhập Facebook trong cửa sổ trình duyệt Muse — đăng nhập 1 lần trong cửa sổ đó (phiên được lưu cho lần sau) rồi bấm Đăng Bài lại.`
              : `Nhóm ${o.group_name}: đăng không thành công.`);
        let affectedId = queued?.id ?? 0;
        if (queued) {
          await db
            .update(schema.publishRecords)
            .set({
              status: o.status,
              // Link bài chỉ nhận khi agent thật sự trả về — không
              // tự dựng link từ tên/ID nhóm.
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .where(eq(schema.publishRecords.id, queued.id));
        } else {
          const [ins] = await db
            .insert(schema.publishRecords)
            .values({
              draftId: args.draft_id,
              targetKind: "group",
              targetName: o.group_name,
              status: o.status,
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .returning({ id: schema.publishRecords.id });
          affectedId = ins?.id ?? 0;
        }
        // Kết quả mới thay thế các bản ghi cũ chưa thành công của
        // cùng nhóm — xóa hẳn để lịch sử chỉ còn thông tin mới.
        await pruneSupersededPublishRecords(db, affectedId);
        updated += 1;
      }
      ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),

  // Kết quả đăng BẰNG TRÌNH DUYỆT (nhóm + Page caption dài) do
  // tác vụ agent — được kích hoạt khi người dùng bấm "Đăng Bài"
  // — gọi lại sau khi xử lý: cập nhật đúng dòng publish_records
  // đang "queued" của từng đích (khớp theo kind + tên đích)
  // thành published (kèm link bài thật), failed (kèm lý do)
  // hoặc needs_login (tác vụ đã mở cửa sổ trình duyệt Muse ở
  // trang đăng nhập Facebook và đang chờ người dùng đăng nhập
  // 1 lần trong cửa sổ đó — phiên được lưu cho mọi lần sau;
  // người dùng đăng nhập xong bấm "Đăng Bài" lại là đăng tiếp,
  // nên trạng thái này KHÔNG phải đăng lỗi). Không có dòng
  // queued (agent báo muộn/lặp) thì ghi một dòng mới để kết quả
  // không bị mất.
  reportBrowserPublish: defineAction({
    request: z.object({
      draft_id: z.number().int().positive(),
      outcomes: z
        .array(
          z.object({
            kind: z.enum(["group", "page"]),
            name: z.string().min(1),
            status: z.enum(["published", "failed", "needs_login"]),
            post_url: z.string().default(""),
            message: z.string().default(""),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      let updated = 0;
      for (const o of args.outcomes) {
        const records = await db
          .select()
          .from(schema.publishRecords)
          .where(eq(schema.publishRecords.draftId, args.draft_id));
        const queued = records
          .filter(
            (p) =>
              p.targetKind === o.kind &&
              normalizeNameKey(p.targetName) === normalizeNameKey(o.name) &&
              p.status === "queued",
          )
          .sort((a, b) => b.id - a.id)[0];
        const kindLabel = o.kind === "group" ? "Nhóm" : "Page";
        const message =
          o.message.trim() ||
          (o.status === "published"
            ? `${kindLabel} ${o.name}: đã đăng thành công.`
            : o.status === "needs_login"
              ? `${kindLabel} ${o.name}: đang chờ bạn đăng nhập Facebook trong cửa sổ trình duyệt Muse — cửa sổ đó đang mở ở trang đăng nhập; đăng nhập 1 lần bằng tài khoản quản trị Page (phiên được lưu cho mọi lần sau) rồi bấm Đăng Bài lại là đăng tiếp.`
              : `${kindLabel} ${o.name}: đăng không thành công.`);
        let affectedId = queued?.id ?? 0;
        if (queued) {
          await db
            .update(schema.publishRecords)
            .set({
              status: o.status,
              // Link bài chỉ nhận khi agent thật sự trả về — không
              // tự dựng link từ tên/ID đích.
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .where(eq(schema.publishRecords.id, queued.id));
        } else {
          const [ins] = await db
            .insert(schema.publishRecords)
            .values({
              draftId: args.draft_id,
              targetKind: o.kind,
              targetName: o.name,
              status: o.status,
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .returning({ id: schema.publishRecords.id });
          affectedId = ins?.id ?? 0;
        }
        // Kết quả mới thay thế các bản ghi cũ chưa thành công của
        // cùng đích — xóa hẳn để lịch sử chỉ còn thông tin mới.
        await pruneSupersededPublishRecords(db, affectedId);
        updated += 1;
      }
      ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),

  // Kết quả đăng INSTAGRAM Ở NỀN do tác vụ agent — được kích
  // hoạt khi người dùng bấm "Đăng Bài" — gọi lại sau khi chạy
  // instagram-cli: cập nhật đúng dòng publish_records đang
  // "queued" của từng tài khoản thành published (kèm link bài
  // thật), failed (kèm lý do thật) hoặc uncertain (lượt đăng bị
  // ngắt giữa chừng, chưa rõ bài đã lên hay chưa — KHÔNG coi là
  // lỗi chắc chắn để người dùng không bấm đăng lại mù). Không có
  // dòng queued (agent báo muộn/lặp) thì ghi một dòng mới để kết
  // quả không bị mất.
  reportInstagramPublish: defineAction({
    request: z.object({
      draft_id: z.number().int().positive(),
      outcomes: z
        .array(
          z.object({
            name: z.string().min(1),
            status: z.enum(["published", "failed", "uncertain"]),
            post_url: z.string().default(""),
            message: z.string().default(""),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      let updated = 0;
      for (const o of args.outcomes) {
        const records = await db
          .select()
          .from(schema.publishRecords)
          .where(eq(schema.publishRecords.draftId, args.draft_id));
        const queued = records
          .filter(
            (p) =>
              p.targetKind === "instagram" &&
              normalizeNameKey(p.targetName) === normalizeNameKey(o.name) &&
              p.status === "queued",
          )
          .sort((a, b) => b.id - a.id)[0];
        const message =
          o.message.trim() ||
          (o.status === "published"
            ? `Instagram ${o.name}: đã đăng thành công.`
            : o.status === "uncertain"
              ? `Instagram ${o.name}: lượt đăng bị ngắt giữa chừng — chưa xác định được bài đã lên hay chưa, kiểm tra Instagram trước khi bấm đăng lại.`
              : `Instagram ${o.name}: đăng không thành công.`);
        let affectedId = queued?.id ?? 0;
        if (queued) {
          await db
            .update(schema.publishRecords)
            .set({
              status: o.status,
              // Link bài chỉ nhận khi agent thật sự trả về — không
              // tự dựng link từ tên tài khoản.
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .where(eq(schema.publishRecords.id, queued.id));
        } else {
          const [ins] = await db
            .insert(schema.publishRecords)
            .values({
              draftId: args.draft_id,
              targetKind: "instagram",
              targetName: o.name,
              status: o.status,
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .returning({ id: schema.publishRecords.id });
          affectedId = ins?.id ?? 0;
        }
        // Kết quả mới thay thế các bản ghi cũ chưa thành công của
        // cùng tài khoản — xóa hẳn để lịch sử chỉ còn thông tin
        // mới ("uncertain" cũ không bị xóa bởi cơ chế này vì nó
        // là căn cứ kiểm tra trùng; bản ghi vừa cập nhật chính
        // là bản mới nhất của đích).
        await pruneSupersededPublishRecords(db, affectedId);
        updated += 1;
      }
      ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),

  // ------------------------------------------------- phân tích & tối ưu
  // Sau khi đăng, ghi chỉ số từng bài theo kênh + giờ đăng. getAnalytics
  // tổng hợp điểm tương tác theo từng khung giờ RIÊNG cho từng nhóm/page
  // và trả về khung giờ tốt nhất + khuyến nghị cho lần đăng sau.
  listPostMetrics: defineAction({
    request: z.object({}),
    response: z.object({ metrics: z.array(metricOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.postMetrics)
        .orderBy(desc(schema.postMetrics.postedAt));
      return { metrics: rows.map(toMetricOut) };
    },
  }),

  addPostMetric: defineAction({
    request: z.object({
      draft_id: z.number().int().positive().optional(),
      product_name: z.string().default(""),
      stt: z.string().default(""),
      channel_type: z.enum(["group", "page", "instagram"]),
      channel_id: z.number().int().min(0).default(0),
      channel_name: z.string().min(1),
      media_kind: z.enum(["image", "video", "none"]).default("image"),
      posted_at: z.string().min(1),
      reach: z.number().int().min(0).default(0),
      likes: z.number().int().min(0).default(0),
      comments: z.number().int().min(0).default(0),
      shares: z.number().int().min(0).default(0),
      clicks: z.number().int().min(0).default(0),
      inquiries: z.number().int().min(0).default(0),
      orders: z.number().int().min(0).default(0),
      notes: z.string().default(""),
    }),
    response: z.object({ id: z.number(), hour_slot: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const postedAt = new Date(args.posted_at);
      if (Number.isNaN(postedAt.getTime()))
        throw new Error("addPostMetric: posted_at không hợp lệ");
      const [row] = await db
        .insert(schema.postMetrics)
        .values({
          draftId: args.draft_id ?? null,
          productName: args.product_name.trim(),
          stt: args.stt.trim(),
          channelType: args.channel_type,
          channelId: args.channel_id,
          channelName: args.channel_name.trim(),
          mediaKind: args.media_kind,
          postedAt,
          hourSlot: hourSlotOf(postedAt),
          reach: args.reach,
          likes: args.likes,
          comments: args.comments,
          shares: args.shares,
          clicks: args.clicks,
          inquiries: args.inquiries,
          orders: args.orders,
          notes: args.notes.trim(),
        })
        .returning({ id: schema.postMetrics.id });
      if (!row) throw new Error("addPostMetric: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id, hour_slot: hourSlotOf(postedAt) };
    },
  }),

  deletePostMetric: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.postMetrics)
        .where(eq(schema.postMetrics.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getAnalytics: defineAction({
    request: z.object({}),
    response: z.object({
      total_posts: z.number(),
      channels: z.array(channelInsightOut),
      overall_best_slot: z.string(),
      overall_best_avg: z.number(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.postMetrics);
      const byChannel = new Map<
        string,
        {
          type: "group" | "page" | "instagram";
          id: number;
          name: string;
          rows: MetricRow[];
        }
      >();
      for (const r of rows) {
        const key = `${r.channelType}:${r.channelId}:${r.channelName}`;
        const cur = byChannel.get(key) ?? {
          type: r.channelType,
          id: r.channelId,
          name: r.channelName,
          rows: [],
        };
        cur.rows.push(r);
        byChannel.set(key, cur);
      }
      const channels: z.infer<typeof channelInsightOut>[] = [];
      for (const c of byChannel.values()) {
        const totalScore = c.rows.reduce((s, r) => s + engagementScore(r), 0);
        const slots = HOUR_SLOTS.map((slot) => {
          const inSlot = c.rows.filter((r) => r.hourSlot === slot);
          const t = inSlot.reduce((s, r) => s + engagementScore(r), 0);
          return {
            slot,
            posts: inSlot.length,
            avg_score: inSlot.length ? Math.round((t / inSlot.length) * 10) / 10 : 0,
            total_score: t,
          };
        });
        const withData = slots.filter((s) => s.posts > 0);
        const best = withData.reduce(
          (a, b) => (b.avg_score > a.avg_score ? b : a),
          withData[0] ?? { slot: "", posts: 0, avg_score: 0, total_score: 0 },
        );
        const totalInq = c.rows.reduce((s, r) => s + r.inquiries, 0);
        const totalOrd = c.rows.reduce((s, r) => s + r.orders, 0);
        let recommendation: string;
        if (c.rows.length < 3) {
          recommendation = `Mới có ${c.rows.length} bài được đo ở kênh này — cần ít nhất 3 bài ở các khung giờ khác nhau mới kết luận được khung giờ tốt nhất. Tạm ưu tiên ${best.slot || "19:00–21:00"}.`;
        } else if (best.posts >= 2) {
          recommendation = `Đăng vào khung ${best.slot} cho kênh này: điểm tương tác trung bình cao nhất (${best.avg_score} điểm/bài qua ${best.posts} bài). Giữ mô tả icon đúng chỗ theo mẫu và dùng đúng media đã gắn vào bài như các bài hiệu quả.`;
        } else {
          recommendation = `Khung ${best.slot} đang dẫn đầu nhưng mới có 1 bài — đăng thử thêm 1–2 bài nữa vào khung này để xác nhận trước khi chốt lịch cố định cho kênh.`;
        }
        channels.push({
          channel_type: c.type,
          channel_id: c.id,
          channel_name: c.name,
          posts: c.rows.length,
          total_score: totalScore,
          avg_score: Math.round((totalScore / c.rows.length) * 10) / 10,
          total_reach: c.rows.reduce((s, r) => s + r.reach, 0),
          total_inquiries: totalInq,
          total_orders: totalOrd,
          best_slot: best.slot,
          best_slot_avg: best.avg_score,
          best_slot_posts: best.posts,
          recommendation,
          slots,
        });
      }
      channels.sort((a, b) => b.avg_score - a.avg_score);
      const overallSlots = HOUR_SLOTS.map((slot) => {
        const inSlot = rows.filter((r) => r.hourSlot === slot);
        const t = inSlot.reduce((s, r) => s + engagementScore(r), 0);
        return { slot, avg: inSlot.length ? t / inSlot.length : 0 };
      }).filter((s) => s.avg > 0);
      const overallBest = overallSlots.reduce(
        (a, b) => (b.avg > a.avg ? b : a),
        overallSlots[0] ?? { slot: "", avg: 0 },
      );
      return {
        total_posts: rows.length,
        channels,
        overall_best_slot: overallBest.slot,
        overall_best_avg: Math.round(overallBest.avg * 10) / 10,
      };
    },
  }),

  // ----------------------------------------------------------------- media
  listMedia: defineAction({
    request: z.object({}),
    response: z.object({
      media: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          mime: z.string(),
          size: z.number(),
          url: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.mediaItems)
        .orderBy(desc(schema.mediaItems.id));
      const media = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          name: r.name,
          mime: r.mime,
          size: r.size,
          url: (await ctx.blobs.getUrl(r.blobKey)) ?? "",
          created_at: r.createdAt.toISOString(),
        })),
      );
      return { media };
    },
  }),

  uploadMedia: defineAction({
    request: z.object({
      name: z.string().min(1),
      mime: z.string().min(1),
      data_base64: z.string().min(1),
    }),
    response: z.object({
      ok: z.boolean(),
      error: z.string(),
      // Thông tin file vừa tải lên — form soạn bài dùng id/url này
      // để gắn ảnh tải lên thẳng vào bản nháp đang soạn.
      id: z.number(),
      name: z.string(),
      mime: z.string(),
      size: z.number(),
      url: z.string(),
    }),
    async handler(ctx, args) {
      const empty = { id: 0, name: "", mime: "", size: 0, url: "" };
      const allowed =
        args.mime.startsWith("image/") || args.mime.startsWith("video/");
      if (!allowed)
        return { ok: false, error: "Chỉ nhận file ảnh hoặc video.", ...empty };
      const bytes = Buffer.from(args.data_base64, "base64");
      if (bytes.length > 25 * 1024 * 1024)
        return { ok: false, error: "File quá lớn (tối đa 25MB).", ...empty };
      const safeName = args.name.replace(/[^\w.\-]+/g, "_");
      const key = `media/${Date.now()}-${safeName}`;
      await ctx.blobs.put(key, bytes, { contentType: args.mime });
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .insert(schema.mediaItems)
        .values({
          name: args.name,
          blobKey: key,
          mime: args.mime,
          size: bytes.length,
        })
        .returning({ id: schema.mediaItems.id });
      ctx.invalidateQueries();
      return {
        ok: true,
        error: "",
        id: row?.id ?? 0,
        name: args.name,
        mime: args.mime,
        size: bytes.length,
        url: (await ctx.blobs.getUrl(key)) ?? "",
      };
    },
  }),

  deleteMedia: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.mediaItems)
        .where(eq(schema.mediaItems.id, args.id));
      if (row) {
        await ctx.blobs.delete(row.blobKey).catch(() => undefined);
        await db
          .delete(schema.mediaItems)
          .where(eq(schema.mediaItems.id, args.id));
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // ------------------------------------------- ĐĂNG NHẬP FACEBOOK BẰNG
  // TRÌNH DUYỆT Muse (để đăng bài NHÓM)
  // Nút "Mở … để liên kết" trước đây là một LINK TĨNH mở trang liên
  // kết Meta Accounts Center (agent.meta.ai/foa_ac_link/facebook →
  // accountscenter.meta.com/add_accounts) — kênh liên kết API, không
  // tạo phiên facebook.com nào và thường báo "Something went wrong".
  // Người dùng chốt: bấm mở liên kết trên tool phải MỞ CỬA SỔ TRÌNH
  // DUYỆT Muse tới TRANG ĐĂNG NHẬP FACEBOOK để đăng nhập 1 lần ở đó,
  // phiên lưu trong hồ sơ trình duyệt Muse đó dùng để đăng bài nhóm
  // (Meta không có API đăng nhóm — đăng nhóm bắt buộc qua facebook.com
  // trong trình duyệt). App tự nó không mở được cửa sổ trình duyệt tới
  // màn hình người dùng: nút bấm gọi action này, action kích hoạt MỘT
  // TÁC VỤ AGENT (ctx.agent.spawnTask) — đúng cơ chế nút Đăng Bài dùng
  // cho đích nhóm — với chỉ thị mở https://www.facebook.com/login
  // trong cửa sổ trình duyệt Muse mà người dùng nhìn thấy được, để
  // nguyên cửa sổ ở trang đăng nhập nếu chưa có phiên (TUYỆT ĐỐI không
  // tự nhập mật khẩu), và báo kết quả thật qua reportFacebookBrowserLogin.
  // Trạng thái lưu ở app_settings (khóa fb_browser_login_*) để giao
  // diện hiện đúng sự thật: requested (đã gửi yêu cầu, chưa có bằng
  // chứng cửa sổ đã mở) ≠ waiting_login (tác vụ đã mở và đang chờ
  // người dùng đăng nhập) ≠ logged_in (tác vụ xác nhận đã đăng nhập).
  getFacebookBrowserLoginStatus: defineAction({
    request: z.object({}),
    response: z.object({
      status: z.string(),
      message: z.string(),
      account_name: z.string(),
      updated_at: z.string(),
      login_url: z.string(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [status, message, accountName, updatedAt] = await Promise.all([
        getSetting(db, "fb_browser_login_status"),
        getSetting(db, "fb_browser_login_message"),
        getSetting(db, "fb_browser_login_account"),
        getSetting(db, "fb_browser_login_at"),
      ]);
      return {
        status,
        message,
        account_name: accountName,
        updated_at: updatedAt,
        login_url: "https://www.facebook.com/login",
      };
    },
  }),

  requestFacebookBrowserLogin: defineAction({
    request: z.object({
      account_id: z.number().int().min(0).default(0),
      account_name: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      // Tên tài khoản Facebook gợi ý: lấy từ args, nếu không có thì
      // lấy nick Facebook đang chọn dùng để đăng (nếu có).
      let accountName = args.account_name.trim();
      if (!accountName) {
        const accs = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.platform, "Facebook"));
        const picked =
          accs.find((a) => a.id === args.account_id) ??
          accs.find((a) => a.selected === 1) ??
          accs[0];
        accountName = picked?.name ?? "";
      }
      const nowIso = new Date().toISOString();
      const requestedMessage =
        "Đã gửi yêu cầu mở trình duyệt Muse tới trang đăng nhập Facebook — chờ Muse mở cửa sổ trình duyệt đó. Cửa sổ này hiện trong cuộc trò chuyện với Muse, không phải tab mới trong Chrome của bạn và không phải trang liên kết Meta Accounts Center.";
      await setSetting(db, "fb_browser_login_status", "requested");
      await setSetting(db, "fb_browser_login_message", requestedMessage);
      await setSetting(db, "fb_browser_login_account", accountName);
      await setSetting(db, "fb_browser_login_at", nowIso);
      const taskMessage = [
        `Người dùng vừa bấm nút “Mở trình duyệt Muse — đăng nhập Facebook để đăng nhóm” trong mục Tài khoản của app Social Desk (artifact social-desk) và muốn ĐÚNG điều này: mở CỬA SỔ TRÌNH DUYỆT Muse mà người dùng NHÌN THẤY ĐƯỢC trong cuộc trò chuyện này tới TRANG ĐĂNG NHẬP FACEBOOK để họ đăng nhập 1 lần ở đó, dùng phiên đó để đăng bài vào NHÓM sau này. Xử lý đúng như khi người dùng nhắn trực tiếp trong chat nhờ bạn mở trình duyệt — KHÔNG cần hỏi lại người dùng.`,
        `Địa chỉ cần mở: https://www.facebook.com/login (nếu Facebook tự chuyển hướng sang https://www.facebook.com/ thì đó là dấu hiệu có thể đã có phiên).${accountName ? ` Tài khoản người dùng dự kiến đăng nhập là tài khoản quản trị Page: “${accountName}” (chỉ để đối chiếu tên sau khi đăng nhập, KHÔNG dùng để tự điền vào form).` : ""}`,
        `Cách xử lý bắt buộc:\n1) Mở địa chỉ trên trong cửa sổ trình duyệt Muse (công cụ trình duyệt của bạn — cùng hồ sơ trình duyệt bền vững dùng cho các lần đăng nhóm bằng trình duyệt sau này).\n2) Nếu trang cho thấy ĐÃ ĐĂNG NHẬP (bảng tin/trang chủ Facebook kèm tên tài khoản): đọc TÊN TÀI KHOẢN thật đang đăng nhập trên trang, rồi gọi action reportFacebookBrowserLogin của artifact social-desk với status "logged_in", account_name là tên thật đó, message là tóm tắt ngắn bằng tiếng Việt.\n3) Nếu trang hiện MÀN HÌNH ĐĂNG NHẬP Facebook (form "Log into Facebook" / đăng nhập bằng email/số điện thoại + mật khẩu): TUYỆT ĐỐI KHÔNG tự nhập email/mật khẩu/mã xác minh, KHÔNG bấm thay người dùng. Hãy ĐỂ NGUYÊN cửa sổ trình duyệt đang mở ở trang đăng nhập đó (không đóng cửa sổ, không điều hướng đi nơi khác) để người dùng tự đăng nhập ngay trong cửa sổ đó — chỉ 1 lần, phiên sẽ được lưu trong hồ sơ trình duyệt cho mọi lần đăng nhóm sau. Rồi gọi action reportFacebookBrowserLogin với status "waiting_login", account_name là "${accountName}", message cho biết cửa sổ trình duyệt Muse đang mở ở trang đăng nhập Facebook và đang chờ người dùng đăng nhập 1 lần trong cửa sổ đó.\n4) Nếu không mở được trang hoặc gặp lỗi thật (trang lỗi, bị chặn, checkpoint bắt buộc…): gọi action reportFacebookBrowserLogin với status "failed" và message là lý do THẬT quan sát được — tuyệt đối không bịa rằng cửa sổ đã mở.`,
        `Phải gọi action reportFacebookBrowserLogin đúng MỘT lần ở cuối lượt này (dù kết quả là logged_in, waiting_login hay failed) để app Social Desk cập nhật trạng thái đăng nhập trình duyệt cho người dùng.`,
      ].join("\n\n");
      try {
        const res = await ctx.agent.spawnTask(taskMessage, {
          expectsAction: "reportFacebookBrowserLogin",
          dedupeKey: `fb-browser-login-${nowIso}`,
        });
        if (!res.ok) {
          const failMessage = `Không khởi động được tác vụ mở trình duyệt Muse: ${res.error} — bấm lại nút mở trình duyệt để thử lại, hoặc nhắn trực tiếp trong chat với Muse nhờ mở trang đăng nhập Facebook.`;
          await setSetting(db, "fb_browser_login_status", "failed");
          await setSetting(db, "fb_browser_login_message", failMessage);
          await setSetting(db, "fb_browser_login_at", new Date().toISOString());
          ctx.invalidateQueries();
          return { ok: false, message: failMessage };
        }
      } catch (e) {
        const reason = (e instanceof Error ? e.message : String(e)).slice(0, 240);
        const failMessage = `Không khởi động được tác vụ mở trình duyệt Muse: ${reason} — bấm lại nút mở trình duyệt để thử lại, hoặc nhắn trực tiếp trong chat với Muse nhờ mở trang đăng nhập Facebook.`;
        await setSetting(db, "fb_browser_login_status", "failed");
        await setSetting(db, "fb_browser_login_message", failMessage);
        await setSetting(db, "fb_browser_login_at", new Date().toISOString());
        ctx.invalidateQueries();
        return { ok: false, message: failMessage };
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        message:
          "Đã gửi yêu cầu: Muse đang mở cửa sổ trình duyệt Muse tới trang đăng nhập Facebook (facebook.com/login). Hãy sang cửa sổ trình duyệt Muse đó và đăng nhập 1 lần bằng tài khoản quản trị Page — phiên được lưu trong hồ sơ trình duyệt đó để đăng bài vào nhóm. Đây không phải trang liên kết Meta Accounts Center và không mở tab mới trong Chrome của bạn.",
      };
    },
  }),

  reportFacebookBrowserLogin: defineAction({
    request: z.object({
      status: z.enum(["waiting_login", "logged_in", "failed"]),
      account_name: z.string().default(""),
      message: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const accountName = args.account_name.trim();
      const fallback =
        args.status === "logged_in"
          ? `Đã đăng nhập Facebook trong trình duyệt Muse${accountName ? ` — ${accountName}` : ""} — sẵn sàng đăng bài vào nhóm bằng phiên này.`
          : args.status === "waiting_login"
            ? "Cửa sổ trình duyệt Muse đang mở ở trang đăng nhập Facebook, chờ người dùng đăng nhập 1 lần trong cửa sổ đó rồi phiên được lưu cho các lần đăng nhóm sau."
            : "Chưa mở được trang đăng nhập Facebook trong trình duyệt Muse.";
      await setSetting(db, "fb_browser_login_status", args.status);
      await setSetting(
        db,
        "fb_browser_login_message",
        args.message.trim() || fallback,
      );
      if (accountName)
        await setSetting(db, "fb_browser_login_account", accountName);
      await setSetting(db, "fb_browser_login_at", new Date().toISOString());
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;

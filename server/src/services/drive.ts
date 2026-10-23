import fs from "node:fs";
import path from "node:path";
import { z, type Ctx } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { privileged } from "../privileged";
import type { Db } from "./settings";

// Mã sản phẩm nội bộ (SKU) theo quy định của shop: "STT-Tên sản
// phẩm-Màu" — ví dụ "1-LEXUS LX600-Trắng". Mỗi biến thể màu có mã
// riêng. Thiếu STT hoặc tên thì không dựng mã (trả "").
export function buildSku(stt: string, name: string, color: string): string {
  const s = stt.trim();
  const n = name.trim().replace(/\s+/g, " ");
  const c = color.trim().replace(/\s+/g, " ");
  if (!s || !n) return "";
  return c ? `${s}-${n}-${c}` : `${s}-${n}`;
}



// Link Google Drive dạng trang xem (…/file/d/<ID>/view) trả về trang HTML
// chứ không phải file ảnh, nên trình duyệt không hiển thị được trong thẻ
// ảnh. Dạng thumbnail?id=<ID> mới tải được ảnh trực tiếp (vẫn cần file đã
// bật chia sẻ "bất kỳ ai có đường link").
export function extractDriveFileId(raw: string): string {
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

export function normalizeSheetImageUrl(raw: string): string {
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
export function extractDriveFolderId(raw: string): string {
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
export interface DriveImage {
  id: string;
  name: string;
  mime: string;
  size: number;
  jpeg_url: string;
  view_url: string;
  is_heic: boolean;
}

export const driveImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  jpeg_url: z.string(),
  view_url: z.string(),
  is_heic: z.boolean(),
});

export function parseDriveImages(raw: string): DriveImage[] {
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

export function parseColors(raw: string, fallbackColor: string): string[] {
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

export type DriveFetchResult =
  | { status: "ok"; folderId: string; images: DriveImage[] }
  | { status: "empty"; folderId: string; images: DriveImage[] }
  | { status: "no_link"; folderId: string; images: DriveImage[]; error: string }
  | { status: "error"; folderId: string; images: DriveImage[]; error: string };

export const UPLOADS_DRIVE_DIR = path.resolve("./uploads/drive");

export function ensureUploadsDriveDir(): void {
  if (!fs.existsSync(UPLOADS_DRIVE_DIR)) {
    fs.mkdirSync(UPLOADS_DRIVE_DIR, { recursive: true });
  }
}

// Xóa các file ảnh cũ đã lưu trên đĩa của folder này ("xóa cũ")
export function cleanOldDriveFolderFiles(folderId: string): void {
  if (!folderId) return;
  try {
    ensureUploadsDriveDir();
    const prefix = `${folderId}_`;
    const files = fs.readdirSync(UPLOADS_DRIVE_DIR);
    for (const f of files) {
      if (f.startsWith(prefix)) {
        try {
          fs.unlinkSync(path.join(UPLOADS_DRIVE_DIR, f));
        } catch {}
      }
    }
  } catch (err) {
    console.error(`[cleanOldDriveFolderFiles] Lỗi xóa file cũ folder ${folderId}:`, err);
  }
}

// Tải ảnh từ Google Drive về lưu trữ trên server local ("lấy mới")
export async function downloadAndSaveDriveImage(
  folderId: string,
  fileId: string,
): Promise<{ localUrl: string; size: number } | null> {
  try {
    ensureUploadsDriveDir();
    const fileName = `${folderId}_${fileId}.jpg`;
    const filePath = path.join(UPLOADS_DRIVE_DIR, fileName);

    const urlsToTry = [
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`,
      `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
    ];

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          // Chỉ lưu nếu dung lượng > 1KB (tránh trang lỗi HTML 404 trả về 200)
          if (buf.length > 1024) {
            fs.writeFileSync(filePath, buf);
            return { localUrl: `/uploads/drive/${fileName}`, size: buf.length };
          }
        }
      } catch {
        // Thử url dự phòng tiếp theo
      }
    }
    return null;
  } catch (err) {
    console.error(`[downloadAndSaveDriveImage] Lỗi tải ảnh ${fileId}:`, err);
    return null;
  }
}

// Mở thư mục Drive của một link ảnh (hoặc folder id) và liệt kê ảnh
// thật bên trong.
// CHỈ QUÉT KHI ĐỒNG BỘ SHEET HOẶC BẤM "QUÉT LẠI ẢNH DRIVE".
// Tự động: "xóa cũ lấy mới" — xóa ảnh cũ đã lưu trên đĩa của folder này,
// tải toàn bộ ảnh mới về ./uploads/drive/ và lưu trữ cục bộ.
export async function fetchDriveImages(
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

  // 1. "XÓA CŨ": Xóa toàn bộ file ảnh cũ trên đĩa của folder này
  cleanOldDriveFolderFiles(folderId);

  // 2. "LẤY MỚI": Lọc các file ảnh thật và tải về lưu cục bộ (./uploads/drive/)
  const validFiles = files.filter(
    (f) => (f.mimeType ?? "").startsWith("image/") && f.id,
  );

  const downloadPromises = validFiles.map(async (f) => {
    const mime = f.mimeType ?? "";
    const isHeic = /heic|heif/i.test(mime) || /\.hei[cf]$/i.test(f.name ?? "");
    const saved = await downloadAndSaveDriveImage(folderId, f.id!);
    const localUrl = saved
      ? saved.localUrl
      : `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`;
    const fileSize = saved ? saved.size : (Number(f.size ?? 0) || 0);

    return {
      id: f.id!,
      name: f.name ?? f.id!,
      mime,
      size: fileSize,
      jpeg_url: localUrl,
      view_url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
      is_heic: isHeic,
    };
  });

  const images: DriveImage[] = await Promise.all(downloadPromises);

  if (images.length === 0)
    return { status: "empty", folderId, images: [] };
  return { status: "ok", folderId, images };
}

export function friendlyDriveError(raw: string): string {
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
export async function storeProductDriveImages(
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

// Chuyển đổi danh sách ảnh (từ file local uploads/ hoặc URL HTTP) thành Base64 Data URL
// giúp Chrome Extension gửi dữ liệu ảnh trực tiếp mà không bị chặn bởi CORS/CSP.
export async function prepareDriveImagesAsDataUrls(
  driveImages: DriveImage[],
): Promise<string[]> {
  const preparedImages: string[] = [];
  for (const im of driveImages) {
    const url = im.jpeg_url;
    if (!url) continue;

    // 1. Nếu là ảnh đã tải lưu trên server local (/uploads/...)
    if (url.startsWith("/uploads/")) {
      try {
        const localPath = path.resolve("." + url);
        if (fs.existsSync(localPath)) {
          const buf = fs.readFileSync(localPath);
          const base64 = buf.toString("base64");
          preparedImages.push(`data:image/jpeg;base64,${base64}`);
          continue;
        }
      } catch (err) {
        console.error("[prepareDriveImagesAsDataUrls] Lỗi đọc ảnh local:", err);
      }
    }

    // 2. Nếu là URL ngoài (http/https), fetch từ server
    try {
      const imgRes = await fetch(url);
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buf).toString("base64");
        const mime = imgRes.headers.get("content-type") || "image/jpeg";
        preparedImages.push(`data:${mime};base64,${base64}`);
      } else {
        preparedImages.push(url);
      }
    } catch {
      preparedImages.push(url);
    }
  }
  return preparedImages.length > 0
    ? preparedImages
    : driveImages.map((im) => im.jpeg_url);
}

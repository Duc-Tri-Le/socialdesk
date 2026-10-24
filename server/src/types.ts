import { z } from "@hatch/space-sdk";
import * as schema from "./schema";
import { driveImageSchema } from "./services/drive";
import type { SheetSourceRow } from "./services/settings";

export const productOut = z.object({
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

export const accountOut = z.object({
  id: z.number(),
  platform: z.string(),
  name: z.string(),
  handle: z.string(),
  profile_url: z.string(),
  linked: z.boolean(),
  selected: z.boolean(),
  extension_code: z.string().default(""),
  session_status: z
    .enum(["logged_in", "expired", "checkpoint"])
    .default("logged_in"),
});

export type AccountRow = typeof schema.accounts.$inferSelect;

export function capitalizeWords(str: string): string {
  return str
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
    .join(" ")
    .trim();
}

/**
 * Trích xuất tên Fanpage thân thiện từ URL Facebook khi người dùng không nhập tên.
 * Hỗ trợ các định dạng:
 * - https://facebook.com/ducgarage -> "Ducgarage"
 * - https://facebook.com/duc.garage -> "Duc Garage"
 * - https://facebook.com/p/Duc-Garage-Auto-61550000000000/ -> "Duc Garage Auto"
 * - https://facebook.com/pages/Shop-Xe-Mo-Hinh/102938481239 -> "Shop Xe Mo Hinh"
 * - https://facebook.com/profile.php?id=61550000000000 -> "Fanpage 61550000000000"
 */
export function extractFacebookPageName(urlStr: string): string {
  try {
    let clean = urlStr.trim();
    if (!/^https?:\/\//i.test(clean)) {
      clean = `https://${clean}`;
    }
    const parsed = new URL(clean);
    const idParam = parsed.searchParams.get("id");

    const segments = parsed.pathname
      .split("/")
      .map((s) => {
        try {
          return decodeURIComponent(s).trim();
        } catch {
          return s.trim();
        }
      })
      .filter(
        (s) =>
          s &&
          !["pages", "category", "p", "profile.php", "business"].includes(
            s.toLowerCase()
          )
      );

    const firstSegment = segments[0];
    if (firstSegment) {
      let candidate = firstSegment.replace(/-\d{7,}$/, "");

      // Nếu candidate không phải toàn số
      if (!/^\d+$/.test(candidate)) {
        const withSpaces = candidate.replace(/[-_.]+/g, " ").trim();
        const formatted = capitalizeWords(withSpaces);
        if (formatted) return formatted;
      } else {
        const secondSegment = segments[1];
        if (secondSegment && !/^\d+$/.test(secondSegment)) {
          const withSpaces = secondSegment.replace(/[-_.]+/g, " ").trim();
          const formatted = capitalizeWords(withSpaces);
          if (formatted) return formatted;
        } else {
          return `Fanpage ${candidate}`;
        }
      }
    }

    if (idParam) {
      return `Fanpage ${idParam}`;
    }
  } catch {
    // URL không hợp lệ hoặc parse lỗi
  }
  return "Fanpage Facebook";
}

// Link mở thẳng tới trang của tài khoản khi người dùng bấm vào nick:
// - Ưu tiên link trang cá nhân đã lưu (profile_url).
// - Nếu link chỉ là trang chủ chung https://facebook.com/ thì fallback sang facebook.com/me
// - Instagram: suy ra từ username dạng @… ở tên/ghi chú.
// - Facebook đang đăng nhập (đã liên kết): facebook.com/me
//   tự chuyển tới đúng trang cá nhân của nick đang đăng nhập trên trình duyệt.
// Ngoài các trường hợp trên trả "" — giao diện hiện ô nhập link để bổ sung.
export function deriveProfileUrl(r: AccountRow): string {
  const stored = r.profileUrl.trim();
  const isGenericFbHome = /^https?:\/\/(www\.)?facebook\.com\/?$/i.test(stored);
  if (stored && !isGenericFbHome) return stored;
  if (r.platform === "Instagram") {
    const candidate = [r.name, r.handle].find((v) => v.trim().startsWith("@"));
    const username = candidate?.trim().slice(1).split(/\s/)[0] ?? "";
    if (/^[\w.]+$/.test(username))
      return `https://www.instagram.com/${username}/`;
    return "";
  }
  if (r.linked === 1) return "https://www.facebook.com/me";
  return "";
}

export function toAccountOut(
  r: AccountRow,
  sessionStatus?: string,
): z.infer<typeof accountOut> {
  const status: "logged_in" | "expired" | "checkpoint" =
    sessionStatus === "logged_in" || sessionStatus === "expired" || sessionStatus === "checkpoint"
      ? sessionStatus
      : r.linked === 1
        ? "logged_in"
        : "expired";
  return {
    id: r.id,
    platform: r.platform,
    name: r.name,
    handle: r.handle,
    profile_url: deriveProfileUrl(r),
    linked: r.linked === 1,
    selected: r.selected === 1,
    extension_code: (r as any).extensionCode ?? "",
    session_status: status,
  };
}

export const pageOut = z.object({
  id: z.number(),
  account_id: z.number(),
  account_name: z.string(),
  name: z.string(),
  url: z.string(),
  role: z.string(),
  selected: z.boolean(),
});

export type PageRow = typeof schema.fbPages.$inferSelect;

export function toPageOut(
  r: PageRow,
  accountName: string,
): z.infer<typeof pageOut> {
  const name = r.name.trim() || extractFacebookPageName(r.url);
  return {
    id: r.id,
    account_id: r.accountId,
    account_name: accountName,
    name,
    url: r.url,
    role: r.role,
    selected: r.selected === 1,
  };
}

export const sheetSourceOut = z.object({
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

export function toSheetSourceOut(
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

export const sheetConfigOut = z.object({
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

export const runOut = z.object({
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

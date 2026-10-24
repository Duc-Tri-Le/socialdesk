import { like } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "./settings";
import {
  extractDriveFolderId,
  parseDriveImages,
  type DriveImage,
} from "./drive";

export type ResolvedDraftImages = {
  folderId: string;
  finalImages: DriveImage[];
  finalStatus: string;
  finalError: string;
};

/**
 * Xác định tập ảnh, thư mục Drive và trạng thái cuối cùng cho một bản nháp:
 * 1. Nếu người dùng tự chỉnh ảnh trong form (imagesCustomized): dùng đúng tập đó.
 * 2. Nếu có ảnh client mang theo: dùng tập đó.
 * 3. Nếu chưa có ảnh và có link thư mục Drive: tra cứu nhanh từ sản phẩm khớp link thư mục đó.
 */
export async function resolveDraftImages(
  db: Db,
  args: {
    imageUrl: string;
    images: DriveImage[];
    imagesCustomized: boolean;
  },
): Promise<ResolvedDraftImages> {
  const folderId = extractDriveFolderId(args.imageUrl);
  let stored: {
    status: string;
    error: string;
    images: DriveImage[];
  } | null = null;

  if (!args.imagesCustomized && args.images.length === 0 && folderId) {
    const [match] = await db
      .select()
      .from(schema.products)
      .where(like(schema.products.imageUrl, `%${folderId}%`))
      .limit(1);
    if (match) {
      stored = {
        status: match.driveStatus,
        error: match.driveError,
        images: parseDriveImages(match.driveImages),
      };
    }
  }

  const finalImages: DriveImage[] = args.imagesCustomized
    ? args.images
    : args.images.length > 0
      ? args.images
      : (stored?.images ?? []);

  const finalStatus = args.imagesCustomized
    ? finalImages.length > 0
      ? "ok"
      : "empty"
    : finalImages.length > 0
      ? "ok"
      : stored
        ? stored.status || "no_link"
        : "no_link";

  const finalError = args.imagesCustomized
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

  return { folderId, finalImages, finalStatus, finalError };
}

/**
 * Tạo thông báo chi tiết khi tạo bản nháp thành công
 */
export function buildDraftCreatedMessage(
  imagesCustomized: boolean,
  finalImages: DriveImage[],
  finalStatus: string,
  finalError: string,
): string {
  if (imagesCustomized) {
    return finalImages.length > 0
      ? `Đã dùng đúng ${finalImages.length} ảnh bạn đã chốt trong form soạn bài (ảnh Drive còn giữ + ảnh bạn tự thêm) — tập ảnh này được giữ nguyên khi xuất gói đăng, không quét lại Drive để gắn thêm/bớt.`
      : "Bạn đã bỏ hết ảnh khỏi bài này trong form soạn bài — bài đăng sẽ không kèm ảnh nào.";
  }

  if (finalImages.length > 0) {
    const hasHeic = finalImages.some((i) => i.is_heic);
    return `Đã dùng ${finalImages.length} ảnh thật đã lưu sẵn trong sản phẩm từ lần đồng bộ gần nhất — soạn bài không quét lại Drive; tập ảnh này được giữ nguyên khi xuất gói đăng, gói đăng cũng không quét lại Drive. Bản dùng để đăng là JPEG do Drive kết xuất${hasHeic ? " (file gốc có HEIC — không đăng trực tiếp file HEIC)" : ""}.`;
  }

  if (finalStatus === "empty") {
    return "Thư mục Drive của sản phẩm đang RỖNG (theo lần quét gần nhất) — bài soạn chưa có ảnh thật; bổ sung ảnh vào thư mục rồi đồng bộ lại hoặc bấm “Quét lại ảnh Drive” trên thẻ sản phẩm.";
  }

  return finalError;
}

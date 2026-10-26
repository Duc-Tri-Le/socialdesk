import { z } from "@hatch/space-sdk";
import * as schema from "../../schema";
import { driveImageSchema } from "../drive";

export const FB_PAGE_CAPTION_LIMIT = 1024;
export const IG_CAPTION_LIMIT = 2200;

export const SUPERSEDABLE_PUBLISH_STATUSES = new Set([
  "failed",
  "needs_login",
  "skipped",
  "unsupported",
]);

export const publishRecordOut = z.object({
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

export type PublishRecordRow = typeof schema.publishRecords.$inferSelect;

export const packTargetsOut = z.object({
  saved: z.boolean(),
  group_ids: z.array(z.number()),
  page_ids: z.array(z.number()),
  instagram_account_ids: z.array(z.number()),
});

export type PackTargets = z.infer<typeof packTargetsOut>;

export type PackTargetsInput = {
  group_ids: number[];
  page_ids: number[];
  instagram_account_ids: number[];
};

export const draftOut = z.object({
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
  scheduled_at: z.string().nullable(),
  pack_targets: packTargetsOut,
  created_at: z.string(),
  placeholders: z.array(z.string()),
});

export type DraftRow = typeof schema.drafts.$inferSelect;

export type BuildPackResult =
  | {
      ok: true;
      packText: string;
      cleanCaption: string;
      driveImageCount: number;
      hasMedia: boolean;
      hasVideo: boolean;
    }
  | { ok: false; message: string };

export interface FbPageRef {
  page_id: string;
  name: string;
}

export interface IgAccountRef {
  user_fbid: string;
  username: string;
}

// Dấu hiệu một lượt đăng bị NGẮT GIỮA CHỪNG vì quá ngân sách thời gian
export function isPublishTimeoutMessage(message: string): boolean {
  return /wall-clock budget|exceeded \d+\s*ms|timed?\s?out|quá thời gian chờ/i.test(
    message,
  );
}

// Dấu hiệu một lượt đăng bằng TRÌNH DUYỆT bị chặn ở MÀN HÌNH ĐĂNG NHẬP Facebook
export function isFbLoginWallMessage(message: string): boolean {
  return /chưa đăng nhập|chưa có đăng nhập đã lưu|không có đăng nhập đã lưu|log into facebook|màn hình.{0,30}đăng nhập|hộp thoại đăng nhập|trang đăng nhập/i.test(
    message,
  );
}

// Trạng thái HIỆU LỰC của một bản ghi đăng
export function effectivePublishStatus(r: {
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

// Khóa nhận diện MỘT ĐÍCH đăng của một bản nháp
export function publishTargetKey(r: {
  targetKind: string;
  targetName: string;
}): string {
  return `${r.targetKind}:${normalizeNameKey(r.targetName)}`;
}

export function normalizeNameKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

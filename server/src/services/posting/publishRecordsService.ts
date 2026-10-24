import { z } from "@hatch/space-sdk";
import { desc, eq, inArray } from "drizzle-orm";
import * as schema from "../../schema";
import type { Db } from "../settings";
import {
  buildSku,
  normalizeSheetImageUrl,
  parseDriveImages,
} from "../drive";
import { findPlaceholders } from "../copywriting";
import {
  publishRecordOut,
  draftOut,
  SUPERSEDABLE_PUBLISH_STATUSES,
  effectivePublishStatus,
  publishTargetKey,
  normalizeNameKey,
  type PublishRecordRow,
  type DraftRow,
} from "./postingTypes";
import { parsePackTargets } from "./packBuilder";

export function toPublishRecordOut(
  r: PublishRecordRow,
): z.infer<typeof publishRecordOut> {
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

export function toDraftOut(
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

// Sau khi một bản ghi đăng MỚI được ghi cho một đích (theo id bản ghi vừa ghi),
// xóa các bản ghi CŨ bị thay thế của CÙNG đích trong CÙNG bản nháp.
export async function pruneSupersededPublishRecords(
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

  const idsToDelete: number[] = [];
  for (const r of rows) {
    if (r.id === keep.id) continue;
    if (publishTargetKey(r) !== key) continue;
    if (!SUPERSEDABLE_PUBLISH_STATUSES.has(effectivePublishStatus(r)))
      continue;
    idsToDelete.push(r.id);
  }

  if (idsToDelete.length > 0) {
    await db
      .delete(schema.publishRecords)
      .where(inArray(schema.publishRecords.id, idsToDelete));
  }
  return idsToDelete.length;
}

// Dọn TOÀN BỘ bản ghi đăng hiện có: với MỖI bản nháp + MỖI đích,
// chỉ giữ bản ghi MỚI NHẤT ở nhóm trạng thái có thể bị thay thế.
export async function pruneAllSupersededPublishRecords(db: Db): Promise<number> {
  const rows = await db
    .select()
    .from(schema.publishRecords)
    .orderBy(desc(schema.publishRecords.id));
  const seen = new Set<string>();
  const idsToDelete: number[] = [];

  for (const r of rows) {
    if (!SUPERSEDABLE_PUBLISH_STATUSES.has(effectivePublishStatus(r)))
      continue;
    const key = `${r.draftId}|${publishTargetKey(r)}`;
    if (seen.has(key)) {
      idsToDelete.push(r.id);
    } else {
      seen.add(key);
    }
  }

  if (idsToDelete.length > 0) {
    await db
      .delete(schema.publishRecords)
      .where(inArray(schema.publishRecords.id, idsToDelete));
  }
  return idsToDelete.length;
}

// Cập nhật kết quả đăng bài cho một đích (nhóm, page, instagram):
// Tìm bản ghi đang "queued" của cùng đích trong bản nháp đó để cập nhật,
// hoặc tạo bản ghi mới nếu không có. Sau đó tự động dọn dẹp các bản ghi cũ
// đã bị thay thế (pruneSupersededPublishRecords).
export async function updatePublishOutcomeRecord(
  db: Db,
  args: {
    draftId: number;
    targetKind: "group" | "page" | "instagram" | "account";
    targetName: string;
    status:
      | "published"
      | "failed"
      | "needs_login"
      | "uncertain"
      | "skipped"
      | "unsupported"
      | "queued";
    postUrl?: string;
    message: string;
  },
): Promise<number> {
  const records = await db
    .select()
    .from(schema.publishRecords)
    .where(eq(schema.publishRecords.draftId, args.draftId));
  const queued = records
    .filter(
      (p) =>
        p.targetKind === args.targetKind &&
        normalizeNameKey(p.targetName) === normalizeNameKey(args.targetName) &&
        p.status === "queued",
    )
    .sort((a, b) => b.id - a.id)[0];

  const postUrl =
    args.status === "published" ? (args.postUrl ?? "").trim() : "";
  let affectedId = queued?.id ?? 0;

  if (queued) {
    await db
      .update(schema.publishRecords)
      .set({
        status: args.status,
        postUrl,
        message: args.message,
      })
      .where(eq(schema.publishRecords.id, queued.id));
  } else {
    const [ins] = await db
      .insert(schema.publishRecords)
      .values({
        draftId: args.draftId,
        targetKind: args.targetKind,
        targetName: args.targetName,
        status: args.status,
        postUrl,
        message: args.message,
      })
      .returning({ id: schema.publishRecords.id });
    affectedId = ins?.id ?? 0;
  }

  await pruneSupersededPublishRecords(db, affectedId);
  return affectedId;
}

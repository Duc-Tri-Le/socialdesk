import { eq, inArray } from "drizzle-orm";
import * as schema from "../../schema";
import {
  hourSlotOf,
  extractValidUrl,
  normalizeChannelKey,
  type MetricRow,
  type NewMetricRow,
} from "./analyticsTypes";

type PublishRecordRow = typeof schema.publishRecords.$inferSelect;
type DraftRow = typeof schema.drafts.$inferSelect;

/**
 * Tự động đồng bộ các bài đã đăng thành công từ publish_records vào post_metrics nếu chưa có.
 * Tự động dọn dẹp toàn bộ dữ liệu phân tích của các bài nháp đã bị xóa khỏi Hàng đợi.
 */
export async function ensureMetricsSynced(db: any): Promise<number> {
  try {
    const [pubRecords, existingMetrics, allDrafts] = await Promise.all([
      db.select().from(schema.publishRecords).where(eq(schema.publishRecords.status, "published")),
      db.select().from(schema.postMetrics),
      db.select().from(schema.drafts),
    ]);

    const validDraftIds = new Set(allDrafts.map((d: any) => d.id));

    // 1. Dọn dẹp triệt để các bản ghi metrics mồ côi (draft đã bị xóa khỏi Hàng đợi)
    const orphanMetricIds = existingMetrics
      .filter((m: any) => m.draftId && !validDraftIds.has(m.draftId))
      .map((m: any) => m.id);
    if (orphanMetricIds.length > 0) {
      await db
        .delete(schema.postMetricSnapshots)
        .where(inArray(schema.postMetricSnapshots.postingId, orphanMetricIds));
      await db
        .delete(schema.postMetrics)
        .where(inArray(schema.postMetrics.id, orphanMetricIds));
    }

    // 2. Dọn dẹp triệt để các bản ghi publish_records mồ côi (draft đã bị xóa khỏi Hàng đợi)
    const orphanPubRecordIds = pubRecords
      .filter((r: any) => !validDraftIds.has(r.draftId))
      .map((r: any) => r.id);
    if (orphanPubRecordIds.length > 0) {
      await db
        .delete(schema.publishRecords)
        .where(inArray(schema.publishRecords.id, orphanPubRecordIds));
    }

    // 3. Chỉ đồng bộ các bài nháp hợp lệ còn tồn tại
    const validPubRecords = pubRecords.filter((r: any) => validDraftIds.has(r.draftId));
    const validExistingMetrics = existingMetrics.filter(
      (m: any) => !m.draftId || validDraftIds.has(m.draftId),
    );

    const batch = prepareSyncMetricsBatch(validPubRecords, validExistingMetrics, allDrafts);
    if (batch.length > 0) {
      await db.insert(schema.postMetrics).values(batch);
      return batch.length;
    }
  } catch (err) {
    console.warn("[Analytics] Lỗi tự động đồng bộ bài đăng:", err);
  }
  return 0;
}

/**
 * Chuẩn bị mảng bản ghi mới để chèn đồng loạt (Batch Insert) từ các bài đăng Hàng đợi thành công.
 * Loại bỏ hoàn toàn vòng lặp N+1 queries và tuyệt đối bỏ qua các bản nháp không tồn tại.
 */
export function prepareSyncMetricsBatch(
  publishedRecords: PublishRecordRow[],
  existingMetrics: MetricRow[],
  drafts: DraftRow[],
): NewMetricRow[] {
  const existingKeys = new Set<string>(
    existingMetrics.map((m) => normalizeChannelKey(m.draftId, m.channelName)),
  );
  const draftMap = new Map<number, DraftRow>(drafts.map((d) => [d.id, d]));

  const batch: NewMetricRow[] = [];

  for (const rec of publishedRecords) {
    const key = normalizeChannelKey(rec.draftId, rec.targetName);
    if (existingKeys.has(key)) continue;

    const draft = draftMap.get(rec.draftId);
    if (!draft) continue; // Tuyệt đối không đồng bộ nếu bài nháp đã bị xóa khỏi Hàng đợi

    const channelType: "group" | "page" | "instagram" =
      rec.targetKind === "group"
        ? "group"
        : rec.targetKind === "instagram"
          ? "instagram"
          : "page";

    const postedAt = rec.createdAt || new Date();
    batch.push({
      draftId: rec.draftId,
      productName: draft?.productName || "Bài đăng Hàng đợi",
      stt: draft?.stt || "",
      channelType,
      channelId: 0,
      channelName: rec.targetName || (channelType === "group" ? "Nhóm Facebook" : "Fanpage"),
      mediaKind: "image",
      postedAt,
      hourSlot: hourSlotOf(postedAt),
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
      inquiries: 0,
      orders: 0,
      notes: extractValidUrl(rec.postUrl) || rec.postUrl || "",
      postStatus: "active",
    });

    existingKeys.add(key);
  }

  return batch;
}

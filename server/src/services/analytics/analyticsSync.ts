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
 * Chuẩn bị mảng bản ghi mới để chèn đồng loạt (Batch Insert) từ các bài đăng Hàng đợi thành công.
 * Loại bỏ hoàn toàn vòng lặp N+1 queries.
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
    });

    existingKeys.add(key);
  }

  return batch;
}

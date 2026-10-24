import { z } from "@hatch/space-sdk";
import * as schema from "../../schema";

export const HOUR_SLOTS = [
  "06:00–09:00",
  "09:00–12:00",
  "12:00–13:00",
  "13:00–17:00",
  "17:00–19:00",
  "19:00–21:00",
  "21:00–23:00",
] as const;

export type HourSlot = (typeof HOUR_SLOTS)[number];

/**
 * Xác định khung giờ Việt Nam (UTC+7) dựa trên thời điểm đăng bài.
 * Trả về một trong 7 khung giờ chuẩn đã định nghĩa.
 */
export function hourSlotOf(d: Date): string {
  if (Number.isNaN(d.getTime())) {
    return "19:00–21:00"; // Khung mặc định an toàn nếu thời gian không hợp lệ
  }
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

/**
 * Trọng số điểm tương tác:
 * - Like ×1
 * - Click ×2
 * - Bình luận ×3
 * - Chia sẻ ×4
 * - Inbox hỏi mua ×8 (tín hiệu chốt đơn cao)
 * - Đơn chốt thành công ×20 (chuyển đổi doanh thu cao nhất)
 */
export function engagementScore(m: {
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

/**
 * Trích xuất và làm sạch đường link hợp lệ từ văn bản,
 * loại bỏ các ký tự dấu câu thừa ở cuối (như .,;:) hoặc ngoặc kép/đơn.
 */
export function extractValidUrl(rawText: string): string {
  if (!rawText) return "";
  const match = rawText.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return "";
  let url = match[0].replace(/[.,;:)\]}>]+$/, "").trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Không phải URL hợp lệ
  }
  return "";
}

/**
 * Chuẩn hóa khóa nhận diện duy nhất cho một kênh bài đăng:
 * Kết hợp draftId và channelName đã chuẩn hóa chữ thường và cắt khoảng trắng.
 */
export function normalizeChannelKey(
  draftId: number | null | undefined,
  channelName: string,
): string {
  const normId = draftId ?? 0;
  const normName = (channelName || "").trim().toLowerCase();
  return `${normId}:${normName}`;
}

export const metricOut = z.object({
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
  post_url: z.string().default(""),
  post_status: z.enum(["active", "pending_approval", "removed"]).default("active"),
  scanned_at: z.string().nullable().default(null),
});

export type MetricRow = typeof schema.postMetrics.$inferSelect;
export type NewMetricRow = typeof schema.postMetrics.$inferInsert;

export function toMetricOut(
  r: MetricRow,
  matchedPostUrl: string = "",
): z.infer<typeof metricOut> {
  let url = matchedPostUrl;
  if (!url && r.notes) {
    url = extractValidUrl(r.notes);
  }
  const rawStatus = (r as any).postStatus || "active";
  const validStatus = (["active", "pending_approval", "removed"] as const).includes(rawStatus)
    ? (rawStatus as "active" | "pending_approval" | "removed")
    : "active";

  const scannedAtIso = r.scannedAt ? r.scannedAt.toISOString() : null;

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
    post_url: url || "",
    post_status: validStatus,
    scanned_at: scannedAtIso,
  };
}

export const heatmapCellOut = z.object({
  slot: z.string(),
  posts_count: z.number(),
  raw_avg_score: z.number(),
  normalized_avg_score: z.number(),
  confidence: z.enum(["none", "low", "medium", "high"]),
  last_scanned_at: z.string().nullable(),
  avg_age_hours: z.number(),
  has_orders: z.boolean(),
  inquiries: z.number(),
  orders: z.number(),
  is_winner: z.boolean(),
});

export type HeatmapCell = z.infer<typeof heatmapCellOut>;

export const groupHeatmapRowOut = z.object({
  group_name: z.string(),
  total_posts: z.number(),
  cells: z.array(heatmapCellOut),
  best_reliable_slot: z.string(),
});

export type GroupHeatmapRow = z.infer<typeof groupHeatmapRowOut>;

export const groupHeatmapOut = z.object({
  groups: z.array(groupHeatmapRowOut),
  slots: z.array(z.string()),
  overall_reliable_best_slot: z.string(),
  timezone: z.string(),
});

export type GroupHeatmapData = z.infer<typeof groupHeatmapOut>;

export const groupPerformanceOut = z.object({
  group_name: z.string(),
  total_posts: z.number(),
  active_posts: z.number(),
  pending_posts: z.number(),
  removed_posts: z.number(),
  total_likes: z.number(),
  total_comments: z.number(),
  total_shares: z.number(),
  total_inquiries: z.number(),
  total_orders: z.number(),
  total_reach: z.number(),
  avg_score: z.number(),
  approval_rate: z.number(),
});

export type GroupPerformanceData = z.infer<typeof groupPerformanceOut>;

export const contentDraftOut = z.object({
  draft_id: z.number(),
  stt: z.string(),
  angle: z.string(),
  caption: z.string(),
  drive_images: z.array(z.string()),
  posts_count: z.number(),
  total_likes: z.number(),
  total_comments: z.number(),
  total_shares: z.number(),
  total_inquiries: z.number(),
  total_orders: z.number(),
  total_reach: z.number(),
  total_score: z.number(),
  posts: z.array(metricOut),
});

export type ContentDraftData = z.infer<typeof contentDraftOut>;

export const productTreeOut = z.object({
  product_name: z.string(),
  drafts_count: z.number(),
  total_posts: z.number(),
  total_score: z.number(),
  total_orders: z.number(),
  total_inquiries: z.number(),
  drafts: z.array(contentDraftOut),
});

export type ProductTreeData = z.infer<typeof productTreeOut>;

export const analyticsOverviewOut = z.object({
  total_products: z.number(),
  total_drafts: z.number(),
  total_posts: z.number(),
  total_reach: z.number(),
  total_likes: z.number(),
  total_comments: z.number(),
  total_shares: z.number(),
  total_inquiries: z.number(),
  total_orders: z.number(),
  total_score: z.number(),
  active_posts: z.number(),
  pending_posts: z.number(),
  removed_posts: z.number(),
  group_posts: z.number(),
  page_posts: z.number(),
  instagram_posts: z.number(),
});

export type AnalyticsOverviewData = z.infer<typeof analyticsOverviewOut>;

export const slotInsightOut = z.object({
  slot: z.string(),
  posts: z.number(),
  avg_score: z.number(),
  total_score: z.number(),
});

export type SlotInsight = z.infer<typeof slotInsightOut>;

export const channelInsightOut = z.object({
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
  slots: z.array(slotInsightOut),
});

export type ChannelInsightData = z.infer<typeof channelInsightOut>;

export interface ChannelGroup {
  type: "group" | "page" | "instagram";
  id: number;
  name: string;
  rows: MetricRow[];
}

import { z } from "@hatch/space-sdk";
import * as schema from "../schema";

export const HOUR_SLOTS = [
  "06:00–09:00",
  "09:00–12:00",
  "12:00–13:00",
  "13:00–17:00",
  "17:00–19:00",
  "19:00–21:00",
  "21:00–23:00",
] as const;

export function hourSlotOf(d: Date): string {
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
});

export type MetricRow = typeof schema.postMetrics.$inferSelect;

export function toMetricOut(r: MetricRow): z.infer<typeof metricOut> {
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

import * as schema from "../../schema";
import {
  HOUR_SLOTS,
  engagementScore,
  extractValidUrl,
  normalizeChannelKey,
  type MetricRow,
  type SlotInsight,
  type ChannelInsightData,
  type ChannelGroup,
} from "./analyticsTypes";

type PublishRecordRow = typeof schema.publishRecords.$inferSelect;

/**
 * Xây dựng bảng tra cứu liên kết bài viết thực tế từ publish_records.
 * Khóa tra cứu: normalizeChannelKey(draftId, targetName).
 */
export function buildPublishUrlMap(
  publishRecords: PublishRecordRow[],
): Map<string, string> {
  const urlMap = new Map<string, string>();
  for (const p of publishRecords) {
    if (p.postUrl && p.draftId) {
      const sanitized = extractValidUrl(p.postUrl) || p.postUrl.trim();
      if (sanitized) {
        urlMap.set(normalizeChannelKey(p.draftId, p.targetName), sanitized);
      }
    }
  }
  return urlMap;
}

/**
 * Tính toán số liệu thống kê cho 1 khung giờ cụ thể.
 * Độ phức tạp O(M) với M là số bài trong khung đó.
 */
export function computeSlotStats(
  slot: string,
  slotRows: MetricRow[],
): SlotInsight {
  const count = slotRows.length;
  if (count === 0) {
    return { slot, posts: 0, avg_score: 0, total_score: 0 };
  }
  const totalScore = slotRows.reduce((sum, r) => sum + engagementScore(r), 0);
  const avgScore = Math.round((totalScore / count) * 10) / 10;
  return {
    slot,
    posts: count,
    avg_score: avgScore,
    total_score: totalScore,
  };
}

/**
 * Tạo khuyến nghị khung giờ đăng bài thông minh dựa trên độ tin cậy mẫu.
 */
export function generateChannelRecommendation(
  totalChannelPosts: number,
  candidateSlot: SlotInsight | null,
): string {
  if (totalChannelPosts === 0) {
    return "Chưa có bài đăng nào được ghi nhận ở kênh này.";
  }
  if (totalChannelPosts < 3) {
    return `Mới có ${totalChannelPosts} bài được ghi nhận ở kênh này — chưa đủ dữ liệu (cần ít nhất 3 bài ở các khung giờ khác nhau) để kết luận khung giờ tốt nhất. Hãy tiếp tục đăng bài để hệ thống có cơ sở phân tích.`;
  }
  if (!candidateSlot || candidateSlot.avg_score === 0) {
    return `Đã đo ${totalChannelPosts} bài nhưng chưa ghi nhận tương tác để xác định khung giờ vượt trội.`;
  }
  if (candidateSlot.posts >= 2) {
    return `Đăng vào khung ${candidateSlot.slot} cho kênh này: điểm tương tác trung bình cao nhất (${candidateSlot.avg_score} điểm/bài qua ${candidateSlot.posts} bài). Giữ phong cách viết và hình ảnh như các bài hiệu quả.`;
  }
  return `Khung ${candidateSlot.slot} đang dẫn đầu (${candidateSlot.avg_score} điểm) nhưng mới có 1 bài — đăng thử thêm 1–2 bài nữa vào khung này để xác nhận độ ổn định.`;
}

/**
 * Phân tích chuyên sâu chỉ số cho một kênh (Hội nhóm, Page hoặc Instagram).
 * Sử dụng Single Pass O(N) để gom nhóm theo khung giờ.
 */
export function analyzeChannel(channel: ChannelGroup): ChannelInsightData {
  const { rows } = channel;
  const totalPosts = rows.length;
  const totalScore = rows.reduce((s, r) => s + engagementScore(r), 0);
  const avgScore = totalPosts > 0 ? Math.round((totalScore / totalPosts) * 10) / 10 : 0;
  const totalReach = rows.reduce((s, r) => s + r.reach, 0);
  const totalInquiries = rows.reduce((s, r) => s + r.inquiries, 0);
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);

  // Single-pass O(N) gom bài theo khung giờ
  const rowsBySlot = new Map<string, MetricRow[]>();
  for (const r of rows) {
    const list = rowsBySlot.get(r.hourSlot);
    if (list) {
      list.push(r);
    } else {
      rowsBySlot.set(r.hourSlot, [r]);
    }
  }

  const slots: SlotInsight[] = HOUR_SLOTS.map((slot) => {
    const inSlot = rowsBySlot.get(slot) ?? [];
    return computeSlotStats(slot, inSlot);
  });

  const slotsWithData = slots.filter((s) => s.posts > 0);
  const candidateSlot = slotsWithData.reduce(
    (a, b) => (b.avg_score > a.avg_score ? b : a),
    slotsWithData[0] ?? { slot: "", posts: 0, avg_score: 0, total_score: 0 },
  );

  // Chỉ kết luận khung giờ tốt nhất khi có ít nhất 3 bài và có điểm tương tác
  const isReliable = totalPosts >= 3 && candidateSlot && candidateSlot.avg_score > 0;
  const bestSlot = isReliable ? candidateSlot : null;
  const recommendation = generateChannelRecommendation(totalPosts, candidateSlot);

  return {
    channel_type: channel.type,
    channel_id: channel.id,
    channel_name: channel.name,
    posts: totalPosts,
    total_score: totalScore,
    avg_score: avgScore,
    total_reach: totalReach,
    total_inquiries: totalInquiries,
    total_orders: totalOrders,
    best_slot: bestSlot ? bestSlot.slot : "",
    best_slot_avg: bestSlot ? bestSlot.avg_score : 0,
    best_slot_posts: bestSlot ? bestSlot.posts : 0,
    recommendation,
    slots,
  };
}

/**
 * Tính toán khung giờ có điểm tương tác trung bình cao nhất trên quy mô toàn bộ các kênh.
 */
export function computeOverallBestSlot(rows: MetricRow[]): { slot: string; avg: number } {
  if (rows.length < 3) {
    return { slot: "", avg: 0 };
  }

  const rowsBySlot = new Map<string, MetricRow[]>();
  for (const r of rows) {
    const list = rowsBySlot.get(r.hourSlot);
    if (list) {
      list.push(r);
    } else {
      rowsBySlot.set(r.hourSlot, [r]);
    }
  }

  const validSlots = HOUR_SLOTS.map((slot) => {
    const inSlot = rowsBySlot.get(slot) ?? [];
    const count = inSlot.length;
    const total = inSlot.reduce((s, r) => s + engagementScore(r), 0);
    return {
      slot,
      avg: count > 0 ? total / count : 0,
    };
  }).filter((s) => s.avg > 0);

  const initial = validSlots[0];
  if (!initial) {
    return { slot: "", avg: 0 };
  }

  const best = validSlots.reduce((a, b) => (b.avg > a.avg ? b : a), initial);
  return {
    slot: best.slot,
    avg: Math.round(best.avg * 10) / 10,
  };
}

/**
 * Tổng hợp toàn bộ dữ liệu phân tích hệ thống:
 * Gom nhóm theo kênh, phân tích từng kênh, xếp hạng và xác định khung giờ dẫn đầu.
 */
export function aggregateAnalytics(rows: MetricRow[]) {
  const byChannel = new Map<string, ChannelGroup>();
  for (const r of rows) {
    const key = `${r.channelType}:${r.channelId}:${r.channelName.trim().toLowerCase()}`;
    let cur = byChannel.get(key);
    if (!cur) {
      cur = {
        type: r.channelType,
        id: r.channelId,
        name: r.channelName,
        rows: [],
      };
      byChannel.set(key, cur);
    }
    cur.rows.push(r);
  }

  const channels: ChannelInsightData[] = Array.from(byChannel.values()).map(analyzeChannel);
  channels.sort((a, b) => b.avg_score - a.avg_score);

  const overall = computeOverallBestSlot(rows);

  return {
    total_posts: rows.length,
    channels,
    overall_best_slot: overall.slot,
    overall_best_avg: overall.avg,
  };
}

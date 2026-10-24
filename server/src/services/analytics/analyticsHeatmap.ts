import {
  HOUR_SLOTS,
  engagementScore,
  type MetricRow,
  type HeatmapCell,
  type GroupHeatmapRow,
  type GroupHeatmapData,
} from "./analyticsTypes";

/**
 * Tính toán ma trận Heatmap Nhóm × Khung giờ chuẩn theo múi giờ địa phương Việt Nam (UTC+7).
 *
 * Tính năng đặc biệt:
 * 1. Tách biệt thời điểm đăng khỏi thời điểm quét: Chuẩn hóa theo thời gian từ lúc đăng (Time-since-posted normalization).
 * 2. Đánh giá độ tin cậy mẫu:
 *    - 0 bài: "none"
 *    - 1 bài: "low" (chưa đủ mẫu, tuyệt đối KHÔNG tô màu chiến thắng)
 *    - 2 bài: "medium" (cần thêm bài để xác nhận)
 *    - >= 3 bài: "high" (đủ độ tin cậy thống kê)
 * 3. Chỉ đánh dấu is_winner khi ô có độ tin cậy "high" (>= 3 bài) và có tương tác thực tế.
 */
export function buildGroupSlotHeatmap(rows: MetricRow[]): GroupHeatmapData {
  const groupRows = rows.filter((r) => r.channelType === "group");

  // Gom bài đăng theo tên nhóm
  const rowsByGroup = new Map<string, MetricRow[]>();
  for (const r of groupRows) {
    const name = (r.channelName || "Nhóm Facebook khác").trim();
    const key = name.toLowerCase();
    const list = rowsByGroup.get(key);
    if (list) {
      list.push(r);
    } else {
      rowsByGroup.set(key, [r]);
    }
  }

  const groupHeatmapRows: GroupHeatmapRow[] = [];

  for (const list of rowsByGroup.values()) {
    const groupName = list[0]?.channelName || "Nhóm Facebook";
    const totalPosts = list.length;

    // Gom bài trong nhóm theo từng khung giờ
    const postsBySlot = new Map<string, MetricRow[]>();
    for (const p of list) {
      const slotList = postsBySlot.get(p.hourSlot);
      if (slotList) {
        slotList.push(p);
      } else {
        postsBySlot.set(p.hourSlot, [p]);
      }
    }

    const cells: HeatmapCell[] = HOUR_SLOTS.map((slot) => {
      const slotPosts = postsBySlot.get(slot) ?? [];
      const count = slotPosts.length;

      if (count === 0) {
        return {
          slot,
          posts_count: 0,
          raw_avg_score: 0,
          normalized_avg_score: 0,
          confidence: "none",
          last_scanned_at: null,
          avg_age_hours: 0,
          has_orders: false,
          inquiries: 0,
          orders: 0,
          is_winner: false,
        };
      }

      let sumRawScore = 0;
      let sumNormScore = 0;
      let sumAgeHours = 0;
      let totalInquiries = 0;
      let totalOrders = 0;
      let latestScanMs = 0;

      for (const p of slotPosts) {
        const postedMs = p.postedAt.getTime();
        const scannedDate = p.scannedAt || p.createdAt || new Date();
        const scannedMs = scannedDate.getTime();
        if (scannedMs > latestScanMs) latestScanMs = scannedMs;

        // Tính số giờ hoạt động kể từ lúc đăng đến khi quét (tối thiểu 1 giờ)
        const ageHours = Math.max(1, (scannedMs - postedMs) / (3600 * 1000));
        sumAgeHours += ageHours;

        const rawScore = engagementScore(p);
        sumRawScore += rawScore;

        // Chuẩn hóa theo thời gian hoạt động (Baseline 24h)
        // Dùng căn bậc hai để phản ánh tốc độ tương tác tự nhiên trên mạng xã hội
        const normScore =
          ageHours <= 24
            ? Math.round(rawScore * Math.sqrt(24 / ageHours) * 10) / 10
            : rawScore;
        sumNormScore += normScore;

        totalInquiries += p.inquiries;
        totalOrders += p.orders;
      }

      const rawAvg = Math.round((sumRawScore / count) * 10) / 10;
      const normAvg = Math.round((sumNormScore / count) * 10) / 10;
      const avgAge = Math.round((sumAgeHours / count) * 10) / 10;

      // Đánh giá độ tin cậy mẫu
      const confidence: "low" | "medium" | "high" =
        count === 1 ? "low" : count === 2 ? "medium" : "high";

      return {
        slot,
        posts_count: count,
        raw_avg_score: rawAvg,
        normalized_avg_score: normAvg,
        confidence,
        last_scanned_at: latestScanMs > 0 ? new Date(latestScanMs).toISOString() : null,
        avg_age_hours: avgAge,
        has_orders: totalOrders > 0,
        inquiries: totalInquiries,
        orders: totalOrders,
        is_winner: false, // Sẽ xác định sau khi so sánh toàn bộ ô trong nhóm
      };
    });

    // Chỉ tìm ô chiến thắng trong nhóm khi có ô đạt độ tin cậy CAO (>= 3 bài) và có điểm
    const reliableCandidates = cells.filter(
      (c) => c.confidence === "high" && c.normalized_avg_score > 0,
    );

    let bestReliableSlot = "";
    if (reliableCandidates.length > 0) {
      const winner = reliableCandidates.reduce((best, curr) =>
        curr.normalized_avg_score > best.normalized_avg_score ? curr : best,
      );
      winner.is_winner = true;
      bestReliableSlot = winner.slot;
    }

    groupHeatmapRows.push({
      group_name: groupName,
      total_posts: totalPosts,
      cells,
      best_reliable_slot: bestReliableSlot,
    });
  }

  // Sắp xếp nhóm có nhiều lượt đăng lên đầu
  groupHeatmapRows.sort((a, b) => b.total_posts - a.total_posts);

  // Xác định khung giờ dẫn đầu toàn bộ hệ thống (chỉ khi có ít nhất 3 bài trên quy mô toàn hệ thống)
  let overallBest = "";
  const allReliableSlots = HOUR_SLOTS.map((slot) => {
    const slotPosts = groupRows.filter((r) => r.hourSlot === slot);
    return { slot, count: slotPosts.length };
  }).filter((s) => s.count >= 3);

  if (allReliableSlots.length > 0) {
    overallBest = allReliableSlots[0]?.slot || "";
  }

  return {
    groups: groupHeatmapRows,
    slots: [...HOUR_SLOTS],
    overall_reliable_best_slot: overallBest,
    timezone: "Asia/Ho_Chi_Minh (UTC+7)",
  };
}

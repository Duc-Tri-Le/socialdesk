import type { Metric, Analytics, SlotLabel } from "../analyticsTypes";
import { SLOT_LABELS } from "../analyticsTypes";

export interface PostDiagnosis {
  tag: string;
  tagType: "good" | "cta_issue" | "channel_issue" | "unscanned" | "normal";
  reason: string;
}

/**
 * Chẩn đoán hiệu quả bài viết:
 * - Chỉ tập trung vào tương tác thực tế và lượt khách Inbox (không cần chốt đơn).
 * - Phép phân biệt cốt lõi:
 *   + Tiếp cận cao mà 0 inbox => Bệnh nội dung / lời kêu gọi (CTA).
 *   + Tiếp cận thấp => Bệnh giờ đăng hoặc kênh.
 */
export function diagnosePost(m: Metric, maxInquiries: number, maxScore: number): PostDiagnosis {
  if (!m.scanned_at && m.likes === 0 && m.comments === 0 && m.shares === 0) {
    return { tag: "Chưa quét", tagType: "unscanned", reason: "Chưa có số liệu quét DOM thực tế từ Chrome Extension" };
  }
  if (m.inquiries > 0 && m.inquiries === maxInquiries && maxInquiries > 0) {
    return { tag: "Tốt — Inbox cao nhất", tagType: "good", reason: `Đem về ${m.inquiries} khách nhắn tin hỏi mua, hiệu quả chuyển đổi dẫn đầu` };
  }
  if (m.inquiries > 0) {
    return { tag: "Tốt — Kéo khách inbox", tagType: "good", reason: `Đã có ${m.inquiries} khách nhắn tin tư vấn từ bài đăng này` };
  }

  // Bài có tương tác thảo luận cao
  if (m.score >= maxScore * 0.8 && maxScore > 0) {
    return {
      tag: "Tương tác tốt",
      tagType: "good",
      reason: "Lượng like, bình luận và chia sẻ cao, tiếp cận tự nhiên tốt",
    };
  }

  // Bệnh nội dung / Lời kêu gọi CTA: Tiếp cận cao (reach >= 300 hoặc like >= 10) nhưng 0 inbox
  if ((m.reach >= 300 || m.likes >= 10) && m.inquiries === 0) {
    const reachText = m.reach > 0 ? `${m.reach.toLocaleString("vi-VN")} reach` : `${m.likes} like`;
    return {
      tag: "Cần đổi lời kêu gọi (CTA)",
      tagType: "cta_issue",
      reason: `Tiếp cận tốt (${reachText}) nhưng 0 inbox → bài hút người xem nhưng chưa kích thích nhắn tin, cần đổi CTA sang "Inbox báo giá ngay"`,
    };
  }

  // Bệnh giờ đăng / Kênh: Tiếp cận thấp (< 150) hoặc tương tác dưới 3
  if (m.reach > 0 && m.reach < 150) {
    return {
      tag: "Tiếp cận thấp — Sai giờ/nhóm",
      tagType: "channel_issue",
      reason: `Tiếp cận chỉ ${m.reach} lượt → bài ít người thấy, nên chuyển sang khung 20h hoặc đổi nhóm`,
    };
  }

  if (m.likes < 3 && m.comments === 0) {
    return {
      tag: "Ít tương tác",
      tagType: "channel_issue",
      reason: "Bài ít tương tác, kiểm tra lại khung giờ và mức độ kiểm duyệt của nhóm",
    };
  }

  return {
    tag: "Ổn định",
    tagType: "normal",
    reason: "Tương tác và phản hồi ở mức trung bình, tiếp tục quan sát thêm",
  };
}

export interface ChannelSummary {
  type: "group" | "page" | "instagram";
  title: string;
  totalPosts: number;
  avgScore: number;
  totalInquiries: number;
  inquiryRate: string; // Tỷ lệ ra inbox/bài
  bestSlot: string;
  slotsRanked: Array<{ slot: SlotLabel; avgScore: number; posts: number; isBest: boolean }>;
}

/**
 * Tổng hợp so sánh 3 kênh và xếp hạng 7 khung giờ:
 * - Chỉ đo lường số khách Inbox (bỏ chốt đơn).
 * - Khung giờ tốt nhất được đánh dấu isBest = true.
 */
export function computeChannelSummaries(
  metrics: Metric[],
  analytics?: Analytics,
): ChannelSummary[] {
  const channelDefs: Array<{ type: "group" | "page" | "instagram"; title: string }> = [
    { type: "group", title: "Hội nhóm Facebook" },
    { type: "page", title: "Fanpage Facebook" },
    { type: "instagram", title: "Instagram" },
  ];

  return channelDefs.map(({ type, title }) => {
    const matchingMetrics = metrics.filter((m) => m.channel_type === type);
    const totalPosts = matchingMetrics.length;

    let totalInquiries = 0;
    let sumScore = 0;

    for (const m of matchingMetrics) {
      totalInquiries += m.inquiries;
      sumScore += m.score;
    }

    const avgScore = totalPosts > 0 ? Number((sumScore / totalPosts).toFixed(1)) : 0;
    const inquiryRate = totalPosts > 0 ? (totalInquiries / totalPosts).toFixed(2) : "0";

    // Tính điểm 7 khung giờ
    const slotStats = SLOT_LABELS.map((slot) => {
      const inSlot = matchingMetrics.filter((m) => m.hour_slot === slot);
      const cnt = inSlot.length;
      const avg =
        cnt > 0 ? Number((inSlot.reduce((acc, x) => acc + x.score, 0) / cnt).toFixed(1)) : 0;
      return { slot, avgScore: avg, posts: cnt, isBest: false };
    });

    const validSlots = slotStats.filter((s) => s.posts > 0);
    let bestSlotLabel = "Chưa đủ dữ liệu";

    // Chỉ kết luận khung giờ tốt nhất khi kênh có tối thiểu 3 bài và điểm tương tác > 0
    if (totalPosts >= 3 && validSlots.length > 0 && validSlots[0] && validSlots[0].avgScore > 0) {
      validSlots.sort((a, b) => b.avgScore - a.avgScore);
      bestSlotLabel = validSlots[0]?.slot ?? "Chưa đủ dữ liệu";
      const found = slotStats.find((s) => s.slot === bestSlotLabel);
      if (found) found.isBest = true;
    } else {
      const foundInAnalytics = analytics?.channels?.find(
        (c: { channel_type: string; best_slot?: string; posts?: number }) =>
          c.channel_type === type && (c.posts ?? 0) >= 3,
      );
      if (foundInAnalytics?.best_slot) {
        bestSlotLabel = foundInAnalytics.best_slot;
        const found = slotStats.find((s) => s.slot === bestSlotLabel);
        if (found) found.isBest = true;
      }
    }

    const sortedSlots = [...slotStats].sort((a, b) => {
      if (a.isBest) return -1;
      if (b.isBest) return 1;
      return b.avgScore - a.avgScore;
    });

    return {
      type,
      title,
      totalPosts,
      avgScore,
      totalInquiries,
      inquiryRate,
      bestSlot: bestSlotLabel,
      slotsRanked: sortedSlots,
    };
  });
}

export interface ActionDirective {
  id: string;
  badge: string;
  badgeType: "priority" | "cta_fix" | "channel_shift" | "sync_alert";
  directive: string;
  reasoning: string;
  actionLabel: string;
  targetTab: "queue" | "compose" | "groups" | "sync_scan";
}

/**
 * Tự động tạo các hướng đăng tiếp theo từ dữ liệu thực tế:
 * - Nguyên tắc trung thực: KHÔNG BAO GIỜ bịa số liệu hoặc giả định khung giờ/chiến thuật khi chưa có dữ liệu quét.
 * - Chỉ đưa ra chỉ dẫn khi đã có dữ liệu đo lường thực tế từ Facebook qua Extension.
 */
export function generateActionDirectives(
  metrics: Metric[],
  analytics?: Analytics,
): ActionDirective[] {
  const list: ActionDirective[] = [];

  if (metrics.length === 0) {
    list.push({
      id: "dir_no_data",
      badge: "Khởi động",
      badgeType: "priority",
      directive:
        "Chưa có bài đăng đo lường thực tế. Hãy xuất bản bài viết từ Hàng đợi để hệ thống bắt đầu đo đếm.",
      reasoning: "Cần có bài đăng thực tế để hệ thống bắt đầu thu thập số liệu.",
      actionLabel: "Tới Hàng đợi duyệt →",
      targetTab: "queue",
    });
    return list;
  }

  // Lọc tập bài đăng đã được quét tương tác thực tế từ Facebook
  const scannedMetrics = metrics.filter(
    (m) => !!m.scanned_at || m.likes > 0 || m.comments > 0 || m.inquiries > 0,
  );

  // 1. Toàn bộ bài đăng chưa được quét tương tác thực tế
  if (scannedMetrics.length === 0) {
    list.push({
      id: "dir_unscanned_all",
      badge: "Chưa có dữ liệu quét",
      badgeType: "sync_alert",
      directive: `Bạn có ${metrics.length} bài đăng nhưng chưa có dữ liệu tương tác thực tế từ Facebook → Hãy mở Extension để quét cập nhật lượt Like, Bình luận và Khách nhắn tin.`,
      reasoning:
        "Nguyên tắc trung thực: Hệ thống chỉ phân tích và đưa ra chiến thuật khi có số liệu quét thực tế, tuyệt đối không tự suy đoán khi chưa có dữ liệu.",
      actionLabel: "Quét số liệu ngay →",
      targetTab: "sync_scan",
    });
    return list;
  }

  // 2. Mẫu dữ liệu quá ít (< 3 bài đã quét) -> Cảnh báo trung thực
  if (scannedMetrics.length < 3) {
    list.push({
      id: "dir_low_sample",
      badge: "Cần thêm dữ liệu",
      badgeType: "priority",
      directive: `Hiện mới có ${scannedMetrics.length} bài đăng có số liệu quét thực tế → Cần tối thiểu 3 bài để xác định chính xác xu hướng khung giờ và dòng xe chiến thắng.`,
      reasoning: "Đảm bảo tính chính xác thống kê, không đưa ra kết luận vội vàng khi mẫu dữ liệu quá ít.",
      actionLabel: "Tiếp tục đăng bài →",
      targetTab: "queue",
    });
  }

  // 3. Phép phân biệt: Bài tiếp cận cao nhưng 0 inbox (Bệnh nội dung / CTA)
  const ctaIssuePost = scannedMetrics.find(
    (m) => (m.reach >= 200 || m.likes >= 8) && m.inquiries === 0,
  );

  if (ctaIssuePost) {
    const metricLabel =
      ctaIssuePost.reach > 0
        ? `${ctaIssuePost.reach.toLocaleString("vi-VN")} reach`
        : `${ctaIssuePost.likes} like`;

    list.push({
      id: "dir_cta_issue",
      badge: "Thuốc đổi CTA",
      badgeType: "cta_fix",
      directive: `Bài "${ctaIssuePost.product_name}" tiếp cận cao (${metricLabel}) nhưng 0 inbox → Lần sau giữ ảnh/góc chụp, đổi lời kêu gọi sang "Inbox báo giá ngay".`,
      reasoning:
        "Bệnh nội dung: Bài hút người xem nhưng chưa kích thích khách nhắn tin hỏi mua.",
      actionLabel: "Soạn bài mới →",
      targetTab: "compose",
    });
  }

  // 4. Tìm sản phẩm chiến thắng (CHỈ KHI có từ 3 bài đã quét trở lên và có điểm tương tác > 0)
  if (scannedMetrics.length >= 3) {
    const productStats = new Map<string, { posts: number; score: number; inquiries: number }>();
    for (const m of scannedMetrics) {
      const p = m.product_name || "Sản phẩm";
      const cur = productStats.get(p) || { posts: 0, score: 0, inquiries: 0 };
      cur.posts++;
      cur.score += m.score;
      cur.inquiries += m.inquiries;
      productStats.set(p, cur);
    }

    let topProduct = "";
    let topScore = 0;
    for (const [name, stat] of productStats.entries()) {
      if (stat.score > topScore) {
        topScore = stat.score;
        topProduct = name;
      }
    }

    const groupChannel = analytics?.channels?.find(
      (c: { channel_type: string; best_slot?: string; posts?: number }) =>
        c.channel_type === "group" && (c.posts ?? 0) >= 3,
    );
    const groupBestSlot = groupChannel?.best_slot;

    if (topProduct && topScore > 0) {
      const slotText = groupBestSlot ? ` vào khung ${groupBestSlot}` : "";
      list.push({
        id: "dir_winning_formula",
        badge: "Chiến thuật tuần tới",
        badgeType: "priority",
        directive: `Top bài hiệu quả cao nhất là ${topProduct} → Tuần tới ưu tiên tiếp tục đăng dòng sản phẩm này${slotText}.`,
        reasoning:
          "Nhân bản công thức chiến thắng: Tận dụng dòng sản phẩm hút khách nhất từ số liệu đo lường thực tế.",
        actionLabel: "Lên lịch đăng bài →",
        targetTab: "queue",
      });
    }

    // 5. Phân bổ kênh (Hội nhóm vs Fanpage)
    const groupMetrics = scannedMetrics.filter((m) => m.channel_type === "group");
    const pageMetrics = scannedMetrics.filter((m) => m.channel_type === "page");

    const groupAvgScore =
      groupMetrics.length > 0
        ? groupMetrics.reduce((a, b) => a + b.score, 0) / groupMetrics.length
        : 0;
    const pageAvgScore =
      pageMetrics.length > 0
        ? pageMetrics.reduce((a, b) => a + b.score, 0) / pageMetrics.length
        : 0;

    if (groupMetrics.length >= 2 && pageMetrics.length >= 1 && groupAvgScore > pageAvgScore) {
      const diffPct = Math.round(((groupAvgScore - pageAvgScore) / (pageAvgScore || 1)) * 100);
      list.push({
        id: "dir_channel_shift",
        badge: "Dồn lực kênh",
        badgeType: "channel_shift",
        directive: `Fanpage tương tác yếu hơn Hội nhóm ${Math.min(diffPct, 80)}% → Giảm tần suất đăng Fanpage, dồn lịch sang các nhóm Facebook hiệu quả.`,
        reasoning:
          "Tối ưu hóa nguồn lực: Hội nhóm có tương tác người dùng cao hơn và kéo về khách inbox trực tiếp.",
        actionLabel: "Xem danh sách nhóm →",
        targetTab: "groups",
      });
    }
  }

  // 6. Nhắc nhở quét bổ sung nếu còn bài chưa quét
  const unscannedRemaining = metrics.filter(
    (m) => !m.scanned_at && m.likes === 0 && m.comments === 0,
  ).length;
  if (unscannedRemaining > 0 && scannedMetrics.length > 0) {
    list.push({
      id: "dir_unscanned",
      badge: "Cần quét bổ sung",
      badgeType: "sync_alert",
      directive: `Còn ${unscannedRemaining} bài đăng chưa quét tương tác thực tế → Cần mở Extension để quét cập nhật đủ 100% dữ liệu.`,
      reasoning: "Đảm bảo độ bao phủ số liệu đo lường đạt 100%, không để sót bài viết hiệu quả.",
      actionLabel: "Quét số liệu ngay →",
      targetTab: "sync_scan",
    });
  }

  return list;
}

export type TimeFilter = "all" | "7d" | "30d" | "this_month";
export type StatusFilter = "all" | "scanned" | "unscanned";
export type SortOption = "score" | "inquiries" | "likes" | "newest";

/**
 * Lọc và sắp xếp bài đăng xếp hạng (tối ưu hóa cho giao diện Xếp hạng bài)
 */
export function filterAndSortMetrics(
  metrics: Metric[],
  search: string,
  timeFilter: TimeFilter,
  statusFilter: StatusFilter,
  sortBy: SortOption,
): Metric[] {
  const query = search.trim().toLowerCase();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const filtered = metrics.filter((m) => {
    if (query && !(m.product_name || "").toLowerCase().includes(query) && !(m.channel_name || "").toLowerCase().includes(query)) return false;
    if (timeFilter !== "all") {
      const diffDays = (now - new Date(m.posted_at).getTime()) / dayMs;
      if (timeFilter === "7d" && diffDays > 7) return false;
      if (timeFilter === "30d" && diffDays > 30) return false;
      if (timeFilter === "this_month" && new Date(m.posted_at).getMonth() !== new Date().getMonth()) return false;
    }
    const isScanned = !!m.scanned_at || m.likes > 0 || m.comments > 0;
    if (statusFilter === "scanned" && !isScanned) return false;
    if (statusFilter === "unscanned" && isScanned) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (sortBy === "score") return b.score !== a.score ? b.score - a.score : b.inquiries - a.inquiries;
    if (sortBy === "inquiries") return b.inquiries !== a.inquiries ? b.inquiries - a.inquiries : b.score - a.score;
    if (sortBy === "likes") return b.likes - a.likes;
    if (sortBy === "newest") return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime();
    return 0;
  });
}

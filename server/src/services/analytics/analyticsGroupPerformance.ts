import { engagementScore, type MetricRow, type GroupPerformanceData } from "./analyticsTypes";

/**
 * Thống kê chuyên sâu hiệu quả theo từng Nhóm Facebook:
 * - Đếm số lượng bài: Tổng số lượt đăng, Đang hiển thị, Chờ duyệt, Bị gỡ/xóa
 * - Tính tỷ lệ duyệt bài (approval rate)
 * - Tổng hợp tương tác (likes, cmt, shares, reach) và kết quả kinh doanh (inbox, đơn)
 */
export function buildGroupPerformanceList(rows: MetricRow[]): GroupPerformanceData[] {
  const groupRows = rows.filter((r) => r.channelType === "group");
  const byGroup = new Map<string, MetricRow[]>();

  for (const r of groupRows) {
    const name = (r.channelName || "Nhóm Facebook khác").trim();
    const key = name.toLowerCase();
    const list = byGroup.get(key);
    if (list) {
      list.push(r);
    } else {
      byGroup.set(key, [r]);
    }
  }

  const result: GroupPerformanceData[] = [];

  for (const [_, list] of byGroup.entries()) {
    const totalPosts = list.length;
    let activePosts = 0;
    let pendingPosts = 0;
    let removedPosts = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalInquiries = 0;
    let totalOrders = 0;
    let totalReach = 0;
    let totalScore = 0;

    for (const r of list) {
      const status = (r as any).postStatus || "active";
      if (status === "active") activePosts++;
      else if (status === "pending_approval") pendingPosts++;
      else if (status === "removed") removedPosts++;

      totalLikes += r.likes;
      totalComments += r.comments;
      totalShares += r.shares;
      totalInquiries += r.inquiries;
      totalOrders += r.orders;
      totalReach += r.reach;
      totalScore += engagementScore(r);
    }

    const avgScore = totalPosts > 0 ? Math.round((totalScore / totalPosts) * 10) / 10 : 0;
    const approvalRate = totalPosts > 0 ? Math.round((activePosts / totalPosts) * 100) : 100;

    result.push({
      group_name: list[0]?.channelName || "Nhóm Facebook",
      total_posts: totalPosts,
      active_posts: activePosts,
      pending_posts: pendingPosts,
      removed_posts: removedPosts,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_shares: totalShares,
      total_inquiries: totalInquiries,
      total_orders: totalOrders,
      total_reach: totalReach,
      avg_score: avgScore,
      approval_rate: approvalRate,
    });
  }

  // Sắp xếp nhóm có nhiều lượt đăng hoặc điểm cao nhất lên đầu
  result.sort((a, b) => b.total_posts - a.total_posts || b.avg_score - a.avg_score);

  return result;
}

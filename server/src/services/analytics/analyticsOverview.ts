import { engagementScore, type MetricRow, type AnalyticsOverviewData } from "./analyticsTypes";

/**
 * Tổng hợp toàn bộ các chỉ số KPI cao nhất cho màn hình Tổng quan
 */
export function buildAnalyticsOverview(
  rows: MetricRow[],
  distinctProductsCount: number,
  distinctDraftsCount: number,
): AnalyticsOverviewData {
  let totalReach = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalInquiries = 0;
  let totalOrders = 0;
  let totalScore = 0;
  let activePosts = 0;
  let pendingPosts = 0;
  let removedPosts = 0;
  let groupPosts = 0;
  let pagePosts = 0;
  let instagramPosts = 0;

  for (const r of rows) {
    totalReach += r.reach;
    totalLikes += r.likes;
    totalComments += r.comments;
    totalShares += r.shares;
    totalInquiries += r.inquiries;
    totalOrders += r.orders;
    totalScore += engagementScore(r);

    const st = (r as any).postStatus || "active";
    if (st === "active") activePosts++;
    else if (st === "pending_approval") pendingPosts++;
    else if (st === "removed") removedPosts++;

    if (r.channelType === "group") groupPosts++;
    else if (r.channelType === "page") pagePosts++;
    else if (r.channelType === "instagram") instagramPosts++;
  }

  return {
    total_products: distinctProductsCount,
    total_drafts: distinctDraftsCount,
    total_posts: rows.length,
    total_reach: totalReach,
    total_likes: totalLikes,
    total_comments: totalComments,
    total_shares: totalShares,
    total_inquiries: totalInquiries,
    total_orders: totalOrders,
    total_score: totalScore,
    active_posts: activePosts,
    pending_posts: pendingPosts,
    removed_posts: removedPosts,
    group_posts: groupPosts,
    page_posts: pagePosts,
    instagram_posts: instagramPosts,
  };
}

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { desc } from "drizzle-orm";
import * as schema from "../../schema";
import { dashboardFiltersInput, type DashboardFilters } from "./analyticsDashboardTypes";
import {
  computeDateWindow,
  computeWE,
  STANDARD_SLOTS,
  VIETNAM_TZ,
} from "./analyticsDashboardHelpers";
import {
  computeTopGroups,
  computeTopContent,
  computeHeatmapRows,
} from "./analyticsDashboardSections";

export async function buildEngagementDashboard(
  db: BunSQLiteDatabase<typeof schema>,
  rawFilters?: Partial<DashboardFilters>,
) {
  const filters = dashboardFiltersInput.parse(rawFilters ?? {});
  const [allMetrics, allGroups, allDrafts, allSnapshots, allSettings] = await Promise.all([
    db.select().from(schema.postMetrics).orderBy(desc(schema.postMetrics.postedAt)),
    db.select().from(schema.fbGroups),
    db.select().from(schema.drafts),
    db.select().from(schema.postMetricSnapshots).orderBy(desc(schema.postMetricSnapshots.capturedAt)),
    db.select().from(schema.appSettings),
  ]);

  const settingsMap = new Map(allSettings.map((s) => [s.key, s.value]));
  const defaultWr = Number(settingsMap.get("analytics_weight_reactions")) || 1;
  const defaultWc = Number(settingsMap.get("analytics_weight_comments")) || 3;
  const defaultWs = Number(settingsMap.get("analytics_weight_shares")) || 5;

  const wr = rawFilters?.reactionWeight ?? defaultWr;
  const wc = rawFilters?.commentWeight ?? defaultWc;
  const ws = rawFilters?.shareWeight ?? defaultWs;
  const window = computeDateWindow(filters);

  // Bộ lọc tùy chọn (Options)
  const groupOptions = allGroups.map((g) => ({ id: g.id, name: g.name }));
  const productSet = new Set<string>();
  for (const m of allMetrics) {
    if (m.productName) productSet.add(m.productName);
  }
  const variantOptions = allDrafts.map((d) => {
    const snippet = d.caption
      ? d.caption.replace(/\s+/g, " ").trim().slice(0, 45) + (d.caption.length > 45 ? "…" : "")
      : "";
    const tag = d.stt ? `Mã ${d.stt}` : `Bản #${d.id}`;
    const label = snippet ? `${tag}: "${snippet}"` : (d.sku || `${tag} - ${d.productName}`);
    return {
      id: d.id,
      label,
      productName: d.productName,
    };
  });

  const groupIds = Array.isArray(filters.groupIds) ? filters.groupIds : [];
  const productName = filters.productName || "";
  const contentVariantId = filters.contentVariantId || 0;
  const scanStatus = filters.scanStatus || "all";

  // Lọc tập bài đăng trong kỳ hiện tại
  const currentPosts = allMetrics.filter((m) => {
    const postTime = m.postedAt.getTime();
    if (postTime < window.startMs || postTime > window.endMs) return false;
    if (groupIds.length > 0) {
      const match = groupIds.some(
        (gid) => gid === m.channelId || allGroups.find((g) => g.id === gid)?.name === m.channelName,
      );
      if (!match) return false;
    }
    if (productName && m.productName !== productName) return false;
    if (contentVariantId > 0 && m.draftId !== contentVariantId) return false;

    if (scanStatus === "scanned") {
      if (!m.scannedAt || m.postStatus !== "active") return false;
    } else if (scanStatus === "not_scanned") {
      if (m.scannedAt !== null) return false;
    } else if (scanStatus === "partial") {
      if (m.postStatus !== "pending_approval") return false;
    } else if (scanStatus === "failed") {
      if (m.postStatus !== "removed") return false;
    }
    return true;
  });

  // Lọc tập bài đăng kỳ trước để tính tăng trưởng
  const prevPosts = allMetrics.filter((m) => {
    const postTime = m.postedAt.getTime();
    return postTime >= window.prevStartMs && postTime < window.prevEndMs;
  });

  // --- Section A: KPI Overview ---
  const totalPosts = currentPosts.length;
  const prevTotalPosts = prevPosts.length;
  const postsGrowthPct =
    prevTotalPosts > 0 ? Math.round(((totalPosts - prevTotalPosts) / prevTotalPosts) * 100) : null;

  const variantIds = new Set<number>();
  const groupNames = new Set<string>();
  let totalReactions = 0;
  let totalComments = 0;
  let totalShares = 0;
  let validMeasurablePosts = 0;
  let eligibleReachPosts = 0;
  let totalReach = 0;
  let engagementOnReachPosts = 0;

  for (const p of currentPosts) {
    if (p.draftId) variantIds.add(p.draftId);
    if (p.channelName) groupNames.add(p.channelName);
    totalReactions += p.likes;
    totalComments += p.comments;
    totalShares += p.shares;
    if (p.scannedAt) validMeasurablePosts++;
    if (p.reach > 0) {
      eligibleReachPosts++;
      totalReach += p.reach;
      engagementOnReachPosts += p.likes + p.comments + p.shares;
    }
  }

  const totalEngagement = totalReactions + totalComments + totalShares;
  let prevTotalEngagement = 0;
  for (const p of prevPosts) {
    prevTotalEngagement += p.likes + p.comments + p.shares;
  }
  const engagementGrowthPct =
    prevTotalEngagement > 0
      ? Math.round(((totalEngagement - prevTotalEngagement) / prevTotalEngagement) * 100)
      : null;

  const reachAvailable = eligibleReachPosts > 0;
  const engagementRate =
    reachAvailable && totalReach > 0
      ? Number(((engagementOnReachPosts / totalReach) * 100).toFixed(2))
      : null;

  const totalTrackedGroups = allGroups.length;
  const activeGroupsCount = groupNames.size;
  const inactiveGroupsCount = Math.max(0, totalTrackedGroups - activeGroupsCount);

  // --- Section B: Trend (Daily points) ---
  const dayBuckets = new Map<
    string,
    { reactions: number; comments: number; shares: number; total: number; weighted: number }
  >();
  const currDays = Math.ceil((window.endMs - window.startMs) / 86400000);
  for (let i = 0; i <= currDays; i++) {
    const d = new Date(window.startMs + i * 86400000);
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: VIETNAM_TZ }).format(d);
    dayBuckets.set(dateStr, { reactions: 0, comments: 0, shares: 0, total: 0, weighted: 0 });
  }

  for (const p of currentPosts) {
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: VIETNAM_TZ }).format(p.postedAt);
    const bucket = dayBuckets.get(dateStr);
    if (bucket) {
      bucket.reactions += p.likes;
      bucket.comments += p.comments;
      bucket.shares += p.shares;
      const t = p.likes + p.comments + p.shares;
      bucket.total += t;
      bucket.weighted += computeWE(p.likes, p.comments, p.shares, wr, wc, ws);
    }
  }

  const trendPoints = Array.from(dayBuckets.entries()).map(([date, val]) => ({
    date,
    reactions: val.reactions,
    comments: val.comments,
    shares: val.shares,
    totalEngagement: val.total,
    weightedEngagement: val.weighted,
    previousPeriodTotal: null as number | null,
  }));

  // --- Sections C, D, E ---
  const topGroupList = computeTopGroups(currentPosts, allGroups, wr, wc, ws);
  const topContentList = computeTopContent(currentPosts, allDrafts, wr, wc, ws);
  const heatmapRows = computeHeatmapRows(
    currentPosts,
    STANDARD_SLOTS,
    filters.heatmapView ?? "all_groups",
    topGroupList,
    wr,
    wc,
    ws,
  );

  // --- Section G: Recommendations ---
  const recommendations: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    evidence: string;
    confidence: "low" | "medium" | "high";
    actionTarget: string;
    actionLabel: string;
  }> = [];

  const topG = topGroupList[0];
  if (topG && topG.totalPosts >= 3) {
    recommendations.push({
      id: "rec_top_group",
      type: "top_group",
      title: `Nhóm nổi bật: "${topG.groupName}"`,
      description: `Nhóm đạt lượt tương tác bình quân cao nhất (${topG.avgEngagement} lượt/bài) với ${topG.totalPosts} bài đăng.`,
      evidence: `${topG.totalPosts} bài đo lường, tương tác TB: ${topG.avgEngagement} lượt/bài`,
      confidence: "high",
      actionTarget: "groups",
      actionLabel: "Xem nhóm",
    });
  }
  const topC = topContentList[0];
  if (topC) {
    recommendations.push({
      id: "rec_top_content",
      type: "top_content",
      title: `Nội dung dẫn đầu: ${topC.productName}`,
      description: `Phiên bản "${topC.variantLabel}" được đăng trên ${topC.groupsCount} nhóm với ${topC.avgEngagement} lượt tương tác trung bình mỗi bài.`,
      evidence: `${topC.postsCount} lượt đăng thực tế`,
      confidence: topC.postsCount >= 3 ? "high" : "low",
      actionTarget: "content",
      actionLabel: "Xem nội dung",
    });
  }
  const unscannedCount = allMetrics.filter((m) => m.scannedAt === null).length;
  if (unscannedCount > 0) {
    recommendations.push({
      id: "rec_unscanned",
      type: "unscanned",
      title: `Có ${unscannedCount} bài đăng chưa quét tương tác`,
      description: "Hãy mở Extension để quét tương tác cập nhật lượt Like, Bình luận và Chia sẻ thực tế.",
      evidence: `${unscannedCount} bài chưa có dữ liệu quét`,
      confidence: "high",
      actionTarget: "sync_scan",
      actionLabel: "Mở Đồng bộ & Quét",
    });
  }

  // --- Section H: Data Health & Sync Status ---
  const totalAllPosts = allMetrics.length;
  const scannedPosts = allMetrics.filter((m) => m.scannedAt !== null && m.postStatus === "active").length;
  const partialPosts = allMetrics.filter((m) => m.postStatus === "pending_approval").length;
  const failedPosts = allMetrics.filter((m) => m.postStatus === "removed").length;
  const unscannedPosts = allMetrics.filter((m) => m.scannedAt === null).length;
  let lastSuccessfulScan: string | null = null;
  for (const m of allMetrics) {
    if (m.scannedAt) {
      lastSuccessfulScan = m.scannedAt.toISOString();
      break;
    }
  }
  const scanCoveragePct = totalAllPosts > 0 ? Math.round((scannedPosts / totalAllPosts) * 100) : 0;

  return {
    lastUpdated: new Date().toISOString(),
    timezone: "Asia/Ho_Chi_Minh (UTC+7)",
    appliedFilters: filters,
    filterOptions: {
      groups: groupOptions,
      products: Array.from(productSet),
      variants: variantOptions,
    },
    kpis: {
      totalPosts,
      postsGrowthPct,
      uniqueVariants: variantIds.size,
      uniqueGroups: groupNames.size,
      totalEngagement,
      engagementGrowthPct,
      reactionsCount: totalReactions,
      commentsCount: totalComments,
      sharesCount: totalShares,
      validMeasurablePosts,
      engagementRate,
      engagementRateChangePp: null,
      eligibleReachPosts,
      reachAvailable,
      activeGroupsCount,
      totalTrackedGroups,
      inactiveGroupsCount,
    },
    trend: {
      points: trendPoints,
      mode: filters.trendMode ?? "cohort",
      hasGrowthData: allSnapshots.length > 1,
      startDate: window.startDateIso,
      endDate: window.endDateIso,
    },
    topGroups: { groups: topGroupList },
    topContent: { content: topContentList },
    bestPostingTime: {
      slots: STANDARD_SLOTS,
      rows: heatmapRows,
      view: filters.heatmapView ?? "all_groups",
    },
    scoring: {
      reactionWeight: wr,
      commentWeight: wc,
      shareWeight: ws,
      werAvailable: reachAvailable,
    },
    recommendations: { items: recommendations },
    dataHealth: {
      totalPosts: totalAllPosts,
      scannedPosts,
      unscannedPosts,
      partialPosts,
      failedPosts,
      lastSuccessfulScan,
      scanCoveragePct,
    },
  };
}

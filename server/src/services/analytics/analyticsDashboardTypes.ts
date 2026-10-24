import { z } from "@hatch/space-sdk";

export const dashboardFiltersInput = z.object({
  dateRangePreset: z.enum(["today", "7d", "30d", "90d", "custom"]).default("30d"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  groupIds: z.array(z.number()).default([]),
  productName: z.string().default(""),
  contentVariantId: z.number().default(0),
  scanStatus: z.enum(["all", "scanned", "not_scanned", "partial", "failed"]).default("all"),
  reactionWeight: z.number().default(1),
  commentWeight: z.number().default(3),
  shareWeight: z.number().default(5),
  trendMode: z.enum(["cohort", "growth"]).default("cohort"),
  heatmapView: z.enum(["all_groups", "by_group", "by_dow"]).default("all_groups"),
});

export type DashboardFilters = z.infer<typeof dashboardFiltersInput>;

export const kpiOverviewOut = z.object({
  totalPosts: z.number(),
  postsGrowthPct: z.number().nullable(),
  uniqueVariants: z.number(),
  uniqueGroups: z.number(),
  totalEngagement: z.number(),
  engagementGrowthPct: z.number().nullable(),
  reactionsCount: z.number(),
  commentsCount: z.number(),
  sharesCount: z.number(),
  validMeasurablePosts: z.number(),
  engagementRate: z.number().nullable(),
  engagementRateChangePp: z.number().nullable(),
  eligibleReachPosts: z.number(),
  reachAvailable: z.boolean(),
  activeGroupsCount: z.number(),
  totalTrackedGroups: z.number(),
  inactiveGroupsCount: z.number(),
});

export const trendPointOut = z.object({
  date: z.string(),
  reactions: z.number(),
  comments: z.number(),
  shares: z.number(),
  totalEngagement: z.number(),
  weightedEngagement: z.number(),
  previousPeriodTotal: z.number().nullable(),
});

export const engagementTrendOut = z.object({
  points: z.array(trendPointOut),
  mode: z.enum(["cohort", "growth"]),
  hasGrowthData: z.boolean(),
  startDate: z.string(),
  endDate: z.string(),
});

export const topGroupItemOut = z.object({
  rank: z.number(),
  groupId: z.number(),
  groupName: z.string(),
  totalPosts: z.number(),
  avgEngagement: z.number(),
  avgWeightedEngagement: z.number(),
  engagementRate: z.number().nullable(),
  bestSlot: z.string(),
  trendPct: z.number().nullable(),
  eligiblePostsCount: z.number(),
});

export const topGroupsOut = z.object({
  groups: z.array(topGroupItemOut),
});

export const topContentItemOut = z.object({
  draftId: z.number(),
  productName: z.string(),
  variantLabel: z.string(),
  thumbnail: z.string(),
  groupsCount: z.number(),
  postsCount: z.number(),
  avgEngagement: z.number(),
  avgWeightedEngagement: z.number(),
  bestGroupName: z.string(),
});

export const topContentOut = z.object({
  content: z.array(topContentItemOut),
});

export const heatmapCellItemOut = z.object({
  slot: z.string(),
  avgWeightedEngagement: z.number(),
  postsCount: z.number(),
  confidenceTier: z.enum(["none", "low", "medium", "high"]),
  label: z.string(),
});

export const heatmapRowItemOut = z.object({
  rowKey: z.string(),
  rowLabel: z.string(),
  cells: z.array(heatmapCellItemOut),
});

export const bestPostingTimeOut = z.object({
  slots: z.array(z.string()),
  rows: z.array(heatmapRowItemOut),
  view: z.enum(["all_groups", "by_group", "by_dow"]),
});

export const scoringSettingsOut = z.object({
  reactionWeight: z.number(),
  commentWeight: z.number(),
  shareWeight: z.number(),
  werAvailable: z.boolean(),
});

export const recommendationItemOut = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  evidence: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  actionTarget: z.string(),
  actionLabel: z.string(),
});

export const recommendationsOut = z.object({
  items: z.array(recommendationItemOut),
});

export const dataHealthOut = z.object({
  totalPosts: z.number(),
  scannedPosts: z.number(),
  unscannedPosts: z.number(),
  partialPosts: z.number(),
  failedPosts: z.number(),
  lastSuccessfulScan: z.string().nullable(),
  scanCoveragePct: z.number(),
});

export const engagementDashboardOut = z.object({
  lastUpdated: z.string(),
  timezone: z.string(),
  appliedFilters: dashboardFiltersInput,
  filterOptions: z.object({
    groups: z.array(z.object({ id: z.number(), name: z.string() })),
    products: z.array(z.string()),
    variants: z.array(z.object({ id: z.number(), label: z.string(), productName: z.string() })),
  }),
  kpis: kpiOverviewOut,
  trend: engagementTrendOut,
  topGroups: topGroupsOut,
  topContent: topContentOut,
  bestPostingTime: bestPostingTimeOut,
  scoring: scoringSettingsOut,
  recommendations: recommendationsOut,
  dataHealth: dataHealthOut,
});

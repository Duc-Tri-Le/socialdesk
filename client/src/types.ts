import { api, type ApiResponse } from "./api";

export type Overview = ApiResponse<typeof api, "getOverview">;
export type Account = Overview["accounts"][number];
export type Page = Overview["pages"][number];
export type SheetConfig = ApiResponse<typeof api, "getSheetConfig">;
export type SheetSource = SheetConfig["sources"][number];
export type Product = ApiResponse<typeof api, "listProducts">["products"][number];
export type Run = ApiResponse<typeof api, "listResearch">["runs"][number];
export type Group = ApiResponse<typeof api, "listGroups">["groups"][number];
export type ScannedGroup = ApiResponse<typeof api, "saveGroupLinks">["scanned"][number];
export type Draft = ApiResponse<typeof api, "listDrafts">["drafts"][number];
export type PublishRecord = Draft["publish_records"][number];
export type MediaItem = ApiResponse<typeof api, "listMedia">["media"][number];
export type Metric = ApiResponse<typeof api, "listPostMetrics">["metrics"][number];
export type Analytics = ApiResponse<typeof api, "getAnalytics">;
export type ChannelInsight = Analytics["channels"][number];
export type AnalyticsOverview = ApiResponse<typeof api, "getAnalyticsOverview">;
export type GroupPerformance = ApiResponse<typeof api, "getGroupAnalytics">["groups"][number];
export type ProductContentTree = ApiResponse<typeof api, "getProductContentTree">["products"][number];
export type GroupHeatmap = ApiResponse<typeof api, "getGroupSlotHeatmap">;
export type GroupHeatmapRow = GroupHeatmap["groups"][number];
export type HeatmapCell = GroupHeatmapRow["cells"][number];
export type EngagementDashboard = ApiResponse<typeof api, "getEngagementDashboard">;
export type DashboardKpis = EngagementDashboard["kpis"];
export type DashboardTrend = EngagementDashboard["trend"];
export type DashboardTopGroup = EngagementDashboard["topGroups"]["groups"][number];
export type DashboardTopContent = EngagementDashboard["topContent"]["content"][number];
export type DashboardHeatmapRow = EngagementDashboard["bestPostingTime"]["rows"][number];
export type DashboardRecommendation = EngagementDashboard["recommendations"]["items"][number];
export type DashboardDataHealth = EngagementDashboard["dataHealth"];
export type DashboardFilters = EngagementDashboard["appliedFilters"];


export type Tab =
  | "overview"
  | "accounts"
  | "products"
  | "research"
  | "groups"
  | "compose"
  | "queue"
  | "analytics"
  | "media";

export const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "accounts", label: "Tài khoản" },
  { id: "products", label: "Sản phẩm" },
  { id: "research", label: "Nghiên cứu" },
  { id: "groups", label: "Hội nhóm" },
  { id: "compose", label: "Soạn bài" },
  { id: "queue", label: "Hàng đợi" },
  { id: "analytics", label: "Phân tích" },
  { id: "media", label: "Ảnh/video" },
];

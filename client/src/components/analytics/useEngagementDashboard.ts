import { useState, useCallback, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import type { DashboardFilters, ProductContentTree } from "./analyticsTypes";

const DEFAULT_FILTERS: DashboardFilters = {
  dateRangePreset: "30d",
  groupIds: [],
  productName: "",
  contentVariantId: 0,
  scanStatus: "all",
  trendMode: "cohort",
  heatmapView: "all_groups",
  reactionWeight: 1,
  commentWeight: 3,
  shareWeight: 5,
};

interface UseEngagementDashboardProps {
  products?: ProductContentTree[];
  onFeedback?: (msg: { text: string; type: "success" | "error" | "info" }) => void;
}

export function useEngagementDashboard({
  products = [],
}: UseEngagementDashboardProps = {}) {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);

  // 1. Query danh sách nhóm Facebook để luôn có đủ nhóm cho bộ lọc
  const groupsListQ = useQuery({
    queryKey: ["groups-list-for-filters"],
    queryFn: () => api.listGroups({}),
  });

  // 2. Query dashboard analytics
  const dashboardQ = useQuery({
    queryKey: ["engagement-dashboard", filters],
    queryFn: () =>
      api.getEngagementDashboard({
        dateRangePreset: filters.dateRangePreset,
        startDate: filters.startDate,
        endDate: filters.endDate,
        groupIds: filters.groupIds,
        productName: filters.productName ?? "",
        contentVariantId: filters.contentVariantId ?? 0,
        scanStatus: filters.scanStatus,
        trendMode: filters.trendMode,
        heatmapView: filters.heatmapView,
        reactionWeight: filters.reactionWeight,
        commentWeight: filters.commentWeight,
        shareWeight: filters.shareWeight,
      }),
    placeholderData: keepPreviousData,
  });

  // 4. Trích xuất danh sách options cho bộ lọc toàn cục
  const filterOptions = useMemo(() => {
    const rawGroups = groupsListQ.data?.groups ?? [];
    const groupOpts = rawGroups.map((g: { id: number; name?: string }) => ({
      id: g.id,
      name: g.name || `Nhóm #${g.id}`,
    }));

    const prodNames = Array.from(
      new Set(products.map((p) => p.product_name).filter(Boolean)),
    ).sort();

    const variants: Array<{ id: number; label: string; productName: string }> = [];
    products.forEach((p) => {
      p.drafts?.forEach((d) => {
        const snippet = d.caption
          ? d.caption.replace(/\s+/g, " ").trim().slice(0, 45) + (d.caption.length > 45 ? "…" : "")
          : "";
        const tag = d.stt ? `Mã ${d.stt}` : `Bản #${d.draft_id}`;
        const label = snippet ? `${tag}: "${snippet}"` : `${tag} - Bản #${d.draft_id}`;

        variants.push({
          id: d.draft_id,
          label,
          productName: p.product_name,
        });
      });
    });

    return {
      groups: groupOpts,
      products: prodNames,
      variants,
    };
  }, [groupsListQ.data?.groups, products]);

  // 5. Các hàm thao tác
  const handleFilterChange = useCallback((updated: Partial<DashboardFilters>) => {
    setFilters((prev: DashboardFilters) => ({ ...prev, ...updated }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return {
    dashboard: dashboardQ.data,
    isDashboardLoading: dashboardQ.isLoading,
    isDashboardFetching: dashboardQ.isFetching,
    dashboardFilters: filters,
    setDashboardFilters: setFilters,
    filterOptions,
    onFilterChange: handleFilterChange,
    onResetFilters: handleResetFilters,
    refetchDashboard: dashboardQ.refetch,
  };
}

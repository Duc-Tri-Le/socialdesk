import { useState, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  onFeedback,
}: UseEngagementDashboardProps = {}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [isScoringModalOpen, setIsScoringModalOpen] = useState(false);

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
  });

  // 3. Cập nhật trọng số tương tác vào app_settings
  const updateWeightsMutation = useMutation({
    mutationFn: (weights: {
      reactionWeight: number;
      commentWeight: number;
      shareWeight: number;
    }) => api.updateAnalyticsWeights(weights),
    onSuccess: (res, variables) => {
      onFeedback?.({ text: res.message, type: "success" });
      setFilters((prev) => ({
        ...prev,
        reactionWeight: variables.reactionWeight,
        commentWeight: variables.commentWeight,
        shareWeight: variables.shareWeight,
      }));
      setIsScoringModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["engagement-dashboard"] });
    },
    onError: (err: any) => {
      onFeedback?.({
        text: err?.message || "Lỗi lưu cấu hình trọng số.",
        type: "error",
      });
    },
  });

  // 4. Trích xuất danh sách options cho bộ lọc toàn cục
  const filterOptions = useMemo(() => {
    const rawGroups = groupsListQ.data?.groups ?? [];
    const groupOpts = rawGroups.map((g) => ({
      id: g.id,
      name: g.name || `Nhóm #${g.id}`,
    }));

    const prodNames = Array.from(
      new Set(products.map((p) => p.product_name).filter(Boolean)),
    ).sort();

    const variants: Array<{ id: number; label: string; productName: string }> = [];
    products.forEach((p) => {
      p.drafts?.forEach((d) => {
        variants.push({
          id: d.draft_id,
          label: d.angle || d.caption || `Bản thảo #${d.draft_id}`,
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
    setFilters((prev) => ({ ...prev, ...updated }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const handleSaveWeights = useCallback(
    (weights: { reactionWeight: number; commentWeight: number; shareWeight: number }) => {
      updateWeightsMutation.mutate(weights);
    },
    [updateWeightsMutation],
  );

  return {
    dashboard: dashboardQ.data,
    isDashboardLoading: dashboardQ.isLoading,
    isDashboardFetching: dashboardQ.isFetching,
    dashboardFilters: filters,
    setDashboardFilters: setFilters,
    filterOptions,
    isScoringModalOpen,
    setIsScoringModalOpen,
    onFilterChange: handleFilterChange,
    onResetFilters: handleResetFilters,
    onSaveWeights: handleSaveWeights,
    isSavingWeights: updateWeightsMutation.isPending,
    refetchDashboard: dashboardQ.refetch,
  };
}

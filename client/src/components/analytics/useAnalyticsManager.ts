import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type {
  ChannelType,
  PostStatus,
  AnalyticsSubTab,
  QuickEditSalesData,
  AnalyticsFeedback,
  Metric,
} from "./analyticsTypes";
import { useEngagementDashboard } from "./useEngagementDashboard";

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  return fallback;
}

export function useAnalyticsManager() {
  const queryClient = useQueryClient();

  // 1. Quản lý Sub-Tab trong mục Phân tích (6 trang con chính)
  const [activeTab, setActiveTabState] = useState<AnalyticsSubTab>(() => {
    try {
      const saved = localStorage.getItem("socialdesk_analytics_subtab") as AnalyticsSubTab;
      if (
        saved &&
        ["overview", "ranking", "channels", "directives"].includes(saved)
      ) {
        return saved;
      }
    } catch {}
    return "overview";
  });

  const setActiveTab = (tab: AnalyticsSubTab) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem("socialdesk_analytics_subtab", tab);
    } catch {}
  };

  // 2. Trạng thái tải chỉ số cho toàn bộ màn hình phân tích (mặc định lấy 200 bản ghi để phân tích đầy đủ)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(200);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | ChannelType>("all");
  const [postStatusFilter, setPostStatusFilter] = useState<"all" | PostStatus>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [feedback, setFeedback] = useState<AnalyticsFeedback | null>(null);

  // 3. Tải dữ liệu các màn hình
  const overviewQ = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => api.getAnalyticsOverview({}),
  });

  const groupAnalyticsQ = useQuery({
    queryKey: ["analytics-groups"],
    queryFn: () => api.getGroupAnalytics({}),
  });

  const productTreeQ = useQuery({
    queryKey: ["analytics-product-tree"],
    queryFn: () => api.getProductContentTree({}),
  });

  const analyticsQ = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api.getAnalytics({}),
  });

  const heatmapQ = useQuery({
    queryKey: ["analytics-heatmap"],
    queryFn: () => api.getGroupSlotHeatmap({}),
  });

  const metricsQ = useQuery({
    queryKey: [
      "metrics",
      page,
      pageSize,
      channelFilter,
      postStatusFilter,
      searchKeyword,
      startDate,
      endDate,
    ],
    queryFn: () =>
      api.listPostMetrics({
        page,
        pageSize,
        channelType: channelFilter,
        postStatus: postStatusFilter,
        search: searchKeyword,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  // Truy vấn danh sách Chrome Extension đang Online
  const extensionsQ = useQuery({
    queryKey: ["online-extensions"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/extensions");
        if (!res.ok) return { online: [] as string[] };
        return (await res.json()) as { online: string[] };
      } catch {
        return { online: [] as string[] };
      }
    },
    refetchInterval: 10000,
  });

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["metrics"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-overview"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-groups"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-product-tree"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-heatmap"] });
    queryClient.invalidateQueries({ queryKey: ["engagement-dashboard"] });
  }, [queryClient]);

  const dashboardState = useEngagementDashboard({
    products: productTreeQ.data?.products,
    onFeedback: setFeedback,
  });

  // 4. Trạng thái sửa nhanh đơn / inbox trực tiếp
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSalesForm, setEditSalesForm] = useState<QuickEditSalesData>({
    id: 0,
    inquiries: 0,
    orders: 0,
    reach: 0,
    notes: "",
    post_url: "",
  });

  // 5. Các thao tác Mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: PostStatus }) =>
      api.updatePostStatus({ id, post_status: status }),
    onSuccess: () => {
      setFeedback({ text: "Đã cập nhật trạng thái bài Facebook.", type: "success" });
      refreshAll();
    },
    onError: (err: unknown) => {
      setFeedback({ text: getErrorMessage(err, "Lỗi cập nhật trạng thái."), type: "error" });
    },
  });

  const batchUpdateStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: PostStatus }) =>
      api.batchUpdatePostStatus({ ids, post_status: status }),
    onSuccess: (res: { updated_count?: number } | undefined) => {
      setFeedback({
        text: `Đã cập nhật trạng thái cho ${res?.updated_count ?? 0} bài đăng đã chọn.`,
        type: "success",
      });
      refreshAll();
    },
    onError: (err: unknown) => {
      setFeedback({ text: getErrorMessage(err, "Lỗi cập nhật trạng thái hàng loạt."), type: "error" });
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => api.batchDeletePostMetrics({ ids }),
    onSuccess: (res: { deleted_count?: number } | undefined) => {
      setFeedback({ text: `Đã xóa ${res?.deleted_count ?? 0} bài đăng đã chọn.`, type: "info" });
      refreshAll();
    },
    onError: (err: unknown) => {
      setFeedback({ text: getErrorMessage(err, "Lỗi xóa hàng loạt bài đăng."), type: "error" });
    },
  });

  const batchScanMutation = useMutation({
    mutationFn: (ids: number[]) => api.batchScanPostMetrics({ metric_ids: ids }),
    onSuccess: (res: { message?: string } | undefined) => {
      setFeedback({ text: res?.message ?? "Quét hàng loạt thành công.", type: "success" });
      refreshAll();
    },
    onError: (err: unknown) => {
      setFeedback({ text: getErrorMessage(err, "Lỗi quét hàng loạt qua Extension."), type: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deletePostMetric({ id }),
    onSuccess: () => {
      setFeedback({ text: "Đã xóa bài đăng khỏi danh sách.", type: "info" });
      refreshAll();
    },
    onError: (err: unknown) => {
      setFeedback({ text: getErrorMessage(err, "Lỗi khi xóa bài đăng."), type: "error" });
    },
  });

  const updateSalesMutation = useMutation({
    mutationFn: (data: QuickEditSalesData) =>
      api.updatePostMetricSales({
        id: data.id,
        inquiries: data.inquiries,
        orders: data.orders,
        reach: data.reach,
        notes: data.notes,
        post_url: data.post_url,
      }),
    onSuccess: () => {
      setFeedback({ text: "Đã cập nhật chỉ số bán hàng thành công!", type: "success" });
      setEditingId(null);
      refreshAll();
    },
    onError: (err: unknown) => {
      setFeedback({ text: getErrorMessage(err, "Lỗi cập nhật chỉ số bán hàng."), type: "error" });
    },
  });

  const syncPublishedMutation = useMutation({
    mutationFn: () => api.syncPublishedPostsToMetrics({}),
    onSuccess: (res: { message?: string } | undefined) => {
      setFeedback({ text: res?.message ?? "Đồng bộ bài đăng thành công.", type: "success" });
      refreshAll();
    },
    onError: (err: unknown) => {
      setFeedback({
        text: getErrorMessage(err, "Không thể đồng bộ bài đăng từ Hàng đợi."),
        type: "error",
      });
    },
  });

  const scanExtensionMutation = useMutation({
    mutationFn: (metricId?: number | void) =>
      api.scanPostMetricsViaExtension({
        metric_id: typeof metricId === "number" ? metricId : undefined,
      }),
    onSuccess: (res: { updated_count?: number; message?: string } | undefined) => {
      const updatedCount = res?.updated_count ?? 0;
      setFeedback({
        text: res?.message ?? "Quét chỉ số bài đăng hoàn tất.",
        type: updatedCount > 0 ? "success" : "info",
      });
      refreshAll();
    },
    onError: (err: unknown) => {
      setFeedback({
        text: getErrorMessage(err, "Lỗi khi quét tương tác qua Extension."),
        type: "error",
      });
    },
  });

  // Trình xử lý sự kiện
  const handlePageChange = useCallback((p: number) => setPage(p), []);
  const handlePageSizeChange = useCallback((sz: number) => { setPageSize(sz); setPage(1); }, []);
  const handleSearchChange = useCallback((kw: string) => { setSearchKeyword(kw); setPage(1); }, []);
  const handleChannelFilterChange = useCallback((ch: "all" | ChannelType) => { setChannelFilter(ch); setPage(1); }, []);
  const handlePostStatusFilterChange = useCallback((st: "all" | PostStatus) => { setPostStatusFilter(st); setPage(1); }, []);
  const handleStartDateChange = useCallback((d: string) => { setStartDate(d); setPage(1); }, []);
  const handleEndDateChange = useCallback((d: string) => { setEndDate(d); setPage(1); }, []);

  const startEditSales = useCallback((m: Metric) => {
    setEditingId(m.id);
    setEditSalesForm({
      id: m.id,
      inquiries: m.inquiries,
      orders: m.orders,
      reach: m.reach,
      notes: m.notes,
      post_url: m.post_url || "",
    });
  }, []);

  const cancelEditSales = useCallback(() => setEditingId(null), []);
  const saveEditSales = useCallback(() => updateSalesMutation.mutate(editSalesForm), [updateSalesMutation, editSalesForm]);
  const syncPublished = useCallback(() => syncPublishedMutation.mutate(), [syncPublishedMutation]);
  const scanAllPosts = useCallback(() => scanExtensionMutation.mutate(undefined), [scanExtensionMutation]);
  const scanSingleMetric = useCallback((id: number) => scanExtensionMutation.mutate(id), [scanExtensionMutation]);

  const deleteMetric = useCallback((id: number) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa bản ghi bài đăng này?")) {
      deleteMutation.mutate(id);
    }
  }, [deleteMutation]);

  const updateStatus = useCallback((id: number, status: PostStatus) => {
    updateStatusMutation.mutate({ id, status });
  }, [updateStatusMutation]);

  const batchScan = useCallback((ids: number[]) => batchScanMutation.mutate(ids), [batchScanMutation]);
  const batchUpdateStatus = useCallback((ids: number[], status: PostStatus) => batchUpdateStatusMutation.mutate({ ids, status }), [batchUpdateStatusMutation]);
  const batchDelete = useCallback((ids: number[]) => batchDeleteMutation.mutate(ids), [batchDeleteMutation]);

  return {
    // Dashboard state & filters
    ...dashboardState,
    refreshAll,

    // Navigation
    activeTab,
    setActiveTab,

    // Queries
    overviewQ,
    groupAnalyticsQ,
    productTreeQ,
    metricsQ,
    analyticsQ,
    heatmapQ,
    extensionsQ,
    onlineExtensionCodes: extensionsQ.data?.online ?? [],

    // Data shortcuts
    overview: overviewQ.data,
    groups: groupAnalyticsQ.data?.groups ?? [],
    products: productTreeQ.data?.products ?? [],
    metrics: metricsQ.data?.metrics ?? [],
    total: metricsQ.data?.total ?? 0,
    page: metricsQ.data?.page ?? 1,
    pageSize: metricsQ.data?.pageSize ?? 10,
    totalPages: metricsQ.data?.totalPages ?? 1,
    analytics: analyticsQ.data,
    heatmap: heatmapQ.data,
    isHeatmapLoading: heatmapQ.isPending,

    // Filters
    searchKeyword,
    onSearchChange: handleSearchChange,
    channelFilter,
    onChannelFilterChange: handleChannelFilterChange,
    postStatusFilter,
    onPostStatusFilterChange: handlePostStatusFilterChange,
    startDate,
    onStartDateChange: handleStartDateChange,
    endDate,
    onEndDateChange: handleEndDateChange,
    onPageChange: handlePageChange,
    onPageSizeChange: handlePageSizeChange,

    // Feedback
    feedback,
    setFeedback,

    // Inline Sales Edit
    editingId,
    editSalesForm,
    setEditSalesForm,
    startEditSales,
    cancelEditSales,
    saveEditSales,
    isSavingSales: updateSalesMutation.isPending,

    // Operations
    deleteMetric,
    updateStatus,
    syncPublished,
    isSyncing: syncPublishedMutation.isPending,
    scanAllPosts,
    isScanning: scanExtensionMutation.isPending,
    scanSingleMetric,
    batchScan,
    isBatchScanning: batchScanMutation.isPending,
    batchUpdateStatus,
    batchDelete,
  };
}

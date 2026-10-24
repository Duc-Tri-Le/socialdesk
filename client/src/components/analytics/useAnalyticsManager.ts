import { useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type {
  ChannelType,
  QuickEditSalesData,
  AnalyticsFeedback,
  Metric,
} from "./analyticsTypes";
import { usePagination } from "../ui/Pagination";

export function useAnalyticsManager() {
  const queryClient = useQueryClient();

  // 1. Tải dữ liệu chỉ số & phân tích từ máy chủ
  const metricsQ = useQuery({
    queryKey: ["metrics"],
    queryFn: () => api.listPostMetrics({}),
  });
  const analyticsQ = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api.getAnalytics({}),
  });

  // 2. Trạng thái Bộ lọc & Phản hồi
  const [feedback, setFeedback] = useState<AnalyticsFeedback | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | ChannelType>("all");

  // Trạng thái sửa nhanh đơn / inbox trực tiếp
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSalesForm, setEditSalesForm] = useState<QuickEditSalesData>({
    id: 0,
    inquiries: 0,
    orders: 0,
    reach: 0,
    notes: "",
    post_url: "",
  });

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["metrics"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  }, [queryClient]);

  // 3. Các thao tác Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deletePostMetric({ id }),
    onSuccess: () => {
      setFeedback({ text: "Đã xóa bản ghi chỉ số.", type: "info" });
      refreshAll();
    },
    onError: (err: any) => {
      setFeedback({ text: err?.message || "Lỗi khi xóa chỉ số.", type: "error" });
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
      setFeedback({
        text: "Đã cập nhật chỉ số kinh doanh và tính lại điểm tương tác thành công!",
        type: "success",
      });
      setEditingId(null);
      refreshAll();
    },
    onError: (err: any) => {
      setFeedback({
        text: err?.message || "Không lưu được chỉ số sửa nhanh.",
        type: "error",
      });
    },
  });

  const syncPublishedMutation = useMutation({
    mutationFn: () => api.syncPublishedPostsToMetrics({}),
    onSuccess: (res) => {
      setFeedback({
        text: res.message,
        type: "success",
      });
      refreshAll();
    },
    onError: (err: any) => {
      setFeedback({
        text: err?.message || "Không thể đồng bộ bài đăng từ Hàng đợi.",
        type: "error",
      });
    },
  });

  const scanExtensionMutation = useMutation({
    mutationFn: (metricId?: number | void) =>
      api.scanPostMetricsViaExtension({
        metric_id: typeof metricId === "number" ? metricId : undefined,
      }),
    onSuccess: (res) => {
      setFeedback({
        text: res.message,
        type: res.updated_count > 0 ? "success" : "info",
      });
      refreshAll();
    },
    onError: (err: any) => {
      setFeedback({
        text: err?.message || "Lỗi khi quét chỉ số qua Extension.",
        type: "error",
      });
    },
  });

  // 4. Lọc danh sách bài đã đo & phân trang
  const rawMetrics = metricsQ.data?.metrics ?? [];
  const filteredMetrics = useMemo(() => {
    return rawMetrics.filter((m) => {
      if (channelFilter !== "all" && m.channel_type !== channelFilter) {
        return false;
      }
      if (!searchKeyword.trim()) return true;
      const kw = searchKeyword.trim().toLowerCase();
      return (
        m.channel_name.toLowerCase().includes(kw) ||
        m.product_name.toLowerCase().includes(kw) ||
        m.stt.toLowerCase().includes(kw) ||
        m.notes.toLowerCase().includes(kw) ||
        m.hour_slot.toLowerCase().includes(kw)
      );
    });
  }, [rawMetrics, channelFilter, searchKeyword]);

  // Phân trang chuẩn với hook usePagination (10 bài/trang)
  const pagination = usePagination(filteredMetrics, { pageSize: 10, initialPage: 1 });

  // 5. Trình xử lý sự kiện
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

  const cancelEditSales = useCallback(() => {
    setEditingId(null);
  }, []);

  const saveEditSales = useCallback(() => {
    updateSalesMutation.mutate(editSalesForm);
  }, [updateSalesMutation, editSalesForm]);

  const syncPublished = useCallback(() => {
    syncPublishedMutation.mutate();
  }, [syncPublishedMutation]);

  const scanAllPosts = useCallback(() => {
    scanExtensionMutation.mutate(undefined);
  }, [scanExtensionMutation]);

  const scanSingleMetric = useCallback(
    (id: number) => {
      scanExtensionMutation.mutate(id);
    },
    [scanExtensionMutation],
  );

  const deleteMetric = useCallback(
    (id: number) => {
      if (window.confirm("Bạn có chắc chắn muốn xóa bản ghi chỉ số bài này không?")) {
        deleteMutation.mutate(id);
      }
    },
    [deleteMutation],
  );

  return {
    // Queries
    metricsQ,
    analyticsQ,
    analytics: analyticsQ.data,
    totalPosts: rawMetrics.length,

    // Feedback
    feedback,
    setFeedback,

    // Filtering & Pagination
    searchKeyword,
    setSearchKeyword,
    channelFilter,
    setChannelFilter,
    pagination,

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
    isDeleting: deleteMutation.isPending,
    syncPublished,
    isSyncing: syncPublishedMutation.isPending,
    scanAllPosts,
    isScanning: scanExtensionMutation.isPending,
    scanSingleMetric,
  };
}

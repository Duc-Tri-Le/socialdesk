import { useState, useMemo, useCallback, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type {
  ChannelOption,
  ChannelType,
  ManualMetricFormData,
  QuickEditSalesData,
  AnalyticsFeedback,
  Metric,
} from "./analyticsTypes";
import { usePagination } from "../ui/Pagination";

const INITIAL_FORM: ManualMetricFormData = {
  channel_type: "group",
  channel_key: "",
  media_kind: "image",
  draft_key: "",
  posted_at: "",
  reach: "",
  likes: "",
  comments: "",
  shares: "",
  clicks: "",
  inquiries: "",
  orders: "",
  notes: "",
  post_url: "",
};

export function useAnalyticsManager() {
  const queryClient = useQueryClient();

  // 1. Tải dữ liệu từ máy chủ
  const metricsQ = useQuery({
    queryKey: ["metrics"],
    queryFn: () => api.listPostMetrics({}),
  });
  const analyticsQ = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api.getAnalytics({}),
  });
  const groupsQ = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.listGroups({}),
  });
  const pagesQ = useQuery({
    queryKey: ["pages"],
    queryFn: () => api.listPages({}),
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts({}),
  });
  const draftsQ = useQuery({
    queryKey: ["drafts"],
    queryFn: () => api.listDrafts({}),
  });

  // 2. Trạng thái Form & Bộ lọc
  const [form, setForm] = useState<ManualMetricFormData>(INITIAL_FORM);
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
  const addMutation = useMutation({
    mutationFn: () => {
      const [cidRaw, ...nameParts] = form.channel_key.split("|");
      const channel_id = Number(cidRaw || 0);
      const channel_name = nameParts.join("|");
      const draft = (draftsQ.data?.drafts ?? []).find(
        (d) => String(d.id) === form.draft_key,
      );
      return api.addPostMetric({
        draft_id: draft?.id,
        product_name: draft?.product_name ?? "",
        stt: draft?.stt ?? "",
        channel_type: form.channel_type,
        channel_id,
        channel_name,
        media_kind: form.media_kind,
        posted_at: new Date(
          `${form.posted_at.length === 16 ? `${form.posted_at}:00` : form.posted_at}+07:00`,
        ).toISOString(),
        reach: Number(form.reach || 0),
        likes: Number(form.likes || 0),
        comments: Number(form.comments || 0),
        shares: Number(form.shares || 0),
        clicks: Number(form.clicks || 0),
        inquiries: Number(form.inquiries || 0),
        orders: Number(form.orders || 0),
        notes: form.notes,
        post_url: form.post_url,
      });
    },
    onSuccess: (res) => {
      setFeedback({
        text: `Đã ghi nhận chỉ số — bài thuộc khung ${res.hour_slot} (giờ VN). Khung giờ tối ưu đã cập nhật!`,
        type: "success",
      });
      setForm((prev) => ({
        ...INITIAL_FORM,
        channel_type: prev.channel_type,
        channel_key: prev.channel_key,
        media_kind: prev.media_kind,
      }));
      refreshAll();
    },
    onError: (err: any) => {
      setFeedback({
        text: err?.message || "Không ghi được chỉ số — vui lòng kiểm tra lại kênh và thời gian đăng.",
        type: "error",
      });
    },
  });

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

  // 4. Danh sách kênh tùy theo loại
  const channelOptions: ChannelOption[] = useMemo(() => {
    if (form.channel_type === "group") {
      return (groupsQ.data?.groups ?? []).map((g) => ({
        key: `${g.id}|${g.name}`,
        label: g.name,
      }));
    }
    if (form.channel_type === "page") {
      return (pagesQ.data?.pages ?? []).map((p) => ({
        key: `${p.id}|${p.name}`,
        label: `Page ${p.name}`,
      }));
    }
    return (accountsQ.data?.accounts ?? [])
      .filter((a) => a.platform === "Instagram" && a.linked)
      .map((a) => ({
        key: `${a.id}|${a.name}`,
        label: `Instagram ${a.name}`,
      }));
  }, [form.channel_type, groupsQ.data, pagesQ.data, accountsQ.data]);

  const packedDrafts = useMemo(
    () =>
      (draftsQ.data?.drafts ?? []).filter(
        (d) => d.status === "packed" || d.status === "approved",
      ),
    [draftsQ.data?.drafts],
  );

  // 5. Lọc danh sách bài đã đo
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

  // 6. Trình xử lý sự kiện
  const handleFormSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!form.channel_key) {
        setFeedback({
          text: "Vui lòng chọn kênh đã đăng (hội nhóm, fanpage hoặc Instagram).",
          type: "error",
        });
        return;
      }
      if (!form.posted_at) {
        setFeedback({
          text: "Vui lòng nhập thời gian đã đăng bài.",
          type: "error",
        });
        return;
      }
      addMutation.mutate();
    },
    [form, addMutation],
  );

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
    groupsQ,
    pagesQ,
    accountsQ,
    draftsQ,
    analytics: analyticsQ.data,
    totalPosts: rawMetrics.length,

    // Form
    form,
    setForm,
    channelOptions,
    packedDrafts,
    handleFormSubmit,
    isAdding: addMutation.isPending,

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

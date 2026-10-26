import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Draft } from "../../types";
import { useComposeJobs } from "../../context/ComposeJobsContext";

export function useQueueMutations({
  onPublishSuccess,
  onApproveSuccess,
  onUnapproveSuccess,
}: {
  onPublishSuccess?: () => void;
  onApproveSuccess?: () => void;
  onUnapproveSuccess?: () => void;
} = {}) {
  const queryClient = useQueryClient();
  const composeJobs = useComposeJobs();
  const [feedback, setFeedback] = useState<Record<number, { ok: boolean; text: string }>>({});

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["drafts"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const setMainAccount = useMutation({
    mutationFn: (args: { id: number; selected: boolean }) => api.setAccountSelected(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const approve = useMutation({
    mutationFn: (id: number) => api.approveDraft({ id }),
    onSuccess: (res, id) => {
      setFeedback((f) => ({ ...f, [id]: { ok: res.ok, text: res.message } }));
      if (res.ok) {
        onApproveSuccess?.();
      }
      refresh();
    },
  });

  const unapprove = useMutation({
    mutationFn: (id: number) => api.unapproveDraft({ id }),
    onSuccess: (res, id) => {
      setFeedback((f) => ({ ...f, [id]: { ok: res.ok, text: res.message } }));
      if (res.ok) {
        onUnapproveSuccess?.();
      }
      refresh();
    },
    onError: (err, id) => {
      setFeedback((f) => ({
        ...f,
        [id]: {
          ok: false,
          text: `Mở khóa duyệt thất bại: ${
            err instanceof Error ? err.message : "lỗi không rõ"
          }`,
        },
      }));
    },
  });

  const update = useMutation({
    mutationFn: (args: { id: number; caption: string }) => api.updateDraft(args),
    onSuccess: (res, args) => {
      setFeedback((f) => ({
        ...f,
        [args.id]: {
          ok: res.ok,
          text: res.ok ? "Đã lưu nội dung." : res.error,
        },
      }));
      refresh();
    },
  });

  const pack = useMutation({
    mutationFn: (args: {
      id: number;
      group_ids?: number[];
      page_ids?: number[];
      instagram_account_ids?: number[];
      account_ids?: number[];
    }) =>
      api.buildPack({
        id: args.id,
        group_ids: args.group_ids ?? [],
        page_ids: args.page_ids ?? [],
        instagram_account_ids: args.instagram_account_ids ?? [],
        account_ids: args.account_ids ?? [],
      }),
    onSuccess: (res, args) => {
      setFeedback((f) => ({ ...f, [args.id]: { ok: res.ok, text: res.message } }));
      refresh();
    },
    onError: (err, args) => {
      setFeedback((f) => ({
        ...f,
        [args.id]: {
          ok: false,
          text: `Cập nhật gói đăng thất bại: ${
            err instanceof Error ? err.message : "lỗi không rõ"
          }`,
        },
      }));
    },
  });

  const saveTargets = useMutation({
    mutationFn: (args: {
      id: number;
      group_ids?: number[];
      page_ids?: number[];
      instagram_account_ids?: number[];
      account_ids?: number[];
    }) =>
      api.saveDraftTargets({
        id: args.id,
        group_ids: args.group_ids ?? [],
        page_ids: args.page_ids ?? [],
        instagram_account_ids: args.instagram_account_ids ?? [],
        account_ids: args.account_ids ?? [],
      }),
    onSuccess: (res, args) => {
      if (!res.ok) {
        setFeedback((f) => ({ ...f, [args.id]: { ok: false, text: res.message } }));
      }
      refresh();
    },
    onError: (err, args) => {
      setFeedback((f) => ({
        ...f,
        [args.id]: {
          ok: false,
          text: `Lưu đích đăng thất bại: ${
            err instanceof Error ? err.message : "lỗi không rõ"
          }`,
        },
      }));
    },
  });

  const publish = useMutation({
    mutationFn: (args: {
      id: number;
      group_ids: number[];
      page_ids: number[];
      instagram_account_ids: number[];
      account_ids?: number[];
    }) => api.publishDraft({ ...args, account_ids: args.account_ids ?? [] }),
    onSuccess: (res, args) => {
      setFeedback((f) => ({ ...f, [args.id]: { ok: res.ok, text: res.message } }));
      if (res.ok && res.results.some((r) => r.status === "published")) {
        onPublishSuccess?.();
      }
      refresh();
    },
    onError: (err, args) => {
      setFeedback((f) => ({
        ...f,
        [args.id]: {
          ok: false,
          text: `Đăng Bài không chạy được: ${
            err instanceof Error ? err.message : "lỗi không rõ"
          } — kiểm tra đích đăng trước khi thử lại để tránh trùng.`,
        },
      }));
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteDraft({ id }),
    onSuccess: refresh,
  });

  const schedule = useMutation({
    mutationFn: (args: {
      id: number;
      scheduled_at: string;
      group_ids?: number[];
      page_ids?: number[];
      instagram_account_ids?: number[];
      account_ids?: number[];
    }) =>
      api.scheduleDraft({
        id: args.id,
        scheduled_at: args.scheduled_at,
        group_ids: args.group_ids ?? [],
        page_ids: args.page_ids ?? [],
        instagram_account_ids: args.instagram_account_ids ?? [],
        account_ids: args.account_ids ?? [],
      }),
    onSuccess: (res, args) => {
      setFeedback((f) => ({ ...f, [args.id]: { ok: res.ok, text: res.message } }));
      refresh();
    },
    onError: (err, args) => {
      setFeedback((f) => ({
        ...f,
        [args.id]: {
          ok: false,
          text: `Lên lịch thất bại: ${err instanceof Error ? err.message : "lỗi không rõ"}`,
        },
      }));
    },
  });

  const cancelSchedule = useMutation({
    mutationFn: (id: number) => api.cancelDraftSchedule({ id }),
    onSuccess: (res, id) => {
      setFeedback((f) => ({ ...f, [id]: { ok: res.ok, text: res.message } }));
      refresh();
    },
    onError: (err, id) => {
      setFeedback((f) => ({
        ...f,
        [id]: {
          ok: false,
          text: `Hủy lịch thất bại: ${err instanceof Error ? err.message : "lỗi không rõ"}`,
        },
      }));
    },
  });

  const enqueueRewrite = (d: Draft) => {
    composeJobs.enqueue({
      kind: "rewrite",
      draftId: d.id,
      label: d.product_name,
      run: async () => {
        const res = await api.rewriteDraft({ id: d.id });
        if (!res.ok) throw new Error(res.message);
        return res;
      },
      onDone: (result) => {
        const res = result as { ok: boolean; message: string };
        setFeedback((f) => ({ ...f, [d.id]: { ok: true, text: res.message } }));
        refresh();
      },
      onError: (message) => {
        setFeedback((f) => ({
          ...f,
          [d.id]: { ok: false, text: `Không viết lại được: ${message}` },
        }));
      },
    });
    setFeedback((f) => ({
      ...f,
      [d.id]: {
        ok: true,
        text: "Đã đưa bài vào hàng đợi viết lại — theo dõi ở vòng tròn tiến trình.",
      },
    }));
  };

  return {
    feedback,
    setFeedback,
    setMainAccount,
    approve,
    unapprove,
    update,
    pack,
    saveTargets,
    publish,
    schedule,
    cancelSchedule,
    del,
    enqueueRewrite,
  };
}

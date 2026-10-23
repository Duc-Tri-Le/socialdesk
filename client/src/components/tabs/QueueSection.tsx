import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Draft } from "../../types";
import { btnGhost } from "../../utils/styles";
import { useComposeJobs } from "../../context/ComposeJobsContext";
import { QueueDraftCard } from "../queue/QueueDraftCard";
import { QueueHistoryCard } from "../queue/QueueHistoryCard";

export function QueueSection({
  drafts,
  loading,
  onGoGroups,
  onGoMedia,
}: {
  drafts: Draft[];
  loading: boolean;
  onGoGroups: () => void;
  onGoMedia: () => void;
}) {
  const queryClient = useQueryClient();
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => api.listGroups({}) });
  const pagesQ = useQuery({ queryKey: ["pages"], queryFn: () => api.listPages({}) });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api.listAccounts({}) });

  const [feedback, setFeedback] = useState<Record<number, { ok: boolean; text: string }>>({});

  const QUEUE_PAGE_SIZE = 5;
  type QueueTab = "draft" | "ready" | "history";
  const [queueTab, setQueueTab] = useState<QueueTab>("draft");
  const [queuePage, setQueuePage] = useState<Record<QueueTab, number>>({
    draft: 1,
    ready: 1,
    history: 1,
  });

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
        setQueueTab("ready");
        setQueuePage((s) => ({ ...s, ready: 1 }));
      }
      refresh();
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
      group_ids: number[];
      page_ids: number[];
      instagram_account_ids: number[];
    }) => api.buildPack(args),
    onSuccess: (res, args) => {
      setFeedback((f) => ({ ...f, [args.id]: { ok: res.ok, text: res.message } }));
      refresh();
    },
  });

  const saveTargets = useMutation({
    mutationFn: (args: {
      id: number;
      group_ids: number[];
      page_ids: number[];
      instagram_account_ids: number[];
    }) => api.saveDraftTargets(args),
    onSuccess: (res, args) => {
      if (!res.ok) {
        setFeedback((f) => ({ ...f, [args.id]: { ok: false, text: res.message } }));
      }
      refresh();
    },
  });

  const publish = useMutation({
    mutationFn: (args: {
      id: number;
      group_ids: number[];
      page_ids: number[];
      instagram_account_ids: number[];
    }) => api.publishDraft(args),
    onSuccess: (res, args) => {
      setFeedback((f) => ({ ...f, [args.id]: { ok: res.ok, text: res.message } }));
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

  const composeJobs = useComposeJobs();
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

  const joinedGroups = (groups.data?.groups ?? []).filter(
    (g) => g.account_joined || g.joined_pages.length > 0,
  );
  const allPages = pagesQ.data?.pages ?? [];
  const igAccounts = (accountsQ.data?.accounts ?? []).filter(
    (a) => a.platform === "Instagram" && a.linked,
  );
  const mainAccounts = (accountsQ.data?.accounts ?? []).filter(
    (a) => a.platform === "Facebook" && a.linked,
  );
  const selectedMainCount = mainAccounts.filter((a) => a.selected).length;

  const queueTabs: {
    id: QueueTab;
    label: string;
    emptyText: string;
    ariaLabel: string;
    matches: (d: Draft) => boolean;
  }[] = [
    {
      id: "draft",
      label: "Chờ duyệt",
      emptyText: "Không có bản nháp nào đang chờ duyệt.",
      ariaLabel: "Chờ duyệt",
      matches: (d) => d.status === "draft",
    },
    {
      id: "ready",
      label: "Đã duyệt",
      emptyText: "Chưa có bài nào đã duyệt.",
      ariaLabel: "Đã duyệt",
      matches: (d) => d.status === "approved" || d.status === "packed",
    },
    {
      id: "history",
      label: "Lịch sử bài đăng",
      emptyText:
        "Chưa có bài nào đã đăng. Bài sẽ hiện ở đây sau khi đăng thành công lên ít nhất một đích ở trang “Đã duyệt”.",
      ariaLabel: "Lịch sử bài đăng",
      matches: (d) => d.publish_records.some((r) => r.status === "published"),
    },
  ];

  const activeTabDef = queueTabs.find((t) => t.id === queueTab) ?? queueTabs[0]!;

  const listForTab = (t: (typeof queueTabs)[number]) => {
    const filtered = drafts.filter((d) => t.matches(d));
    if (t.id !== "history") return filtered;
    const latestAt = (d: Draft) =>
      Math.max(
        0,
        ...d.publish_records
          .filter((r) => r.status === "published")
          .map((r) => new Date(r.created_at).getTime()),
      );
    return [...filtered].sort((a, b) => latestAt(b) - latestAt(a));
  };

  const activeList = listForTab(activeTabDef);
  const totalPages = Math.max(1, Math.ceil(activeList.length / QUEUE_PAGE_SIZE));
  const currentPage = Math.min(queuePage[queueTab], totalPages);
  const pageStart = (currentPage - 1) * QUEUE_PAGE_SIZE;
  const pagedList = activeList.slice(pageStart, pageStart + QUEUE_PAGE_SIZE);

  const setPageForTab = (tab: QueueTab, page: number) =>
    setQueuePage((s) => ({ ...s, [tab]: page }));

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div role="tablist" aria-label="Các trang Hàng đợi" className="flex flex-wrap gap-2">
        {queueTabs.map((t) => {
          const count = listForTab(t).length;
          const active = queueTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              aria-label={`${t.label} (${count} bài)`}
              onClick={() => setQueueTab(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              }`}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Main Section Content */}
      <section aria-label={activeTabDef.ariaLabel}>
        <h2 className="text-lg font-bold">
          {`${activeTabDef.label} (${activeList.length})`}
        </h2>

        {loading && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>}

        <ul className="mt-3 space-y-3">
          {queueTab === "history"
            ? pagedList.map((d) => (
                <QueueHistoryCard
                  key={d.id}
                  draft={d}
                  onDelete={(id) => del.mutate(id)}
                  isDeletePending={del.isPending}
                />
              ))
            : pagedList.map((d) => (
                <QueueDraftCard
                  key={d.id}
                  draft={d}
                  feedback={feedback[d.id]}
                  joinedGroups={joinedGroups}
                  allPages={allPages}
                  igAccounts={igAccounts}
                  mainAccounts={mainAccounts}
                  selectedMainCount={selectedMainCount}
                  onToggleMainAccount={(id, selected) =>
                    setMainAccount.mutate({ id, selected })
                  }
                  isMainAccountPending={setMainAccount.isPending}
                  onGoGroups={onGoGroups}
                  onGoMedia={onGoMedia}
                  onApprove={(id) => approve.mutate(id)}
                  isApprovePending={approve.isPending}
                  onUpdateCaption={(args) => update.mutate(args)}
                  isUpdatePending={update.isPending}
                  onPack={(args) => pack.mutate(args)}
                  isPackPending={pack.isPending}
                  onPublish={(args) => publish.mutate(args)}
                  isPublishPending={publish.isPending}
                  onDelete={(id) => del.mutate(id)}
                  onRewrite={enqueueRewrite}
                  onSaveTargets={(args) => saveTargets.mutate(args)}
                />
              ))}
        </ul>

        {!loading && activeList.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">{activeTabDef.emptyText}</p>
        )}

        {/* Phân trang */}
        {activeList.length > 0 && (
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
            aria-label={`Phân trang ${activeTabDef.label}`}
          >
            <p className="text-xs text-[var(--dim)]">
              Trang {currentPage}/{totalPages} — hiển thị {pagedList.length} / {activeList.length} bài (tối đa {QUEUE_PAGE_SIZE} bài/trang)
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={btnGhost}
                disabled={currentPage <= 1}
                aria-label={`Trang trước — ${activeTabDef.label}`}
                onClick={() => setPageForTab(queueTab, currentPage - 1)}
              >
                ‹ Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  aria-label={`Trang ${p} — ${activeTabDef.label}`}
                  aria-current={p === currentPage ? "page" : undefined}
                  onClick={() => setPageForTab(queueTab, p)}
                  className={`min-w-9 rounded-[var(--radius)] px-2 py-2 text-sm font-semibold ${
                    p === currentPage
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                className={btnGhost}
                disabled={currentPage >= totalPages}
                aria-label={`Trang sau — ${activeTabDef.label}`}
                onClick={() => setPageForTab(queueTab, currentPage + 1)}
              >
                Sau ›
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

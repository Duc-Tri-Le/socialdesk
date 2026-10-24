import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Draft } from "../../types";
import { useComposeJobs } from "../../context/ComposeJobsContext";
import { QueueDraftCard } from "../queue/QueueDraftCard";
import { QueueHistoryCard } from "../queue/QueueHistoryCard";
import { EmptyState, Pagination, PillTabs, SearchInput } from "../ui";
import { fuzzyMatchVi } from "../../utils/search";

function matchesDraftSearch(d: Draft, query: string): boolean {
  if (!query.trim()) return true;

  const targetNames = (d.publish_records ?? [])
    .map((r) => `${r.target_name} ${r.target_kind}`)
    .join(" ");

  const combined = [
    d.product_name,
    d.caption,
    d.code,
    d.sku,
    d.stt,
    d.maker,
    d.color,
    d.scale,
    d.price,
    d.selling_point,
    targetNames,
  ]
    .filter(Boolean)
    .join(" ");

  return fuzzyMatchVi(combined, query);
}

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
  const [searchQuery, setSearchQuery] = useState("");

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
      if (res.ok && res.results.some((r) => r.status === "published")) {
        setQueueTab("history");
        setQueuePage((s) => ({ ...s, history: 1 }));
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
      matches: (d) =>
        (d.status === "approved" || d.status === "packed") &&
        !d.publish_records.some((r) => r.status === "published"),
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

  const listForTab = (
    t: (typeof queueTabs)[number],
    query: string = searchQuery,
  ) => {
    const inTab = drafts.filter((d) => t.matches(d));
    const filtered = query.trim()
      ? inTab.filter((d) => matchesDraftSearch(d, query))
      : inTab;
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

  const activeList = listForTab(activeTabDef, searchQuery);
  const totalPages = Math.max(1, Math.ceil(activeList.length / QUEUE_PAGE_SIZE));
  const currentPage = Math.min(queuePage[queueTab], totalPages);
  const pageStart = (currentPage - 1) * QUEUE_PAGE_SIZE;
  const pagedList = activeList.slice(pageStart, pageStart + QUEUE_PAGE_SIZE);

  const setPageForTab = (tab: QueueTab, page: number) =>
    setQueuePage((s) => ({ ...s, [tab]: page }));

  return (
    <div className="space-y-4">
      {/* Tab bar & Thanh tìm kiếm */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PillTabs<QueueTab>
          ariaLabel="Các trang Hàng đợi"
          tabs={queueTabs.map((t) => {
            const allInTab = drafts.filter((d) => t.matches(d)).length;
            const matchInTab = listForTab(t, searchQuery).length;
            const badgeCount = searchQuery.trim() ? matchInTab : allInTab;
            return {
              id: t.id,
              label: t.label,
              count: badgeCount,
              ariaLabel: `${t.label} (${badgeCount} bài)`,
            };
          })}
          activeId={queueTab}
          onChange={(id) => setQueueTab(id)}
        />

        {/* Thanh tìm kiếm dùng chung */}
        <SearchInput
          id="queue-search"
          ariaLabel="Tìm kiếm bài viết trong Hàng đợi"
          value={searchQuery}
          onChange={(val) => {
            setSearchQuery(val);
            setQueuePage((s) => ({ ...s, [queueTab]: 1 }));
          }}
          placeholder="Tìm bài viết, caption, mã…"
          className="w-full sm:w-64"
        />
      </div>

      {/* Thông tin đang lọc kết quả */}
      {searchQuery.trim() && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs">
          <span className="text-[var(--dim)]">
            Đang tìm: <strong className="text-[var(--text)]">“{searchQuery.trim()}”</strong> ({activeList.length} bài trong mục {activeTabDef.label.toLowerCase()})
          </span>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setQueuePage((s) => ({ ...s, [queueTab]: 1 }));
            }}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            Xóa tìm kiếm
          </button>
        </div>
      )}

      {/* Main Section Content */}
      <section aria-label={activeTabDef.ariaLabel}>
        {/* Tiêu đề đã hiển thị trên tab pill nên ẩn trực quan để tránh lặp tiêu đề */}
        <h2 className="sr-only">
          {activeTabDef.label}
        </h2>

        {loading && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>}

        <ul className="mt-3 space-y-3">
          {queueTab === "history"
            ? pagedList.map((d) => (
                <QueueHistoryCard
                  key={d.id}
                  draft={d}
                  feedback={feedback[d.id]}
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
          <EmptyState
            message={
              searchQuery.trim()
                ? `Không tìm thấy bài nào khớp với “${searchQuery.trim()}” trong mục ${activeTabDef.label.toLowerCase()}.`
                : activeTabDef.emptyText
            }
            actionLabel={searchQuery.trim() ? "Xóa từ khóa tìm kiếm" : undefined}
            onAction={
              searchQuery.trim()
                ? () => {
                    setSearchQuery("");
                    setQueuePage((s) => ({ ...s, [queueTab]: 1 }));
                  }
                : undefined
            }
          />
        )}

        {/* Phân trang */}
        {activeList.length > 0 && (
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={(p) => setPageForTab(queueTab, p)}
            totalItems={activeList.length}
            pageSize={QUEUE_PAGE_SIZE}
            itemLabel="bài"
            navLabel={`Phân trang ${activeTabDef.label}`}
            infoText={
              searchQuery.trim()
                ? `Trang ${currentPage}/${totalPages} — hiển thị ${pagedList.length} / ${activeList.length} bài · đang tìm theo “${searchQuery.trim()}”`
                : undefined
            }
          />
        )}
      </section>
    </div>
  );
}

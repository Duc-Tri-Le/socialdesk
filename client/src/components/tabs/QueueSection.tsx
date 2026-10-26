import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import type { Draft } from "../../types";
import { QueueDraftCard } from "../queue/QueueDraftCard";
import { QueueHistoryCard } from "../queue/QueueHistoryCard";
import { EmptyState, Pagination, PillTabs, SearchInput } from "../ui";
import { fuzzyMatchVi } from "../../utils/search";
import { useQueueMutations } from "../queue/useQueueMutations";

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
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => api.listGroups({}) });
  const pagesQ = useQuery({ queryKey: ["pages"], queryFn: () => api.listPages({}) });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api.listAccounts({}) });

  const [searchQuery, setSearchQuery] = useState("");

  const QUEUE_PAGE_SIZE = 5;
  type QueueTab = "draft" | "ready" | "history";
  const [queueTab, setQueueTab] = useState<QueueTab>("draft");
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "scheduled" | "unscheduled">("all");
  const [queuePage, setQueuePage] = useState<Record<QueueTab, number>>({
    draft: 1,
    ready: 1,
    history: 1,
  });

  const {
    feedback,
    setMainAccount,
    approve,
    update,
    pack,
    saveTargets,
    publish,
    schedule,
    cancelSchedule,
    del,
    enqueueRewrite,
  } = useQueueMutations({
    onApproveSuccess: () => {
      setQueueTab("ready");
      setQueuePage((s) => ({ ...s, ready: 1 }));
    },
    onPublishSuccess: () => {
      setQueueTab("history");
      setQueuePage((s) => ({ ...s, history: 1 }));
    },
  });

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

  const scheduledCount = drafts.filter(
    (d) =>
      (d.status === "approved" || d.status === "packed") &&
      !!d.scheduled_at &&
      !d.publish_records.some((r) => r.status === "published"),
  ).length;

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
      label: scheduledCount > 0 ? `Đã duyệt (${scheduledCount} hẹn giờ)` : "Đã duyệt",
      emptyText:
        scheduleFilter === "scheduled"
          ? "Chưa có bài nào được lên lịch hẹn giờ đăng."
          : "Chưa có bài nào đã duyệt.",
      ariaLabel: "Đã duyệt",
      matches: (d) => {
        const isReady =
          (d.status === "approved" || d.status === "packed") &&
          !d.publish_records.some((r) => r.status === "published");
        if (!isReady) return false;
        if (scheduleFilter === "scheduled") return !!d.scheduled_at;
        if (scheduleFilter === "unscheduled") return !d.scheduled_at;
        return true;
      },
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

      {/* Subfilter cho trang Đã duyệt: Tất cả / Đã hẹn giờ / Chưa hẹn giờ */}
      {queueTab === "ready" && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="font-medium text-[var(--dim)]">Lọc:</span>
          <button
            type="button"
            onClick={() => {
              setScheduleFilter("all");
              setQueuePage((s) => ({ ...s, ready: 1 }));
            }}
            className={`rounded-full px-3 py-1 font-semibold transition cursor-pointer ${
              scheduleFilter === "all"
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--text)]"
            }`}
          >
            Tất cả bài đã duyệt
          </button>
          <button
            type="button"
            onClick={() => {
              setScheduleFilter("scheduled");
              setQueuePage((s) => ({ ...s, ready: 1 }));
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition cursor-pointer ${
              scheduleFilter === "scheduled"
                ? "bg-indigo-600 text-white shadow-xs"
                : "border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
            }`}
          >
            <span>Đã lên lịch</span>
            {scheduledCount > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                  scheduleFilter === "scheduled"
                    ? "bg-white/20 text-white"
                    : "bg-indigo-200/80 dark:bg-indigo-800 text-indigo-900 dark:text-indigo-100"
                }`}
              >
                {scheduledCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setScheduleFilter("unscheduled");
              setQueuePage((s) => ({ ...s, ready: 1 }));
            }}
            className={`rounded-full px-3 py-1 font-semibold transition cursor-pointer ${
              scheduleFilter === "unscheduled"
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--text)]"
            }`}
          >
            Chưa hẹn giờ
          </button>
        </div>
      )}

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
                  onSchedule={(args) => schedule.mutate(args)}
                  isSchedulePending={schedule.isPending}
                  onCancelSchedule={(id) => cancelSchedule.mutate(id)}
                  isCancelSchedulePending={cancelSchedule.isPending}
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

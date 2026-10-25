import { useMemo } from "react";
import {
  useAnalyticsManager,
  OverviewTab,
  RankedPostsSection,
  ChannelSlotComparisonSection,
  NextActionDirectivesSection,
  type AnalyticsSubTab,
} from "../analytics";
import { FeedbackBanner } from "../ui";

interface NavModuleItem {
  id: AnalyticsSubTab;
  title: string;
  subtitle: string;
  count?: number;
}

export function AnalyticsSection({ onGoQueue }: { onGoQueue: () => void }) {
  const {
    // Navigation
    activeTab,
    setActiveTab,

    // Dashboard State
    dashboard,
    isDashboardLoading,
    isDashboardFetching,
    dashboardFilters,
    filterOptions,
    onFilterChange,
    onResetFilters,
    refreshAll,

    // Metrics Data
    metrics,
    total,
    analytics,

    // Feedback
    feedback,
    setFeedback,

    // Sync & Scan
    syncPublished,
    isSyncing,
    scanAllPosts,
    isScanning,
  } = useAnalyticsManager();

  // Danh mục 4 trang cốt lõi của mục Phân tích (Xóa hết các trang cũ)
  const modules: NavModuleItem[] = useMemo(
    () => [
      {
        id: "overview",
        title: "Tổng quan",
        subtitle: "3 con số sức khỏe",
      },
      {
        id: "ranking",
        title: "Xếp hạng bài",
        subtitle: "Trái tim phân tích",
        count: total,
      },
      {
        id: "channels",
        title: "Kênh & Khung giờ vàng",
        subtitle: "Đăng đâu, mấy giờ",
      },
      {
        id: "directives",
        title: "Hướng đăng tiếp theo",
        subtitle: "Biến phân tích thành hành động",
      },
    ],
    [total],
  );

  // Ánh xạ thumbnail từ danh sách topContent
  const thumbnailsMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (dashboard?.topContent?.content) {
      for (const c of dashboard.topContent.content) {
        if (c.draftId && c.thumbnail) {
          map[c.draftId] = c.thumbnail;
        }
      }
    }
    return map;
  }, [dashboard?.topContent?.content]);

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
      {feedback && (
        <FeedbackBanner
          feedback={{ ok: feedback.type !== "error", text: feedback.text }}
          variant={feedback.type === "error" ? "danger" : feedback.type === "info" ? "info" : "ok"}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Top Header Navigation: Đúng 4 trang cốt lõi */}
      <header
        aria-label="Thanh điều hướng 4 trang phân tích"
        className="sticky top-[49px] z-10 -mx-1 px-1 py-2 bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--border)] transition-all"
      >
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-none sm:flex-wrap">
          {modules.map((m) => {
            const isActive = activeTab === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveTab(m.id)}
                aria-current={isActive ? "page" : undefined}
                className={`group flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-[var(--accent)] text-white shadow-xs"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--text)] hover:border-[var(--text)] hover:bg-[var(--surface-alt)]"
                }`}
              >
                <span>{m.title}</span>
                {typeof m.count === "number" && m.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-[var(--surface-alt)] text-[var(--dim)] border border-[var(--border)]"
                    }`}
                  >
                    {m.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Nội dung 4 trang cốt lõi (Xóa bỏ các trang cũ) */}
      <div className="w-full min-w-0">
        {/* TRANG 1: HÀNG TỔNG QUAN — 3 CON SỐ (KHÔNG BIỂU ĐỒ DÀI DÒNG) */}
        {activeTab === "overview" && (
          <OverviewTab
            dashboard={dashboard}
            isLoading={isDashboardLoading}
            filters={dashboardFilters}
            filterOptions={filterOptions}
            onFilterChange={onFilterChange}
            onResetFilters={onResetFilters}
            onRefresh={refreshAll}
            isRefreshing={isDashboardFetching}
            onSync={syncPublished}
            isSyncing={isSyncing}
            onScan={scanAllPosts}
            isScanning={isScanning}
            onNavigateTab={setActiveTab}
            metrics={metrics}
          />
        )}

        {/* TRANG 2: BẢNG XẾP HẠNG BÀI — TRÁI TIM CỦA MỤC NÀY */}
        {activeTab === "ranking" && (
          <RankedPostsSection
            metrics={metrics}
            onNavigate={setActiveTab}
            thumbnailsMap={thumbnailsMap}
          />
        )}

        {/* TRANG 3: SO SÁNH KÊNH + KHUNG GIỜ VÀNG — TRẢ LỜI "ĐĂNG ĐÂU, MẤY GIỜ" */}
        {activeTab === "channels" && (
          <ChannelSlotComparisonSection
            analytics={analytics}
            metrics={metrics}
          />
        )}

        {/* TRANG 4: "HƯỚNG ĐĂNG TIẾP THEO" — PHẦN BIẾN PHÂN TÍCH THÀNH HÀNH ĐỘNG */}
        {activeTab === "directives" && (
          <NextActionDirectivesSection
            metrics={metrics}
            analytics={analytics}
            onNavigate={setActiveTab}
            onGoQueue={onGoQueue}
          />
        )}
      </div>
    </div>
  );
}

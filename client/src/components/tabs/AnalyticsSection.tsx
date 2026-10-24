import { useMemo } from "react";
import {
  useAnalyticsManager,
  OverviewTab,
  FacebookGroupsTab,
  ContentProductsTab,
  PublishPostsTab,
  OptimalSlotsTab,
  SyncScanTab,
  type AnalyticsSubTab,
} from "../analytics";
import { FeedbackBanner } from "../ui";
import { cardCls } from "../../utils/styles";

interface NavModuleItem {
  id: AnalyticsSubTab;
  icon: string;
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
    isScoringModalOpen,
    setIsScoringModalOpen,
    onFilterChange,
    onResetFilters,
    onSaveWeights,
    isSavingWeights,
    refetchDashboard,

    // Queries & Legacy Shortcuts
    groups,
    products,
    metrics,
    total,
    page,
    pageSize,
    totalPages,
    analytics,
    heatmap,
    isHeatmapLoading,
    onlineExtensionCodes,
    groupAnalyticsQ,
    productTreeQ,
    metricsQ,
    analyticsQ,

    // Filters & Pagination for Posts Tab
    searchKeyword,
    onSearchChange,
    channelFilter,
    onChannelFilterChange,
    postStatusFilter,
    onPostStatusFilterChange,
    startDate,
    onStartDateChange,
    endDate,
    onEndDateChange,
    onPageChange,
    onPageSizeChange,

    // Feedback
    feedback,
    setFeedback,

    // Sales Edit
    editingId,
    editSalesForm,
    setEditSalesForm,
    startEditSales,
    cancelEditSales,
    saveEditSales,
    isSavingSales,

    // Operations
    deleteMetric,
    updateStatus,
    syncPublished,
    isSyncing,
    scanAllPosts,
    isScanning,
    scanSingleMetric,
    batchScan,
    isBatchScanning,
    batchUpdateStatus,
    batchDelete,
  } = useAnalyticsManager();

  // Danh mục 6 module điều hướng phân tích
  const modules: NavModuleItem[] = useMemo(
    () => [
      {
        id: "overview",
        icon: "📊",
        title: "Overview",
        subtitle: "Tổng quan & KPIs",
      },
      {
        id: "groups",
        icon: "👥",
        title: "Facebook Groups",
        subtitle: "Hiệu quả nhóm",
        count: groups.length,
      },
      {
        id: "posts",
        icon: "📝",
        title: "Posts",
        subtitle: "Quản lý lượt đăng",
        count: total,
      },
      {
        id: "slots",
        icon: "⏰",
        title: "Best Posting Time",
        subtitle: "Khung giờ tối ưu",
      },
      {
        id: "content",
        icon: "📦",
        title: "Content Analytics",
        subtitle: "Nội dung & Sản phẩm",
        count: products.length,
      },
      {
        id: "sync_scan",
        icon: "🔄",
        title: "Sync & Scan",
        subtitle: "Đồng bộ & Quét tương tác",
      },
    ],
    [groups.length, products.length, total],
  );

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

      {/* Mobile / Tablet Compact Navigation */}
      <div className="lg:hidden">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {modules.map((m) => {
            const isActive = activeTab === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveTab(m.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                  isActive
                    ? "bg-[var(--accent)] text-white shadow-xs"
                    : "bg-[var(--surface)] text-[var(--dim)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)] border border-[var(--border)]"
                }`}
              >
                <span>{m.icon}</span>
                <span>{m.title}</span>
                {typeof m.count === "number" && m.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isActive ? "bg-white/20 text-white" : "bg-[var(--surface-alt)] text-[var(--dim)]"
                    }`}
                  >
                    {m.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Layout: Desktop Sidebar + Content */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:gap-6">
        {/* Desktop Fixed Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-4">
          <nav aria-label="Sidebar điều hướng phân tích" className={`${cardCls} p-3 space-y-1 shadow-xs`}>
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--dim)] border-b border-[var(--border)] mb-2">
              Performance Center
            </div>
            {modules.map((m) => {
              const isActive = activeTab === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveTab(m.id)}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition ${
                    isActive
                      ? "bg-[var(--accent)] text-white font-semibold shadow-xs"
                      : "text-[var(--ink)] hover:bg-[var(--surface-alt)]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">{m.icon}</span>
                    <div className="min-w-0">
                      <div className="truncate">{m.title}</div>
                      <div
                        className={`text-[10px] truncate ${
                          isActive ? "text-white/80" : "text-[var(--dim)]"
                        }`}
                      >
                        {m.subtitle}
                      </div>
                    </div>
                  </div>
                  {typeof m.count === "number" && m.count > 0 && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold shrink-0 ${
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
          </nav>
        </aside>

        {/* Tab Content Area */}
        <main className="flex-1 min-w-0">
          {activeTab === "overview" && (
            <OverviewTab
              dashboard={dashboard}
              isLoading={isDashboardLoading}
              filters={dashboardFilters}
              filterOptions={filterOptions}
              onFilterChange={onFilterChange}
              onResetFilters={onResetFilters}
              onRefresh={refetchDashboard}
              isRefreshing={isDashboardFetching}
              onSync={syncPublished}
              isSyncing={isSyncing}
              onScan={scanAllPosts}
              isScanning={isScanning}
              onNavigateTab={setActiveTab}
              isScoringModalOpen={isScoringModalOpen}
              onOpenScoringModal={() => setIsScoringModalOpen(true)}
              onCloseScoringModal={() => setIsScoringModalOpen(false)}
              onSaveWeights={onSaveWeights}
              isSavingWeights={isSavingWeights}
            />
          )}

          {activeTab === "groups" && (
            <FacebookGroupsTab
              groups={groups}
              isLoading={groupAnalyticsQ.isPending}
            />
          )}

          {activeTab === "content" && (
            <ContentProductsTab
              products={products}
              isLoading={productTreeQ.isPending}
            />
          )}

          {activeTab === "posts" && (
            <PublishPostsTab
              metrics={metrics}
              total={total}
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              isLoading={metricsQ.isPending}
              searchKeyword={searchKeyword}
              onSearchChange={onSearchChange}
              channelFilter={channelFilter}
              onChannelFilterChange={onChannelFilterChange}
              postStatusFilter={postStatusFilter}
              onPostStatusFilterChange={onPostStatusFilterChange}
              startDate={startDate}
              onStartDateChange={onStartDateChange}
              endDate={endDate}
              onEndDateChange={onEndDateChange}
              editingId={editingId}
              editSalesForm={editSalesForm}
              setEditSalesForm={setEditSalesForm}
              startEditSales={startEditSales}
              cancelEditSales={cancelEditSales}
              saveEditSales={saveEditSales}
              isSavingSales={isSavingSales}
              onDeleteMetric={deleteMetric}
              onScanSingleMetric={scanSingleMetric}
              onUpdateStatus={updateStatus}
              onBatchScan={batchScan}
              isBatchScanning={isBatchScanning}
              onBatchUpdateStatus={batchUpdateStatus}
              onBatchDelete={batchDelete}
            />
          )}

          {activeTab === "slots" && (
            <OptimalSlotsTab
              analytics={analytics}
              isLoading={analyticsQ.isPending}
              heatmap={heatmap}
              isHeatmapLoading={isHeatmapLoading}
              onGoQueue={onGoQueue}
            />
          )}

          {activeTab === "sync_scan" && (
            <SyncScanTab
              onSyncPublished={syncPublished}
              isSyncing={isSyncing}
              onScanExtension={scanAllPosts}
              isScanning={isScanning}
              onGoQueue={onGoQueue}
              onlineExtensionCodes={onlineExtensionCodes}
            />
          )}
        </main>
      </div>
    </div>
  );
}

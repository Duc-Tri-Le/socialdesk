import {
  useAnalyticsManager,
  ChannelBestSlotCard,
  MetricsHistoryList,
  SyncMetricsToolbar,
} from "../analytics";
import { FeedbackBanner } from "../ui";

export function AnalyticsSection({ onGoQueue }: { onGoQueue: () => void }) {
  const {
    analytics,
    analyticsQ,
    metricsQ,
    feedback,
    setFeedback,
    searchKeyword,
    setSearchKeyword,
    channelFilter,
    setChannelFilter,
    pagination,
    editingId,
    editSalesForm,
    setEditSalesForm,
    startEditSales,
    cancelEditSales,
    saveEditSales,
    isSavingSales,
    deleteMetric,
    syncPublished,
    isSyncing,
    scanAllPosts,
    isScanning,
    scanSingleMetric,
  } = useAnalyticsManager();

  return (
    <div className="space-y-6">
      {/* 1. Thanh điều khiển, thông báo, đồng bộ & bộ lọc */}
      <SyncMetricsToolbar
        analytics={analytics}
        onGoQueue={onGoQueue}
        onSyncPublished={syncPublished}
        isSyncing={isSyncing}
        onScanExtension={scanAllPosts}
        isScanning={isScanning}
        searchKeyword={searchKeyword}
        onSearchChange={setSearchKeyword}
        channelFilter={channelFilter}
        onChannelFilterChange={setChannelFilter}
      />

      {feedback && (
        <FeedbackBanner
          feedback={{ ok: feedback.type !== "error", text: feedback.text }}
          variant={feedback.type === "error" ? "danger" : feedback.type === "info" ? "info" : "ok"}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* 2. Khung giờ tốt nhất theo từng kênh */}
      <section aria-label="Khung giờ tốt nhất theo từng kênh" className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--ink)]">
          Khung giờ tốt nhất theo từng kênh ({analytics?.channels.length ?? 0} kênh đã có dữ liệu)
        </h2>

        {analyticsQ.isPending && (
          <p className="mt-2 text-sm text-[var(--dim)]">Đang tải phân tích khung giờ…</p>
        )}

        {analytics && analytics.channels.length === 0 && (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-6 text-sm text-[var(--dim)]">
            Chưa có bài đăng nào được ghi chỉ số — hãy duyệt bài ở{" "}
            <button
              type="button"
              className="text-[var(--accent)] underline hover:text-[var(--accent)]/80"
              onClick={onGoQueue}
            >
              Hàng đợi
            </button>
            , sau đó bấm <strong>"Đồng bộ bài đã đăng"</strong> để tự động đưa vào bảng phân tích.
          </div>
        )}

        <ul className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {(analytics?.channels ?? []).map((c) => (
            <ChannelBestSlotCard
              key={`${c.channel_type}-${c.channel_id}-${c.channel_name}`}
              channel={c}
            />
          ))}
        </ul>
      </section>

      {/* 3. Lịch sử bài đã đo & cập nhật chuyển đổi doanh số */}
      <MetricsHistoryList
        metrics={metricsQ.data?.metrics ?? []}
        pagination={pagination}
        isLoading={metricsQ.isPending}
        editingId={editingId}
        editSalesForm={editSalesForm}
        setEditSalesForm={setEditSalesForm}
        startEditSales={startEditSales}
        cancelEditSales={cancelEditSales}
        saveEditSales={saveEditSales}
        isSavingSales={isSavingSales}
        deleteMetric={deleteMetric}
        scanSingleMetric={scanSingleMetric}
      />
    </div>
  );
}

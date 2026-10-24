import { memo } from "react";
import type {
  EngagementDashboard,
  DashboardFilters,
  AnalyticsSubTab,
} from "../analyticsTypes";
import {
  DashboardHeader,
  DashboardFilterBar,
  KpiOverviewSection,
  EngagementTrendSection,
  TopGroupsSection,
  TopContentSection,
  BestPostingTimeSection,
  ScoringSettingsModal,
  RecommendationsSection,
  DataHealthSection,
} from "../dashboard";
import { cardCls, btnPrimary, btnOutline } from "../../../utils/styles";

interface OverviewTabProps {
  dashboard?: EngagementDashboard;
  isLoading: boolean;
  filters: DashboardFilters;
  filterOptions: {
    groups: Array<{ id: number; name: string }>;
    products: string[];
    variants: Array<{ id: number; label: string; productName: string }>;
  };
  onFilterChange: (updated: Partial<DashboardFilters>) => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSync: () => void;
  isSyncing: boolean;
  onScan: () => void;
  isScanning: boolean;
  onNavigateTab: (tab: AnalyticsSubTab) => void;
  isScoringModalOpen: boolean;
  onOpenScoringModal: () => void;
  onCloseScoringModal: () => void;
  onSaveWeights: (weights: {
    reactionWeight: number;
    commentWeight: number;
    shareWeight: number;
  }) => void;
  isSavingWeights: boolean;
}

export const OverviewTab = memo(function OverviewTab({
  dashboard,
  isLoading,
  filters,
  filterOptions,
  onFilterChange,
  onResetFilters,
  onRefresh,
  isRefreshing,
  onSync,
  isSyncing,
  onScan,
  isScanning,
  onNavigateTab,
  isScoringModalOpen,
  onOpenScoringModal,
  onCloseScoringModal,
  onSaveWeights,
  isSavingWeights,
}: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* 1. Header Dashboard */}
      <DashboardHeader
        lastUpdated={dashboard?.lastUpdated}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        onSync={onSync}
        isSyncing={isSyncing}
        onScan={onScan}
        isScanning={isScanning}
      />

      {/* 2. Global Filter Bar */}
      <DashboardFilterBar
        filters={filters}
        options={filterOptions}
        onChange={onFilterChange}
        onReset={onResetFilters}
      />

      {/* 3. Loading State */}
      {isLoading && !dashboard && (
        <div className={`${cardCls} p-12 text-center`}>
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--accent)] border-r-transparent" />
          <p className="mt-3 text-sm font-medium text-[var(--ink)]">
            Đang phân tích hiệu suất bài đăng trên các hội nhóm Facebook…
          </p>
          <p className="mt-1 text-xs text-[var(--dim)]">
            Tổng hợp dữ liệu snapshot, tính toán trọng số tương tác và tỷ lệ tăng trưởng.
          </p>
        </div>
      )}

      {/* 4. Empty State khi không có bài đăng */}
      {!isLoading && dashboard && dashboard.kpis.totalPosts === 0 && (
        <div className={`${cardCls} p-12 text-center space-y-4`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-alt)] text-2xl">
            📊
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-bold text-[var(--ink)]">
              Chưa có dữ liệu bài đăng trong khoảng thời gian này
            </h3>
            <p className="mt-1.5 text-xs text-[var(--dim)] leading-relaxed">
              No posts found. Đồng bộ các bài đăng từ Hàng đợi xuất bản hoặc nới rộng khoảng ngày lọc
              để bắt đầu phân tích tương tác trên nhóm.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className={`${btnPrimary} text-xs px-4 py-2`}
            >
              {isSyncing ? "Đang đồng bộ…" : "🔄 Đồng bộ bài đăng ngay"}
            </button>
            <button
              type="button"
              onClick={onResetFilters}
              className={`${btnOutline} text-xs px-4 py-2`}
            >
              Đặt lại bộ lọc
            </button>
          </div>
        </div>
      )}

      {/* 5. Nội dung chính khi có dữ liệu */}
      {dashboard && dashboard.kpis.totalPosts > 0 && (
        <>
          {/* Section A — KPI Overview */}
          <KpiOverviewSection kpis={dashboard.kpis} onNavigate={onNavigateTab} />

          {/* Section B — Engagement Trend Line Chart */}
          <EngagementTrendSection
            trend={dashboard.trend}
            isLoading={isLoading}
            onModeChange={(mode) => onFilterChange({ trendMode: mode })}
          />

          {/* Section C (Top Groups) & Section D (Top Content) — 2 Cột trên Desktop */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <TopGroupsSection
              groups={dashboard.topGroups.groups}
              onSelectGroup={(gid) => onFilterChange({ groupIds: [gid] })}
              onNavigate={onNavigateTab}
            />
            <TopContentSection
              content={dashboard.topContent.content}
              onSelectContent={(draftId) => onFilterChange({ contentVariantId: draftId })}
              onNavigate={onNavigateTab}
            />
          </div>

          {/* Section E — Best Posting Time Heatmap */}
          <BestPostingTimeSection
            heatmap={dashboard.bestPostingTime}
            view={filters.heatmapView}
            onViewChange={(view) => onFilterChange({ heatmapView: view })}
          />

          {/* Section F — Engagement Scoring Bar */}
          <div className={`${cardCls} p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--surface-alt)]/40 border-[var(--border)]`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-[var(--dim)]">
                  Section F · Công thức tính điểm tương tác (WE)
                </span>
                <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700">
                  WE = R × {dashboard.scoring.reactionWeight} + C × {dashboard.scoring.commentWeight} + S × {dashboard.scoring.shareWeight}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--dim)]">
                Trọng số hiện tại: Reactions × {dashboard.scoring.reactionWeight} · Comments ×{" "}
                {dashboard.scoring.commentWeight} · Shares × {dashboard.scoring.shareWeight}. Chỉ tính
                WER khi có Reach hợp lệ từ Page/Admin.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenScoringModal}
              className={`${btnOutline} text-xs shrink-0 self-start sm:self-center`}
            >
              ⚙️ Cấu hình trọng số (WE Settings)
            </button>
          </div>

          {/* Section G (Recommendations) & Section H (Data Health) — 2 Cột trên Desktop */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <RecommendationsSection
              items={dashboard.recommendations.items}
              onNavigate={onNavigateTab}
            />
            <DataHealthSection
              health={dashboard.dataHealth}
              onSync={onSync}
              isSyncing={isSyncing}
              onScan={onScan}
              isScanning={isScanning}
              onNavigate={onNavigateTab}
            />
          </div>
        </>
      )}

      {/* Modal chỉnh sửa trọng số Section F */}
      {dashboard && (
        <ScoringSettingsModal
          initialWeights={{
            reactionWeight: dashboard.scoring.reactionWeight,
            commentWeight: dashboard.scoring.commentWeight,
            shareWeight: dashboard.scoring.shareWeight,
          }}
          isOpen={isScoringModalOpen}
          onClose={onCloseScoringModal}
          onSave={onSaveWeights}
          isSaving={isSavingWeights}
        />
      )}
    </div>
  );
});

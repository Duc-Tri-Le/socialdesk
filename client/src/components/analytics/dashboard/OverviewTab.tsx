import { memo, useMemo } from "react";
import type {
  EngagementDashboard,
  DashboardFilters,
  AnalyticsSubTab,
  Metric,
} from "../analyticsTypes";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardFilterBar } from "./DashboardFilterBar";
import { OverviewKpiStrip } from "./OverviewKpiStrip";
import { DataHealthSection } from "./DataHealthSection";
import { OverviewTrendAndFeaturedSection } from "./OverviewTrendAndFeaturedSection";
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
  metrics?: Metric[];
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
  metrics = [],
}: OverviewTabProps) {
  // Tính tổng số inbox từ danh sách bài đăng thực tế
  const totalInquiries = useMemo(
    () => metrics.reduce((acc, m) => acc + m.inquiries, 0),
    [metrics],
  );

  const unscannedCount = useMemo(
    () => metrics.filter((m) => !m.scanned_at && m.likes === 0 && m.comments === 0).length,
    [metrics],
  );

  return (
    <div className="space-y-6">
      {/* 1. Header: Trạng thái & Thao tác đồng bộ/quét */}
      <DashboardHeader
        lastUpdated={dashboard?.lastUpdated}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        onSync={onSync}
        isSyncing={isSyncing}
        onScan={onScan}
        isScanning={isScanning}
      />

      {/* 2. Bộ lọc khoảng thời gian nhanh */}
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
            Đang tổng hợp số liệu sức khỏe bài đăng…
          </p>
        </div>
      )}

      {/* 4. Fallback khi không có dữ liệu dashboard */}
      {!isLoading && !dashboard && (
        <div className={`${cardCls} p-12 text-center space-y-4`}>
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-bold text-[var(--ink)]">
              Chưa tải được dữ liệu tổng quan
            </h3>
            <p className="mt-1.5 text-xs text-[var(--dim)] leading-relaxed">
              Vui lòng bấm nút bên dưới để tải lại dữ liệu từ máy chủ.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className={`${btnPrimary} text-xs px-4 py-2`}
            >
              {isRefreshing ? "Đang tải…" : "Tải lại dữ liệu"}
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

      {/* 5. NỘI DUNG TỔNG QUAN PHÂN TÍCH */}
      {dashboard && (
        <div className="space-y-6">
          {/* Hàng 4 thẻ KPI cốt lõi + Banner cảnh báo trung thực */}
          <OverviewKpiStrip
            kpis={dashboard.kpis}
            totalInquiries={totalInquiries}
            unscannedCount={unscannedCount}
            onScan={onScan}
            isScanning={isScanning}
          />

          {/* Chất lượng & Độ bao phủ dữ liệu */}
          <DataHealthSection
            health={dashboard.dataHealth}
            onSync={onSync}
            isSyncing={isSyncing}
            onScan={onScan}
            isScanning={isScanning}
            onNavigate={onNavigateTab}
          />

          {/* 2 Cột: Xu hướng tương tác & Bài đăng nổi bật */}
          <OverviewTrendAndFeaturedSection
            metrics={metrics}
            onNavigate={onNavigateTab}
          />
        </div>
      )}
    </div>
  );
});

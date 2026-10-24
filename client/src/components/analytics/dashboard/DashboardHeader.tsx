import { memo } from "react";
import { btnPrimary, btnOutline } from "../../../utils/styles";

interface DashboardHeaderProps {
  lastUpdated?: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSync: () => void;
  isSyncing: boolean;
  onScan: () => void;
  isScanning: boolean;
}

export const DashboardHeader = memo(function DashboardHeader({
  lastUpdated,
  onRefresh,
  isRefreshing,
  onSync,
  isSyncing,
  onScan,
  isScanning,
}: DashboardHeaderProps) {
  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "Đang tải…";

  return (
    <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Tiêu đề & Subtitle */}
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-lg">
            ⚡
          </span>
          <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] sm:text-2xl">
            Engagement Analytics
          </h1>
        </div>
        <p className="mt-1 text-xs font-medium text-[var(--dim)] sm:text-sm">
          Facebook Groups · Performance Center
        </p>
      </div>

      {/* Thông tin cập nhật & Bộ nút hành động */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--dim)]">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Cập nhật:</span>
          <strong className="font-mono text-[var(--ink)]">{formattedTime}</strong>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`${btnOutline} py-1.5 px-3 text-xs`}
          title="Tải lại số liệu dashboard"
        >
          {isRefreshing ? "⏳ Đang tải…" : "🔄 Refresh Dashboard"}
        </button>

        <button
          type="button"
          onClick={onSync}
          disabled={isSyncing}
          className={`${btnOutline} py-1.5 px-3 text-xs`}
          title="Đồng bộ bài đã đăng từ Hàng đợi"
        >
          {isSyncing ? "Đang đồng bộ…" : "📥 Đồng bộ bài đăng"}
        </button>

        <button
          type="button"
          onClick={onScan}
          disabled={isScanning}
          className={`${btnPrimary} py-1.5 px-3 text-xs`}
          title="Kích hoạt Chrome Extension quét tương tác"
        >
          {isScanning ? "Đang quét…" : "🔌 Quét tương tác"}
        </button>
      </div>
    </div>
  );
});

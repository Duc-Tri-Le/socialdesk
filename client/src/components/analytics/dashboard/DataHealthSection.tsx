import { memo } from "react";
import type { DashboardDataHealth, AnalyticsSubTab } from "../analyticsTypes";
import { cardCls, btnPrimary, btnOutline } from "../../../utils/styles";

interface DataHealthSectionProps {
  health: DashboardDataHealth;
  onSync: () => void;
  isSyncing: boolean;
  onScan: () => void;
  isScanning: boolean;
  onNavigate: (tab: AnalyticsSubTab) => void;
}

export const DataHealthSection = memo(function DataHealthSection({
  health,
  onSync,
  isSyncing,
  onScan,
  isScanning,
  onNavigate,
}: DataHealthSectionProps) {
  const lastScanFormatted = health.lastSuccessfulScan
    ? new Date(health.lastSuccessfulScan).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "Chưa có";

  return (
    <div className={`${cardCls} p-5 space-y-4 flex flex-col justify-between`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">
              Chất lượng dữ liệu & Đồng bộ (Data Health)
            </h2>
            <p className="text-xs text-[var(--dim)]">
              Theo dõi độ phủ đo lường thực tế trên tất cả bài viết đã đăng
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("sync_scan")}
          className="text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          Cổng Extension →
        </button>
      </div>

      {/* Thanh tiến trình Scan Coverage */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--ink)]">Tỷ lệ quét hoàn tất (Scan Coverage):</span>
          <span className="font-bold text-emerald-600 font-mono">{health.scanCoveragePct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--surface-alt)] border border-[var(--border)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, health.scanCoveragePct))}%` }}
          />
        </div>
        <p className="text-[11px] text-[var(--dim)]">
          Đã quét thành công: <strong>{health.scannedPosts}</strong> / {health.totalPosts} bài đăng thực tế
        </p>
      </div>

      {/* Grid 4 chỉ số trạng thái */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs font-mono">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/50 p-2.5 text-center">
          <span className="text-[10px] text-[var(--dim)] font-sans block">Đã quét (Active)</span>
          <span className="text-base font-bold text-emerald-600">{health.scannedPosts}</span>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/50 p-2.5 text-center">
          <span className="text-[10px] text-[var(--dim)] font-sans block">Chưa quét</span>
          <span className="text-base font-bold text-amber-600">{health.unscannedPosts}</span>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/50 p-2.5 text-center">
          <span className="text-[10px] text-[var(--dim)] font-sans block">Chờ duyệt (Partial)</span>
          <span className="text-base font-bold text-blue-600">{health.partialPosts}</span>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/50 p-2.5 text-center">
          <span className="text-[10px] text-[var(--dim)] font-sans block">Bị gỡ (Failed)</span>
          <span className="text-base font-bold text-rose-600">{health.failedPosts}</span>
        </div>
      </div>

      {/* Thông tin quét cuối & Nút hành động */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs">
        <span className="text-[11px] text-[var(--dim)]">
          Lần quét gần nhất: <strong className="text-[var(--ink)] font-mono">{lastScanFormatted}</strong>
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSyncing}
            onClick={onSync}
            className={`${btnOutline} py-1 px-2.5 text-xs`}
          >
            {isSyncing ? "Đang đồng bộ…" : "Đồng bộ mới"}
          </button>
          <button
            type="button"
            disabled={isScanning}
            onClick={onScan}
            className={`${btnPrimary} py-1 px-2.5 text-xs`}
          >
            {isScanning ? "Đang quét…" : "Quét bài chưa đo"}
          </button>
        </div>
      </div>
    </div>
  );
});

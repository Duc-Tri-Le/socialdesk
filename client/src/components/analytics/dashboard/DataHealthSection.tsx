import { memo } from "react";
import type { DashboardDataHealth, AnalyticsSubTab } from "../analyticsTypes";

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
  onNavigate,
}: DataHealthSectionProps) {
  const coveragePct = Math.min(100, Math.max(0, health.scanCoveragePct || 0));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[var(--ink)]">
              Chất lượng & Độ bao phủ dữ liệu
            </h2>
            <p className="text-xs text-[var(--dim)]">
              Theo dõi độ phủ và lượng thực tế trên tất cả bài viết đã đăng
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("ranking")}
          className="flex items-center gap-1 text-xs font-semibold text-[var(--ink)] hover:text-[var(--accent)] transition cursor-pointer"
        >
          <span>Chi tiết</span>
          <span>→</span>
        </button>
      </div>

      {/* Lưới 5 ô trạng thái quét */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Ô 1: Vòng tròn tiến độ & % hoàn thành */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt,#27272a)]/40 p-4 flex items-center gap-3.5">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--surface)]">
            <span className="font-mono text-sm font-extrabold text-[var(--ink)]">
              {coveragePct}%
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <span className="text-xs font-semibold text-[var(--ink)] block truncate">
              Đã quét thành công
            </span>
            <div className="text-[11px] text-[var(--dim)] font-mono">
              {health.scannedPosts} / {health.totalPosts} bài đăng
            </div>
            {/* Thanh tiến độ xanh */}
            <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${coveragePct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Ô 2: Đã quét thành công */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt,#27272a)]/40 p-4 flex flex-col justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block shrink-0" />
            <span className="text-xs text-[var(--dim)] truncate">Đã quét thành công</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-bold text-emerald-400">
              {health.scannedPosts}
            </span>
            <span className="text-xs text-[var(--dim)]">bài</span>
          </div>
        </div>

        {/* Ô 3: Chưa quét */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt,#27272a)]/40 p-4 flex flex-col justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400 inline-block shrink-0" />
            <span className="text-xs text-[var(--dim)] truncate">Chưa quét</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-bold text-amber-400">
              {health.unscannedPosts}
            </span>
            <span className="text-xs text-[var(--dim)]">bài</span>
          </div>
        </div>

        {/* Ô 4: Đang chờ duyệt */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt,#27272a)]/40 p-4 flex flex-col justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-400 inline-block shrink-0" />
            <span className="text-xs text-[var(--dim)] truncate">Đang chờ duyệt</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-bold text-blue-400">
              {health.partialPosts}
            </span>
            <span className="text-xs text-[var(--dim)]">bài</span>
          </div>
        </div>

        {/* Ô 5: Bị gỡ hoặc lỗi */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt,#27272a)]/40 p-4 flex flex-col justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400 inline-block shrink-0" />
            <span className="text-xs text-[var(--dim)] truncate">Bị gỡ hoặc lỗi</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-bold text-rose-400">
              {health.failedPosts}
            </span>
            <span className="text-xs text-[var(--dim)]">bài</span>
          </div>
        </div>
      </div>
    </div>
  );
});

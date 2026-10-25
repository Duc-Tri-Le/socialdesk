import { memo } from "react";
import type { DashboardKpis } from "../analyticsTypes";

interface OverviewKpiStripProps {
  kpis: DashboardKpis;
  totalInquiries?: number;
  unscannedCount?: number;
  onScan?: () => void;
  isScanning?: boolean;
}

export const OverviewKpiStrip = memo(function OverviewKpiStrip({
  kpis,
  totalInquiries = 0,
  unscannedCount = 0,
  onScan,
  isScanning = false,
}: OverviewKpiStripProps) {
  const hasValidData = kpis.totalPosts > 0 && kpis.totalEngagement > 0;
  const avgEngagement =
    kpis.totalPosts > 0 ? (kpis.totalEngagement / kpis.totalPosts).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      {/* 1. Banner cảnh báo dữ liệu trung thực */}
      {!hasValidData && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-zinc-950 font-bold text-sm">
              !
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">
                Chưa đủ dữ liệu để đánh giá hiệu quả
              </h3>
              <p className="text-xs text-[var(--dim)] leading-relaxed">
                Bạn có {kpis.totalPosts} bài đăng nhưng chưa có dữ liệu tương tác được xác nhận. Hãy quét bài đăng để bắt đầu phân tích.
              </p>
            </div>
          </div>

          {onScan && (
            <div className="shrink-0 pt-1 sm:pt-0">
              <button
                type="button"
                onClick={onScan}
                disabled={isScanning}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-4 py-2 text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <span>▶</span>
                <span>{isScanning ? "Đang quét bài…" : "Quét bài đăng ngay"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. Hàng 4 thẻ KPI tóm tắt */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Thẻ 1: Tổng bài đăng */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col justify-between transition hover:border-[var(--border-hover,#3f3f46)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-medium text-[var(--dim)] block">Tổng bài đăng</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="font-mono text-2xl font-black text-[var(--ink)]">
                  {kpis.totalPosts}
                </span>
                <span className="text-xs text-[var(--dim)] font-medium">bài</span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--border)]/40 flex items-center justify-between">
            <span className="rounded-full bg-[var(--surface-alt)] px-2.5 py-0.5 text-[10px] font-mono text-[var(--dim)] border border-[var(--border)]">
              Chưa quét: {unscannedCount}
            </span>
          </div>
        </div>

        {/* Thẻ 2: Điểm tương tác TB */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col justify-between transition hover:border-[var(--border-hover,#3f3f46)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-[var(--dim)] truncate">Điểm tương tác TB</span>
                <span
                  title="Điểm tương tác trung bình (Like, Comment, Share) trên mỗi bài đăng"
                  className="cursor-help text-[10px] text-[var(--dim)]"
                >
                  ⓘ
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                {hasValidData ? (
                  <>
                    <span className="font-mono text-2xl font-black text-[var(--ink)]">
                      {avgEngagement}
                    </span>
                    <span className="text-xs text-[var(--dim)] font-medium">đ/bài</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold text-[var(--ink)]">Chưa có dữ liệu</span>
                    <span className="text-xs text-[var(--dim)]">/bài</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--border)]/40">
            <span className="text-[10px] text-[var(--dim)] truncate block">
              {hasValidData ? "Được tính từ bài đăng thực tế" : "Chưa có dữ liệu hợp lệ để tính toán"}
            </span>
          </div>
        </div>

        {/* Thẻ 3: Khách inbox tư vấn */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col justify-between transition hover:border-[var(--border-hover,#3f3f46)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-[var(--dim)] truncate">Khách inbox tư vấn</span>
                <span
                  title="Số lượng khách nhắn tin hỏi giá, tư vấn sản phẩm từ các bài đăng"
                  className="cursor-help text-[10px] text-[var(--dim)]"
                >
                  ⓘ
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                {totalInquiries > 0 ? (
                  <>
                    <span className="font-mono text-2xl font-black text-blue-400">
                      {totalInquiries}
                    </span>
                    <span className="text-xs text-[var(--dim)] font-medium">inbox</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold text-[var(--ink)]">Chưa có dữ liệu</span>
                    <span className="text-xs text-[var(--dim)]">inbox</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--border)]/40">
            <span className="text-[10px] text-[var(--dim)] truncate block">
              {totalInquiries > 0
                ? `${(totalInquiries / (kpis.totalPosts || 1)).toFixed(2)} inb/bài`
                : "Chưa có dữ liệu hợp lệ để tính toán"}
            </span>
          </div>
        </div>

        {/* Thẻ 4: Múi giờ */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col justify-between transition hover:border-[var(--border-hover,#3f3f46)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-medium text-[var(--dim)] block">Múi giờ</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs font-bold text-[var(--ink)] truncate max-w-[150px]">
                  Asia/Ho_Chi_Minh
                </span>
                <span className="text-[10px] font-mono font-medium text-emerald-400">
                  (UTC+7)
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block shrink-0" />
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--border)]/40">
            <span className="text-[10px] text-[var(--dim)] block">
              Thời gian hiển thị theo múi giờ của bạn
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

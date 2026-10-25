import { memo } from "react";

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
    <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-center lg:justify-between">
      {/* Tiêu đề & Subtitle kèm Icon biểu đồ cam */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] sm:text-2xl">
            Phân tích tương tác
          </h1>
          <p className="text-xs font-medium text-[var(--dim)] mt-0.5">
            Hiệu quả bài đăng Facebook · Tối ưu nội dung, tăng tương tác
          </p>
        </div>
      </div>

      {/* Thông tin cập nhật & Bộ nút hành động */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Badge Cập nhật */}
        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs text-[var(--dim)] font-mono">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Cập nhật:</span>
          <strong className="text-[var(--ink)] font-medium">{formattedTime}</strong>
          <span className="rounded bg-[var(--surface-alt)] px-1.5 py-0.2 text-[10px] text-blue-400 font-semibold border border-[var(--border)]">
            UTC+7
          </span>
        </div>

        {/* Nút Tải lại số liệu */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-alt)] transition cursor-pointer disabled:opacity-50"
          title="Tải lại số liệu dashboard"
        >
          <svg className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>{isRefreshing ? "Đang tải…" : "Tải lại số liệu"}</span>
        </button>

        {/* Nút Đồng bộ bài đăng */}
        <button
          type="button"
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-alt)] transition cursor-pointer disabled:opacity-50"
          title="Đồng bộ bài đã xuất bản từ Hàng đợi"
        >
          <svg className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          <span>{isSyncing ? "Đang đồng bộ…" : "Đồng bộ bài đăng"}</span>
        </button>

        {/* Nút Quét tương tác (Màu vàng cam nổi bật) */}
        <button
          type="button"
          onClick={onScan}
          disabled={isScanning}
          className="flex items-center gap-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-4 py-1.5 text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
          title="Kích hoạt Chrome Extension quét tương tác"
        >
          <svg className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>{isScanning ? "Đang quét…" : "Quét tương tác"}</span>
        </button>
      </div>
    </div>
  );
});

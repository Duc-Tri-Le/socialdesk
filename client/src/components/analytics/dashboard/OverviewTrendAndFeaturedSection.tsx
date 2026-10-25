import { memo, useState } from "react";
import type { Metric, AnalyticsSubTab } from "../analyticsTypes";

interface OverviewTrendAndFeaturedSectionProps {
  metrics?: Metric[];
  onNavigate: (tab: AnalyticsSubTab) => void;
}

export const OverviewTrendAndFeaturedSection = memo(function OverviewTrendAndFeaturedSection({
  metrics = [],
  onNavigate,
}: OverviewTrendAndFeaturedSectionProps) {
  const [trendDays, setTrendDays] = useState<"7d" | "30d">("7d");

  // Lọc bài đăng có tương tác thực tế
  const activeScannedPosts = metrics
    .filter((m) => !!m.scanned_at || m.likes > 0 || m.comments > 0)
    .sort((a, b) => b.score - a.score);

  const hasData = activeScannedPosts.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* CỘT 1: XU HƯỚNG TƯƠNG TÁC */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[var(--ink)]">
                Xu hướng tương tác
              </h2>
              <p className="text-xs text-[var(--dim)]">
                Biểu đồ theo ngày · Khi có đủ dữ liệu sẽ hiển thị xu hướng
              </p>
            </div>
          </div>

          <div className="relative">
            <select
              value={trendDays}
              onChange={(e) => setTrendDays(e.target.value as any)}
              className="appearance-none rounded-full border border-[var(--border)] bg-[var(--surface-alt)]/60 py-1.5 px-3 pr-7 text-xs font-medium text-[var(--ink)] focus:outline-none cursor-pointer"
            >
              <option value="7d">7 ngày</option>
              <option value="30d">30 ngày</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--dim)]">
              ▼
            </span>
          </div>
        </div>

        {/* Nội dung khi chưa có đủ dữ liệu hoặc biểu đồ */}
        {!hasData ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-alt)] text-[var(--dim)] mb-1">
              <svg className="h-6 w-6 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-[var(--ink)]">
              Chưa có đủ dữ liệu để hiển thị biểu đồ
            </h3>
            <p className="text-xs text-[var(--dim)] max-w-xs">
              Hãy quét bài đăng để thu thập dữ liệu tương tác.
            </p>
          </div>
        ) : (
          <div className="py-4 space-y-3">
            <div className="text-xs text-[var(--dim)]">
              Đo lường từ <strong className="text-[var(--ink)]">{activeScannedPosts.length}</strong> bài đăng đã quét thành công.
            </div>
            <div className="space-y-2">
              {activeScannedPosts.slice(0, 3).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs py-1 border-b border-[var(--border)]/30">
                  <span className="text-[var(--ink)] truncate max-w-[200px] font-medium">{p.product_name}</span>
                  <span className="font-mono font-bold text-emerald-400">{p.score}đ</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CỘT 2: BÀI ĐĂNG NỔI BẬT */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <svg className="h-4 w-4 fill-amber-500" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[var(--ink)]">
                Bài đăng nổi bật
              </h2>
              <p className="text-xs text-[var(--dim)]">
                Top bài đăng có hiệu quả tốt nhất (khi có dữ liệu)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate("ranking")}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--ink)] hover:text-[var(--accent)] transition cursor-pointer"
          >
            <span>Xem tất cả</span>
            <span>→</span>
          </button>
        </div>

        {/* Nội dung khi chưa có bài đăng nổi bật */}
        {!hasData ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-alt)] text-[var(--dim)] mb-1">
              <svg className="h-6 w-6 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-[var(--ink)]">
              Chưa có dữ liệu bài đăng
            </h3>
            <p className="text-xs text-[var(--dim)] max-w-xs">
              Sau khi quét dữ liệu, chúng tôi sẽ hiển thị các bài đăng có hiệu quả tốt nhất và cần cải thiện nhất.
            </p>
          </div>
        ) : (
          <div className="space-y-2 py-1">
            {activeScannedPosts.slice(0, 3).map((p, idx) => (
              <div
                key={p.id}
                onClick={() => onNavigate("ranking")}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-alt,#27272a)]/40 p-3 hover:border-[var(--accent)] transition cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`font-mono text-sm font-extrabold ${idx === 0 ? "text-amber-400" : "text-[var(--dim)]"}`}>
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--ink)] truncate max-w-[200px]">{p.product_name}</p>
                    <p className="text-[11px] text-[var(--dim)] truncate">{p.channel_name}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-sm font-bold text-[var(--ink)]">{p.score}đ</span>
                  <span className="block text-[10px] text-blue-400 font-medium">{p.inquiries} inb</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

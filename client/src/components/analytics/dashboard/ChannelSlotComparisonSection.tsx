import { memo, useMemo, useState } from "react";
import type { Analytics, Metric } from "../analyticsTypes";
import { computeChannelSummaries } from "../helpers/analyticsCalculations";

interface ChannelSlotComparisonSectionProps {
  analytics?: Analytics;
  metrics?: Metric[];
}

export const ChannelSlotComparisonSection = memo(function ChannelSlotComparisonSection({
  analytics,
  metrics = [],
}: ChannelSlotComparisonSectionProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Tính toán dữ liệu so sánh 3 kênh từ helper dùng chung
  const channelsData = useMemo(() => {
    return computeChannelSummaries(metrics, analytics);
  }, [analytics, metrics]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 shadow-xs transition space-y-6">
      {/* Header: Chuẩn theo thiết kế mockup (Tiêu đề bên trái, 30 ngày gần nhất bên phải) */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)]">
          So sánh kênh & khung giờ vàng
        </h2>
        <span className="text-xs sm:text-sm font-medium text-[var(--dim)]">
          30 ngày gần nhất
        </span>
      </div>

      {/* 3 Cột Kênh đặt cạnh nhau chuẩn pixel-perfect theo ảnh tham chiếu */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {channelsData.map((ch) => {
          const hasData = ch.totalPosts > 0;
          const isSampleSufficient = ch.totalPosts >= 3;

          return (
            <div
              key={ch.type}
              className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)]/50 p-5 transition hover:border-[var(--border-hover)]"
            >
              {/* Phần 1: Tên kênh & Số lượng bài đã đăng */}
              <div>
                <h3 className="text-base font-bold text-[var(--ink)]">{ch.title}</h3>
                <p className="text-xs text-[var(--dim)] mt-1">
                  {hasData ? `${ch.totalPosts} bài đã đăng` : "0 bài trong dữ liệu"}
                </p>
              </div>

              {/* Phần 2: Điểm tương tác TB & Số khách Inbox */}
              <div className="border-t border-[var(--border)] my-4 pt-4">
                <span className="text-xs text-[var(--dim)] font-medium block">
                  Điểm tương tác TB
                </span>
                <div className="text-xl font-bold text-[var(--ink)] mt-1.5 tracking-tight font-mono">
                  {!hasData
                    ? "Chưa có dữ liệu"
                    : isSampleSufficient
                      ? `${ch.avgScore}đ`
                      : "Chưa đủ dữ liệu"}
                </div>
                <p className="text-xs text-[var(--dim)] mt-1.5">
                  {hasData ? `Inbox: ${ch.totalInquiries} đã ghi nhận` : "Inbox: Chưa xác định"}
                </p>
              </div>

              {/* Phần 3: Khung giờ vàng - Trung thực 100% theo dữ liệu thực tế */}
              <div className="border-t border-[var(--border)] pt-4">
                <span className="text-xs text-[var(--dim)] font-medium block">
                  Khung giờ tốt nhất
                </span>

                {hasData && isSampleSufficient && ch.bestSlot !== "Chưa đủ dữ liệu" ? (
                  <div className="mt-1.5">
                    <div className="text-sm font-semibold text-[var(--ink)] font-mono">
                      {ch.bestSlot}
                    </div>
                    <div className="text-xs text-[var(--dim)] mt-1">
                      Xác nhận từ {ch.totalPosts} bài đăng
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-2 text-xs text-[var(--dim)]">
                    <svg
                      className="h-4 w-4 text-[var(--dim)] shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>
                      {!hasData
                        ? "Cần dữ liệu bài đăng"
                        : "Cần tối thiểu 3 bài đã quét để xác nhận"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Nút tròn mũi tên mở rộng / thu gọn chi tiết 7 khung giờ */}
      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-alt)] hover:border-[var(--border-hover)] text-[var(--dim)] hover:text-[var(--ink)] transition cursor-pointer shadow-xs"
          title={showDetails ? "Thu gọn chi tiết khung giờ" : "Xem chi tiết phân bố 7 khung giờ"}
        >
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Chi tiết phân bố 7 khung giờ khi bấm mở rộng */}
      {showDetails && (
        <div className="border-t border-[var(--border)] pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--ink)]">
                Chi tiết xếp hạng 7 khung giờ theo kênh
              </h3>
              <p className="text-xs text-[var(--dim)] mt-0.5">
                Đo lường thời điểm người dùng tương tác cao nhất và dễ để lại Inbox nhất
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {channelsData.map((ch) => (
              <div
                key={`detail_${ch.type}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)]/40 p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-xs font-bold text-[var(--ink)]">{ch.title}</span>
                  <span className="text-[10px] text-[var(--dim)] font-mono">
                    {ch.totalPosts} bài đăng
                  </span>
                </div>

                <div className="space-y-1.5">
                  {ch.slotsRanked.map((s) => (
                    <div
                      key={s.slot}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                        s.isBest
                          ? "bg-[var(--accent-subtle)] border border-[var(--accent)]/30 text-[var(--accent-ink)] font-semibold"
                          : s.posts > 0
                            ? "bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)]/60"
                            : "text-[var(--dim)] opacity-50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {s.isBest && <span className="text-[10px] text-[var(--accent)]">★</span>}
                        <span>{s.slot}</span>
                      </div>
                      <span className="font-mono text-[11px]">
                        {s.posts > 0 ? `${s.avgScore}đ (${s.posts} bài)` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

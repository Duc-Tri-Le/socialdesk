import { memo, useState, useMemo } from "react";
import { usePagination, Pagination } from "../../ui";
import type { Metric, AnalyticsSubTab } from "../analyticsTypes";
import {
  diagnosePost,
  filterAndSortMetrics,
  type TimeFilter,
  type StatusFilter,
  type SortOption,
} from "../helpers/analyticsCalculations";

interface RankedPostsSectionProps {
  metrics: Metric[];
  onNavigate: (tab: AnalyticsSubTab) => void;
  thumbnailsMap?: Record<number, string>;
}

export const RankedPostsSection = memo(function RankedPostsSection({
  metrics,
  thumbnailsMap = {},
}: RankedPostsSectionProps) {
  // Trạng thái tìm kiếm & bộ lọc
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("score");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 1. Thống kê 3 thẻ đầu trang (Tổng bài, Đã quét, Chưa quét)
  const totalCount = metrics.length;
  const scannedCount = useMemo(
    () => metrics.filter((m) => !!m.scanned_at || m.likes > 0 || m.comments > 0).length,
    [metrics],
  );
  const unscannedCount = totalCount - scannedCount;

  // 2. Lọc & sắp xếp dữ liệu qua pure helper
  const sortedPosts = useMemo(
    () => filterAndSortMetrics(metrics, search, timeFilter, statusFilter, sortBy),
    [metrics, search, timeFilter, statusFilter, sortBy],
  );

  // 3. Phân trang bằng hook usePagination dùng chung
  const {
    page: currentPage,
    pageSize,
    pagedItems: paginatedPosts,
    resetPage,
    paginationProps,
  } = usePagination(sortedPosts, { pageSize: 10 });

  const maxInquiries = useMemo(() => Math.max(0, ...metrics.map((x) => x.inquiries)), [metrics]);
  const maxScore = useMemo(() => Math.max(0, ...metrics.map((x) => x.score)), [metrics]);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* 1. Tiêu đề mô tả */}
      <div>
        <p className="text-xs sm:text-sm text-[var(--dim)]">
          Theo dõi và so sánh hiệu suất bài đăng Facebook
        </p>
      </div>

      {/* 2. Ba thẻ KPI tóm tắt (Tổng bài, Đã quét, Chưa quét) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-[var(--dim)]">Tổng bài đăng</span>
          <span className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)] mt-2 font-mono">
            {totalCount}
          </span>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-[var(--dim)]">Đã quét</span>
          <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-2 font-mono">
            {scannedCount}
          </span>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-[var(--dim)]">Chưa quét</span>
          <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-2 font-mono">
            {unscannedCount}
          </span>
        </div>
      </div>

      {/* 3. Ô tìm kiếm & Bộ lọc bo tròn (Pill style) */}
      <div className="space-y-3">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Tìm tên bài đăng hoặc nhóm Facebook..."
            className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-xs sm:text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--accent)] transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                resetPage();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--dim)] hover:text-[var(--ink)]"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <select
              value={timeFilter}
              onChange={(e) => {
                setTimeFilter(e.target.value as TimeFilter);
                resetPage();
              }}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 pr-8 text-xs text-[var(--ink)] appearance-none cursor-pointer focus:outline-none focus:border-[var(--accent)] transition"
            >
              <option value="all">Tất cả thời gian</option>
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
              <option value="this_month">Tháng này</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--dim)]">
              ▼
            </span>
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                resetPage();
              }}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 pr-8 text-xs text-[var(--ink)] appearance-none cursor-pointer focus:outline-none focus:border-[var(--accent)] transition"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="scanned">Đã quét</option>
              <option value="unscanned">Chưa quét</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--dim)]">
              ▼
            </span>
          </div>
        </div>
      </div>

      {/* 4. Thanh số lượng bài & Sắp xếp */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs sm:text-sm font-medium text-[var(--dim)]">
          {sortedPosts.length} bài đăng
        </span>

        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortOption);
              resetPage();
            }}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 pr-8 text-xs text-[var(--ink)] appearance-none cursor-pointer focus:outline-none focus:border-[var(--accent)] transition"
          >
            <option value="score">Xếp theo điểm</option>
            <option value="inquiries">Xếp theo Inbox</option>
            <option value="likes">Xếp theo Like</option>
            <option value="newest">Mới nhất</option>
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--dim)]">
            ▼
          </span>
        </div>
      </div>

      {/* 5. Danh sách bài viết xếp hạng */}
      <div className="divide-y divide-[var(--border)]/60 border-t border-b border-[var(--border)]/60">
        {paginatedPosts.length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--dim)] italic">
            Không tìm thấy bài đăng nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          paginatedPosts.map((m, idx) => {
            const rankIndex = (currentPage - 1) * pageSize + idx + 1;
            const isExpanded = expandedId === m.id;
            const isScanned = !!m.scanned_at || m.likes > 0 || m.comments > 0;
            const diagnosis = diagnosePost(m, maxInquiries, maxScore);
            const thumb = (m.draft_id && thumbnailsMap[m.draft_id]) || "";

            return (
              <div key={m.id} className="py-4 transition hover:bg-[var(--surface)]/40">
                <div
                  onClick={() => toggleExpand(m.id)}
                  className="flex items-center justify-between gap-4 cursor-pointer px-1"
                >
                  {/* Cột trái: Số thứ tự + Tên xe + Kênh & Chỉ số */}
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-6 shrink-0 text-center">
                      <span
                        className={`text-base font-extrabold ${rankIndex === 1 ? "text-amber-400" : "text-[var(--dim)]"
                          }`}
                      >
                        {rankIndex}
                      </span>
                    </div>

                    {thumb && (
                      <img
                        src={thumb}
                        alt={m.product_name}
                        className="h-11 w-11 shrink-0 rounded-lg border border-[var(--border)] object-cover hidden sm:block"
                      />
                    )}

                    <div className="min-w-0 space-y-1">
                      <h3
                        className="text-sm sm:text-base font-bold text-[var(--ink)] truncate max-w-[280px] sm:max-w-[420px]"
                        title={m.product_name}
                      >
                        {m.product_name}
                      </h3>
                      <p className="text-xs text-[var(--dim)] truncate">
                        {m.channel_name}
                      </p>

                      {/* Chỉ số: Like, Bình luận, Inbox - Bỏ chốt đơn */}
                      {isScanned ? (
                        <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--dim)]">
                          <span>
                            {m.likes} Like · {m.comments} Bình luận ·{" "}
                            <strong className="text-blue-500 font-bold">{m.inquiries} Inbox</strong>
                          </span>
                          {diagnosis.tagType === "cta_issue" && (
                            <span className="rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.2 text-[10px] font-medium">
                              {diagnosis.tag}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-block rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-semibold">
                          Chưa quét
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cột phải: Điểm số hoặc Chưa có dữ liệu */}
                  <div className="shrink-0 text-right">
                    {isScanned ? (
                      <div>
                        <span className="block text-xl sm:text-2xl font-black text-[var(--ink)] font-mono leading-none">
                          {m.score}đ
                        </span>
                        <span className="text-[10px] sm:text-xs text-[var(--dim)] mt-1 block">
                          Điểm số
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="block text-xl sm:text-2xl font-normal text-[var(--dim)] leading-none">
                          ——
                        </span>
                        <span className="text-[10px] sm:text-xs text-amber-400 font-medium mt-1 block">
                          Chưa có dữ liệu
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chi tiết mở rộng khi bấm vào dòng */}
                {isExpanded && (
                  <div className="mt-3 ml-10 mr-1 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-3.5 text-xs space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--dim)]">Khung giờ:</span>
                        <span className="font-mono font-semibold text-[var(--ink)]">{m.hour_slot}</span>
                        <span className="text-[var(--dim)]">·</span>
                        <span className="text-[var(--dim)] font-mono">
                          {new Date(m.posted_at).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      {m.scanned_at && (
                        <span className="text-[10px] text-[var(--dim)] font-mono">
                          Quét: {new Date(m.scanned_at).toLocaleTimeString("vi-VN")}
                        </span>
                      )}
                    </div>

                    {diagnosis.reason && (
                      <p className="text-[11px] text-[var(--dim)] italic">
                        💡 {diagnosis.reason}
                      </p>
                    )}

                    {m.notes && (
                      <div className="text-[11px] text-[var(--ink)] leading-relaxed whitespace-pre-line bg-[var(--bg)]/50 p-2.5 rounded-lg border border-[var(--border)]">
                        {m.notes}
                      </div>
                    )}

                    {m.post_url && (
                      <div className="pt-1">
                        <a
                          href={m.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Mở bài viết thực tế trên Facebook ↗</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 6. Phân trang chuẩn với nhãn Trang trước, Trang sau đồng bộ toàn ứng dụng */}
      {sortedPosts.length > 0 && (
        <Pagination
          {...paginationProps}
          itemLabel="bài đăng"
          navLabel="Phân trang bảng xếp hạng"
          prevLabel="Trang trước"
          nextLabel="Trang sau"
        />
      )}
    </div>
  );
});

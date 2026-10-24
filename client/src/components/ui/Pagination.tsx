import { btnGhost } from "../../utils/styles";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  rangeStart?: number;
  rangeEnd?: number;
  itemLabel?: string;
  infoText?: string;
  navLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
  className?: string;
}

/**
 * Thuật toán tính danh sách trang kèm dấu "…" khi có nhiều trang
 */
export function computePagination(
  current: number,
  total: number,
): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

/**
 * Component phân trang dùng chung cho toàn bộ ứng dụng:
 * - Hỗ trợ responsive (tự canh lề trên di động và màn hình rộng)
 * - Tự động tính toán các nút trang kèm dấu "…"
 * - Hiển thị tóm tắt dải bản ghi (ví dụ: 1–10 / 25 sản phẩm)
 * - Chuẩn accessibility: aria-label, aria-current="page"
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  rangeStart,
  rangeEnd,
  itemLabel = "mục",
  infoText,
  navLabel = "Phân trang",
  prevLabel = "‹ Trước",
  nextLabel = "Sau ›",
  className = "",
}: PaginationProps) {
  if (totalPages <= 1 && !infoText && totalItems === undefined) {
    return null;
  }

  const pages = computePagination(page, totalPages);

  const calculatedStart =
    rangeStart !== undefined
      ? rangeStart
      : totalItems && pageSize
        ? (page - 1) * pageSize + 1
        : undefined;

  const calculatedEnd =
    rangeEnd !== undefined
      ? rangeEnd
      : totalItems && pageSize
        ? Math.min(totalItems, page * pageSize)
        : undefined;

  return (
    <nav
      aria-label={navLabel}
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      {/* Tóm tắt số trang và dải hiển thị */}
      <div className="text-xs text-[var(--dim)]" role="status">
        {infoText ? (
          <p>{infoText}</p>
        ) : totalItems !== undefined && calculatedStart !== undefined && calculatedEnd !== undefined ? (
          <p>
            Trang {page}/{totalPages} — hiển thị{" "}
            <strong className="font-mono text-[var(--text)]">
              {calculatedStart}–{calculatedEnd} / {totalItems}
            </strong>{" "}
            {itemLabel}
            {pageSize ? ` (tối đa ${pageSize} ${itemLabel}/trang)` : ""}
          </p>
        ) : (
          <p>Trang {page}/{totalPages}</p>
        )}
      </div>

      {/* Các nút bấm chuyển trang */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={btnGhost}
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            aria-label={`${prevLabel} — ${navLabel}`}
          >
            {prevLabel}
          </button>

          {pages.map((p, idx) => {
            if (p === "…") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  aria-hidden="true"
                  className="px-1 text-sm text-[var(--dim)]"
                >
                  …
                </span>
              );
            }

            const isCurrent = p === page;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-label={`Đi tới trang ${p}`}
                aria-current={isCurrent ? "page" : undefined}
                className={`min-w-9 rounded-[var(--radius)] px-2.5 py-2 text-sm font-semibold transition-colors ${
                  isCurrent
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--text)]"
                }`}
              >
                {p}
              </button>
            );
          })}

          <button
            type="button"
            className={btnGhost}
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            aria-label={`${nextLabel} — ${navLabel}`}
          >
            {nextLabel}
          </button>
        </div>
      )}
    </nav>
  );
}

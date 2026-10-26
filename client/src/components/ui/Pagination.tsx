import { useState, useEffect, useMemo } from "react";
import { btnGhost } from "../../utils/styles";

export interface UsePaginationOptions {
  pageSize?: number;
  initialPage?: number;
}

export interface UsePaginationReturn<T> {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  pagedItems: T[];
  rangeStart: number;
  rangeEnd: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  setPage: (page: number | ((prev: number) => number)) => void;
  nextPage: () => void;
  prevPage: () => void;
  setPageSize: (size: number) => void;
  resetPage: () => void;
  paginationProps: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalItems: number;
    pageSize: number;
    rangeStart: number;
    rangeEnd: number;
  };
}

/**
 * Hook phân trang dùng chung cho mọi danh sách trong ứng dụng:
 * Tự động tính toán trang an toàn, dải bản ghi hiển thị (rangeStart/rangeEnd),
 * cắt danh sách pagedItems, và cung cấp sẵn paginationProps để gắn vào <Pagination />.
 */
export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {},
): UsePaginationReturn<T> {
  const { pageSize: initialPageSize = 10, initialPage = 1 } = options;
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(initialPage);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // Tự động kéo về trang hợp lệ khi danh sách bị lọc ngắn lại
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(totalItems, safePage * pageSize);

  const nextPage = () => setPage((p) => Math.min(totalPages, p + 1));
  const prevPage = () => setPage((p) => Math.max(1, p - 1));
  const resetPage = () => setPage(1);

  return {
    page: safePage,
    pageSize,
    totalPages,
    totalItems,
    pagedItems,
    rangeStart,
    rangeEnd,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
    setPage,
    nextPage,
    prevPage,
    setPageSize,
    resetPage,
    paginationProps: {
      page: safePage,
      totalPages,
      onPageChange: setPage,
      totalItems,
      pageSize,
      rangeStart,
      rangeEnd,
    },
  };
}

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
 * Thuật toán tính danh sách trang:
 * - Quy tắc hiển thị tối đa 7 phần tử (số trang + dấu '…').
 * - Bắt buộc luôn hiển thị trang đầu (1) và trang cuối (total).
 * - Xung quanh trang hiện tại luôn hiển thị trang trước (current - 1) và trang sau (current + 1).
 *   Ví dụ:
 *     - Ở trang 3: hiển thị [1, 2, 3, 4, 5, "…", total] (có cả trang 2 và 4)
 *     - Ở trang 5: hiển thị [1, "…", 4, 5, 6, "…", total] (có cả trang 4 và 6)
 * - Trang nào không hiển thị được thay thế bằng dấu '…' ở khoảng trống.
 */
export function computePagination(
  current: number,
  total: number,
): (number | "…")[] {
  if (total <= 1) return [1];
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const safeCurrent = Math.min(Math.max(1, current), total);

  // TH1: Gần đầu (safeCurrent <= 4)
  // [1, 2, 3, 4, 5, "…", total]
  // - Ở trang 1: hiển thị 1, 2, 3, 4, 5, "…", total
  // - Ở trang 2: có 1, 3 bên cạnh
  // - Ở trang 3: có 2, 4 bên cạnh
  // - Ở trang 4: có 3, 5 bên cạnh
  if (safeCurrent <= 4) {
    return [1, 2, 3, 4, 5, "…", total];
  }

  // TH2: Gần cuối (safeCurrent >= total - 3)
  // [1, "…", total - 4, total - 3, total - 2, total - 1, total]
  // - Ví dụ total = 10: safeCurrent >= 7 -> [1, "…", 6, 7, 8, 9, 10]
  // - Ở trang 7: có 6, 8 bên cạnh
  // - Ở trang 8: có 7, 9 bên cạnh
  // - Ở trang 9: có 8, 10 bên cạnh
  if (safeCurrent >= total - 3) {
    return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  }

  // TH3: Ở giữa (safeCurrent > 4 và safeCurrent < total - 3)
  // [1, "…", safeCurrent - 1, safeCurrent, safeCurrent + 1, "…", total]
  // - Ví dụ total = 10, safeCurrent = 5: [1, "…", 4, 5, 6, "…", 10] (có cả 4 và 6)
  // - Ví dụ total = 10, safeCurrent = 6: [1, "…", 5, 6, 7, "…", 10] (có cả 5 và 7)
  return [1, "…", safeCurrent - 1, safeCurrent, safeCurrent + 1, "…", total];
}

/**
 * Component phân trang dùng chung cho toàn bộ ứng dụng:
 * - Hỗ trợ responsive (tự canh lề trên di động và màn hình rộng)
 * - Tối đa 5 trang kèm dấu "…" bắt buộc có trang đầu và trang cuối
 * - Chuẩn hóa nhãn điều hướng: "Trang trước" và "Trang sau"
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
  prevLabel = "Trang trước",
  nextLabel = "Trang sau",
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

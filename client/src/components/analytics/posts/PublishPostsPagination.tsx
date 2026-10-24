import { memo } from "react";
import { btnOutline } from "../../../utils/styles";

interface PublishPostsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newSize: number) => void;
}

export const PublishPostsPagination = memo(function PublishPostsPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: PublishPostsPaginationProps) {
  return (
    <div className="bg-[var(--surface-alt)]/40 border-t border-[var(--border)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-[var(--dim)]">Hiển thị mỗi trang:</span>
        <select
          aria-label="Số bài mỗi trang"
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          <option value={10}>10 bài/trang</option>
          <option value={20}>20 bài/trang</option>
          <option value={50}>50 bài/trang</option>
        </select>
        <span className="text-[var(--dim)]">
          (Tổng cộng <strong className="text-[var(--ink)]">{total}</strong> lượt đăng)
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-[var(--dim)]">
          Trang <strong>{page}</strong> / {totalPages}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={`${btnOutline} text-xs px-2.5 py-1 disabled:opacity-40`}
        >
          ← Trước
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={`${btnOutline} text-xs px-2.5 py-1 disabled:opacity-40`}
        >
          Sau →
        </button>
      </div>
    </div>
  );
});

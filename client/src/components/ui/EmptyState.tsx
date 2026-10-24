import type { ReactNode } from "react";
import { btnGhost } from "../../utils/styles";

export interface EmptyStateProps {
  title?: string;
  message?: string | ReactNode;
  description?: string | ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Component hiển thị trạng thái rỗng (không có dữ liệu hoặc không khớp tìm kiếm):
 * - Viền nét đứt thanh lịch, nền tối ưu theo theme
 * - Có nút hành động (ví dụ "Xóa tìm kiếm" hoặc "Thêm mới")
 */
export function EmptyState({
  title,
  message,
  description,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  const content = message || description;

  return (
    <div
      className={`rounded-[var(--radius)] border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--dim)] ${className}`}
      role="status"
    >
      {title && <p className="mb-1 font-semibold text-[var(--text)]">{title}</p>}
      {content && <div>{content}</div>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={`${btnGhost} mt-3 text-xs font-semibold`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

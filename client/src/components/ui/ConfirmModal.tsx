import { useEffect, type ReactNode } from "react";
import { btnDanger, btnPrimary, btnGhost } from "../../utils/styles";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warn" | "primary";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Hộp thoại modal xác nhận hành động dùng chung:
 * - Dùng cho các hành động nguy hiểm: Xóa, Gỡ liên kết, Reset...
 * - Bắt phím Escape để đóng
 * - Nền mờ (backdrop blur), animation mượt mà
 */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const confirmBtnCls =
    variant === "danger"
      ? btnDanger
      : variant === "warn"
        ? "rounded-[var(--radius)] bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition-colors"
        : btnPrimary;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
              variant === "danger"
                ? "bg-red-500/15 text-red-500"
                : variant === "warn"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-blue-500/15 text-blue-400"
            }`}
          >
            {variant === "danger" ? "⚠️" : variant === "warn" ? "⚡" : "ℹ️"}
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="confirm-modal-title"
              className="text-base font-bold text-[var(--text)]"
            >
              {title}
            </h3>
            <div className="mt-1.5 text-xs leading-5 text-[var(--dim)]">
              {message}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className={btnGhost}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={confirmBtnCls}
          >
            {isLoading ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

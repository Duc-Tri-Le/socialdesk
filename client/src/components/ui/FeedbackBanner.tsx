export interface FeedbackMessage {
  ok: boolean;
  text: string;
}

export interface FeedbackBannerProps {
  feedback?: FeedbackMessage | null;
  message?: string;
  variant?: "ok" | "danger" | "info";
  onDismiss?: () => void;
  className?: string;
}

/**
 * Component hiển thị thông báo phản hồi thao tác (thành công hoặc lỗi) dùng chung:
 * - Hỗ trợ cả object `feedback: { ok, text }` lẫn prop `message` đơn giản
 * - Chuẩn màu semantic: ok (xanh), danger (đỏ), info (accent)
 * - Tự động ẩn khi không có thông báo, có nút đóng tùy chọn
 */
export function FeedbackBanner({
  feedback,
  message,
  variant,
  onDismiss,
  className = "",
}: FeedbackBannerProps) {
  const text = feedback?.text || message;
  if (!text) return null;

  const isOk = feedback ? feedback.ok : variant !== "danger";
  const colorCls =
    variant === "info"
      ? "text-[var(--accent-ink)]"
      : isOk
        ? "text-[var(--ok)]"
        : "text-[var(--danger)]";

  return (
    <div
      role="status"
      className={`mt-2 flex items-center justify-between gap-2 rounded-[var(--radius)] bg-[var(--surface-alt)] px-3 py-2 text-xs font-semibold ${colorCls} ${className}`}
    >
      <p className="min-w-0 flex-1">{text}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-2 text-xs text-[var(--dim)] hover:text-[var(--text)] transition-colors"
          aria-label="Đóng thông báo"
        >
          ✕
        </button>
      )}
    </div>
  );
}

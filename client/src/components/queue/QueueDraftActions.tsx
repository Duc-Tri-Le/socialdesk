import type { Draft } from "../../types";
import { btnDanger, btnGhost, btnPrimary } from "../../utils/styles";

export interface QueueDraftActionsProps {
  draft: Draft;
  isDraft: boolean;
  isApprovePending: boolean;
  onApprove: (id: number) => void;
  publishConfirm: boolean;
  onTogglePublishConfirm: () => void;
  isPublishPending: boolean;
  scheduleOpen: boolean;
  onToggleSchedule: () => void;
  open: boolean;
  onToggleOpen: () => void;
  isEditing: boolean;
  onStartEditing: () => void;
  rwJob: any;
  onRewrite: (d: Draft) => void;
  isPackPending: boolean;
  onPack: () => void;
  onGoMedia: () => void;
  onDelete: (id: number) => void;
}

export function QueueDraftActions({
  draft: d,
  isDraft,
  isApprovePending,
  onApprove,
  publishConfirm,
  onTogglePublishConfirm,
  isPublishPending,
  scheduleOpen,
  onToggleSchedule,
  open,
  onToggleOpen,
  isEditing,
  onStartEditing,
  rwJob,
  onRewrite,
  isPackPending,
  onPack,
  onGoMedia,
  onDelete,
}: QueueDraftActionsProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {isDraft ? (
        <button
          className={`${btnPrimary} whitespace-nowrap`}
          disabled={isApprovePending}
          onClick={() => onApprove(d.id)}
          aria-label={`Duyệt bài viết ${d.product_name}`}
        >
          {isApprovePending ? "Đang duyệt…" : "Duyệt bài viết"}
        </button>
      ) : (
        <>
          <button
            className={`${btnPrimary} whitespace-nowrap`}
            disabled={isPublishPending}
            aria-expanded={publishConfirm}
            aria-label={`Đăng Bài ${d.product_name} lên các đích đã chọn`}
            onClick={onTogglePublishConfirm}
          >
            {d.scheduled_at ? "Đăng ngay" : "Đăng Bài"}
          </button>

          <button
            type="button"
            className={`${btnGhost} whitespace-nowrap font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40`}
            aria-expanded={scheduleOpen}
            aria-label={`Lên lịch đăng bài ${d.product_name}`}
            onClick={onToggleSchedule}
          >
            {d.scheduled_at ? "⏰ Đổi giờ hẹn" : "⏰ Lên lịch đăng"}
          </button>
        </>
      )}

      <button
        type="button"
        className={btnGhost}
        aria-expanded={open}
        aria-label={`${open ? "Thu gọn" : "Xem chi tiết"} bài viết ${d.product_name}`}
        onClick={onToggleOpen}
      >
        {open ? "Thu gọn ▲" : "Xem chi tiết ▼"}
      </button>

      {open && isDraft && !isEditing && (
        <>
          <button
            className={btnGhost}
            disabled={!!rwJob}
            onClick={() => onRewrite(d)}
          >
            {rwJob
              ? rwJob.status === "running"
                ? "Đang viết lại…"
                : "Đang chờ viết lại…"
              : "Viết lại chuyên nghiệp"}
          </button>
          <button className={btnGhost} onClick={onStartEditing}>
            Sửa nội dung
          </button>
        </>
      )}

      {open && !isDraft && (
        <>
          <button
            className={`${btnGhost} whitespace-nowrap cursor-pointer`}
            disabled={isPackPending}
            aria-label={`Cập nhật gói đăng cho ${d.product_name} theo các đích đã chọn`}
            onClick={onPack}
          >
            {isPackPending ? "Đang cập nhật gói…" : "Cập nhật gói đăng"}
          </button>
          <button
            className={`${btnGhost} whitespace-nowrap`}
            onClick={onGoMedia}
          >
            Kiểm tra ảnh/video
          </button>
        </>
      )}

      <button
        className={`${btnDanger} whitespace-nowrap`}
        onClick={() => onDelete(d.id)}
        aria-label={`Xóa bản nháp ${d.code}`}
      >
        Xóa
      </button>
    </div>
  );
}

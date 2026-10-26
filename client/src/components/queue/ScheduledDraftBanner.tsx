import { formatScheduledTime, getTimeUntil } from "./queueHelpers";

export interface ScheduledDraftBannerProps {
  scheduledAt: string;
  onOpenSchedule: () => void;
  onCancelSchedule?: () => void;
  isCancelPending?: boolean;
}

export function ScheduledDraftBanner({
  scheduledAt,
  onOpenSchedule,
  onCancelSchedule,
  isCancelPending,
}: ScheduledDraftBannerProps) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 px-3.5 py-2.5 text-xs text-indigo-950 dark:text-indigo-100">
      <div className="flex items-center gap-2">
        <div>
          <span className="font-bold text-indigo-900 dark:text-indigo-200">
            Đã hẹn giờ đăng tự động:
          </span>{" "}
          <strong className="underline decoration-indigo-400 font-semibold">
            {formatScheduledTime(scheduledAt)}
          </strong>{" "}
          <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">
            ({getTimeUntil(scheduledAt)})
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenSchedule}
          className="rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-indigo-900/60 hover:bg-indigo-50 dark:hover:bg-indigo-900 px-2.5 py-1 text-xs font-semibold text-indigo-800 dark:text-indigo-100 transition cursor-pointer shadow-xs"
        >
          Đổi giờ
        </button>
        {onCancelSchedule && (
          <button
            type="button"
            disabled={isCancelPending}
            onClick={onCancelSchedule}
            className="rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-rose-950/50 hover:bg-rose-50 dark:hover:bg-rose-900/50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300 transition cursor-pointer disabled:opacity-50 shadow-xs"
          >
            {isCancelPending ? "Đang hủy…" : "Hủy lịch"}
          </button>
        )}
      </div>
    </div>
  );
}

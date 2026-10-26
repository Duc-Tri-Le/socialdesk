import { useState, useMemo } from "react";
import type { Account, Draft, Group, Page } from "../../types";
import { btnGhost, btnPrimary, inputCls } from "../../utils/styles";

export interface SchedulePublishDialogProps {
  draft: Draft;
  selectedPageIds: number[];
  selectedIgIds: number[];
  selectedGroupIds: number[];
  allPages: Page[];
  igAccounts: Account[];
  joinedGroups: Group[];
  isSchedulePending: boolean;
  onConfirmSchedule: (scheduledAt: string) => void;
  onCancel: () => void;
}

// Chuyển Date object sang format YYYY-MM-DDTHH:mm cho input[type="datetime-local"]
function toLocalDatetimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function SchedulePublishDialog({
  draft: d,
  selectedPageIds,
  selectedIgIds,
  selectedGroupIds,
  allPages,
  igAccounts,
  joinedGroups,
  isSchedulePending,
  onConfirmSchedule,
  onCancel,
}: SchedulePublishDialogProps) {
  // Lấy thời gian tối thiểu: hiện tại + 2 phút
  const now = new Date();
  const minDate = new Date(now.getTime() + 2 * 60 * 1000);
  const minString = toLocalDatetimeString(minDate);

  // Mặc định: Nếu bài đã có lịch cũ thì dùng lịch cũ, nếu không thì chọn 1 giờ sau
  const defaultInitial = useMemo(() => {
    if (d.scheduled_at) {
      const prev = new Date(d.scheduled_at);
      if (prev.getTime() > now.getTime()) {
        return toLocalDatetimeString(prev);
      }
    }
    // Mặc định chọn tròn giờ tiếp theo (ví dụ 10:15 -> 11:00)
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    return toLocalDatetimeString(nextHour);
  }, [d.scheduled_at]);

  const [datetimeVal, setDatetimeVal] = useState<string>(defaultInitial);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const pickedPages = allPages.filter((p) => selectedPageIds.includes(p.id));
  const pickedIg = igAccounts.filter((a) => selectedIgIds.includes(a.id));
  const pickedGroups = joinedGroups.filter((g) => selectedGroupIds.includes(g.id));
  const nothingPicked =
    pickedPages.length === 0 && pickedIg.length === 0 && pickedGroups.length === 0;

  // Tính các gợi ý khung giờ thông minh
  const presets = useMemo(() => {
    const list: Array<{ label: string; date: Date; icon: string }> = [];
    const today = new Date();

    // 1. Tối nay 19:30 (hoặc tối mai nếu đã quá 19:30)
    const tonight = new Date(today);
    tonight.setHours(19, 30, 0, 0);
    if (tonight.getTime() > now.getTime() + 10 * 60 * 1000) {
      list.push({ label: "Tối nay (19:30)", date: tonight, icon: "🌙" });
    } else {
      const tomorrowNight = new Date(today);
      tomorrowNight.setDate(tomorrowNight.getDate() + 1);
      tomorrowNight.setHours(19, 30, 0, 0);
      list.push({ label: "Tối mai (19:30)", date: tomorrowNight, icon: "🌙" });
    }

    // 2. Sáng mai 08:00
    const tomorrowMorning = new Date(today);
    tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
    tomorrowMorning.setHours(8, 0, 0, 0);
    list.push({ label: "Sáng mai (08:00)", date: tomorrowMorning, icon: "☀️" });

    // 3. Trưa mai 11:30
    const tomorrowNoon = new Date(today);
    tomorrowNoon.setDate(tomorrowNoon.getDate() + 1);
    tomorrowNoon.setHours(11, 30, 0, 0);
    list.push({ label: "Trưa mai (11:30)", date: tomorrowNoon, icon: "🌤️" });

    // 4. Giờ vàng 20:30 tối mai
    const primeTime = new Date(today);
    primeTime.setDate(primeTime.getDate() + 1);
    primeTime.setHours(20, 30, 0, 0);
    list.push({ label: "Giờ vàng (20:30)", date: primeTime, icon: "⭐" });

    return list;
  }, []);

  const handleApplyPreset = (dt: Date) => {
    setDatetimeVal(toLocalDatetimeString(dt));
    setErrorMsg("");
  };

  const handleSubmit = () => {
    if (!datetimeVal) {
      setErrorMsg("Vui lòng chọn ngày và giờ lên lịch.");
      return;
    }
    const chosen = new Date(datetimeVal);
    if (isNaN(chosen.getTime())) {
      setErrorMsg("Thời gian không hợp lệ.");
      return;
    }
    if (chosen.getTime() <= Date.now() + 60 * 1000) {
      setErrorMsg("Thời gian lên lịch phải cách hiện tại ít nhất 1 phút.");
      return;
    }
    if (nothingPicked) {
      setErrorMsg("Chưa chọn đích đăng nào — vui lòng chọn ít nhất 1 trang hoặc nhóm.");
      return;
    }
    setErrorMsg("");
    onConfirmSchedule(chosen.toISOString());
  };

  // Preview định dạng tiếng Việt
  const previewText = useMemo(() => {
    if (!datetimeVal) return "";
    try {
      const parsed = new Date(datetimeVal);
      if (isNaN(parsed.getTime())) return "";
      const diffMs = parsed.getTime() - Date.now();
      if (diffMs <= 0) return "Thời gian đã qua, vui lòng chọn lại.";

      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      const timeFmt = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parsed);

      let relative = "";
      if (diffHours > 24) {
        const days = Math.floor(diffHours / 24);
        relative = `còn khoảng ${days} ngày nữa`;
      } else if (diffHours > 0) {
        relative = `còn ${diffHours} giờ ${diffMinutes} phút nữa`;
      } else {
        relative = `còn ${diffMinutes} phút nữa`;
      }

      return `${timeFmt} (${relative})`;
    } catch {
      return "";
    }
  }, [datetimeVal]);

  return (
    <div
      className="mt-3 rounded-2xl border-2 border-indigo-500/40 bg-[var(--surface)] p-4 sm:p-5 space-y-4 shadow-sm"
      role="group"
      aria-label={`Lên lịch đăng bài ${d.product_name}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-lg">
            ⏰
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
              Lên lịch đăng bài tự động
            </h3>
            <p className="text-xs text-[var(--dim)]">
              Bài sẽ tự động được xuất bản khi máy chủ chạy tới giờ hẹn
            </p>
          </div>
        </div>
      </div>

      {/* Gợi ý khung giờ nhanh */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--dim)] block">
          Chọn nhanh khung giờ tối ưu:
        </label>
        <div className="flex flex-wrap gap-2">
          {presets.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleApplyPreset(p.date)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] hover:border-indigo-500 hover:text-indigo-500 px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition cursor-pointer"
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input Datetime-Local */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--ink)] block">
          Thời gian đăng bài chính xác:
        </label>
        <input
          type="datetime-local"
          value={datetimeVal}
          min={minString}
          onChange={(e) => {
            setDatetimeVal(e.target.value);
            setErrorMsg("");
          }}
          className={`${inputCls} w-full max-w-sm font-mono text-sm cursor-pointer`}
        />
        {previewText && (
          <p className="text-xs text-indigo-600 dark:text-indigo-300 font-medium">
            👉 Dự kiến đăng: <strong>{previewText}</strong>
          </p>
        )}
      </div>

      {/* Tóm tắt đích đăng */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)]/50 p-3 space-y-2 text-xs">
        <div className="font-semibold text-[var(--ink)]">
          Đích đăng sẽ nhận bài ({pickedPages.length + pickedGroups.length + pickedIg.length} đích):
        </div>
        {nothingPicked ? (
          <p className="text-amber-600 font-medium">
            ⚠️ Chưa có đích đăng nào được chọn. Hãy bấm &ldquo;Chọn đích đăng&rdquo; trên thẻ bài viết.
          </p>
        ) : (
          <ul className="list-disc list-inside space-y-1 text-[var(--dim)]">
            {pickedPages.map((p) => (
              <li key={`p-${p.id}`}>
                Fanpage Facebook: <strong>{p.name}</strong>
              </li>
            ))}
            {pickedGroups.map((g) => (
              <li key={`g-${g.id}`}>
                Hội nhóm Facebook: <strong>{g.name}</strong>
              </li>
            ))}
            {pickedIg.map((a) => (
              <li key={`ig-${a.id}`}>
                Instagram: <strong>{a.name}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Lưu ý kỹ thuật */}
      <div className="rounded-lg bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-2.5 text-[11px] text-blue-800 dark:text-blue-200 leading-relaxed">
        💡 <strong>Cơ chế tự động:</strong> Khi đến giờ hẹn, máy chủ (<code>server.ts</code>) sẽ tự động kích hoạt tiến trình đăng. Đối với Hội nhóm, vui lòng giữ Chrome có Extension mở để hệ thống tự động đăng bài.
      </div>

      {/* Thông báo lỗi nếu có */}
      {errorMsg && (
        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-2.5 text-xs text-rose-700 dark:text-rose-300 font-medium">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Nút hành động */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]">
        <button
          type="button"
          disabled={isSchedulePending || nothingPicked}
          onClick={handleSubmit}
          className={`${btnPrimary} bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 font-bold disabled:opacity-50`}
        >
          {isSchedulePending ? "Đang lên lịch…" : "⏰ Xác nhận lên lịch đăng"}
        </button>
        <button
          type="button"
          disabled={isSchedulePending}
          onClick={onCancel}
          className={`${btnGhost} text-xs px-3 py-2`}
        >
          Đóng
        </button>
      </div>
    </div>
  );
}

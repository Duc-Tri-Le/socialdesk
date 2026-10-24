import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { fmtElapsed } from "../../utils/format";
import type { ComposeJob } from "../../context/ComposeJobsContext";
import { isGatewayTimeoutError } from "../../context/ComposeJobsContext";

export const JOBS_WIDGET_POS_KEY = "social-desk-jobs-widget-pos";

export function ComposeJobsWidget({
  jobs,
  onDismiss,
  onRetry,
}: {
  jobs: ComposeJob[];
  onDismiss: (id: number) => void;
  onRetry: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 390,
    h: typeof window !== "undefined" ? window.innerHeight : 720,
  }));
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === "undefined") return { x: 300, y: 560 };
    try {
      const raw = window.localStorage.getItem(JOBS_WIDGET_POS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
        if (
          typeof parsed.x === "number" &&
          typeof parsed.y === "number" &&
          Number.isFinite(parsed.x) &&
          Number.isFinite(parsed.y)
        ) {
          return {
            x: Math.min(
              Math.max(8, parsed.x),
              Math.max(8, window.innerWidth - 64),
            ),
            y: Math.min(
              Math.max(8, parsed.y),
              Math.max(8, window.innerHeight - 64),
            ),
          };
        }
      }
    } catch {
      // Dùng vị trí mặc định
    }
    return {
      x: Math.max(8, window.innerWidth - 72),
      y: Math.max(8, window.innerHeight - 190),
    };
  });
  const [, setTick] = useState(0);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const running = jobs.filter((j) => j.status === "running");
  const waiting = jobs.filter((j) => j.status === "waiting");
  const activeCount = running.length + waiting.length;
  const hasError = jobs.some((j) => j.status === "error");

  useEffect(() => {
    if (running.length === 0) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [running.length]);

  useEffect(() => {
    if (jobs.length === 0) setOpen(false);
  }, [jobs.length]);

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      setPos((p) => ({
        x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - 64)),
        y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - 64)),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (jobs.length === 0) return null;

  const clampPos = (x: number, y: number) => ({
    x: Math.min(Math.max(8, x), Math.max(8, viewport.w - 64)),
    y: Math.min(Math.max(8, y), Math.max(8, viewport.h - 64)),
  });

  const beginDrag = (e: ReactPointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
  };
  const moveDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    if (d.moved) setPos(clampPos(d.origX + dx, d.origY + dy));
  };
  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) {
      suppressClickRef.current = true;
      try {
        window.localStorage.setItem(JOBS_WIDGET_POS_KEY, JSON.stringify(pos));
      } catch {
        // Bỏ qua lỗi lưu vị trí
      }
    }
  };

  const onCircleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((o) => !o);
  };

  const statusRank = (j: ComposeJob) =>
    j.status === "running"
      ? 0
      : j.status === "waiting"
        ? 1
        : j.status === "error"
          ? 2
          : 3;
  const ordered = [...jobs].sort(
    (a, b) => statusRank(a) - statusRank(b) || a.createdAt - b.createdAt,
  );
  const openUp = pos.y > viewport.h / 2;
  const alignRight = pos.x > viewport.w / 2;
  const circleLabel =
    activeCount > 0
      ? `Tiến trình soạn bài: ${running.length} bài đang chạy, ${waiting.length} bài đang chờ. Bấm để ${open ? "thu gọn" : "xem danh sách"}, kéo để di chuyển.`
      : hasError
        ? `Có bài soạn bị lỗi. Bấm để ${open ? "thu gọn" : "xem danh sách"}, kéo để di chuyển.`
        : `Bài soạn vừa hoàn thành. Bấm để ${open ? "thu gọn" : "xem danh sách"}, kéo để di chuyển.`;

  return (
    <div
      className="fixed z-50"
      style={{ left: pos.x, top: pos.y }}
      aria-live="polite"
    >
      {open && (
        <div
          className={`absolute w-[300px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl ${
            openUp ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"
          } ${alignRight ? "right-0" : "left-0"}`}
          role="region"
          aria-label="Danh sách tiến trình soạn bài"
        >
          <div
            className="flex cursor-grab touch-none select-none items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 active:cursor-grabbing"
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <p className="text-sm font-bold">
              Tiến trình soạn bài
              <span className="ml-2 text-xs font-semibold text-[var(--dim)]">
                {running.length} đang chạy · {waiting.length} đang chờ
              </span>
            </p>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-base font-bold leading-none"
              aria-label="Thu gọn tiến trình soạn bài"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <ul className="max-h-[46vh] divide-y divide-[var(--border)] overflow-y-auto">
            {ordered.map((j) => (
              <li key={j.id} className="px-3 py-2.5">
                <p
                  className="truncate text-sm font-semibold"
                  title={j.label}
                >
                  {j.kind === "rewrite" ? "Viết lại: " : ""}
                  {j.label}
                </p>
                {j.status === "running" && (
                  <div className="mt-1.5">
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-alt)]"
                      role="progressbar"
                      aria-label={`Đang soạn bài ${j.label}`}
                    >
                      <div className="job-bar-indeterminate h-full w-1/3 rounded-full bg-[var(--accent)]" />
                    </div>
                    <p className="mt-1 text-xs font-medium text-[var(--accent-ink)]">
                      Đang chạy
                      {j.startedAt
                        ? ` · đã ${fmtElapsed(Date.now() - j.startedAt)}`
                        : ""}
                    </p>
                  </div>
                )}
                {j.status === "waiting" && (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[var(--dim)]">
                      Đang chờ · thứ {waiting.indexOf(j) + 1} trong hàng đợi
                    </p>
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)]"
                      aria-label={`Hủy bài đang chờ ${j.label}`}
                      onClick={() => onDismiss(j.id)}
                    >
                      Hủy
                    </button>
                  </div>
                )}
                {j.status === "done" && (
                  <p className="mt-1 text-xs font-semibold text-[var(--ok)]">
                    ✓ Đã xong
                    {j.note
                      ? ` — ${j.note}`
                      : j.kind === "create"
                        ? " — bài đã vào Hàng đợi duyệt"
                        : " — bài đã được viết lại"}
                  </p>
                )}
                {j.status === "error" && (
                  <div className="mt-1">
                    <p className="text-xs font-medium leading-5 text-[var(--danger)]">
                      Lỗi: {j.error || "Không soạn được bài này."}
                    </p>
                    {isGatewayTimeoutError(j.error) && (
                      <p className="mt-0.5 text-xs font-medium leading-5">
                        Đây là lỗi timeout của cổng kết nối — app đã tự
                        kiểm tra lại nhưng chưa thấy bài trong Hàng đợi
                        duyệt. Bấm “Thử lại” là an toàn: lượt soạn này có
                        mã chống trùng, nếu máy chủ đã kịp lưu bài thì app
                        dùng lại đúng bản đó, không tạo bản trùng.
                      </p>
                    )}
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white"
                        aria-label={`Thử soạn lại bài ${j.label}`}
                        onClick={() => onRetry(j.id)}
                      >
                        Thử lại
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold"
                        aria-label={`Bỏ qua bài bị lỗi ${j.label}`}
                        onClick={() => onDismiss(j.id)}
                      >
                        Bỏ qua
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--dim)]">
            Kéo vòng tròn (hoặc thanh tiêu đề này) để di chuyển · bài chạy
            xong sẽ tự biến mất khỏi danh sách.
          </p>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={circleLabel}
        title={circleLabel}
        onClick={onCircleClick}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-xl"
        style={{ cursor: "grab" }}
      >
        {activeCount > 0 ? (
          <>
            <svg
              aria-hidden
              className="absolute inset-0 h-full w-full animate-spin [animation-duration:2.2s]"
              viewBox="0 0 56 56"
            >
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="var(--surface-alt)"
                strokeWidth="4"
              />
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="38 113"
              />
            </svg>
            <span className="font-mono text-lg font-bold leading-none">
              {activeCount}
            </span>
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[11px] font-bold text-white">
              {activeCount}
            </span>
          </>
        ) : hasError ? (
          <span className="text-xl font-bold text-[var(--danger)]">!</span>
        ) : (
          <span className="text-xl font-bold text-[var(--ok)]">✓</span>
        )}
      </button>
    </div>
  );
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { fmtElapsed } from "../utils/format";

export type ComposeJobStatus = "waiting" | "running" | "done" | "error";

export interface ComposeJob {
  id: number;
  kind: "create" | "rewrite";
  label: string;
  draftId?: number;
  status: ComposeJobStatus;
  error: string;
  note: string;
  createdAt: number;
  startedAt: number | null;
}

export interface ReconciledComposeResult {
  reconciled: true;
  note: string;
  result: unknown;
}

export function isReconciledResult(v: unknown): v is ReconciledComposeResult {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as ReconciledComposeResult).reconciled === true
  );
}

export function isGatewayTimeoutError(message: string): boolean {
  return /timed?\s?out|gateway/i.test(message);
}

export interface EnqueueJobInput {
  kind: "create" | "rewrite";
  label: string;
  draftId?: number;
  run: () => Promise<unknown>;
  onDone?: (result: unknown) => void;
  onError?: (message: string) => void;
  reconcileOnError?: (message: string) => Promise<ReconciledComposeResult | null>;
}

export interface ComposeJobsContextValue {
  jobs: ComposeJob[];
  enqueue: (input: EnqueueJobInput) => void;
  dismiss: (id: number) => void;
  retry: (id: number) => void;
}

const ComposeJobsContext = createContext<ComposeJobsContextValue | null>(null);

export function useComposeJobs(): ComposeJobsContextValue {
  const ctx = useContext(ComposeJobsContext);
  if (!ctx)
    throw new Error("useComposeJobs phải nằm trong ComposeJobsProvider");
  return ctx;
}

const JOBS_WIDGET_POS_KEY = "social-desk-jobs-widget-pos";

export function ComposeJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ComposeJob[]>([]);
  const jobsRef = useRef<ComposeJob[]>([]);
  const executorsRef = useRef(
    new Map<
      number,
      {
        run: () => Promise<unknown>;
        onDone?: (result: unknown) => void;
        onError?: (message: string) => void;
        reconcileOnError?: (
          message: string,
        ) => Promise<ReconciledComposeResult | null>;
      }
    >(),
  );
  const nextIdRef = useRef(1);
  const pumpingRef = useRef(false);

  const pump = useCallback(() => {
    if (pumpingRef.current) return;
    const next = jobsRef.current.find((j) => j.status === "waiting");
    if (!next) return;
    const ex = executorsRef.current.get(next.id);
    if (!ex) {
      setJobs((prev) => prev.filter((j) => j.id !== next.id));
      return;
    }
    pumpingRef.current = true;
    setJobs((prev) =>
      prev.map((j) =>
        j.id === next.id
          ? { ...j, status: "running" as const, startedAt: Date.now() }
          : j,
      ),
    );
    void (async () => {
      const markDone = (note: string) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === next.id ? { ...j, status: "done" as const, note } : j,
          ),
        );
        window.setTimeout(() => {
          executorsRef.current.delete(next.id);
          setJobs((prev) => prev.filter((j) => j.id !== next.id));
        }, 2600);
      };
      try {
        const result = await ex.run();
        if (isReconciledResult(result)) {
          ex.onDone?.(result.result);
          markDone(result.note);
        } else {
          ex.onDone?.(result);
          markDone("");
        }
      } catch (err) {
        const rawMessage =
          err instanceof Error ? err.message : String(err || "");
        let handled = false;
        if (ex.reconcileOnError) {
          try {
            const rec = await ex.reconcileOnError(rawMessage);
            if (rec) {
              handled = true;
              ex.onDone?.(rec.result);
              markDone(rec.note);
            }
          } catch {
            // Đối soát lỗi thì giữ nguyên luồng lỗi cũ bên dưới.
          }
        }
        if (!handled) {
          ex.onError?.(rawMessage);
          setJobs((prev) =>
            prev.map((j) =>
              j.id === next.id
                ? {
                    ...j,
                    status: "error" as const,
                    error: rawMessage,
                  }
                : j,
            ),
          );
        }
      } finally {
        pumpingRef.current = false;
        pump();
      }
    })();
  }, []);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    pump();
  }, [jobs, pump]);

  const enqueue = useCallback(
    (input: EnqueueJobInput) => {
      const id = nextIdRef.current++;
      const item: ComposeJob = {
        id,
        kind: input.kind,
        label: input.label,
        draftId: input.draftId,
        status: "waiting",
        error: "",
        note: "",
        createdAt: Date.now(),
        startedAt: null,
      };
      executorsRef.current.set(id, {
        run: input.run,
        onDone: input.onDone,
        onError: input.onError,
        reconcileOnError: input.reconcileOnError,
      });
      setJobs((prev) => [...prev, item]);
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    executorsRef.current.delete(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const retry = useCallback((id: number) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? {
              ...j,
              status: "waiting" as const,
              error: "",
              note: "",
              startedAt: null,
            }
          : j,
      ),
    );
  }, []);

  return (
    <ComposeJobsContext.Provider value={{ jobs, enqueue, dismiss, retry }}>
      {children}
      <ComposeJobsWidget jobs={jobs} onDismiss={dismiss} onRetry={retry} />
    </ComposeJobsContext.Provider>
  );
}

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
      // Không đọc được vị trí đã lưu — dùng vị trí mặc định.
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
        // Không lưu được vị trí — bỏ qua, widget vẫn kéo đi được.
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

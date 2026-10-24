import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ComposeJobsWidget } from "../components/compose/ComposeJobsWidget";

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

export { ComposeJobsWidget, JOBS_WIDGET_POS_KEY } from "../components/compose/ComposeJobsWidget";


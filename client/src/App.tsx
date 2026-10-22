import {
createContext,
useCallback,
useContext,
useEffect,
useRef,
useState,
type FormEvent,
type PointerEvent as ReactPointerEvent,
type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";

type Overview = ApiResponse<typeof api, "getOverview">;
type Account = Overview["accounts"][number];
type Page = Overview["pages"][number];
type SheetConfig = ApiResponse<typeof api, "getSheetConfig">;
type SheetSource = SheetConfig["sources"][number];
type Product = ApiResponse<typeof api, "listProducts">["products"][number];
type Run = ApiResponse<typeof api, "listResearch">["runs"][number];
type Group = ApiResponse<typeof api, "listGroups">["groups"][number];
type ScannedGroup = ApiResponse<typeof api, "saveGroupLinks">["scanned"][number];
type Draft = ApiResponse<typeof api, "listDrafts">["drafts"][number];
type MediaItem = ApiResponse<typeof api, "listMedia">["media"][number];
type Metric = ApiResponse<typeof api, "listPostMetrics">["metrics"][number];
type Analytics = ApiResponse<typeof api, "getAnalytics">;
type ChannelInsight = Analytics["channels"][number];

type Tab =
  | "overview"
  | "accounts"
  | "products"
  | "research"
  | "groups"
  | "compose"
  | "queue"
  | "analytics"
  | "media";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "accounts", label: "Tài khoản" },
  { id: "products", label: "Sản phẩm" },
  { id: "research", label: "Nghiên cứu" },
  { id: "groups", label: "Hội nhóm" },
  { id: "compose", label: "Soạn bài" },
  { id: "queue", label: "Hàng đợi" },
  { id: "analytics", label: "Phân tích" },
  { id: "media", label: "Ảnh/video" },
];

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

// Rút gọn thông điệp đồng bộ Sheet khi hiển thị: chỉ giữ Nhập / Mới /
// Cập nhật / Có ảnh / Chưa có ảnh. Số ảnh KHÔNG lấy theo link trong
// thông điệp đã lưu (có link ≠ có ảnh thật) mà tính trực tiếp từ ảnh
// thật đã lấy được từ Drive của từng sản phẩm (real). Thông điệp mới
// từ máy chủ đã chứa sẵn số ảnh thật thì giữ nguyên.
function shortenSyncMessage(
  raw: string,
  real?: { with: number; without: number },
): string {
  const msg = raw.trim();
  if (!msg) return msg;
  if (msg.includes("Có ảnh:")) return msg;
  const total =
    msg.match(/Đã nhập (\d+)/)?.[1] ?? msg.match(/Nhập (\d+)/)?.[1];
  if (!total) return msg;
  const inserted =
    msg.match(/thêm mới (\d+)/)?.[1] ?? msg.match(/Mới (\d+)/)?.[1] ?? "0";
  const updated =
    msg.match(/cập nhật (\d+)/)?.[1] ?? msg.match(/Cập nhật (\d+)/)?.[1] ?? "0";
  let out = `Nhập ${total} · Mới ${inserted} · Cập nhật ${updated}`;
  if (real) out += ` · Có ảnh: ${real.with} · Chưa có ảnh: ${real.without}`;
  return out;
}

function fmtMembers(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  if (n >= 1000)
    return `${(n / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}k`;
  return String(n);
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// Link ảnh trong Sheet BUSINESS là link THƯ MỤC Google Drive
// (…/drive/folders/…) — thư mục không phải file ảnh, không hiển thị
// được bằng thẻ ảnh; giao diện hiện link mở thư mục thay thế.
function isDriveFolderLink(raw: string): boolean {
  return /drive\.google\.com\/drive\/folders\//i.test(raw.trim());
}

// Link Google Drive dạng trang xem (…/file/d/<ID>/view) trả về trang HTML
// chứ không phải file ảnh nên thẻ ảnh không hiển thị được; dạng thumbnail
// mới tải được ảnh về trình duyệt (file vẫn cần bật chia sẻ công khai).
function displayImageSrc(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (isDriveFolderLink(s)) return "";
  const fileMatch = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (fileMatch?.[1])
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1200`;
  const idMatch = s.match(
    /drive\.google\.com\/(?:open|uc|thumbnail)\?[^#]*\bid=([a-zA-Z0-9_-]{10,})/,
  );
  if (idMatch?.[1])
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1200`;
  return s;
}

// Xem trước trực tiếp một link ảnh (dùng trong form): hiện ảnh thật nếu tải
// được, hiện cảnh báo nếu link không tải được để biết ngay link sai ở đâu.
function SheetImagePreview({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const src = displayImageSrc(url);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (isDriveFolderLink(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Mở thư mục ảnh của ${label} trên Google Drive`}
        className="inline-block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-xs font-semibold text-[var(--ok)]"
      >
        Link thư mục ảnh trên Google Drive — app lấy ảnh thật trong thư mục này khi đồng bộ Sheet · bấm để mở thư mục ↗
      </a>
    );
  }
  if (!src) return null;
  if (failed) {
    return (
      <p className="text-xs font-medium text-[var(--danger)]" role="status">
        Không tải được ảnh từ link này — nếu là link Google Drive, hãy bật
        chia sẻ “Bất kỳ ai có đường link” cho file ảnh rồi thử lại.
      </p>
    );
  }
  return (
    <img
      src={src}
      alt={`Xem trước ảnh của ${label}`}
      className="h-24 w-24 rounded-[var(--radius)] border border-[var(--border)] object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// Trạng thái ảnh THẬT của sản phẩm theo kết quả liệt kê thư mục
// Drive: chỉ "ok" (≥1 file ảnh thật) mới tính là có ảnh. Các trạng
// thái còn lại đều là "Chưa có ảnh" kèm lý do cụ thể.
function driveStatusLabel(p: {
  drive_status: string;
  drive_error: string;
  drive_images: { length: number };
}): string {
  if (p.drive_status === "ok")
    return `Có ${p.drive_images.length} ảnh thật từ Drive`;
  if (p.drive_status === "empty")
    return "Chưa có ảnh — thư mục Drive đang rỗng";
  if (p.drive_status === "error")
    return `Chưa có ảnh — ${p.drive_error || "không đọc được thư mục Drive"}`;
  if (p.drive_status === "no_link")
    return `Chưa có ảnh — ${p.drive_error || "chưa có link thư mục Drive trong Sheet"}`;
  return "Chưa kiểm tra ảnh Drive — bấm Quét lại ảnh Drive";
}

// Khung ảnh sản phẩm luôn chiếm một ô cố định: có ảnh thật từ Drive
// thì hiện ảnh JPEG đầu tiên, chưa có ảnh thì hiện trạng thái rõ ràng.
function ProductThumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const firstDrive = product.drive_images[0];
  const src = product.has_real_image && firstDrive ? firstDrive.jpeg_url : displayImageSrc(product.image_url);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (isDriveFolderLink(product.image_url) && !product.has_real_image) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-alt)] px-1 text-center text-[10px] font-medium leading-tight text-[var(--dim)]"
        role="img"
        aria-label={driveStatusLabel(product)}
      >
        {product.drive_status === "empty"
          ? "Thư mục Drive rỗng"
          : "Chưa có ảnh thật"}
      </div>
    );
  }
  if (!src) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-alt)] px-1 text-center text-[10px] font-medium leading-tight text-[var(--dim)]"
        role="img"
        aria-label={`Chưa có ảnh cho ${product.name}`}
      >
        Chưa có ảnh
      </div>
    );
  }
  if (failed) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-alt)] px-1 text-center text-[10px] font-medium leading-tight text-[var(--danger)]"
        role="img"
        aria-label={`Ảnh của ${product.name} không tải được`}
      >
        Ảnh lỗi — kiểm tra quyền chia sẻ link
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={`Ảnh sản phẩm ${product.name}`}
      className="h-14 w-14 shrink-0 rounded-[var(--radius)] object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// Dải ảnh thật từ Drive của một sản phẩm/bản nháp: hiện từng file
// ảnh (bản JPEG do Drive kết xuất) kèm tên file và ghi rõ định dạng
// gốc — file gốc HEIC thì ghi rõ bản đăng là JPEG, không đăng HEIC.
// Khi truyền `max` (dải ảnh TRONG DANH SÁCH sản phẩm ở mục Sản phẩm
// và mục Soạn bài), chỉ hiện tối đa `max` ảnh thu nhỏ; còn nhiều hơn
// thì ô tiếp theo hiện dấu "…" báo còn nữa. Không truyền `max` thì
// hiện toàn bộ (ví dụ lưới ảnh của bản nháp ở Hàng đợi duyệt).
function DriveImageStrip({
  images,
  label,
  max,
}: {
  images: { id: string; name: string; jpeg_url: string; view_url: string; is_heic: boolean; mime: string }[];
  label: string;
  max?: number;
}) {
  if (images.length === 0) return null;
  const shown = max !== undefined ? images.slice(0, max) : images;
  const hiddenCount = images.length - shown.length;
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-[var(--ok)]">
        Đã gắn {images.length} ảnh vào bài (bản dùng để đăng):
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {shown.map((im) => (
          <li key={im.id} className="w-20">
            <a
              href={im.view_url || im.jpeg_url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Mở ảnh ${im.name} của ${label} trên Drive`}
            >
              <img
                src={im.jpeg_url}
                alt={`Ảnh thật ${im.name} của ${label}`}
                className="h-16 w-20 rounded-[var(--radius)] border border-[var(--border)] object-cover"
                loading="lazy"
              />
            </a>
            <p className="mt-0.5 truncate text-[10px] text-[var(--dim)]" title={im.name}>
              {im.name}
            </p>
            <p className="text-[10px] font-medium text-[var(--dim)]">
              {im.id.startsWith("upload-")
                ? "Ảnh tải lên từ thiết bị"
                : im.is_heic
                  ? "Gốc HEIC → đăng bản JPEG"
                  : `Gốc ${im.mime.replace("image/", "").toUpperCase()}`}
            </p>
          </li>
        ))}
        {hiddenCount > 0 && (
          <li className="w-20">
            <div
              className="flex h-16 w-20 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] text-xl font-bold tracking-widest text-[var(--dim)]"
              role="img"
              aria-label={`Còn ${hiddenCount} ảnh nữa của ${label} chưa hiện trong danh sách`}
            >
              …
            </div>
            <p className="mt-0.5 text-[10px] font-medium text-[var(--dim)]">
              Còn {hiddenCount} ảnh nữa
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}

const inputCls =
  "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]";
const labelCls = "block text-xs font-semibold text-[var(--dim)] mb-1";
const btnPrimary =
  "rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] disabled:opacity-50";
const btnDanger =
  "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--danger)] disabled:opacity-50";

// Dấu chấm than (!) đặt cạnh tên ô nhập — đoạn chú thích của ô chỉ
// hiện khi di chuột vào dấu này (hoặc giữ focus khi chạm/gõ phím),
// không còn in thường trực dưới ô nhập nữa.
function Hint({
  text,
  label,
  align = "left",
}: {
  text: ReactNode;
  label: string;
  align?: "left" | "right";
}) {
  return (
    <span className="group/hint relative inline-flex shrink-0">
      <span
        tabIndex={0}
        role="img"
        aria-label={label}
        className="flex h-4 w-4 cursor-help select-none items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold leading-none text-white outline-none"
      >
        !
      </span>
      <span
        className={`pointer-events-none absolute top-full z-30 mt-1.5 hidden w-64 max-w-[72vw] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-[var(--text)] shadow-lg group-hover/hint:block group-focus-within/hint:block ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

/* ------------------------------------- Hàng đợi soạn bài + tiến trình */

// Một "việc soạn bài" trong hàng đợi toàn cục: soạn bản nháp mới
// (mục Soạn bài) hoặc viết lại một bản nháp (mục Hàng đợi). Các việc
// chạy LẦN LƯỢT — một việc "running", các việc còn lại "waiting" —
// để người dùng thấy rõ bài nào đang chạy, bài nào đang chờ. Việc
// chạy xong chuyển "done" rồi TỰ BIẾN MẤT khỏi danh sách sau ít giây;
// khi không còn việc nào, vòng tròn tiến trình cũng biến mất hẳn.
// Việc lỗi giữ lại trong danh sách kèm nút Thử lại / Bỏ qua để không
// mất bài đang soạn dở mà không ai hay.
type ComposeJobStatus = "waiting" | "running" | "done" | "error";

interface ComposeJob {
  id: number;
  kind: "create" | "rewrite";
  label: string;
  draftId?: number;
  status: ComposeJobStatus;
  error: string;
  // Ghi chú hiện cạnh dấu ✓ khi bài xong theo đường đối soát (ví dụ
  // lượt gửi bị timeout nhưng máy chủ đã lưu bài — xem runCreateDraft
  // ở mục Soạn bài).
  note: string;
  createdAt: number;
  startedAt: number | null;
}

// Kết quả "đối soát được" sau lỗi timeout: lượt gửi bị cổng kết nối
// cắt (báo timeout) nhưng kiểm tra lại thấy máy chủ ĐÃ lưu bài xong.
// Hàng đợi coi đây là XONG (gọi onDone với result) thay vì lỗi.
interface ReconciledComposeResult {
  reconciled: true;
  note: string;
  result: unknown;
}

function isReconciledResult(v: unknown): v is ReconciledComposeResult {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as ReconciledComposeResult).reconciled === true
  );
}

// Lỗi "cổng kết nối timeout": phản hồi bị cắt giữa chừng — khác hẳn
// lỗi xử lý thật, vì máy chủ có thể vẫn chạy tiếp và lưu bài xong.
function isGatewayTimeoutError(message: string): boolean {
  return /timed?\s?out|gateway/i.test(message);
}

interface EnqueueJobInput {
  kind: "create" | "rewrite";
  label: string;
  draftId?: number;
  run: () => Promise<unknown>;
  onDone?: (result: unknown) => void;
  onError?: (message: string) => void;
  // Đối soát khi lượt chạy báo lỗi (chủ yếu là timeout): trả về kết
  // quả đã đối soát được thì việc được tính là XONG; trả null thì
  // giữ nguyên lỗi như cũ.
  reconcileOnError?: (message: string) => Promise<ReconciledComposeResult | null>;
}

interface ComposeJobsContextValue {
  jobs: ComposeJob[];
  enqueue: (input: EnqueueJobInput) => void;
  dismiss: (id: number) => void;
  retry: (id: number) => void;
}

const ComposeJobsContext = createContext<ComposeJobsContextValue | null>(
  null,
);

function useComposeJobs(): ComposeJobsContextValue {
  const ctx = useContext(ComposeJobsContext);
  if (!ctx)
    throw new Error("useComposeJobs phải nằm trong ComposeJobsProvider");
  return ctx;
}

function ComposeJobsProvider({ children }: { children: ReactNode }) {
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
        // Chạy xong → tự biến mất khỏi danh sách sau ít giây (đủ để
        // người dùng thấy dấu ✓), không cần bấm đóng.
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
        const message = err instanceof Error ? err.message : String(err);
        // ĐỐI SOÁT SAU TIMEOUT: phản hồi bị cổng kết nối cắt không có
        // nghĩa là bài chưa được lưu — máy chủ có thể vẫn chạy tiếp
        // và lưu xong (đúng lỗi XT6 từng gặp: báo "Gateway request
        // timed out" mà bài vẫn vào hàng đợi). Kiểm tra lại trước
        // khi kết luận lỗi: thấy bài đã lưu thì tính là XONG, không
        // để người dùng bấm "Thử lại" một cách mù quáng.
        let reconciled: ReconciledComposeResult | null = null;
        if (ex.reconcileOnError) {
          try {
            reconciled = await ex.reconcileOnError(message);
          } catch {
            reconciled = null;
          }
        }
        if (reconciled) {
          ex.onDone?.(reconciled.result);
          markDone(reconciled.note);
        } else {
          ex.onError?.(message);
          setJobs((prev) =>
            prev.map((j) =>
              j.id === next.id
                ? { ...j, status: "error" as const, error: message }
                : j,
            ),
          );
        }
      } finally {
        pumpingRef.current = false;
        window.setTimeout(() => pump(), 0);
      }
    })();
  }, []);

  useEffect(() => {
    jobsRef.current = jobs;
    pump();
  }, [jobs, pump]);

  const enqueue = useCallback((input: EnqueueJobInput) => {
    const id = nextIdRef.current++;
    executorsRef.current.set(id, {
      run: input.run,
      onDone: input.onDone,
      onError: input.onError,
      reconcileOnError: input.reconcileOnError,
    });
    setJobs((prev) => [
      ...prev,
      {
        id,
        kind: input.kind,
        label: input.label,
        draftId: input.draftId,
        status: "waiting",
        error: "",
        note: "",
        createdAt: Date.now(),
        startedAt: null,
      },
    ]);
  }, []);

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

  const value: ComposeJobsContextValue = { jobs, enqueue, dismiss, retry };

  return (
    <ComposeJobsContext.Provider value={value}>
      {children}
      <ComposeJobsWidget jobs={jobs} onDismiss={dismiss} onRetry={retry} />
    </ComposeJobsContext.Provider>
  );
}

const JOBS_WIDGET_POS_KEY = "social-desk-jobs-widget-pos";

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} giây`;
  return `${Math.floor(s / 60)} phút ${s % 60} giây`;
}

// Vòng tròn tiến trình KÉO ĐI ĐƯỢC khắp trang: mặc định chỉ là một
// hình tròn có vòng xoay + số bài đang xử lý (đang chạy + đang chờ);
// bấm vào mở danh sách từng bài (đang chạy kèm thanh tiến trình +
// thời gian đã chạy, đang chờ kèm thứ tự trong hàng đợi). Kéo thả
// bằng chuột/chạm: kéo quá ngưỡng nhỏ thì chỉ di chuyển, không mở
// danh sách; vị trí được nhớ lại cho lần mở sau.
function ComposeJobsWidget({
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

  // Đồng hồ 1 giây để cập nhật thời gian đã chạy của bài đang chạy.
  useEffect(() => {
    if (running.length === 0) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [running.length]);

  // Không còn việc nào → widget tự biến mất (và lần có việc mới thì
  // bắt đầu ở trạng thái thu gọn).
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

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const queryClient = useQueryClient();
  const seeded = useRef(false);

  const seed = useMutation({
    mutationFn: () => api.seedDesk({}),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      seed.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.getOverview({}),
  });
  const drafts = useQuery({
    queryKey: ["drafts"],
    queryFn: () => api.listDrafts({}),
  });

  const pending = overview.data?.counts.drafts_pending ?? 0;

  return (
    <ComposeJobsProvider>
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)] pt-safe">
        <nav
          aria-label="Mục chính"
          className="flex flex-wrap gap-1 px-3 py-2"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ${
                tab === t.id
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "text-[var(--dim)]"
              }`}
            >
              {t.label}
              {t.id === "queue" && pending > 0 && (
                <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
                  {pending}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main
        className={`mx-auto w-full px-4 pb-16 pt-4 ${
          tab === "compose" || tab === "products"
            ? "max-w-6xl"
            : "max-w-3xl"
        }`}
      >
        {tab === "overview" && (
          <OverviewSection
            overview={overview.data}
            loading={overview.isPending}
            onGoQueue={() => setTab("queue")}
            onGoCompose={() => setTab("compose")}
            onGoProducts={() => setTab("products")}
            onGoAccounts={() => setTab("accounts")}
            onGoAnalytics={() => setTab("analytics")}
          />
        )}
        {tab === "accounts" &&
          (overview.isPending || !overview.data ? (
            <p className="text-sm text-[var(--dim)]">Đang tải…</p>
          ) : (
            <AccountsSection
              accounts={overview.data.accounts}
              pages={overview.data.pages}
            />
          ))}
        {tab === "products" && <ProductsSection />}
        {tab === "research" && <ResearchSection />}
        {tab === "groups" && <GroupsSection />}
        {tab === "compose" && (
          <ComposeSection
            onGoQueue={() => setTab("queue")}
            onGoProducts={() => setTab("products")}
          />
        )}
        {tab === "queue" && (
          <QueueSection
            drafts={drafts.data?.drafts ?? []}
            loading={drafts.isPending}
            onGoGroups={() => setTab("groups")}
            onGoMedia={() => setTab("media")}
          />
        )}
        {tab === "analytics" && (
          <AnalyticsSection onGoQueue={() => setTab("queue")} />
        )}
        {tab === "media" && <MediaSection />}
      </main>
    </div>
    </ComposeJobsProvider>
  );
}

/* ------------------------------------------------------------- Tổng quan */

function OverviewSection({
  overview,
  loading,
  onGoQueue,
  onGoCompose,
  onGoProducts,
  onGoAccounts,
  onGoAnalytics,
}: {
  overview: Overview | undefined;
  loading: boolean;
  onGoQueue: () => void;
  onGoCompose: () => void;
  onGoProducts: () => void;
  onGoAccounts: () => void;
  onGoAnalytics: () => void;
}) {
  if (loading || !overview) return <p className="text-sm text-[var(--dim)]">Đang tải…</p>;
  const c = overview.counts;
  const slotsLeft = Math.max(0, overview.limits.max_posts_per_day - c.packed_today);

  return (
    <div className="space-y-6">
      <section aria-label="Quy trình vận hành">
        <h2 className="text-lg font-bold">Quy trình vận hành</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            [
              "1 · Lấy sản phẩm từ Google Sheet",
              "Sheet BUSINESS: STT, hãng xe, mẫu, tỉ lệ (1:24…), kích thước Dài x Rộng x Cao, màu, giá, tồn kho, link thư mục ảnh Drive — tên sản phẩm = hãng xe + mẫu. Sản phẩm được PHÂN LOẠI theo hãng xe + mẫu + tỉ lệ + kích thước + màu sắc: mỗi màu là MỘT sản phẩm riêng với tồn kho riêng, SKU nội bộ “STT-Tên-Màu”, vận chuyển mặc định COD. Tên sản phẩm giữ nguyên văn như trong Sheet.",
            ],
            [
              "2 · Viết bài phong cách ĐỨC GARAGE",
              "Từ thông tin sản phẩm đã có (tên xe giữ nguyên văn, hãng xe, tỉ lệ, màu, kích thước, giá, tồn kho, vận chuyển), AI tự soạn toàn bộ bài đăng chính cho cả nhóm, fanpage và Instagram theo phong cách ĐỨC GARAGE — Emotional Sales Copywriting pha Luxury Product Marketing: tiêu đề emoji chủ đề + tên xe nguyên văn + tagline IN HOA, 1–2 đoạn mở đầu gợi cảm xúc (khí chất dòng xe, giá trị trưng bày, quà tặng, gọi “anh em”), mục ĐIỂM NỔI BẬT ~5 dòng ✅ về thiết kế đặc trưng, mục 📌 THÔNG TIN SẢN PHẨM đầy đủ (hãng xe, dòng xe, tỷ lệ, màu sắc, chất liệu Die-cast, kích thước dạng ~, chức năng theo quy tắc tỉ lệ của shop — 1:18 và 1:24 mở được cửa/cốp/capo, 1:32 sealed không mở — phụ kiện hộp + đế mica, rồi 💰 giá bán dạng che 3xx.xxxđ ghi rõ giá khuyến mãi, 🎁 ưu đãi, ⏰ thời gian khuyến mãi = ngày đăng + 7 ngày chỉ nằm trong khối thông tin, 📦 tình trạng, 🚚 vận chuyển mặc định COD; mục nào chưa có thông tin thì ghi “Cần xác nhận” và vẫn bị chặn duyệt), CTA “📩 Inbox ĐỨC GARAGE…” và cuối bài là hashtag (#DucGarage đứng đầu + tag theo đúng tỉ lệ của xe). Không banner khuyến mãi ở dòng 2. Bạn chỉ đối chiếu với ảnh/video rồi duyệt ở Hàng đợi trước khi đăng; không in mã STT/SKU vào caption.",
            ],
            [
              "3 · Chọn đích nào đăng đích đó",
              "App mở thư mục Drive theo link trong Sheet để liệt kê ảnh THẬT khi đồng bộ Sheet (bản JPEG do Drive kết xuất — file gốc HEIC không đăng trực tiếp được). Khi soạn bài, bạn kiểm soát thêm/bớt ảnh ngay trong form và tập ảnh đó được chốt vào bản nháp; xuất gói đăng dùng đúng tập đã chốt, không quét lại Drive. Không kênh nào bị ép một loại media: gói đăng liệt kê đúng media đã gắn vào bài (ảnh đã chốt và video nếu có) cho mọi đích bạn chọn — nhóm đích, fanpage, tài khoản Instagram hay tài khoản chính thức — và bạn chọn đích nào thì chỉ đăng lên đích đó.",
            ],
            [
              "4 · Đo chỉ số, tối ưu khung giờ riêng",
              `Đã ghi ${c.metrics_posts} bài đã đăng. Mục Phân tích tính khung giờ tốt nhất riêng cho từng nhóm, từng Page và từng tài khoản Instagram — không dùng một khung chung.`,
            ],
          ].map(([title, desc]) => (
            <li
              key={title}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--dim)]">{desc}</p>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btnGhost} onClick={onGoProducts}>
            Đồng bộ sản phẩm từ Sheet
          </button>
          <button className={btnGhost} onClick={onGoAnalytics}>
            Xem phân tích khung giờ
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--dim)]">
          Sản phẩm có ảnh THẬT từ Drive (đã liệt kê được file ảnh trong
          thư mục):{" "}
          <strong className="font-mono">{c.products_with_image}</strong> · có
          video: <strong className="font-mono">{c.products_with_video}</strong>{" "}
          / tổng <strong className="font-mono">{c.products}</strong> sản phẩm.
          Sản phẩm chỉ có link thư mục nhưng thư mục rỗng/lỗi/chưa quét
          thì KHÔNG tính là có ảnh.
        </p>
      </section>

      <section aria-label="Việc cần xử lý">
        <h2 className="text-lg font-bold">Việc cần xử lý</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={onGoQueue}
            className="rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] p-4 text-left"
          >
            <p className="font-mono text-3xl font-semibold text-[var(--accent-ink)]">
              {c.drafts_pending}
            </p>
            <p className="mt-1 text-sm font-medium">bản nháp chờ duyệt</p>
            <p className="text-xs text-[var(--dim)]">
              {c.drafts_approved + c.drafts_packed} bài đã duyệt
            </p>
          </button>
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="font-mono text-3xl font-semibold">
              {c.packed_today}
              <span className="text-lg text-[var(--dim)]">
                /{overview.limits.max_posts_per_day}
              </span>
            </p>
            <p className="mt-1 text-sm font-medium">gói đăng đã xuất hôm nay</p>
            <p className="text-xs text-[var(--dim)]">
              {slotsLeft > 0
                ? `Còn ${slotsLeft} lượt trong hạn mức an toàn`
                : "Đã chạm hạn mức — mai đăng tiếp"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className={btnPrimary} onClick={onGoCompose}>
            Soạn bài mới
          </button>
          <button className={btnGhost} onClick={onGoQueue}>
            Mở hàng đợi duyệt
          </button>
        </div>
      </section>

      <LoggedInSummary
        accounts={overview.accounts}
        pages={overview.pages}
        onGoAccounts={onGoAccounts}
      />

      <section aria-label="Nguồn danh sách sản phẩm">
        <h2 className="text-lg font-bold">Danh sách sản phẩm</h2>
        <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          {overview.sheet.configured ? (
            <p className="text-sm leading-6">
              Nguồn: <strong>Google Sheet</strong>
              {overview.sheet.title ? ` — “${overview.sheet.title}”` : ""}
              {overview.sheet.sheet_name
                ? ` · tab ${overview.sheet.sheet_name}`
                : ""}
              . Đã có{" "}
              <strong className="font-mono">{overview.sheet.product_count}</strong>{" "}
              sản phẩm lấy từ Sheet
              {overview.sheet.last_sync_at
                ? ` · đồng bộ gần nhất ${fmtDate(overview.sheet.last_sync_at)}`
                : " · chưa đồng bộ lần nào"}
              .
            </p>
          ) : (
            <p className="text-sm leading-6">
              Danh sách sản phẩm đang nhập tay. Gắn một file{" "}
              <strong>Google Sheet</strong> để danh sách tự lấy từ Sheet.
            </p>
          )}
          <button className={`${btnPrimary} mt-3`} onClick={onGoProducts}>
            Mở mục Sản phẩm
          </button>
        </div>
      </section>

      <section aria-label="Giới hạn an toàn">
        <h2 className="text-lg font-bold">Giới hạn an toàn chống khóa nick</h2>
        <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6">
          <p>
            Tối đa{" "}
            <strong className="font-mono">{overview.limits.max_posts_per_day} bài nhóm/ngày</strong>,
            mỗi bài cách nhau ≥{" "}
            <strong className="font-mono">{overview.limits.min_interval_minutes} phút</strong>.
          </p>
          <p>
            Khung giờ tương tác cao (giờ VN):{" "}
            <strong className="font-mono">{overview.limits.windows.join(" · ")}</strong>
          </p>
          <p className="text-[var(--dim)]">
            Chỉ đăng vào nhóm bạn đã tham gia. Mọi bài đều qua duyệt ở mục Hàng
            đợi — không có nút tự đăng.
          </p>
        </div>
      </section>

      <section aria-label="Số liệu">
        <h2 className="text-lg font-bold">Số liệu bàn làm việc</h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
          {[
            ["Tài khoản đang dùng", c.accounts_selected],
            ["Pages quản lý", c.pages_total],
            ["Pages chọn đăng", c.pages_selected],
            ["Sản phẩm", c.products],
            ["Hội nhóm", c.groups],
            ["Nhóm tài khoản chính đã tham gia", c.groups_joined_by_account],
            ["Nhóm có Page đã tham gia", c.groups_joined_by_page],
            ["Nhóm đích", c.groups_target],
            ["Ảnh/video", c.media],
            ["Tổng bản nháp", c.drafts_pending + c.drafts_approved + c.drafts_packed],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <dd className="font-mono text-xl font-semibold">{value}</dd>
              <dt className="mt-0.5 text-xs text-[var(--dim)]">{label}</dt>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- Tài khoản */

const IG_LINK_URL = "https://agent.meta.ai/foa_ac_link/instagram";
const FB_LOGIN_URL_LABEL = "facebook.com/login";

function LoggedInSummary({
  accounts,
  pages,
  onGoAccounts,
}: {
  accounts: Account[];
  pages: Page[];
  onGoAccounts: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const enable = useMutation({
    mutationFn: (id: number) =>
      api.setAccountSelected({ id, selected: true }),
    onSuccess: (res) => {
      setNote(res.message);
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
  const loggedIn = accounts.filter((a) => a.linked && a.selected);
  const linkedNotUsed = accounts.filter((a) => a.linked && !a.selected);
  return (
    <section aria-label="Tài khoản đang đăng nhập">
      <h2 className="text-lg font-bold">Đang đăng nhập</h2>
      <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        {loggedIn.length > 0 ? (
          <ul className="space-y-2">
            {loggedIn.map((a) => {
              const myPages = pages.filter(
                (p) => p.account_id === a.id && p.selected,
              );
              return (
                <li key={a.id} className="text-sm">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--ok)]"
                    />
                    {a.profile_url ? (
                      <a
                        href={a.profile_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Mở trang ${a.platform} của ${a.name}`}
                        className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                      >
                        {a.platform} — {a.name} ↗
                      </a>
                    ) : (
                      <span className="font-semibold">
                        {a.platform} — {a.name}
                      </span>
                    )}
                    <span className="text-xs text-[var(--dim)]">
                      đang đăng nhập · dùng để đăng bài
                    </span>
                  </div>
                  {myPages.length > 0 && (
                    <ul className="ml-5 mt-1 space-y-0.5">
                      {myPages.map((p) => (
                        <li
                          key={p.id}
                          className="text-xs text-[var(--dim)]"
                        >
                          Page đăng bài:{" "}
                          {p.url ? (
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Mở Page ${p.name}`}
                              className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                            >
                              {p.name} ↗
                            </a>
                          ) : (
                            <span className="font-semibold">{p.name}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-[var(--dim)]">
            Chưa có nick nào đang đăng nhập để đăng bài.
          </p>
        )}
        {linkedNotUsed.length > 0 && (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs font-semibold text-[var(--dim)]">
              Đã liên kết nhưng chưa dùng để đăng — các nick này đang bị ẩn
              khỏi gói đăng:
            </p>
            <ul className="mt-2 space-y-2">
              {linkedNotUsed.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-alt)]"
                  />
                  <span className="font-semibold">
                    {a.platform} — {a.name}
                  </span>
                  <span className="text-xs text-[var(--dim)]">
                    đã liên kết nhưng chưa dùng để đăng
                  </span>
                  <button
                    className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={enable.isPending}
                    onClick={() => enable.mutate(a.id)}
                    aria-label={`Bật dùng để đăng cho ${a.platform} ${a.name}`}
                  >
                    Bật dùng để đăng
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {note && (
          <p className="mt-2 text-sm font-medium" role="status">
            {note}
          </p>
        )}
        <button className={`${btnGhost} mt-3`} onClick={onGoAccounts}>
          Xem danh sách tài khoản
        </button>
      </div>
    </section>
  );
}

function AccountsSection({
  accounts,
  pages,
}: {
  accounts: Account[];
  pages: Page[];
}) {
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState("");
  const [editingUrlId, setEditingUrlId] = useState(0);
  const [urlDraft, setUrlDraft] = useState("");
  const [platform, setPlatform] = useState<"Facebook" | "Instagram">(
    "Instagram",
  );
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };
  const select = useMutation({
    mutationFn: (args: { id: number; selected: boolean }) =>
      api.setAccountSelected(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });
  const link = useMutation({
    mutationFn: (args: { id: number; linked: boolean }) =>
      api.setAccountLinked(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteAccount({ id }),
    onSuccess: refresh,
  });
  const saveUrl = useMutation({
    mutationFn: (args: { id: number; profile_url: string }) =>
      api.setAccountProfileUrl(args),
    onSuccess: (res) => {
      setMsg(res.message);
      if (res.ok) setEditingUrlId(0);
      refresh();
    },
  });
  const fbBrowserLogin = useQuery({
    queryKey: ["fbBrowserLogin"],
    queryFn: () => api.getFacebookBrowserLoginStatus({}),
    refetchInterval: 5000,
  });
  const openFbBrowser = useMutation({
    mutationFn: (args: { account_id: number; account_name: string }) =>
      api.requestFacebookBrowserLogin(args),
    onSuccess: (res) => {
      setMsg(res.message);
      queryClient.invalidateQueries({ queryKey: ["fbBrowserLogin"] });
    },
    onError: (e) => {
      setMsg(
        e instanceof Error
          ? `Không gửi được yêu cầu mở trình duyệt Muse: ${e.message}`
          : "Không gửi được yêu cầu mở trình duyệt Muse — thử bấm lại.",
      );
    },
  });
  const fbLoginStatus = fbBrowserLogin.data?.status ?? "";
  const fbLoginLabel =
    fbLoginStatus === "logged_in"
      ? `✓ Đã đăng nhập Facebook trong trình duyệt Muse${fbBrowserLogin.data?.account_name ? ` — ${fbBrowserLogin.data.account_name}` : ""} — sẵn sàng đăng bài vào nhóm`
      : fbLoginStatus === "waiting_login"
        ? "🔑 Cửa sổ trình duyệt Muse đang ở trang đăng nhập Facebook — đăng nhập 1 lần trong cửa sổ đó"
        : fbLoginStatus === "requested"
          ? "⏳ Đã gửi yêu cầu — Muse đang mở cửa sổ trình duyệt tới trang đăng nhập Facebook…"
          : fbLoginStatus === "failed"
            ? "✗ Chưa mở được trình duyệt Muse tới trang đăng nhập Facebook"
            : "";

  const loggedIn = accounts.filter((a) => a.linked && a.selected);
  const linkedNotUsed = accounts.filter((a) => a.linked && !a.selected);
  const notLinked = accounts.filter((a) => !a.linked);

  return (
    <section aria-label="Danh sách tài khoản">
      <h2 className="text-lg font-bold">Danh sách tài khoản</h2>

      <p className="mt-1 text-xs text-[var(--dim)]">
        {loggedIn.length} nick đang đăng nhập
        {linkedNotUsed.length > 0 &&
          ` · ${linkedNotUsed.length} nick đã liên kết nhưng chưa dùng để đăng`}
        {notLinked.length > 0 && ` · ${notLinked.length} nick chưa liên kết`}
      </p>
      <ul className="mt-3 space-y-3">
        {accounts.map((a) => (
          <li
            key={a.id}
            className={`rounded-[var(--radius)] border bg-[var(--surface)] p-4 ${
              a.selected && a.linked
                ? "border-2 border-[var(--accent)]"
                : "border-[var(--border)]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] text-sm font-bold"
              >
                {a.platform === "Facebook" ? "f" : "◎"}
              </span>
              <div className="min-w-0 flex-1">
                {a.profile_url ? (
                  <a
                    href={a.profile_url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Mở trang ${a.platform} của ${a.name}`}
                    className="block truncate text-sm font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                  >
                    {a.platform} — {a.name} ↗
                  </a>
                ) : (
                  <p className="truncate text-sm font-semibold">
                    {a.platform} — {a.name}
                  </p>
                )}
                <p className="truncate text-xs text-[var(--dim)]">
                  {a.handle || "Chưa có ghi chú"}
                </p>
              </div>
              {a.linked && a.selected ? (
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--ok)] px-2 py-1 text-xs font-semibold text-white">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
                  Đang đăng nhập
                </span>
              ) : (
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                    a.linked
                      ? "bg-[var(--surface-alt)] text-[var(--ok)]"
                      : "bg-[var(--surface-alt)] text-[var(--dim)]"
                  }`}
                >
                  {a.linked ? "Đã liên kết" : "Chưa liên kết"}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {a.profile_url ? (
                <a
                  href={a.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Mở trang tài khoản ${a.name}`}
                  className="rounded-full bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)]"
                >
                  Mở trang tài khoản ↗
                </a>
              ) : (
                <button
                  onClick={() => {
                    setEditingUrlId(a.id);
                    setUrlDraft("");
                  }}
                  className="rounded-full bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)]"
                >
                  Thêm link trang để bấm vào mở được
                </button>
              )}
              {a.platform === "Facebook" && (
                <button
                  onClick={() =>
                    openFbBrowser.mutate({
                      account_id: a.id,
                      account_name: a.name,
                    })
                  }
                  disabled={openFbBrowser.isPending}
                  aria-label={`Mở trình duyệt Muse tới trang đăng nhập Facebook để đăng nhóm bằng nick ${a.name}`}
                  className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {openFbBrowser.isPending
                    ? "Đang mở trình duyệt Muse…"
                    : "Mở trình duyệt Muse — đăng nhập FB để đăng nhóm"}
                </button>
              )}
              <button
                onClick={() =>
                  select.mutate({ id: a.id, selected: !a.selected })
                }
                aria-pressed={a.selected}
                disabled={select.isPending}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  a.selected && a.linked
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] text-[var(--dim)]"
                }`}
              >
                {a.selected ? "✓ Đang đăng nhập" : "Đăng nhập bằng nick này"}
              </button>
              <button
                onClick={() => link.mutate({ id: a.id, linked: !a.linked })}
                aria-pressed={a.linked}
                disabled={link.isPending}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]"
              >
                {a.linked ? "Gỡ liên kết" : "Đánh dấu đã liên kết"}
              </button>
              <button
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)]"
                onClick={() => del.mutate(a.id)}
                aria-label={`Xóa tài khoản ${a.name}`}
              >
                Xóa
              </button>
              <button
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]"
                onClick={() => {
                  setEditingUrlId(editingUrlId === a.id ? 0 : a.id);
                  setUrlDraft(a.profile_url);
                }}
                aria-expanded={editingUrlId === a.id}
                aria-label={`Sửa link trang của ${a.name}`}
              >
                Sửa link trang
              </button>
            </div>
            {editingUrlId === a.id && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Link trang cá nhân của ${a.name}`}
                  className={`${inputCls} min-w-0 flex-1`}
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder={
                    a.platform === "Facebook"
                      ? "https://www.facebook.com/username…"
                      : "https://www.instagram.com/username/"
                  }
                />
                <button
                  className={btnPrimary}
                  disabled={saveUrl.isPending}
                  onClick={() =>
                    saveUrl.mutate({ id: a.id, profile_url: urlDraft })
                  }
                >
                  Lưu link
                </button>
              </div>
            )}
            {a.profile_url && (
              <p className="mt-2 truncate text-xs text-[var(--dim)]">
                Link trang:{" "}
                <a
                  href={a.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                >
                  {a.profile_url}
                </a>
              </p>
            )}
            {a.platform === "Facebook" && (
              <AccountPages
                account={a}
                pages={pages.filter((p) => p.account_id === a.id)}
                onMsg={setMsg}
              />
            )}
          </li>
        ))}
      </ul>
      {accounts.length === 0 && (
        <p className="mt-2 text-sm text-[var(--dim)]">
          Chưa có tài khoản nào.
        </p>
      )}
      {msg && (
        <p className="mt-2 text-sm font-medium" role="status">
          {msg}
        </p>
      )}

      <div className="mt-4 space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div>
          <p className="text-base font-bold">Kết nối tài khoản mới</p>
          <p className="mt-1 text-sm text-[var(--dim)]">
            Chọn nền tảng để bắt đầu. Facebook để đăng nhóm: mở trình duyệt
            Muse tới trang đăng nhập Facebook. Instagram: mở trang liên kết
            chính thức.
          </p>
        </div>
        <div
          className="grid grid-cols-2 gap-3"
          role="group"
          aria-label="Chọn nền tảng để liên kết"
        >
          {(
            [
              { id: "Instagram", icon: "◎" },
              { id: "Facebook", icon: "f" },
            ] as const
          ).map((p) => {
            const tileSelected = platform === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={tileSelected}
                aria-label={`Chọn nền tảng ${p.id}`}
                onClick={() => setPlatform(p.id)}
                className={`flex flex-col items-center gap-1.5 rounded-[var(--radius)] border-2 px-3 py-5 text-sm font-semibold ${
                  tileSelected
                    ? "border-[var(--ok)] bg-[var(--surface-alt)]"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <span aria-hidden className="text-3xl leading-none">
                  {p.icon}
                </span>
                <span>{p.id}</span>
                {tileSelected && (
                  <span
                    aria-hidden
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ok)] text-xs font-bold text-white"
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {platform === "Instagram" ? (
          <a
            href={IG_LINK_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Mở Instagram để liên kết"
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm font-semibold text-[var(--text)]"
          >
            <span aria-hidden>↗</span>
            Mở Instagram để liên kết
          </a>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() =>
                openFbBrowser.mutate({ account_id: 0, account_name: "" })
              }
              disabled={openFbBrowser.isPending}
              aria-label="Mở trình duyệt Muse tới trang đăng nhập Facebook để đăng bài nhóm"
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <span aria-hidden>↗</span>
              {openFbBrowser.isPending
                ? "Đang gửi yêu cầu mở trình duyệt Muse…"
                : "Mở trình duyệt Muse — đăng nhập Facebook để đăng nhóm"}
            </button>
            <p className="text-sm leading-6 text-[var(--dim)]">
              Bấm nút này, Muse sẽ mở <strong>cửa sổ trình duyệt Muse</strong>{" "}
              tới trang đăng nhập Facebook (<span className="font-mono">{FB_LOGIN_URL_LABEL}</span>)
              — bạn đăng nhập 1 lần ngay trong cửa sổ đó bằng tài khoản quản trị
              Page, phiên được lưu trong hồ sơ trình duyệt đó để đăng bài vào
              nhóm. Nút này <strong>không</strong> còn mở trang liên kết Meta
              Accounts Center như trước, và không mở tab mới trong Chrome của bạn.
            </p>
            {fbLoginLabel && (
              <div
                role="status"
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2.5 text-sm leading-6"
              >
                <p className="font-semibold">{fbLoginLabel}</p>
                {fbBrowserLogin.data?.message && (
                  <p className="mt-1 text-[var(--dim)]">
                    {fbBrowserLogin.data.message}
                  </p>
                )}
                {fbBrowserLogin.data?.updated_at && (
                  <p className="mt-1 text-xs text-[var(--dim)]">
                    Cập nhật: {fmtDate(fbBrowserLogin.data.updated_at)}
                  </p>
                )}
                {fbLoginStatus === "waiting_login" && (
                  <p className="mt-1 text-[var(--dim)]">
                    Đăng nhập xong trong cửa sổ trình duyệt Muse, quay lại đây —
                    trạng thái sẽ tự cập nhật khi Muse xác nhận phiên đăng nhập.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------- Pages của 1 nick FB */

function AccountPages({
  account,
  pages,
  onMsg,
}: {
  account: Account;
  pages: Page[];
  onMsg: (m: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", role: "" });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };
  const add = useMutation({
    mutationFn: () =>
      api.addPage({
        account_id: account.id,
        name: form.name,
        url: form.url,
        role: form.role,
      }),
    onSuccess: (res) => {
      onMsg(res.message);
      if (res.ok) {
        setForm({ name: "", url: "", role: "" });
        setOpen(false);
      }
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: (args: { id: number; selected: boolean }) =>
      api.setPageSelected(args),
    onSuccess: (res) => {
      onMsg(res.message);
      refresh();
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deletePage({ id }),
    onSuccess: refresh,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim()) add.mutate();
  };

  return (
    <div className="mt-3 ml-5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] p-3">
      <p className="text-xs font-semibold">
        Trang (Page) của nick này ({pages.length})
        {pages.length > 0 &&
          ` · ${pages.filter((p) => p.selected).length} đang chọn để đăng`}
      </p>
      {pages.length === 0 && (
        <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
          Nick này chưa ghi Page nào. Nếu nick quản trị Page bán hàng, thêm
          Page vào đây để chọn đăng bài bằng Page thay vì trang cá nhân.
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {pages.map((p) => (
          <li
            key={p.id}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] text-xs font-bold"
              >
                P
              </span>
              <div className="min-w-0 flex-1">
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Mở Page ${p.name}`}
                    className="block truncate text-sm font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                  >
                    {p.name} ↗
                  </a>
                ) : (
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                )}
                <p className="truncate text-xs text-[var(--dim)]">
                  {p.role || "Chưa ghi vai trò"}
                  {p.url ? ` · ${p.url}` : " · chưa có link Page"}
                </p>
              </div>
              {p.selected && (
                <span className="shrink-0 rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-white">
                  Đang chọn đăng
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  toggle.mutate({ id: p.id, selected: !p.selected })
                }
                aria-pressed={p.selected}
                disabled={toggle.isPending}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  p.selected
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] text-[var(--dim)]"
                }`}
              >
                {p.selected ? "✓ Đăng bằng Page này" : "Chọn Page này để đăng"}
              </button>
              <button
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)]"
                onClick={() => del.mutate(p.id)}
                aria-label={`Xóa Page ${p.name}`}
              >
                Xóa Page
              </button>
            </div>
          </li>
        ))}
      </ul>
      {open ? (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <div>
            <label className={labelCls} htmlFor={`pg-name-${account.id}`}>
              Tên Page *
            </label>
            <input
              id={`pg-name-${account.id}`}
              aria-label="Tên Page"
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nhập tên Page"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls} htmlFor={`pg-url-${account.id}`}>
                Link Page
              </label>
              <input
                id={`pg-url-${account.id}`}
                aria-label="Link Page"
                className={inputCls}
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://www.facebook.com/…"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`pg-role-${account.id}`}>
                Vai trò của bạn
              </label>
              <input
                id={`pg-role-${account.id}`}
                aria-label="Vai trò của bạn trên Page"
                className={inputCls}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Nhập vai trò của bạn"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={add.isPending}>
              Thêm Page
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setOpen(false)}
            >
              Hủy
            </button>
          </div>
        </form>
      ) : (
        <button
          className={`${btnGhost} mt-3`}
          onClick={() => setOpen(true)}
          aria-label={`Thêm Page cho nick ${account.name}`}
        >
          + Thêm Page của nick này
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Nghiên cứu */

function ResearchSection() {
  const queryClient = useQueryClient();
  const runs = useQuery({
    queryKey: ["research"],
    queryFn: () => api.listResearch({}),
  });
  const [form, setForm] = useState({
    query: "",
    marketplace_count: "",
    price_count: "",
    price_min: "",
    price_median: "",
    price_max: "",
    groups_found: "",
    notes: "",
  });
  const add = useMutation({
    mutationFn: () =>
      api.addResearch({
        query: form.query,
        marketplace_count: Number(form.marketplace_count || 0),
        price_count: Number(form.price_count || 0),
        price_min: form.price_min ? Number(form.price_min) : undefined,
        price_median: form.price_median ? Number(form.price_median) : undefined,
        price_max: form.price_max ? Number(form.price_max) : undefined,
        groups_found: Number(form.groups_found || 0),
        notes: form.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research"] });
      setForm({
        query: "",
        marketplace_count: "",
        price_count: "",
        price_min: "",
        price_median: "",
        price_max: "",
        groups_found: "",
        notes: "",
      });
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteResearch({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["research"] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.query.trim()) add.mutate();
  };

  return (
    <div className="space-y-6">
      <section aria-label="Ghi kết quả nghiên cứu">
        <h2 className="text-lg font-bold">Ghi kết quả nghiên cứu</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Lượt quét Marketplace/hội nhóm chạy bằng tool Social Desk trên máy
          của bạn (hoặc nhờ Muse quét hộ) — ghi lại số liệu ở đây để đối
          chiếu khi định giá. Giá trích tự động có thể sai, kiểm tra tay trước
          khi đưa vào bài đăng.
        </p>
        <form
          onSubmit={submit}
          className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div>
            <label className={labelCls} htmlFor="rq-query">Từ khóa sản phẩm</label>
            <input
              id="rq-query" aria-label="Từ khóa sản phẩm"
              className={inputCls}
              value={form.query}
              onChange={(e) => setForm({ ...form, query: e.target.value })}
              placeholder="Nhập từ khóa sản phẩm"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} htmlFor="rq-count">Số tin Marketplace</label>
              <input id="rq-count" aria-label="Số tin Marketplace" type="number" min={0} className={inputCls} value={form.marketplace_count} onChange={(e) => setForm({ ...form, marketplace_count: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rq-pcount">Số giá trích được</label>
              <input id="rq-pcount" aria-label="Số giá trích được" type="number" min={0} className={inputCls} value={form.price_count} onChange={(e) => setForm({ ...form, price_count: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rq-groups">Số nhóm liên quan</label>
              <input id="rq-groups" aria-label="Số nhóm liên quan" type="number" min={0} className={inputCls} value={form.groups_found} onChange={(e) => setForm({ ...form, groups_found: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} htmlFor="rq-min">Giá thấp nhất (đ)</label>
              <input id="rq-min" aria-label="Giá thấp nhất (đ)" type="number" min={0} className={inputCls} value={form.price_min} onChange={(e) => setForm({ ...form, price_min: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rq-med">Giá trung vị (đ)</label>
              <input id="rq-med" aria-label="Giá trung vị (đ)" type="number" min={0} className={inputCls} value={form.price_median} onChange={(e) => setForm({ ...form, price_median: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rq-max">Giá cao nhất (đ)</label>
              <input id="rq-max" aria-label="Giá cao nhất (đ)" type="number" min={0} className={inputCls} value={form.price_max} onChange={(e) => setForm({ ...form, price_max: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="rq-notes">Ghi chú</label>
            <textarea id="rq-notes" aria-label="Ghi chú nghiên cứu" rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit" className={btnPrimary} disabled={add.isPending}>
            Lưu kết quả nghiên cứu
          </button>
        </form>
      </section>

      <section aria-label="Các lượt nghiên cứu đã lưu">
        <h2 className="text-lg font-bold">Các lượt đã chạy</h2>
        {runs.isPending && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>}
        <ul className="mt-3 space-y-3">
          {(runs.data?.runs ?? []).map((r: Run) => (
            <li key={r.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.query}</p>
                  <p className="text-xs text-[var(--dim)]">Chạy lúc {fmtDate(r.ran_at)} (giờ VN)</p>
                </div>
                <button className={btnDanger} onClick={() => del.mutate(r.id)} aria-label={`Xóa lượt nghiên cứu ${r.query}`}>
                  Xóa
                </button>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-[var(--dim)]">Tin Marketplace</dt><dd className="font-mono font-semibold">{r.marketplace_count}</dd></div>
                <div><dt className="text-xs text-[var(--dim)]">Giá thấp nhất</dt><dd className="font-mono font-semibold">{r.price_min_fmt}</dd></div>
                <div><dt className="text-xs text-[var(--dim)]">Giá trung vị</dt><dd className="font-mono font-semibold">{r.price_median_fmt}</dd></div>
                <div><dt className="text-xs text-[var(--dim)]">Giá cao nhất</dt><dd className="font-mono font-semibold">{r.price_max_fmt}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-[var(--dim)]">
                {r.price_count} giá trích được · {r.groups_found} nhóm liên quan
                {r.notes ? ` · ${r.notes}` : ""}
              </p>
            </li>
          ))}
        </ul>
        {runs.data && runs.data.runs.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">Chưa có lượt nghiên cứu nào được ghi.</p>
        )}
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- Hội nhóm */

function GroupsSection() {
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.listGroups({}),
  });
  // Tài khoản Facebook đã liên kết mà app dùng để quét link nhóm
  // (đọc chi tiết + kiểm tra trạng thái tham gia) — hiển thị trong
  // panel dán link để người dùng biết app quét bằng nick nào.
  const adderAccount = useQuery({
    queryKey: ["group-adder-account"],
    queryFn: () => api.getGroupAdderAccount({}),
  });
  const [pasteText, setPasteText] = useState("");
  const saveLinks = useMutation({
    mutationFn: () => api.saveGroupLinks({ links_text: pasteText }),
    onSuccess: (res) => {
      if (res.ok) setPasteText("");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const submitSave = (e: FormEvent) => {
    e.preventDefault();
    if (pasteText.trim()) saveLinks.mutate();
  };
  const setMembership = useMutation({
    mutationFn: (args: {
      group_id: number;
      identity_kind: "account" | "page";
      identity_id: number;
      status: "joined" | "not_joined";
    }) => api.setGroupMembership(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const flags = useMutation({
    mutationFn: (args: { id: number; joined?: boolean; is_target?: boolean }) =>
      api.setGroupFlags(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteGroup({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  return (
    <div className="space-y-6">
      <section aria-label="Thêm nhóm bằng link Facebook">
        <h2 className="text-lg font-bold">Thêm nhóm bằng link Facebook</h2>
        <form onSubmit={submitSave} className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          {!adderAccount.data?.linked && (
            <div
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] p-3"
              role="status"
            >
              <p className="text-sm font-medium text-[var(--danger)]">
                Chưa có tài khoản Facebook nào được liên kết — hãy
                liên kết tài khoản Facebook ở mục Tài khoản để app
                quét được chi tiết và trạng thái tham gia khi bạn
                dán link nhóm.
              </p>
            </div>
          )}
          <div>
            <label className={labelCls} htmlFor="gf-paste">
              Link nhóm Facebook (mỗi link một dòng)
            </label>
            <textarea
              id="gf-paste"
              aria-label="Dán link các nhóm Facebook"
              className={`${inputCls} min-h-24`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"https://www.facebook.com/groups/…\nhttps://www.facebook.com/groups/…"}
            />
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
              Cách lấy link nhóm: mở nhóm trên Facebook → nút Chia sẻ →
              “Sao chép liên kết” (hoặc chuột phải vào tên nhóm → “Sao
              chép liên kết”). Dán cả đoạn văn bản có chứa link nhóm
              cũng được — app tự tách link dạng facebook.com/groups/…
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={btnPrimary} disabled={saveLinks.isPending || !pasteText.trim()}>
              {saveLinks.isPending ? "Đang quét từng link nhóm…" : "Lưu & quét nhóm"}
            </button>
            <span className="text-sm text-[var(--dim)]">
              Tối đa 25 link mỗi lần lưu.
            </span>
          </div>
        </form>

        {saveLinks.isError && (
          <p className="mt-3 text-sm font-medium text-[var(--danger)]" role="alert">
            Lưu &amp; quét nhóm thất bại:{" "}
            {saveLinks.error instanceof Error
              ? saveLinks.error.message
              : "lỗi không xác định."}
          </p>
        )}
        {saveLinks.data && !saveLinks.data.ok && (
          <p className="mt-3 text-sm font-medium text-[var(--danger)]" role="alert">
            {saveLinks.data.message}
          </p>
        )}
        {saveLinks.data?.ok && (
          <div className="mt-3">
            <p className="text-sm text-[var(--dim)]" role="status">
              {saveLinks.data.message}
            </p>
            {saveLinks.data.scanned.length > 0 && (
              <ul className="mt-3 space-y-3">
                {saveLinks.data.scanned.map((g: ScannedGroup) => (
                  <li key={g.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <a href={g.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2">
                          {g.name}
                        </a>
                        <p className="text-xs text-[var(--dim)]">
                          <span className="font-mono">{fmtMembers(g.members)}</span> thành viên
                          {!g.detail_ok && " · chưa đọc được chi tiết"}
                        </p>
                        {g.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-[var(--dim)]">{g.description}</p>
                        )}
                        <p className="mt-1 text-xs text-[var(--dim)]">{g.note}</p>
                      </div>
                      {g.fb_status === "joined" ? (
                        <span className="shrink-0 rounded-full bg-[var(--ok)] px-3 py-1.5 text-xs font-semibold text-white">
                          ✓ Nick Facebook đã tham gia
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)]">
                          Nick Facebook chưa tham gia
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-[var(--dim)]">
              Các nhóm trên đã nằm trong <strong>Danh sách nhóm</strong>{" "}
              bên dưới — kiểm tra và đặt đúng trạng thái tham gia của
              từng Page trên thẻ nhóm trước khi đăng bài.
            </p>
          </div>
        )}

      </section>

      <section aria-label="Danh sách hội nhóm">
        <h2 className="text-lg font-bold">Danh sách nhóm</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Hiển thị theo <strong>tên nhóm</strong>. Chỉ đăng vào nhóm bạn{" "}
          <strong>đã tham gia</strong> — đăng vào nhóm lạ dễ bị Facebook
          coi là spam.
        </p>
        {groups.isPending && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>}
        <ul className="mt-3 space-y-3">
          {(groups.data?.groups ?? []).map((g: Group) => (
            <li key={g.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {g.url ? (
                    <a href={g.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2">
                      {g.name}
                    </a>
                  ) : (
                    <p className="font-semibold">{g.name}</p>
                  )}
                  <p className="text-xs text-[var(--dim)]">
                    <span className="font-mono">{fmtMembers(g.members)}</span> thành viên
                    {g.created_at
                      ? ` · Thêm lúc ${fmtDate(g.created_at)} (giờ VN)`
                      : ""}
                  </p>
                </div>
                <button className={btnDanger} onClick={() => del.mutate(g.id)} aria-label={`Xóa nhóm ${g.name}`}>Xóa</button>
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold text-[var(--dim)]">
                  Trạng thái tham gia theo từng tài khoản/Page (mỗi danh tính một trạng thái riêng — Page và tài khoản chính có thể khác nhau)
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {g.memberships
                    .filter((m) => m.identity_kind !== "instagram")
                    .map((m) => (
                      <li
                        key={`${m.identity_kind}-${m.identity_id}`}
                        className={`flex flex-wrap items-center gap-2 text-sm ${
                          m.identity_kind === "page"
                            ? "ml-6 border-l-2 border-[var(--border)] pl-3"
                            : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {m.identity_name}{" "}
                          <span className="text-xs text-[var(--dim)]">
                            ({m.identity_kind === "page" ? "Page" : "Tài khoản"})
                          </span>
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            m.status === "joined"
                              ? "bg-[var(--ok)] text-white"
                              : "border border-[var(--danger)] text-[var(--danger)]"
                          }`}
                        >
                          {m.status === "joined"
                            ? "✓ Đã tham gia"
                            : "Chưa tham gia"}
                        </span>
                        <select
                          aria-label={`Đặt trạng thái tham gia của ${m.identity_name} trong nhóm ${g.name}`}
                          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                          value={m.status}
                          disabled={setMembership.isPending}
                          onChange={(e) =>
                            setMembership.mutate({
                              group_id: g.id,
                              identity_kind: m.identity_kind as "account" | "page",
                              identity_id: m.identity_id,
                              status: e.target.value as
                                | "joined"
                                | "not_joined",
                            })
                          }
                        >
                          <option value="joined">Đã tham gia</option>
                          <option value="not_joined">Chưa tham gia</option>
                        </select>
                      </li>
                    ))}
                </ul>
                {g.memberships.filter((m) => m.identity_kind !== "instagram")
                  .length === 0 && (
                  <p className="mt-1 text-xs text-[var(--dim)]">
                    Chưa có tài khoản/Page nào trong app để đối chiếu
                    trạng thái tham gia.
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => flags.mutate({ id: g.id, is_target: !g.is_target })}
                  aria-pressed={g.is_target}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${g.is_target ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--dim)]"}`}
                >
                  {g.is_target ? "★ Nhóm đích đăng bài" : "Đặt làm nhóm đích"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {groups.data && groups.data.groups.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa có nhóm nào — dán link nhóm Facebook vào ô ở trên rồi
            bấm “Lưu &amp; quét nhóm”.
          </p>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- Sản phẩm */

const PRODUCT_PAGE_SIZE = 10;

type ProductSort =
  | "default"
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "stock_desc"
  | "stock_asc";

const PRODUCT_SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "default", label: "Mặc định (theo STT trong Sheet)" },
  { value: "name_asc", label: "Tên A–Z" },
  { value: "name_desc", label: "Tên Z–A" },
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "price_desc", label: "Giá cao → thấp" },
  { value: "stock_desc", label: "Tồn kho nhiều → ít" },
  { value: "stock_asc", label: "Tồn kho ít → nhiều" },
];

function productSortLabel(sort: ProductSort): string {
  return (
    PRODUCT_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort
  );
}

// Giá bán trong Sheet là chuỗi tự do (ví dụ "2.990.000", "2990000₫"):
// trích phần số để so sánh; không trích được số = thiếu giá.
function parsePriceValue(price: string): number | null {
  const digits = (price ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function filterProductsBySearch(
  list: Product[],
  needle: string,
): Product[] {
  if (!needle) return list;
  return list.filter((p) =>
    [p.name, p.maker, p.color, p.colors.join(" "), p.sku, p.stt, p.scale]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

// Sắp xếp áp trên TOÀN BỘ tập đã lọc rồi mới phân trang ở nơi gọi.
// Sản phẩm thiếu giá / thiếu tồn kho luôn xếp cuối bất kể chiều sắp.
function sortProducts(list: Product[], sort: ProductSort): Product[] {
  if (sort === "default") return list;
  const arr = [...list];
  if (sort === "name_asc")
    return arr.sort((a, b) =>
      a.name.localeCompare(b.name, "vi", { sensitivity: "base" }),
    );
  if (sort === "name_desc")
    return arr.sort((a, b) =>
      b.name.localeCompare(a.name, "vi", { sensitivity: "base" }),
    );
  if (sort === "price_asc" || sort === "price_desc") {
    const dir = sort === "price_asc" ? 1 : -1;
    return arr.sort((a, b) => {
      const av = parsePriceValue(a.price);
      const bv = parsePriceValue(b.price);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }
  // stock_desc | stock_asc — stock là số nguyên trong DB; chỉ khi
  // không phải số hữu hạn mới coi là thiếu tồn kho.
  const dir = sort === "stock_desc" ? -1 : 1;
  return arr.sort((a, b) => {
    const av =
      typeof a.stock === "number" && Number.isFinite(a.stock)
        ? a.stock
        : null;
    const bv =
      typeof b.stock === "number" && Number.isFinite(b.stock)
        ? b.stock
        : null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * dir;
  });
}

// ---------------------------------------------------------------------
// Thiết kế DANH SÁCH SẢN PHẨM DÙNG CHUNG cho mục Sản phẩm và mục Soạn
// bài: cùng một thẻ sản phẩm (ảnh thu nhỏ + tên + nhãn nguồn, mô tả
// chạy hết chiều ngang thẻ, hàng nhãn trạng thái ảnh/video, dải ảnh
// Drive tối đa 7 ảnh), cùng ô tìm kiếm + ô sắp xếp và cùng phân trang.
// Hai mục chỉ khác nhau ở phần hành động dưới thẻ (Sản phẩm: Sửa /
// Quét lại ảnh Drive / Xóa; Soạn bài: Đổ vào form) truyền qua children.
// ---------------------------------------------------------------------

// Icon đen trắng (đường nét theo màu chữ, không màu riêng) cho từng
// thông tin trên thẻ sản phẩm: hãng xe, tỉ lệ, kích thước, màu, giá,
// tồn kho, vận chuyển — mỗi thông tin một icon để phân biệt thay vì
// một dòng text ngăn bằng dấu "·".
function MetaIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-[var(--text)]"
    >
      {children}
    </svg>
  );
}

const CarIcon = () => (
  <MetaIcon>
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 3A3.8 3.8 0 0 0 2 12.9V16c0 .6.4 1 1 1h2" />
    <circle cx="7" cy="17" r="2" />
    <path d="M9 17h6" />
    <circle cx="17" cy="17" r="2" />
  </MetaIcon>
);

const ScaleIcon = () => (
  <MetaIcon>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </MetaIcon>
);

const RulerIcon = () => (
  <MetaIcon>
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
    <path d="m14.5 12.5 2-2" />
    <path d="m11.5 9.5 2-2" />
    <path d="m8.5 6.5 2-2" />
    <path d="m17.5 15.5 2-2" />
  </MetaIcon>
);

const ColorIcon = () => (
  <MetaIcon>
    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
  </MetaIcon>
);

const PriceTagIcon = () => (
  <MetaIcon>
    <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
    <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
  </MetaIcon>
);

const StockIcon = () => (
  <MetaIcon>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </MetaIcon>
);

const TruckIcon = () => (
  <MetaIcon>
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="17" cy="18" r="2" />
    <circle cx="7" cy="18" r="2" />
  </MetaIcon>
);

function ProductMetaItem({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span className="text-[var(--dim)]">{label}:</span>
      <span
        className={`font-semibold text-[var(--text)]${mono ? " font-mono" : ""}`}
      >
        {value}
      </span>
    </span>
  );
}

function ProductListCard({
  product: p,
  selected = false,
  children,
}: {
  product: Product;
  selected?: boolean;
  children?: ReactNode;
}) {
  return (
    <li
      className={`rounded-[var(--radius)] border bg-[var(--surface)] p-[15px] ${
        selected
          ? "border-2 border-[var(--accent)]"
          : "border-[var(--border)]"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <ProductThumb product={p} />
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <p className="min-w-0 font-semibold">
            {(p.sku || p.stt) && (
              <span className="mr-1.5 rounded bg-[var(--surface-alt)] px-1.5 py-0.5 font-mono text-xs font-semibold">
                {p.sku || `STT ${p.stt}`}
              </span>
            )}
            {p.name}
          </p>
          {p.source === "sheet" ? (
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--info)]">
              Từ Google Sheet
            </span>
          ) : (
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--dim)]">
              Nhập tay
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 text-xs leading-relaxed">
        {p.maker ? (
          <ProductMetaItem icon={<CarIcon />} label="Hãng xe" value={p.maker} />
        ) : null}
        <ProductMetaItem
          icon={<ScaleIcon />}
          label="Tỉ lệ"
          value={p.scale || "Chưa rõ"}
        />
        <ProductMetaItem
          icon={<RulerIcon />}
          label="Kích thước"
          value={p.size || "Chưa rõ"}
        />
        <ProductMetaItem
          icon={<ColorIcon />}
          label="Màu sắc"
          value={
            p.colors.length > 0
              ? p.colors.join(", ")
              : p.color || "Chưa rõ"
          }
        />
        <ProductMetaItem
          icon={<PriceTagIcon />}
          label="Giá bán"
          value={p.price || "Chưa có giá"}
          mono={Boolean(p.price)}
        />
        <ProductMetaItem
          icon={<StockIcon />}
          label="Tồn kho"
          value={String(p.stock)}
          mono
        />
        <ProductMetaItem
          icon={<TruckIcon />}
          label="Vận chuyển"
          value={p.ship || "COD"}
        />
      </div>
      <p className="mt-1 flex w-full flex-wrap gap-1.5 text-xs">
        {p.has_real_image ? (
          <a
            href={p.image_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Mở thư mục Drive của ${p.name} (đã có ${p.drive_images.length} ảnh thật từ Drive)`}
            className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]"
          >
            Có {p.drive_images.length} ảnh thật từ Drive (bản JPEG)
          </a>
        ) : (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--danger)]">
            {driveStatusLabel(p)}
          </span>
        )}
        {p.video_url ? (
          <a
            href={p.video_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Mở video của ${p.name}`}
            className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]"
          >
            Có video
          </a>
        ) : (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
            Chưa có video
          </span>
        )}
      </p>
      <DriveImageStrip images={p.drive_images} label={p.name} max={7} />
      {children}
    </li>
  );
}

function ProductListControls({
  searchId,
  sortId,
  searchAriaLabel,
  sortAriaLabel,
  search,
  onSearchChange,
  sort,
  onSortChange,
  total,
  rangeStart,
  rangeEnd,
  page,
  totalPages,
  needleText,
  allTotal,
}: {
  searchId: string;
  sortId: string;
  searchAriaLabel: string;
  sortAriaLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  sort: ProductSort;
  onSortChange: (value: ProductSort) => void;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  page: number;
  totalPages: number;
  needleText: string;
  allTotal?: number;
}) {
  const needle = needleText.trim();
  return (
    <>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor={searchId}>
            Tìm sản phẩm trong danh sách
          </label>
          <input
            id={searchId}
            aria-label={searchAriaLabel}
            className={inputCls}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm theo tên xe, hãng xe, màu, mã SKU…"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={sortId}>
            Sắp xếp danh sách sản phẩm
          </label>
          <select
            id={sortId}
            aria-label={sortAriaLabel}
            className={inputCls}
            value={sort}
            onChange={(e) => onSortChange(e.target.value as ProductSort)}
          >
            {PRODUCT_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {total > 0 && (
        <p className="mt-2 text-sm text-[var(--dim)]" role="status">
          Đang xem{" "}
          <strong className="font-mono">
            {rangeStart}–{rangeEnd} / {total}
          </strong>{" "}
          sản phẩm · Trang {page}/{totalPages} · {PRODUCT_PAGE_SIZE} sản
          phẩm mỗi trang
          {needle
            ? ` · đang lọc theo “${needle}”${
                allTotal !== undefined ? ` (tổng ${allTotal} sản phẩm)` : ""
              }`
            : ""}
          {sort !== "default" ? ` · sắp xếp: ${productSortLabel(sort)}` : ""}
        </p>
      )}
    </>
  );
}

function ProductListPagination({
  navLabel,
  prevLabel,
  nextLabel,
  pageLabel,
  pageNumbers,
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  onPage,
}: {
  navLabel: string;
  prevLabel: string;
  nextLabel: string;
  pageLabel: (n: number) => string;
  pageNumbers: number[];
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPage: (n: number) => void;
}) {
  if (total <= PRODUCT_PAGE_SIZE) return null;
  return (
    <nav
      aria-label={navLabel}
      className="mt-4 flex flex-wrap items-center gap-2"
    >
      <button
        type="button"
        className={btnGhost}
        disabled={page <= 1}
        onClick={() => onPage(Math.max(1, page - 1))}
        aria-label={prevLabel}
      >
        ← Trang trước
      </button>
      {pageNumbers.map((n, idx) => {
        const prev = pageNumbers[idx - 1];
        const gap = prev !== undefined && n - prev > 1;
        return (
          <span key={n} className="flex items-center gap-2">
            {gap && (
              <span aria-hidden className="text-sm text-[var(--dim)]">
                …
              </span>
            )}
            <button
              type="button"
              onClick={() => onPage(n)}
              aria-label={pageLabel(n)}
              aria-current={n === page ? "page" : undefined}
              className={`min-w-10 rounded-[var(--radius)] px-3 py-2 text-sm font-semibold ${
                n === page
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              }`}
            >
              {n}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        className={btnGhost}
        disabled={page >= totalPages}
        onClick={() => onPage(Math.min(totalPages, page + 1))}
        aria-label={nextLabel}
      >
        Trang sau →
      </button>
      <span className="text-sm text-[var(--dim)]" role="status">
        {rangeStart}–{rangeEnd} / {total} sản phẩm
      </span>
    </nav>
  );
}

function ProductsSection() {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.listProducts({}),
  });
  const [productPage, setProductPage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [productSort, setProductSort] = useState<ProductSort>("default");
  const allProducts: Product[] = products.data?.products ?? [];
  const productSearchNeedle = productSearch.trim().toLowerCase();
  const filteredProducts = sortProducts(
    filterProductsBySearch(allProducts, productSearchNeedle),
    productSort,
  );
  const productTotal = filteredProducts.length;
  const productTotalPages = Math.max(
    1,
    Math.ceil(productTotal / PRODUCT_PAGE_SIZE),
  );
  const safeProductPage = Math.min(productPage, productTotalPages);
  const productRangeStart =
    productTotal === 0 ? 0 : (safeProductPage - 1) * PRODUCT_PAGE_SIZE + 1;
  const productRangeEnd = Math.min(
    productTotal,
    safeProductPage * PRODUCT_PAGE_SIZE,
  );
  const pagedProducts = filteredProducts.slice(
    (safeProductPage - 1) * PRODUCT_PAGE_SIZE,
    safeProductPage * PRODUCT_PAGE_SIZE,
  );
  // Số có/chưa có ảnh THẬT (đã lấy được file từ Drive) của các sản
  // phẩm nguồn Sheet — dùng cho dòng tóm tắt đồng bộ rút gọn.
  const sheetProductsAll = allProducts.filter((p) => p.source === "sheet");
  const realImageCounts =
    sheetProductsAll.length > 0
      ? {
          with: sheetProductsAll.filter((p) => p.has_real_image).length,
          without: sheetProductsAll.filter((p) => !p.has_real_image)
            .length,
        }
      : undefined;
  useEffect(() => {
    if (productPage > productTotalPages) setProductPage(productTotalPages);
  }, [productPage, productTotalPages]);
  const productPageNumbers: number[] = (() => {
    if (productTotalPages <= 7)
      return Array.from({ length: productTotalPages }, (_, i) => i + 1);
    const wanted = new Set<number>([
      1,
      productTotalPages,
      safeProductPage - 1,
      safeProductPage,
      safeProductPage + 1,
    ]);
    return [...wanted]
      .filter((n) => n >= 1 && n <= productTotalPages)
      .sort((a, b) => a - b);
  })();
  const sheet = useQuery({
    queryKey: ["sheet"],
    queryFn: () => api.getSheetConfig({}),
  });
  const [sheetForm, setSheetForm] = useState({
    name: "",
    spreadsheet: "",
    sheet_name: "",
    range: "",
  });
  const [sheetMsg, setSheetMsg] = useState("");
  const [productForm, setProductForm] = useState({
    id: 0,
    stt: "",
    name: "",
    scale: "",
    maker: "",
    size: "",
    color: "",
    price: "",
    stock: "1",
    ship: "",
    image_url: "",
    video_url: "",
  });
  const [productMsg, setProductMsg] = useState("");

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["sheet"] });
  };
  const saveSheet = useMutation({
    mutationFn: () => api.saveSheetConfig({ ...sheetForm }),
    onSuccess: (res) => {
      setSheetMsg(res.message);
      if (res.ok)
        setSheetForm({ name: "", spreadsheet: "", sheet_name: "", range: "" });
      refreshAll();
    },
  });
  const sync = useMutation({
    mutationFn: (sourceId: number) =>
      api.syncSheetNow({ source_id: sourceId }),
    onSuccess: (res) => {
      setSheetMsg(res.message);
      setProductPage(1);
      refreshAll();
    },
    onError: (err) => {
      setSheetMsg(
        `Đồng bộ thất bại: ${err instanceof Error ? err.message : String(err)}`,
      );
      refreshAll();
    },
  });
  const setActiveSource = useMutation({
    mutationFn: (id: number) => api.setActiveSheetSource({ id }),
    onSuccess: (res) => {
      setSheetMsg(res.message);
      refreshAll();
    },
  });
  const deleteSource = useMutation({
    mutationFn: (id: number) => api.deleteSheetSource({ id }),
    onSuccess: (res) => {
      setSheetMsg(res.message);
      refreshAll();
    },
  });
  const saveProduct = useMutation({
    mutationFn: () =>
      api.saveProduct({
        id: productForm.id || undefined,
        stt: productForm.stt,
        name: productForm.name,
        scale: productForm.scale,
        maker: productForm.maker,
        size: productForm.size,
        color: productForm.color,
        price: productForm.price,
        stock: Number(productForm.stock || 1),
        ship: productForm.ship,
        image_url: productForm.image_url,
        video_url: productForm.video_url,
      }),
    onSuccess: () => {
      refreshAll();
      setProductMsg("Đã lưu sản phẩm.");
      setProductForm({
        id: 0,
        stt: "",
        name: "",
        scale: "",
        maker: "",
        size: "",
        color: "",
        price: "",
        stock: "1",
        ship: "",
        image_url: "",
        video_url: "",
      });
    },
  });
  const deleteProduct = useMutation({
    mutationFn: (id: number) => api.deleteProduct({ id }),
    onSuccess: refreshAll,
  });
  const [driveMsg, setDriveMsg] = useState<Record<number, string>>({});
  const productFormRef = useRef<HTMLFormElement>(null);
  const refreshImages = useMutation({
    mutationFn: (id: number) => api.refreshProductImages({ id }),
    onSuccess: (res, id) => {
      setDriveMsg((m) => ({ ...m, [id]: res.message }));
      refreshAll();
    },
    onError: (err, id) => {
      setDriveMsg((m) => ({
        ...m,
        [id]: `Quét ảnh Drive thất bại: ${err instanceof Error ? err.message : String(err)}`,
      }));
    },
  });

  const submitSheet = (e: FormEvent) => {
    e.preventDefault();
    if (sheetForm.spreadsheet.trim()) saveSheet.mutate();
  };
  const submitProduct = (e: FormEvent) => {
    e.preventDefault();
    if (productForm.name.trim()) saveProduct.mutate();
  };

  const cfg: SheetConfig | undefined = sheet.data;

  const activeSource = cfg?.sources.find((s) => s.is_active);
  const manualCount = allProducts.filter((p) => p.source !== "sheet").length;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-5">
      <div className="min-w-0 space-y-4 lg:col-span-2 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1">
      <section
        aria-label="Nguồn Sản Phẩm"
        className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-lg font-bold">Nguồn Sản Phẩm</h2>
          <span className="rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-xs font-semibold">
            <span className="font-mono">{allProducts.length}</span> sản phẩm
          </span>
        </header>
        <div aria-label="Danh sách nguồn Sheet đã lưu" className="p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Nguồn Sheet đã lưu
            </h3>
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-mono text-xs font-semibold">
              {cfg?.sources.length ?? 0}
            </span>
          </div>
          {activeSource && (
            <p className="mt-1.5 text-xs text-[var(--dim)]" role="status">
              Đang lấy từ:{" "}
              <span className="font-semibold text-[var(--text)]">
                {activeSource.name}
              </span>
            </p>
          )}
          {cfg && cfg.sources.length === 0 && (
            <p className="mt-2 rounded-[var(--radius)] bg-[var(--surface-alt)] px-3 py-2.5 text-sm text-[var(--dim)]">
              Chưa có nguồn nào — thêm nguồn ở phần “Thêm nguồn Sheet” bên
              dưới.
            </p>
          )}
          <ul className="mt-2 space-y-3">
            {(cfg?.sources ?? []).map((src: SheetSource) => (
              <li
                key={src.id}
                className={`rounded-[var(--radius)] border bg-[var(--bg)] p-3 ${
                  src.is_active
                    ? "border-2 border-[var(--accent)]"
                    : "border-[var(--border)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{src.name}</p>
                  {src.is_active && (
                    <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">
                      Nguồn đang chọn
                    </span>
                  )}
                  <span className="text-xs text-[var(--dim)]">
                    <span className="font-mono">{src.product_count}</span> sản
                    phẩm từ nguồn này
                  </span>
                </div>
                {src.title && src.title !== src.name && (
                  <p className="mt-0.5 text-xs text-[var(--dim)]">
                    Tên file trên Google: “{src.title}”
                  </p>
                )}
                <p className="mt-0.5 truncate text-xs text-[var(--dim)]">
                  Link:{" "}
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Mở file Sheet của nguồn ${src.name}`}
                    className="font-mono text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                  >
                    {src.url}
                  </a>
                </p>
                <p className="mt-0.5 text-xs text-[var(--dim)]">
                  {src.sheet_name
                    ? `Tab: ${src.sheet_name}`
                    : "Tab: tab đầu tiên"}
                  {src.last_sync_at
                    ? ` · Đồng bộ ${fmtDate(src.last_sync_at)} — ${shortenSyncMessage(src.last_sync_message, realImageCounts)}`
                    : " · Chưa đồng bộ lần nào"}
                  {src.last_sync_status === "syncing"
                    ? " · Đang đồng bộ…"
                    : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={sync.isPending}
                    onClick={() => sync.mutate(src.id)}
                    aria-label={`Đồng bộ ngay từ nguồn Sheet ${src.name}`}
                  >
                    {sync.isPending ? "Đang đồng bộ…" : "Đồng bộ nguồn này"}
                  </button>
                  {!src.is_active && (
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={setActiveSource.isPending}
                      onClick={() => setActiveSource.mutate(src.id)}
                      aria-label={`Chọn nguồn Sheet ${src.name} làm nguồn chính`}
                    >
                      Chọn làm nguồn chính
                    </button>
                  )}
                  <button
                    type="button"
                    className={btnDanger}
                    disabled={deleteSource.isPending}
                    onClick={() => deleteSource.mutate(src.id)}
                    aria-label={`Xóa nguồn Sheet ${src.name} khỏi danh sách đã lưu`}
                  >
                    Xóa nguồn
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {sheetMsg && (
            <p className="mt-2 text-sm font-medium" role="status">
              {sheetMsg}
            </p>
          )}
        </div>

        <form
          onSubmit={submitSheet}
          aria-label="Thêm nguồn Sheet"
          className="space-y-3 border-t border-[var(--border)] p-4"
        >
          <h3 className="text-sm font-semibold">Thêm nguồn Sheet</h3>
          <div>
            <label className={labelCls} htmlFor="sh-name">Tên nguồn Sheet *</label>
            <input
              id="sh-name"
              aria-label="Tên nguồn Sheet"
              className={inputCls}
              value={sheetForm.name}
              onChange={(e) =>
                setSheetForm({ ...sheetForm, name: e.target.value })
              }
              placeholder="Đặt tên cho nguồn Sheet"
              required
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="sh-link">Link hoặc ID file Google Sheet *</label>
            <input
              id="sh-link"
              aria-label="Link hoặc ID file Google Sheet"
              className={inputCls}
              value={sheetForm.spreadsheet}
              onChange={(e) =>
                setSheetForm({ ...sheetForm, spreadsheet: e.target.value })
              }
              placeholder="https://docs.google.com/spreadsheets/d/…"
              required
            />
          </div>
          <div className="grid gap-3">
            <div>
              <label className={labelCls} htmlFor="sh-tab">Tên tab trong Sheet</label>
              <input
                id="sh-tab"
                aria-label="Tên tab trong Sheet"
                className={inputCls}
                value={sheetForm.sheet_name}
                onChange={(e) =>
                  setSheetForm({ ...sheetForm, sheet_name: e.target.value })
                }
                placeholder="Để trống = tab đầu tiên"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="sh-range">Phạm vi ô (không bắt buộc)</label>
              <input
                id="sh-range"
                aria-label="Phạm vi ô"
                className={inputCls}
                value={sheetForm.range}
                onChange={(e) =>
                  setSheetForm({ ...sheetForm, range: e.target.value })
                }
                placeholder="Để trống = lấy toàn bộ dữ liệu"
              />
            </div>
          </div>
          <button
            type="submit"
            className={`${btnPrimary} w-full sm:w-auto`}
            disabled={saveSheet.isPending}
          >
            {saveSheet.isPending ? "Đang lưu…" : "Lưu nguồn Sheet"}
          </button>
        </form>
      </section>

      <section
        aria-label="Thêm sản phẩm thủ công"
        className={`overflow-hidden rounded-[var(--radius)] border bg-[var(--surface)] ${
          productForm.id
            ? "border-2 border-[var(--accent)]"
            : "border-[var(--border)]"
        }`}
      >
        <form
          ref={productFormRef}
          onSubmit={submitProduct}
          className="scroll-mt-24"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-base font-bold">
              {productForm.id
                ? `Đang sửa sản phẩm #${productForm.id}`
                : "Thêm sản phẩm thủ công"}
            </h2>
            {productForm.id > 0 && (
              <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">
                Đang sửa
              </span>
            )}
          </header>
          <div className="space-y-4 p-4">
            <div role="group" aria-label="Thông tin xe" className="space-y-3">
              <p className="text-xs font-bold text-[var(--dim)]">
                Thông tin xe
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls} htmlFor="pf-name">Tên sản phẩm *</label>
                  <input id="pf-name" aria-label="Tên sản phẩm" className={inputCls} value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required />
                </div>
                <div className="col-span-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="pf-maker">Hãng xe</label>
                    <Hint
                      label="Chú thích ô Hãng xe (thêm sản phẩm thủ công)"
                      text="Hãng xe sẽ được nhắc trong bài viết; tên sản phẩm luôn giữ nguyên văn như đã nhập."
                    />
                  </div>
                  <input id="pf-maker" aria-label="Hãng xe" className={inputCls} value={productForm.maker} onChange={(e) => setProductForm({ ...productForm, maker: e.target.value })} placeholder="Nhập hãng xe như trong Sheet" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-stt">Mã STT (quản lý từng xe)</label>
                  <input id="pf-stt" aria-label="Mã STT" className={inputCls} value={productForm.stt} onChange={(e) => setProductForm({ ...productForm, stt: e.target.value })} placeholder="Nhập mã STT như trong Sheet" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-scale">Tỉ lệ / kích cỡ</label>
                  <input id="pf-scale" aria-label="Tỉ lệ" className={inputCls} value={productForm.scale} onChange={(e) => setProductForm({ ...productForm, scale: e.target.value })} placeholder="Nhập tỉ lệ như trong Sheet" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-size">Kích thước (Dài x Rộng x Cao)</label>
                  <input id="pf-size" aria-label="Kích thước" className={inputCls} value={productForm.size} onChange={(e) => setProductForm({ ...productForm, size: e.target.value })} placeholder="Nhập như trong Sheet, ví dụ dạng Dài x Rộng x Cao" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-color">Màu</label>
                  <input id="pf-color" aria-label="Màu" className={inputCls} value={productForm.color} onChange={(e) => setProductForm({ ...productForm, color: e.target.value })} />
                </div>
              </div>
            </div>
            <div
              role="group"
              aria-label="Giá, tồn kho và vận chuyển"
              className="space-y-3 border-t border-[var(--border)] pt-4"
            >
              <p className="text-xs font-bold text-[var(--dim)]">
                Giá, tồn kho &amp; vận chuyển
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="pf-price">Giá</label>
                  <input id="pf-price" aria-label="Giá" className={inputCls} value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} placeholder="Nhập giá như trong Sheet" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-stock">Tồn kho</label>
                  <input id="pf-stock" aria-label="Tồn kho" type="number" min={0} className={inputCls} value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="pf-ship">Vận chuyển</label>
                    <Hint
                      label="Chú thích ô Vận chuyển (thêm sản phẩm thủ công)"
                      text="Sheet không có cột vận chuyển — mọi sản phẩm mặc định COD; chỉ điền khi xe này giao khác."
                    />
                  </div>
                  <input id="pf-ship" aria-label="Vận chuyển" className={inputCls} value={productForm.ship} onChange={(e) => setProductForm({ ...productForm, ship: e.target.value })} placeholder="Để trống = mặc định COD" />
                </div>
              </div>
            </div>
            <div
              role="group"
              aria-label="Ảnh và video"
              className="space-y-3 border-t border-[var(--border)] pt-4"
            >
              <p className="text-xs font-bold text-[var(--dim)]">
                Ảnh &amp; video
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls} htmlFor="pf-img">Link ảnh sản phẩm — thư mục Google Drive</label>
                  <input id="pf-img" aria-label="Link ảnh sản phẩm" className={inputCls} value={productForm.image_url} onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })} placeholder="https://… (link thư mục Drive như trong Sheet)" />
                  {productForm.image_url.trim() && (
                    <div className="mt-2">
                      <SheetImagePreview url={productForm.image_url} label={productForm.name || "sản phẩm"} />
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className={labelCls} htmlFor="pf-vid">Link video sản phẩm</label>
                  <input id="pf-vid" aria-label="Link video sản phẩm" className={inputCls} value={productForm.video_url} onChange={(e) => setProductForm({ ...productForm, video_url: e.target.value })} placeholder="https://… (để trống nếu chưa quay video)" />
                </div>
              </div>
            </div>
          </div>
          <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-4 py-3">
            <button type="submit" className={`${btnPrimary} flex-1 sm:flex-none`} disabled={saveProduct.isPending}>
              {saveProduct.isPending
                ? "Đang lưu…"
                : productForm.id
                  ? "Lưu thay đổi"
                  : "Thêm sản phẩm"}
            </button>
            {productForm.id > 0 && (
              <button
                type="button"
                className={btnGhost}
                aria-label="Hủy sửa, quay về thêm sản phẩm thủ công"
                onClick={() => {
                  setProductMsg("");
                  setProductForm({
                    id: 0,
                    stt: "",
                    name: "",
                    scale: "",
                    maker: "",
                    size: "",
                    color: "",
                    price: "",
                    stock: "1",
                    ship: "",
                    image_url: "",
                    video_url: "",
                  });
                }}
              >
                Hủy sửa
              </button>
            )}
            {productMsg && (
              <p className="text-sm font-medium text-[var(--ok)]" role="status">
                {productMsg}
              </p>
            )}
          </footer>
        </form>
      </section>
      </div>

      <section aria-label="Danh sách sản phẩm" className="min-w-0 lg:col-span-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            Sản phẩm đang bán ({productTotal})
          </h2>
          {allProducts.length > 0 && (
            <p className="text-xs text-[var(--dim)]" role="status">
              <span className="font-mono font-semibold">
                {sheetProductsAll.length}
              </span>{" "}
              từ Sheet ·{" "}
              <span className="font-mono font-semibold">{manualCount}</span>{" "}
              nhập tay
            </p>
          )}
        </header>
        <ProductListControls
          searchId="products-search"
          sortId="products-sort"
          searchAriaLabel="Tìm sản phẩm trong mục Sản phẩm"
          sortAriaLabel="Sắp xếp danh sách sản phẩm"
          search={productSearch}
          onSearchChange={(value) => {
            setProductSearch(value);
            setProductPage(1);
          }}
          sort={productSort}
          onSortChange={(value) => {
            setProductSort(value);
            setProductPage(1);
          }}
          total={productTotal}
          rangeStart={productRangeStart}
          rangeEnd={productRangeEnd}
          page={safeProductPage}
          totalPages={productTotalPages}
          needleText={productSearch}
          allTotal={allProducts.length}
        />
        <ul className="mt-3 space-y-3">
          {pagedProducts.map((p: Product) => (
            <ProductListCard key={p.id} product={p}>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={btnGhost}
                  onClick={() => {
                    setProductForm({
                      id: p.id,
                      stt: p.stt,
                      name: p.name,
                      scale: p.scale,
                      maker: p.maker,
                      size: p.size,
                      color: p.color,
                      price: p.price,
                      stock: String(p.stock),
                      ship: p.ship,
                      image_url: p.image_url,
                      video_url: p.video_url,
                    });
                    requestAnimationFrame(() =>
                      productFormRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                      }),
                    );
                  }}
                >
                  Sửa
                </button>
                <button
                  className={btnGhost}
                  disabled={refreshImages.isPending}
                  onClick={() => refreshImages.mutate(p.id)}
                  aria-label={`Quét lại ảnh thật từ Drive cho ${p.name}`}
                >
                  {refreshImages.isPending ? "Đang quét Drive…" : "Quét lại ảnh Drive"}
                </button>
                <button
                  className={btnDanger}
                  onClick={() => deleteProduct.mutate(p.id)}
                  aria-label={`Xóa sản phẩm ${p.name}`}
                >
                  Xóa
                </button>
              </div>
              {driveMsg[p.id] && (
                <p className="mt-2 text-sm font-medium" role="status">
                  {driveMsg[p.id]}
                </p>
              )}
            </ProductListCard>
          ))}
        </ul>
        {products.data && products.data.products.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa có sản phẩm nào — đồng bộ từ một nguồn trong mục Nguồn
            Sản Phẩm hoặc thêm thủ công ở cột bên trái.
          </p>
        )}
        {products.data &&
          products.data.products.length > 0 &&
          productTotal === 0 && (
            <p className="mt-2 text-sm text-[var(--dim)]">
              Không có sản phẩm nào khớp với “{productSearch.trim()}”.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setProductSearch("");
                  setProductPage(1);
                }}
              >
                Xóa từ khóa tìm
              </button>
            </p>
          )}
        <ProductListPagination
          navLabel="Phân trang danh sách sản phẩm"
          prevLabel="Trang trước"
          nextLabel="Trang sau"
          pageLabel={(n) => `Đi tới trang ${n}`}
          pageNumbers={productPageNumbers}
          page={safeProductPage}
          totalPages={productTotalPages}
          rangeStart={productRangeStart}
          rangeEnd={productRangeEnd}
          total={productTotal}
          onPage={setProductPage}
        />

      </section>
    </div>
  );
}

/* --------------------------------------------------------------- Soạn bài */

interface DraftFormState {
  stt: string;
  sku: string;
  product_name: string;
  scale: string;
  maker: string;
  color: string;
  price: string;
  stock: string;
  ship: string;
  image_url: string;
  video_url: string;
  selling_point: string;
  size_cm: string;
}

const EMPTY_DRAFT_FORM: DraftFormState = {
  stt: "",
  sku: "",
  product_name: "",
  scale: "",
  maker: "",
  color: "",
  price: "",
  stock: "1",
  ship: "",
  image_url: "",
  video_url: "",
  selling_point: "",
  size_cm: "",
};

type ComposeImage = Product["drive_images"][number];

function ComposeSection({
  onGoQueue,
  onGoProducts,
}: {
  onGoQueue: () => void;
  onGoProducts: () => void;
}) {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.listProducts({}),
  });
  // Danh sách chọn sản phẩm bên dưới: tìm kiếm + phân trang 10 sản
  // phẩm/trang như mục Sản phẩm. Đổi từ khóa tìm kiếm thì quay về
  // trang 1; chuyển trang giữ nguyên từ khóa đang tìm.
  const [listSearch, setListSearch] = useState("");
  const [listSort, setListSort] = useState<ProductSort>("default");
  const [listPage, setListPage] = useState(1);
  const allComposeProducts: Product[] = products.data?.products ?? [];
  const searchNeedle = listSearch.trim().toLowerCase();
  const filteredComposeProducts = sortProducts(
    filterProductsBySearch(allComposeProducts, searchNeedle),
    listSort,
  );
  const composeTotal = filteredComposeProducts.length;
  const composeTotalPages = Math.max(
    1,
    Math.ceil(composeTotal / PRODUCT_PAGE_SIZE),
  );
  const safeListPage = Math.min(listPage, composeTotalPages);
  const composeRangeStart =
    composeTotal === 0 ? 0 : (safeListPage - 1) * PRODUCT_PAGE_SIZE + 1;
  const composeRangeEnd = Math.min(
    composeTotal,
    safeListPage * PRODUCT_PAGE_SIZE,
  );
  const pagedComposeProducts = filteredComposeProducts.slice(
    (safeListPage - 1) * PRODUCT_PAGE_SIZE,
    safeListPage * PRODUCT_PAGE_SIZE,
  );
  useEffect(() => {
    if (listPage > composeTotalPages) setListPage(composeTotalPages);
  }, [listPage, composeTotalPages]);
  const composePageNumbers: number[] = (() => {
    if (composeTotalPages <= 7)
      return Array.from({ length: composeTotalPages }, (_, i) => i + 1);
    const wanted = new Set<number>([
      1,
      composeTotalPages,
      safeListPage - 1,
      safeListPage,
      safeListPage + 1,
    ]);
    return [...wanted]
      .filter((n) => n >= 1 && n <= composeTotalPages)
      .sort((a, b) => a - b);
  })();
  const [form, setForm] = useState<DraftFormState>(EMPTY_DRAFT_FORM);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [composeMsg, setComposeMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [queuedMsg, setQueuedMsg] = useState("");
  const composeJobs = useComposeJobs();
  // Tập ảnh ĐANG gắn vào bài trong form: mặc định là ảnh Drive của
  // sản phẩm đã chọn; người dùng tự xóa bớt / thêm lại từ Drive /
  // tải ảnh từ thiết bị lên. Khi gửi, tập này được chốt vào bản
  // nháp và gói đăng dùng đúng tập đó — không quét lại Drive.
  const [images, setImages] = useState<ComposeImage[]>([]);
  const [imagesCustomized, setImagesCustomized] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [imageMsg, setImageMsg] = useState("");

  const resetComposeForm = () => {
    setForm(EMPTY_DRAFT_FORM);
    setSelectedProduct(null);
    setImages([]);
    setImagesCustomized(false);
    setImageMsg("");
    setComposeMsg("");
  };

  // Gửi bài vào HÀNG ĐỢI SOẠN BÀI toàn cục thay vì chờ ngay tại
  // form: chụp lại toàn bộ dữ kiện + tập ảnh đã chốt tại thời điểm
  // bấm, đưa vào hàng đợi (chạy nền lần lượt từng bài, theo dõi ở
  // vòng tròn tiến trình kéo đi được trên màn hình), rồi làm trống
  // form NGAY để chọn sản phẩm khác soạn tiếp. Bài chạy xong tự vào
  // Hàng đợi duyệt và tự biến mất khỏi danh sách tiến trình; bài lỗi
  // ở lại trong danh sách tiến trình với nút Thử lại (dữ kiện đã
  // chụp nên thử lại không cần soạn lại form).
  const enqueueCreate = () => {
    // MÃ CHỐNG TRÙNG của riêng lượt soạn này: sinh MỘT lần tại đây
    // và giữ nguyên trong cả hàm chạy lẫn các lần "Thử lại" của
    // việc này. Máy chủ thấy cùng mã thì trả về bản nháp đã tạo
    // thay vì tạo bản thứ hai — thử lại sau timeout thành an toàn.
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `compose-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const snapshot = {
      ...form,
      idempotency_key: idempotencyKey,
      images: images.map((im) => ({ ...im })),
      images_customized: imagesCustomized,
    };
    const name = snapshot.product_name.trim();
    // ĐỐI SOÁT SAU TIMEOUT: hỏi máy chủ theo mã chống trùng xem
    // lượt soạn này đã kịp lưu bản nháp chưa; dò vài lần cách nhau
    // ít giây vì máy chủ có thể vẫn đang viết bài khi cổng kết nối
    // đã cắt phản hồi. Thấy bản nháp → coi như XONG kèm drive
    // message nói rõ là bài đối soát được, không phải bài mới.
    const reconcileByKey = async (
      message: string,
    ): Promise<ReconciledComposeResult | null> => {
      if (!isGatewayTimeoutError(message)) return null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0)
          await new Promise((r) => window.setTimeout(r, 2500));
        try {
          const found = await api.findDraftByKey({
            idempotency_key: idempotencyKey,
          });
          if (found.found) {
            return {
              reconciled: true,
              note: "phản hồi bị timeout nhưng bài đã kịp vào Hàng đợi duyệt (đã đối soát)",
              result: {
                id: found.id,
                code: found.code,
                writer: found.writer === "template" ? "template" : "ai",
                drive_status: found.drive_status,
                drive_image_count: found.drive_image_count,
                drive_message:
                  "Phản hồi soạn bài bị timeout ở cổng kết nối, nhưng máy chủ đã lưu xong — app đã đối soát theo mã chống trùng và xác nhận bài đã vào Hàng đợi duyệt. Không cần soạn lại; bấm Thử lại (nếu còn hiện) cũng không tạo bản trùng.",
              },
            };
          }
        } catch {
          // Hỏi đối soát cũng lỗi — thử tiếp vòng sau; hết vòng thì
          // trả null để việc giữ trạng thái lỗi như cũ.
        }
      }
      return null;
    };
    composeJobs.enqueue({
      kind: "create",
      label: name,
      run: () => api.createDraft(snapshot),
      reconcileOnError: reconcileByKey,
      onDone: (result) => {
        const res = result as ApiResponse<typeof api, "createDraft">;
        setQueuedMsg("");
        setSuccessMsg(
          `Đã soạn xong bài “${name}” — bài đã vào Hàng đợi duyệt. ${res.drive_message}`,
        );
        queryClient.invalidateQueries({ queryKey: ["drafts"] });
        queryClient.invalidateQueries({ queryKey: ["overview"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      },
      onError: (message) => {
        setSuccessMsg("");
        setComposeMsg(
          isGatewayTimeoutError(message)
            ? `Soạn bài “${name}” bị timeout ở cổng kết nối: ${message} — app đã tự đối soát nhưng chưa thấy bài trong Hàng đợi duyệt. Mở vòng tròn tiến trình trên màn hình để bấm Thử lại: lượt soạn này có mã chống trùng nên thử lại không tạo bản trùng, dữ kiện của bài vẫn được giữ trong hàng đợi.`
            : `Soạn bài “${name}” thất bại: ${message} — mở vòng tròn tiến trình trên màn hình để bấm Thử lại, dữ kiện của bài vẫn được giữ trong hàng đợi.`,
        );
      },
    });
    resetComposeForm();
    setQueuedMsg(
      `Đã đưa bài “${name}” vào hàng đợi soạn bài — vòng tròn tiến trình trên màn hình cho biết bài nào đang chạy, bài nào đang chờ; soạn xong bài tự vào Hàng đợi duyệt. Form đã làm trống, chọn sản phẩm khác bên dưới để soạn tiếp ngay.`,
    );
  };

  const submitDraft = (e: FormEvent) => {
    e.preventDefault();
    if (form.product_name.trim()) enqueueCreate();
  };
  // Sản phẩm được phân loại theo Hãng + Mẫu + Tỉ lệ + Kích thước +
  // Màu sắc: mỗi thẻ là đúng MỘT màu, nên đổ vào form là màu và SKU
  // (đã gồm màu, dạng "STT-Tên-Màu") của chính biến thể đó được điền
  // sẵn. Các nút chọn màu dưới thẻ chỉ còn xuất hiện với dữ liệu gộp
  // cũ (nhiều màu trong một thẻ) còn sót trước lần đồng bộ kế tiếp.
  const useProduct = (p: Product, chosenColor?: string) => {
    setSelectedProduct(p);
    setComposeMsg("");
    setSuccessMsg("");
    setQueuedMsg("");
    setImageMsg("");
    setImages(p.drive_images);
    setImagesCustomized(false);
    const colorList =
      p.colors.length > 0 ? p.colors : p.color ? [p.color] : [];
    const color =
      chosenColor ??
      (colorList.length === 1 ? (colorList[0] ?? "") : "");
    const sku =
      chosenColor && colorList.length > 1 && p.sku
        ? `${p.sku}-${chosenColor}`
        : p.sku;
    setForm((prev) => ({
      stt: p.stt,
      sku,
      product_name: p.name,
      scale: p.scale,
      maker: p.maker,
      color,
      price: p.price,
      stock: String(p.stock),
      ship: p.ship,
      image_url: p.image_url,
      video_url: p.video_url,
      selling_point: prev.selling_point,
      size_cm: p.size || prev.size_cm,
    }));
    if (colorList.length > 1 && !chosenColor) {
      setComposeMsg(
        `Sản phẩm “${p.name}” có ${colorList.length} màu (${colorList.join(", ")}) — bấm nút màu dưới thẻ sản phẩm để đổ đúng màu vào form, hoặc tự điền ô Màu trong form trước khi viết bài.`,
      );
    }
  };

  const removeImage = (im: ComposeImage) => {
    setImages((list) => list.filter((x) => x.id !== im.id));
    setImagesCustomized(true);
    setSuccessMsg("");
    setImageMsg(
      `Đã bỏ ảnh “${im.name}” khỏi bài này (chỉ bỏ khỏi bản nháp — file gốc trên Drive/thiết bị không bị xóa).`,
    );
  };
  const addDriveImage = (im: ComposeImage) => {
    setImages((list) =>
      list.some((x) => x.id === im.id) ? list : [...list, im],
    );
    setImagesCustomized(true);
    setSuccessMsg("");
    setImageMsg(`Đã thêm lại ảnh “${im.name}” từ thư mục Drive của sản phẩm.`);
  };
  const upload = useMutation({
    mutationFn: (args: { name: string; mime: string; data_base64: string }) =>
      api.uploadMedia(args),
  });
  const onUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadBusy(true);
    setImageMsg("");
    setSuccessMsg("");
    let added = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setImageMsg(`File “${file.name}” không phải ảnh — chỉ gắn được file ảnh vào bài.`);
        continue;
      }
      try {
        const b64 = await fileToBase64(file);
        const res = await upload.mutateAsync({
          name: file.name,
          mime: file.type || "image/jpeg",
          data_base64: b64,
        });
        if (res.ok && res.url) {
          setImages((list) => [
            ...list,
            {
              id: `upload-${res.id}`,
              name: res.name || file.name,
              mime: res.mime || file.type,
              size: res.size || file.size,
              jpeg_url: res.url,
              view_url: res.url,
              is_heic: false,
            },
          ]);
          added += 1;
        } else {
          setImageMsg(res.error || `Không tải lên được ảnh “${file.name}”.`);
        }
      } catch {
        setImageMsg(`Không tải lên được ảnh “${file.name}”.`);
      }
    }
    setUploadBusy(false);
    if (added > 0) {
      setImagesCustomized(true);
      setImageMsg(`Đã tải lên và gắn ${added} ảnh từ thiết bị vào bài này.`);
      queryClient.invalidateQueries({ queryKey: ["media"] });
    }
  };
  // Ảnh Drive của sản phẩm đã chọn nhưng CHƯA gắn vào bài (đã bị
  // xóa trước đó) — bấm để thêm lại.
  const availableDriveImages = (selectedProduct?.drive_images ?? []).filter(
    (im) => !images.some((x) => x.id === im.id),
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-label="Soạn bản nháp bài đăng" className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1">
        <h2 className="text-lg font-bold">Soạn bản nháp</h2>
        {successMsg && (
          <div
            className="mt-2 rounded-[var(--radius)] border-2 border-[var(--ok)] bg-[var(--surface)] p-3"
            role="status"
          >
            <p className="text-sm font-semibold text-[var(--ok)]">
              ✓ {successMsg}
            </p>
            <button
              type="button"
              className={`${btnGhost} mt-2`}
              onClick={onGoQueue}
            >
              Xem Hàng đợi duyệt
            </button>
          </div>
        )}
        {queuedMsg && (
          <div
            className="mt-2 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] p-3"
            role="status"
          >
            <p className="text-sm font-semibold">{queuedMsg}</p>
          </div>
        )}
        {composeMsg && (
          <p className="mt-2 text-sm font-medium" role="status">
            {composeMsg}
          </p>
        )}
        <form onSubmit={submitDraft} className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="df-stt">Mã STT</label>
              <input id="df-stt" aria-label="Mã STT" className={inputCls} value={form.stt} onChange={(e) => setForm({ ...form, stt: e.target.value })} placeholder="Như trong Sheet" />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-img-state">Media đi kèm</label>
              <p id="df-img-state" className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-xs leading-5">
                Ảnh:{" "}
                {images.length > 0
                  ? `đang gắn ${images.length} ảnh vào bài${imagesCustomized ? " (bạn đã tự thêm/xóa — tập này được chốt khi xuất gói)" : " (đã lưu từ lần đồng bộ — tập này được chốt khi xuất gói)"}`
                  : selectedProduct
                    ? driveStatusLabel(selectedProduct)
                    : form.image_url
                      ? "chưa gắn ảnh nào — thêm ảnh ở mục Ảnh của bài bên dưới"
                      : "chưa có ảnh"}{" "}
                · Video:{" "}
                {form.video_url ? "đã có video" : "chưa có video"}
                {form.sku ? ` · SKU: ${form.sku}` : ""}
              </p>
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="df-name">Tên sản phẩm *</label>
              <Hint
                label="Chú thích ô Tên sản phẩm"
                text={
                  <>
                    Tên sản phẩm được <strong>giữ nguyên văn</strong> trong
                    bài viết — nhập đúng như tên trong Sheet.
                  </>
                }
              />
            </div>
            <input id="df-name" aria-label="Tên sản phẩm" className={inputCls} value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required placeholder="Nhập tên sản phẩm" />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="df-maker">Hãng xe</label>
              <Hint
                label="Chú thích ô Hãng xe"
                text="Có hãng xe thì bài viết sẽ nhắc hãng (khối thông tin và nội dung) — dùng đúng nguyên văn giá trị này."
              />
            </div>
            <input id="df-maker" aria-label="Hãng xe" className={inputCls} value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })} placeholder="Nhập hãng xe như trong Sheet" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls} htmlFor="df-img">Link ảnh trong Sheet — thư mục Drive</label>
              <input id="df-img" aria-label="Link ảnh trong Sheet" className={inputCls} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" />
              {form.image_url.trim() && (
                <div className="mt-2">
                  <SheetImagePreview url={form.image_url} label={form.product_name || "sản phẩm"} />
                </div>
              )}
              <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <span>
                    Ảnh của bài ({images.length})
                  </span>
                  <Hint
                    label="Chú thích mục Ảnh của bài"
                    align="right"
                    text="Chưa có ảnh nào đang gắn vào bài khi danh sách này trống — chọn sản phẩm có ảnh Drive ở danh sách bên cạnh, thêm lại ảnh Drive, hoặc tải ảnh từ thiết bị lên. Tối đa 25MB mỗi ảnh. Xóa ảnh chỉ bỏ khỏi bài — không xóa file gốc trên Drive."
                  />
                </p>
                {images.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {images.map((im) => (
                      <li key={im.id} className="relative w-20">
                        <div className="h-16 w-20 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
                          <img
                            src={im.jpeg_url}
                            alt={`Ảnh ${im.name}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeImage(im)}
                          aria-label={`Xóa ảnh ${im.name} khỏi bài`}
                          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--danger)] text-sm font-bold leading-none text-white"
                        >
                          ×
                        </button>
                        <p className="mt-0.5 truncate text-[10px] text-[var(--dim)]" title={im.name}>
                          {im.name}
                        </p>
                        <p className="text-[10px] font-medium text-[var(--dim)]">
                          {im.id.startsWith("upload-")
                            ? "Ảnh tải lên từ thiết bị"
                            : im.is_heic
                              ? "Gốc HEIC → đăng bản JPEG"
                              : "Ảnh từ Drive"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {imagesCustomized && (
                  <p className="mt-1 text-xs font-medium text-[var(--ok)]">
                    Bạn đã tự chỉnh tập ảnh — bản nháp và gói đăng sẽ
                    dùng đúng tập này, không quét lại Drive để gắn lại
                    ảnh đã xóa.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className={btnPrimary}>
                    {uploadBusy ? "Đang tải ảnh lên…" : "Thêm ảnh từ thiết bị"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      aria-label="Thêm ảnh từ thiết bị"
                      disabled={uploadBusy}
                      onChange={(e) => {
                        void onUploadFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {availableDriveImages.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold">
                      Thêm ảnh từ thư mục Drive của sản phẩm này (
                      {availableDriveImages.length} ảnh chưa gắn):
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-2">
                      {availableDriveImages.map((im) => (
                        <li key={im.id} className="w-20">
                          <div className="h-16 w-20 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
                            <img
                              src={im.jpeg_url}
                              alt={`Ảnh ${im.name}`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-[var(--dim)]" title={im.name}>
                            {im.name}
                          </p>
                          <button
                            type="button"
                            className="mt-0.5 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold"
                            onClick={() => addDriveImage(im)}
                            aria-label={`Thêm ảnh ${im.name} từ Drive vào bài`}
                          >
                            + Thêm vào bài
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {imageMsg && (
                  <p className="mt-2 text-xs font-medium" role="status">
                    {imageMsg}
                  </p>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelCls} htmlFor="df-vid">Link video</label>
              <input id="df-vid" aria-label="Link video" className={inputCls} value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://… (để trống nếu chưa có)" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="df-scale">Tỉ lệ</label>
              <input id="df-scale" aria-label="Tỉ lệ" className={inputCls} value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-color">Màu</label>
              <input id="df-color" aria-label="Màu" className={inputCls} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Nhập màu xe" />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-price">Giá bán</label>
              <input id="df-price" aria-label="Giá bán" className={inputCls} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Nhập giá bán" />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-stock">Tồn kho (chiếc)</label>
              <input id="df-stock" aria-label="Tồn kho (chiếc)" className={inputCls} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-ship">Vận chuyển</label>
              <input id="df-ship" aria-label="Vận chuyển" className={inputCls} value={form.ship} onChange={(e) => setForm({ ...form, ship: e.target.value })} placeholder="Để trống = mặc định COD" />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="df-selling">Chi tiết tự ghi — tùy chọn ghi đè (để trống AI tự viết)</label>
            <textarea id="df-selling" aria-label="Chi tiết tự ghi, tùy chọn ghi đè, để trống AI tự viết" rows={4} className={inputCls} value={form.selling_point} onChange={(e) => setForm({ ...form, selling_point: e.target.value })} placeholder="Để trống: AI tự viết toàn bộ dòng chi tiết. Chỉ điền khi bạn muốn tự ghi đè." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="df-size">Kích thước — không bắt buộc</label>
              <input id="df-size" aria-label="Kích thước" className={inputCls} value={form.size_cm} onChange={(e) => setForm({ ...form, size_cm: e.target.value })} placeholder="Để trống nếu chưa đo" />
            </div>
          </div>
          <button type="submit" className={btnPrimary}>
            Viết bài &amp; đưa vào hàng đợi soạn bài
          </button>
        </form>
      </section>

      <section aria-label="Chọn sản phẩm để soạn bài" className="min-w-0">
        <h2 className="text-lg font-bold">Chọn từ danh sách sản phẩm</h2>
        <ProductListControls
          searchId="compose-product-search"
          sortId="compose-product-sort"
          searchAriaLabel="Tìm sản phẩm trong danh sách soạn bài"
          sortAriaLabel="Sắp xếp danh sách sản phẩm trong soạn bài"
          search={listSearch}
          onSearchChange={(value) => {
            setListSearch(value);
            setListPage(1);
          }}
          sort={listSort}
          onSortChange={(value) => {
            setListSort(value);
            setListPage(1);
          }}
          total={composeTotal}
          rangeStart={composeRangeStart}
          rangeEnd={composeRangeEnd}
          page={safeListPage}
          totalPages={composeTotalPages}
          needleText={listSearch}
          allTotal={allComposeProducts.length}
        />
        <ul className="mt-3 space-y-3">
          {pagedComposeProducts.map((p: Product) => (
            <ProductListCard
              key={p.id}
              product={p}
              selected={selectedProduct?.id === p.id}
            >
              <div className="mt-3">
                <button className={btnGhost} onClick={() => useProduct(p)}>Đổ vào form soạn bài</button>
                {p.colors.length > 1 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-[var(--dim)]">
                      Đổ vào form theo màu:
                    </span>
                    {p.colors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold"
                        aria-label={`Đổ ${p.name} màu ${c} vào form soạn bài`}
                        onClick={() => useProduct(p, c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </ProductListCard>
          ))}
        </ul>
        {products.data && allComposeProducts.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa có sản phẩm nào.{" "}
            <button className="underline" onClick={onGoProducts}>Sang mục Sản phẩm để đồng bộ từ Google Sheet</button>
          </p>
        )}
        {products.data && allComposeProducts.length > 0 && composeTotal === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Không có sản phẩm nào khớp với “{listSearch.trim()}”.{" "}
            <button
              className="underline"
              onClick={() => {
                setListSearch("");
                setListPage(1);
              }}
            >
              Xóa từ khóa tìm
            </button>
          </p>
        )}
        <ProductListPagination
          navLabel="Phân trang danh sách sản phẩm để soạn bài"
          prevLabel="Trang trước của danh sách soạn bài"
          nextLabel="Trang sau của danh sách soạn bài"
          pageLabel={(n) => `Đi tới trang ${n} của danh sách soạn bài`}
          pageNumbers={composePageNumbers}
          page={safeListPage}
          totalPages={composeTotalPages}
          rangeStart={composeRangeStart}
          rangeEnd={composeRangeEnd}
          total={composeTotal}
          onPage={setListPage}
        />
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- Hàng đợi */

function QueueSection({
  drafts,
  loading,
  onGoGroups,
  onGoMedia,
}: {
  drafts: Draft[];
  loading: boolean;
  onGoGroups: () => void;
  onGoMedia: () => void;
}) {
  const queryClient = useQueryClient();
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => api.listGroups({}) });
  const pagesQ = useQuery({ queryKey: ["pages"], queryFn: () => api.listPages({}) });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api.listAccounts({}) });
  const [feedback, setFeedback] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [editing, setEditing] = useState<Record<number, { caption: string }>>({});
  const [packGroups, setPackGroups] = useState<Record<number, number[]>>({});
  const [packPages, setPackPages] = useState<Record<number, number[]>>({});
  const [packIg, setPackIg] = useState<Record<number, number[]>>({});
  const [pickerOpen, setPickerOpen] = useState<Record<number, boolean>>({});
  const [packOpen, setPackOpen] = useState<Record<number, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const QUEUE_PAGE_SIZE = 5;
  // Hai trang: "Chờ duyệt" và "Đã duyệt". CẢ HAI trang đều có bộ
  // chọn "Chọn đích đăng" ngay trên thẻ bài (người dùng chốt):
  // chọn đích ngay từ lúc chờ duyệt, lựa chọn lưu bền theo từng
  // bài và duyệt bài là XUẤT GÓI ĐĂNG LUÔN trong cùng một thao
  // tác theo đúng bộ đích đã chọn đó (máy chủ sinh gói ngay khi
  // duyệt) — không còn bước xuất gói riêng sau khi duyệt: bài
  // duyệt xong đã có sẵn gói đăng trên thẻ và bấm "Đăng Bài"
  // ngay tại trang "Đã duyệt". Nút duyệt mang tên "Duyệt bài
  // viết". Riêng "Cập nhật gói đăng" ĐƯỢC GIỮ LẠI (người dùng
  // chốt): nội dung gói THAY ĐỔI theo đích đăng đã chọn, nên đổi
  // đích thì gói tự cập nhật theo ở máy chủ, và nút "Cập nhật
  // gói đăng" vẫn nằm trên thẻ ở trang "Đã duyệt" để bấm cập
  // nhật tay theo đúng bộ đích đang chọn khi cần — trang "Đã
  // duyệt" KHÔNG còn nút mang tên "Xuất gói đăng".
  // Trang thứ ba "Lịch sử bài đăng": chỉ gồm các bài ĐÃ ĐĂNG
  // THÀNH CÔNG lên ít nhất một đích (có publish_records ở trạng
  // thái "published"). Bài ở trang này hiện GỌN — một dòng tóm
  // tắt — bấm mở mới hiện chi tiết, và thẻ bài CHỈ còn nút
  // "Xóa": không còn chọn đích đăng, Đăng Bài, Cập nhật gói
  // đăng, viết lại hay sửa nội dung.
  type QueueTab = "draft" | "ready" | "history";
  const [queueTab, setQueueTab] = useState<QueueTab>("draft");
  const [queuePage, setQueuePage] = useState<Record<QueueTab, number>>({
    draft: 1,
    ready: 1,
    history: 1,
  });
  // Tài khoản chính thức (Facebook) chọn ngay trong danh sách đích
  // đăng: đổi lựa chọn ở đây chính là đổi tài khoản "dùng để đăng"
  // ở mục Tài khoản — gói đăng ghi đúng tài khoản đang chọn.
  const setMainAccount = useMutation({
    mutationFn: (args: { id: number; selected: boolean }) => api.setAccountSelected(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["drafts"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };
  const approve = useMutation({
    mutationFn: (id: number) => api.approveDraft({ id }),
    onSuccess: (res, id) => {
      setFeedback((f) => ({ ...f, [id]: { ok: res.ok, text: res.message } }));
      // Duyệt xong là gói đăng đã được xuất luôn và bài đã sang
      // trang "Đã duyệt" — chuyển thẳng sang trang đó để thấy gói
      // đăng và nút "Đăng Bài" ngay, khỏi tìm lại.
      if (res.ok) {
        setQueueTab("ready");
        setQueuePage((s) => ({ ...s, ready: 1 }));
      }
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (args: { id: number; caption: string }) => api.updateDraft(args),
    onSuccess: (res, args) => {
      if (res.ok) {
        setEditing((e) => {
          const next = { ...e };
          delete next[args.id];
          return next;
        });
        setFeedback((f) => ({ ...f, [args.id]: { ok: true, text: "Đã lưu nội dung." } }));
      } else {
        setFeedback((f) => ({ ...f, [args.id]: { ok: false, text: res.error } }));
      }
      refresh();
    },
  });
  // "Cập nhật gói đăng" thủ công: sinh lại text gói theo đúng bộ
  // đích đang chọn trên thẻ. Nút này ĐƯỢC GIỮ LẠI vì nội dung gói
  // thay đổi theo đích đăng — bấm là gói phản ánh đúng bộ đích
  // hiện tại. Ở trang "Đã duyệt" nút LUÔN mang tên "Cập nhật gói
  // đăng", kể cả với bài đã duyệt từ trước chưa có gói.
  const pack = useMutation({
    mutationFn: (args: { id: number; group_ids: number[]; page_ids: number[]; instagram_account_ids: number[] }) => api.buildPack(args),
    onSuccess: (res, args) => {
      setFeedback((f) => ({ ...f, [args.id]: { ok: res.ok, text: res.message } }));
      refresh();
    },
  });
  // Lưu đích đăng đã chọn cho TỪNG bài ngay khi người dùng đổi
  // lựa chọn — mở lại trang vẫn giữ đúng bộ đích cũ, không chọn
  // lại từ mặc định. Bộ chọn đích có ở cả trang "Chờ duyệt" (chỉ
  // lưu đích; gói sinh theo đúng bộ đích này khi duyệt bài) lẫn
  // trang "Đã duyệt" (máy chủ đồng thời TỰ CẬP NHẬT gói đăng
  // theo bộ đích mới — gói thay đổi theo đích đăng, phần cập
  // nhật này được giữ lại theo yêu cầu người dùng, bên cạnh nút
  // "Cập nhật gói đăng" thủ công ở trên).
  const saveTargets = useMutation({
    mutationFn: (args: { id: number; group_ids: number[]; page_ids: number[]; instagram_account_ids: number[] }) => api.saveDraftTargets(args),
    onSuccess: (res, args) => {
      if (!res.ok) {
        setFeedback((f) => ({ ...f, [args.id]: { ok: false, text: res.message } }));
      }
      refresh();
    },
  });
  const [publishConfirm, setPublishConfirm] = useState<Record<number, boolean>>({});
  const publish = useMutation({
    mutationFn: (args: { id: number; group_ids: number[]; page_ids: number[]; instagram_account_ids: number[] }) => api.publishDraft(args),
    onSuccess: (res, args) => {
      setFeedback((f) => ({ ...f, [args.id]: { ok: res.ok, text: res.message } }));
      setPublishConfirm((s) => ({ ...s, [args.id]: false }));
      refresh();
    },
    onError: (err, args) => {
      setFeedback((f) => ({
        ...f,
        [args.id]: {
          ok: false,
          text: `Đăng Bài không chạy được: ${err instanceof Error ? err.message : "lỗi không rõ"} — kiểm tra đích đăng trước khi thử lại để tránh trùng.`,
        },
      }));
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteDraft({ id }),
    onSuccess: refresh,
  });
  // Viết lại cũng đi qua HÀNG ĐỢI SOẠN BÀI toàn cục: bấm nút là bài
  // vào hàng đợi (theo dõi ở vòng tròn tiến trình), không phải chờ
  // ngay tại nút. Kết quả ok=false của action (bài trùng hệt, bản
  // nháp đã duyệt…) được ném thành lỗi để hiện trong danh sách tiến
  // trình kèm nút Thử lại, thay vì báo "xong" giả.
  const composeJobs = useComposeJobs();
  const enqueueRewrite = (d: Draft) => {
    composeJobs.enqueue({
      kind: "rewrite",
      draftId: d.id,
      label: d.product_name,
      run: async () => {
        const res = await api.rewriteDraft({ id: d.id });
        if (!res.ok) throw new Error(res.message);
        return res;
      },
      onDone: (result) => {
        const res = result as { ok: boolean; message: string };
        setFeedback((f) => ({ ...f, [d.id]: { ok: true, text: res.message } }));
        refresh();
      },
      onError: (message) => {
        setFeedback((f) => ({
          ...f,
          [d.id]: { ok: false, text: `Không viết lại được: ${message}` },
        }));
      },
    });
    setFeedback((f) => ({
      ...f,
      [d.id]: {
        ok: true,
        text: "Đã đưa bài vào hàng đợi viết lại — vòng tròn tiến trình trên màn hình cho biết khi nào bài đang chạy/đang chờ.",
      },
    }));
  };

  const copyPack = async (d: Draft) => {
    try {
      await navigator.clipboard.writeText(d.pack_text);
      setCopied(d.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setFeedback((f) => ({ ...f, [d.id]: { ok: false, text: "Không chép tự động được — bôi đen nội dung gói đăng để chép tay." } }));
    }
  };

  // Nhóm đăng được = có ÍT NHẤT MỘT danh tính sẽ đăng đã tham gia
  // nhóm đó; trạng thái của tài khoản chính và từng Page con tách
  // riêng (account_joined / joined_pages) vì hai phía có thể khác
  // trạng thái — nút chọn nhóm ghi rõ đăng được bằng danh tính nào.
  const joinedGroups = (groups.data?.groups ?? []).filter(
    (g) => g.account_joined || g.joined_pages.length > 0,
  );
  const allPages = pagesQ.data?.pages ?? [];
  const igAccounts = (accountsQ.data?.accounts ?? []).filter(
    (a) => a.platform === "Instagram" && a.linked,
  );
  const mainAccounts = (accountsQ.data?.accounts ?? []).filter(
    (a) => a.platform === "Facebook" && a.linked,
  );
  const selectedMainCount = mainAccounts.filter((a) => a.selected).length;


  const renderDraft = (d: Draft) => {
    const fb = feedback[d.id];
    const edit = editing[d.id];
    // Đích đăng của bài: lựa chọn ĐÃ LƯU cho bài này thắng mọi mặc
    // định; chỉ khi bài chưa từng lưu lựa chọn mới suy từ các cờ
    // chọn mặc định (nhóm đích / Page đang chọn / nick IG đang
    // chọn). Lựa chọn vừa đổi trong phiên (state cục bộ) thắng cả
    // bản đã lưu vì nó mới hơn.
    const savedTargets = d.pack_targets;
    const selected =
      packGroups[d.id] ??
      (savedTargets.saved
        ? savedTargets.group_ids
        : joinedGroups.filter((g) => g.is_target).map((g) => g.id));
    const selectedPages =
      packPages[d.id] ??
      (savedTargets.saved
        ? savedTargets.page_ids
        : allPages.filter((p) => p.selected).map((p) => p.id));
    const selectedIg =
      packIg[d.id] ??
      (savedTargets.saved
        ? savedTargets.instagram_account_ids
        : igAccounts.filter((a) => a.selected).map((a) => a.id));
    // Đổi đích đăng ở bất cứ mục nào cũng áp dụng ngay cho cả ba
    // mục VÀ lưu bền theo bài — một bộ chọn đích duy nhất cho cả
    // thẻ bài ở mọi trang (Chờ duyệt lẫn Đã duyệt), dùng cho
    // duyệt bài và "Đăng Bài"; với bài đã duyệt, gói đăng tự cập
    // nhật theo bộ đích này ở máy chủ mỗi lần đổi.
    const applyTargets = (groups: number[], pages: number[], igs: number[]) => {
      setPackGroups((s) => ({ ...s, [d.id]: groups }));
      setPackPages((s) => ({ ...s, [d.id]: pages }));
      setPackIg((s) => ({ ...s, [d.id]: igs }));
      saveTargets.mutate({
        id: d.id,
        group_ids: groups,
        page_ids: pages,
        instagram_account_ids: igs,
      });
    };
    return (
      <li key={d.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{d.product_name}</p>
          <p className="font-mono text-xs text-[var(--dim)]">{d.code} · {fmtDate(d.created_at)}</p>
        </div>
        <p className="mt-0.5 text-xs text-[var(--dim)]">
          {d.sku ? `SKU ${d.sku} · ` : d.stt ? `STT ${d.stt} · ` : ""}
          {d.maker ? `Hãng xe ${d.maker} · ` : ""}
          {d.color || "chưa rõ màu"} · {d.price || "chưa có giá"} · tồn {d.stock}
          {d.selling_point ? ` · Chi tiết tự ghi đè: ${d.selling_point}` : " · Chi tiết: AI tự soạn"}
          {d.size_cm ? ` · Kích thước: ${d.size_cm}` : ""}
        </p>
        <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {d.has_real_image ? (
            <a href={d.image_url} target="_blank" rel="noreferrer" aria-label={`Thư mục Drive của ${d.product_name} — đã gắn ${d.drive_images.length} ảnh vào bài`} className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
              Có {d.drive_images.length} ảnh đã gắn vào bài
            </a>
          ) : (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
              {d.drive_status === "empty"
                ? d.drive_error
                  ? `Chưa có ảnh — ${d.drive_error}`
                  : "Chưa có ảnh — thư mục Drive đang rỗng"
                : d.drive_status === "error"
                  ? `Chưa có ảnh — ${d.drive_error || "không đọc được thư mục Drive"}`
                  : d.drive_status === "no_link"
                    ? `Chưa có ảnh — ${d.drive_error || "chưa có link thư mục Drive"}`
                    : "Chưa có ảnh thật từ Drive"}
            </span>
          )}
          {d.video_url ? (
            <a href={d.video_url} target="_blank" rel="noreferrer" aria-label={`Video của ${d.product_name}`} className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
              Có video đã gắn vào bài
            </a>
          ) : (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
              Chưa có video
            </span>
          )}
          {d.caption_source === "ai" && (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
              Bài do AI viết
            </span>
          )}
          {d.caption_source === "template" && (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--danger)]">
              Bài theo mẫu dự phòng — AI chưa viết được
            </span>
          )}
          {d.caption_source === "manual" && (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
              Nội dung bạn đã sửa tay
            </span>
          )}
        </p>

        <DriveImageStrip images={d.drive_images} label={d.product_name} />

        {d.placeholders.length > 0 && (
          <p className="mt-2 text-xs font-medium text-[var(--danger)]">
            Chưa điền: {d.placeholders.join("  ")}
          </p>
        )}

        {edit ? (
          <div className="mt-3 space-y-3">
            <div>
              <label className={labelCls} htmlFor={`cap-${d.id}`}>Bài đăng (nhóm + fanpage + Instagram)</label>
              <textarea id={`cap-${d.id}`} rows={12} className={`${inputCls} font-mono text-xs leading-5`} value={edit.caption} onChange={(e) => setEditing((s) => ({ ...s, [d.id]: { ...edit, caption: e.target.value }}))} />
            </div>
            <div className="flex gap-2">
              <button className={btnPrimary} disabled={update.isPending} onClick={() => update.mutate({ id: d.id, caption: edit.caption })}>
                Lưu nội dung
              </button>
              <button className={btnGhost} onClick={() => setEditing((s) => { const n = { ...s }; delete n[d.id]; return n; })}>
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 font-mono text-xs leading-5">{d.caption}</pre>
        )}

        {d.pack_text && (() => {
          const packShown = !!packOpen[d.id];
          return (
            <div className="mt-3">
              <button
                type="button"
                className={`${btnGhost} flex w-full items-center justify-between gap-2 text-left`}
                aria-expanded={packShown}
                aria-label={`Gói đăng ${d.code}`}
                onClick={() => setPackOpen((s) => ({ ...s, [d.id]: !packShown }))}
              >
                <span className="text-xs font-semibold text-[var(--ok)]">
                  Gói đăng{d.packed_at ? ` · ${fmtDate(d.packed_at)}` : ""}
                </span>
                <span className="text-xs font-medium text-[var(--dim)]">{packShown ? "Ẩn ▲" : "Xem ▼"}</span>
              </button>
              {packShown && (
                <div className="mt-2">
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--ok)] p-3 font-mono text-xs leading-5">{d.pack_text}</pre>
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    <button className={btnGhost} onClick={() => copyPack(d)} aria-label={`Chép gói đăng ${d.code}`}>
                      {copied === d.id ? "Đã chép ✓" : "Chép gói đăng"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {d.publish_records.length > 0 &&
          (() => {
            // Lịch sử đăng Bài chỉ hiện thông tin MỚI NHẤT theo
            // từng đích (người dùng chốt): mỗi đích chỉ hiện một
            // bản ghi — bản ghi đã đăng thành công nếu có, không
            // thì bản ghi mới nhất của đích đó. Bản ghi cũ bị
            // thay thế được máy chủ tự xóa khi có bản ghi mới;
            // bộ lọc này bảo đảm giao diện không bao giờ chồng
            // thông tin cũ lên thông tin mới.
            const statusRank = (s: string) =>
              s === "published"
                ? 0
                : s === "queued"
                  ? 1
                  : s === "uncertain"
                    ? 2
                    : 3;
            const latestByTarget = new Map<
              string,
              Draft["publish_records"][number]
            >();
            for (const r of d.publish_records) {
              const key = `${r.target_kind}:${r.target_name}`;
              const cur = latestByTarget.get(key);
              if (
                !cur ||
                statusRank(r.status) < statusRank(cur.status)
              )
                latestByTarget.set(key, r);
            }
            const latestRecords = [...latestByTarget.values()].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            );
            return (
          <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <p className="text-xs font-bold">Lịch sử đăng Bài</p>
            <ul className="mt-1.5 space-y-1.5">
              {latestRecords.map((r) => (
                <li key={r.id} className="text-xs leading-5">
                  <span
                    className={`mr-1.5 rounded-full px-2 py-0.5 font-semibold ${
                      r.status === "published"
                        ? "bg-[var(--surface-alt)] text-[var(--ok)]"
                        : r.status === "failed"
                          ? "bg-[var(--surface-alt)] text-[var(--danger)]"
                          : r.status === "uncertain" || r.status === "needs_login"
                            ? "bg-[var(--surface-alt)] text-[var(--warn)]"
                            : "bg-[var(--surface-alt)] text-[var(--dim)]"
                    }`}
                  >
                    {r.status === "published"
                      ? "✓ Đã đăng"
                      : r.status === "failed"
                        ? "✗ Đăng lỗi"
                        : r.status === "uncertain"
                          ? "⚠ Chưa xác định — kiểm tra Instagram"
                          : r.status === "needs_login"
                            ? "🔑 Chờ bạn đăng nhập Facebook"
                            : r.status === "queued"
                              ? "⏳ Đang xử lý đăng"
                              : r.status === "skipped"
                                ? "↷ Bỏ qua — đã đăng"
                                : "— Chưa đăng trực tiếp được"}
                  </span>
                  <span className="font-semibold">
                    {r.target_kind === "page"
                      ? "Fanpage"
                      : r.target_kind === "instagram"
                        ? "Instagram"
                        : r.target_kind === "group"
                          ? "Nhóm"
                          : "Tài khoản"}{" "}
                    {r.target_name}
                  </span>{" "}
                  <span className="text-[var(--dim)]">· {fmtDate(r.created_at)}</span>
                  <span className="block text-[var(--dim)]">{r.message}</span>
                  {r.post_url && (
                    <a
                      href={r.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline"
                      aria-label={`Xem bài đã đăng của ${d.product_name} trên ${r.target_name}`}
                    >
                      Xem bài đã đăng
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
            );
          })()}

        {d.status !== "draft" &&
          (() => {
            // Đích mà lượt đăng GẦN NHẤT đang ở trạng thái "Chờ
            // đăng nhập": trình duyệt Muse đã mở ở trang đăng
            // nhập Facebook và đang chờ người dùng vào đăng nhập
            // 1 lần — đây không phải đăng lỗi, nên hiện banner
            // hướng dẫn + nút đăng lại ngay trên thẻ bài.
            const latestByTarget = new Map<string, Draft["publish_records"][number]>();
            for (const r of d.publish_records) {
              const key = `${r.target_kind}:${r.target_name}`;
              if (!latestByTarget.has(key)) latestByTarget.set(key, r);
            }
            const waitingLogin = [...latestByTarget.values()].filter(
              (r) => r.status === "needs_login",
            );
            if (waitingLogin.length === 0) return null;
            return (
              <div
                className="mt-3 rounded-[var(--radius)] border border-[var(--warn)] p-3"
                role="group"
                aria-label={`Chờ đăng nhập Facebook để đăng tiếp ${d.product_name}`}
              >
                <p className="text-sm font-bold text-[var(--warn)]">
                  🔑 Chờ bạn đăng nhập Facebook — chưa phải đăng lỗi
                </p>
                <p className="mt-1 text-xs leading-5">
                  Các đích này đăng bằng trình duyệt nên cần phiên Facebook trong{" "}
                  <strong>chính cửa sổ trình duyệt Muse</strong> — cửa sổ mà tác vụ đăng
                  vừa mở ra (không phải tab Facebook trong Chrome của bạn, và “Đã liên
                  kết” ở mục Tài khoản là kênh API, không thay được phiên trình duyệt).
                  Đang chờ:{" "}
                  {waitingLogin
                    .map(
                      (r) =>
                        `${r.target_kind === "group" ? "Nhóm" : "Fanpage"} ${r.target_name}`,
                    )
                    .join(" · ")}
                  .
                </p>
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs leading-5">
                  <li>
                    Sang cửa sổ trình duyệt Muse đang dừng ở trang đăng nhập Facebook.
                  </li>
                  <li>
                    Đăng nhập bằng tài khoản quản trị Page — chỉ 1 lần, phiên được lưu
                    trong trình duyệt đó cho mọi lần đăng sau.
                  </li>
                  <li>Quay lại đây bấm nút dưới đây — bài đăng tiếp bằng phiên đã lưu.</li>
                </ol>
                <div className="mt-2.5">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={publish.isPending}
                    aria-label={`Đã đăng nhập xong, đăng Bài lại ${d.product_name}`}
                    onClick={() =>
                      publish.mutate({
                        id: d.id,
                        group_ids: selected,
                        page_ids: selectedPages,
                        instagram_account_ids: selectedIg,
                      })
                    }
                  >
                    {publish.isPending
                      ? "Đang đăng…"
                      : "Đã đăng nhập xong — Đăng Bài lại"}
                  </button>
                </div>
              </div>
            );
          })()}

        {fb && (
          <p className={`mt-3 text-sm font-medium ${fb.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`} role="status">
            {fb.text}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {d.status === "draft" && (
            <>
              {!edit && (
                <>
                  {(() => {
                    const rwJob = composeJobs.jobs.find(
                      (j) =>
                        j.kind === "rewrite" &&
                        j.draftId === d.id &&
                        (j.status === "waiting" || j.status === "running"),
                    );
                    return (
                      <button
                        className={btnGhost}
                        disabled={!!rwJob}
                        onClick={() => enqueueRewrite(d)}
                      >
                        {rwJob
                          ? rwJob.status === "running"
                            ? "Đang viết lại…"
                            : "Đang chờ viết lại…"
                          : "Viết lại chuyên nghiệp"}
                      </button>
                    );
                  })()}
                  <button className={btnGhost} onClick={() => setEditing((s) => ({ ...s, [d.id]: { caption: d.caption } }))}>
                    Sửa nội dung
                  </button>
                </>
              )}
            </>
          )}
          {/* Bộ chọn "Chọn đích đăng" có ở MỌI trang của Hàng đợi
              — cả "Chờ duyệt" (chọn đích trước, duyệt bài xuất gói
              theo đúng bộ đích đã chọn) lẫn "Đã duyệt". Khối này
              render cho mọi trạng thái; hàng nút dưới bộ chọn đổi
              theo trạng thái của bài. */}
          {(() => {
            const open = !!pickerOpen[d.id];
            const totalPicked =
              selected.length + selectedPages.length + selectedIg.length + selectedMainCount;
            const allGroupsPicked =
              joinedGroups.length > 0 && selected.length === joinedGroups.length;
            return (
            <div className="w-full space-y-2">
              <div className="relative">
                <button
                  type="button"
                  className={`${btnGhost} flex w-full flex-wrap items-center justify-between gap-2 text-left`}
                  aria-expanded={open}
                  aria-label={`Chọn đích đăng cho ${d.product_name} — đã chọn ${selected.length} nhóm đích, ${selectedPages.length} fanpage, ${selectedIg.length} tài khoản Instagram, ${selectedMainCount} tài khoản chính thức`}
                  onClick={() => setPickerOpen((s) => ({ ...s, [d.id]: !open }))}
                >
                  <span className="font-semibold">Chọn đích đăng</span>
                  <span className="text-xs font-medium text-[var(--dim)]">
                    Đã chọn: {selected.length} nhóm đích · {selectedPages.length} fanpage · {selectedIg.length} tài khoản Instagram · {selectedMainCount} tài khoản chính thức (tổng {totalPicked} đích) {open ? "▲" : "▼"}
                  </span>
                </button>
                {open && (
                  <div
                    role="group"
                    aria-label={`Danh sách đích đăng cho ${d.product_name}`}
                    className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] space-y-4 overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold">Danh sách đích đăng</p>
                      <button
                        type="button"
                        className={btnGhost}
                        aria-label={`Đóng danh sách đích đăng của ${d.product_name}`}
                        onClick={() => setPickerOpen((s) => ({ ...s, [d.id]: false }))}
                      >
                        Đóng
                      </button>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          Nhóm đích — đã chọn {selected.length}/{joinedGroups.length} nhóm
                        </p>
                        {joinedGroups.length > 0 && (
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={allGroupsPicked}
                            aria-label={`Chọn tất cả nhóm đích cho ${d.product_name}`}
                            onClick={() =>
                              applyTargets(
                                joinedGroups.map((g) => g.id),
                                selectedPages,
                                selectedIg,
                              )
                            }
                          >
                            Chọn tất cả nhóm đích
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--dim)]">
                        Chỉ đăng bằng danh tính đã tham gia nhóm đó — trạng thái của tài khoản chính và từng Page tính riêng.
                      </p>
                      {joinedGroups.length === 0 ? (
                        <p className="mt-1 text-sm text-[var(--danger)]">
                          Chưa có nhóm nào có tài khoản chính hoặc Page đang chọn đăng được đánh dấu “Đã tham gia”.{" "}
                          <button className="underline" onClick={onGoGroups}>Sang mục Hội nhóm để đánh dấu</button>{" "}
                          — hoặc cứ để trống nhóm rồi bổ sung sau, gói đăng tự cập nhật theo.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {joinedGroups.map((g) => {
                            const on = selected.includes(g.id);
                            const via = [
                              ...(g.account_joined ? ["tài khoản chính"] : []),
                              ...g.joined_pages.map((p) => `Page ${p.name}`),
                            ].join(" · ");
                            return (
                              <button
                                key={g.id}
                                aria-pressed={on}
                                onClick={() =>
                                  applyTargets(
                                    on
                                      ? selected.filter((x) => x !== g.id)
                                      : [...selected, g.id],
                                    selectedPages,
                                    selectedIg,
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-[var(--text)] text-[var(--bg)]" : "border border-[var(--border)] text-[var(--dim)]"}`}
                              >
                                {g.name} — đăng bằng: {via}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium">
                        Fanpage đích — đã chọn {selectedPages.length}/{allPages.length} fanpage
                      </p>
                      {allPages.length === 0 ? (
                        <p className="mt-1 text-sm text-[var(--dim)]">
                          Chưa có Page nào — thêm Page ở mục Tài khoản nếu muốn đăng
                          lên fanpage. Bài vẫn đăng được cho các đích khác.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {allPages.map((p) => {
                            const on = selectedPages.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                aria-pressed={on}
                                onClick={() =>
                                  applyTargets(
                                    selected,
                                    on
                                      ? selectedPages.filter((x) => x !== p.id)
                                      : [...selectedPages, p.id],
                                    selectedIg,
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--dim)]"}`}
                              >
                                Page: {p.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium">
                        Tài khoản Instagram đích — đã chọn {selectedIg.length}/{igAccounts.length} tài khoản
                      </p>
                      {igAccounts.length === 0 ? (
                        <p className="mt-1 text-sm text-[var(--dim)]">
                          Chưa có tài khoản Instagram nào đã liên kết — liên kết ở
                          mục Tài khoản nếu muốn đăng lên Instagram. Bài vẫn
                          đăng được cho các đích khác.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {igAccounts.map((a) => {
                            const on = selectedIg.includes(a.id);
                            return (
                              <button
                                key={a.id}
                                aria-pressed={on}
                                onClick={() =>
                                  applyTargets(
                                    selected,
                                    selectedPages,
                                    on
                                      ? selectedIg.filter((x) => x !== a.id)
                                      : [...selectedIg, a.id],
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--dim)]"}`}
                              >
                                Instagram: {a.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium">
                        Tài khoản chính thức — đã chọn {selectedMainCount}/{mainAccounts.length} tài khoản
                      </p>
                      {mainAccounts.length === 0 ? (
                        <p className="mt-1 text-sm text-[var(--dim)]">
                          Chưa có tài khoản Facebook nào đã liên kết — liên kết ở mục Tài khoản.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {mainAccounts.map((a) => {
                            const on = !!a.selected;
                            return (
                              <button
                                key={a.id}
                                aria-pressed={on}
                                disabled={setMainAccount.isPending}
                                onClick={() => setMainAccount.mutate({ id: a.id, selected: !on })}
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--dim)]"}`}
                              >
                                Tài khoản: {a.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {d.status === "draft" ? (
                  <button
                    className={`${btnPrimary} whitespace-nowrap`}
                    disabled={approve.isPending}
                    onClick={() => approve.mutate(d.id)}
                    aria-label={`Duyệt bài viết ${d.product_name}`}
                  >
                    {approve.isPending ? "Đang duyệt…" : "Duyệt bài viết"}
                  </button>
                ) : (
                  <>
                    <button
                      className={`${btnPrimary} whitespace-nowrap`}
                      disabled={publish.isPending}
                      aria-expanded={!!publishConfirm[d.id]}
                      aria-label={`Đăng Bài ${d.product_name} lên các đích đã chọn`}
                      onClick={() => setPublishConfirm((s) => ({ ...s, [d.id]: !s[d.id] }))}
                    >
                      Đăng Bài
                    </button>
                    <button
                      className={`${btnGhost} whitespace-nowrap`}
                      disabled={pack.isPending}
                      aria-label={`Cập nhật gói đăng cho ${d.product_name} theo các đích đã chọn`}
                      onClick={() => pack.mutate({ id: d.id, group_ids: selected, page_ids: selectedPages, instagram_account_ids: selectedIg })}
                    >
                      Cập nhật gói đăng
                    </button>
                    <button className={`${btnGhost} whitespace-nowrap`} onClick={onGoMedia}>Kiểm tra ảnh/video</button>
                    <button className={`${btnDanger} whitespace-nowrap`} onClick={() => del.mutate(d.id)} aria-label={`Xóa bản nháp ${d.code}`}>
                      Xóa
                    </button>
                  </>
                )}
              </div>
            </div>
            );
          })()}
                  {!!publishConfirm[d.id] && (() => {
                    const pickedPages = allPages.filter((p) => selectedPages.includes(p.id));
                    const pickedIg = igAccounts.filter((a) => selectedIg.includes(a.id));
                    const pickedGroups = joinedGroups.filter((g) => selected.includes(g.id));
                    const nothingPicked =
                      pickedPages.length === 0 && pickedIg.length === 0 && pickedGroups.length === 0;
                    const alreadyOn = (kind: "page" | "instagram" | "group", name: string) =>
                      d.publish_records.some(
                        (r) => r.target_kind === kind && r.target_name === name && r.status === "published",
                      );
                    return (
                      <div
                        className="mt-3 rounded-[var(--radius)] border border-[var(--accent)] p-3"
                        role="group"
                        aria-label={`Xác nhận đăng bài ${d.product_name}`}
                      >
                        <p className="text-sm font-bold">Đăng Bài ngay — bài sẽ lên công khai các đích này:</p>
                        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                          {pickedPages.map((p) => (
                            <li key={`pg-${p.id}`}>
                              Fanpage “{p.name}” — đăng kèm {d.drive_images.length} ảnh đã chốt
                              {d.caption.length > 1024 && (
                                <span className="text-[var(--dim)]"> (caption dài hơn giới hạn API — xử lý đăng bằng trình duyệt như khi bạn nhắn trực tiếp)</span>
                              )}
                              {alreadyOn("page", p.name) && (
                                <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
                              )}
                              {!alreadyOn("page", p.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "page" && r.target_name === p.name && r.status === "queued",
                                ) && (
                                  <span className="font-semibold text-[var(--ok)]"> (đang xử lý đăng — sẽ tự bỏ qua)</span>
                                )}
                              {!alreadyOn("page", p.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "page" && r.target_name === p.name && r.status === "needs_login",
                                ) && (
                                  <span className="font-semibold text-[var(--warn)]"> (lượt trước đang chờ bạn đăng nhập trong cửa sổ trình duyệt Muse — nếu đã đăng nhập ở cửa sổ đó rồi, lượt này đăng tiếp bằng phiên đã lưu)</span>
                                )}
                            </li>
                          ))}
                          {pickedIg.map((a) => (
                            <li key={`ig-${a.id}`}>
                              Instagram {a.name} — đăng {d.drive_images.length} ảnh đã chốt (xử lý đăng ở chế độ nền, kết quả hiện ở Lịch sử đăng Bài)
                              {alreadyOn("instagram", a.name) && (
                                <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
                              )}
                              {!alreadyOn("instagram", a.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "instagram" && r.target_name === a.name && r.status === "queued",
                                ) && (
                                  <span className="font-semibold text-[var(--ok)]"> (đang xử lý đăng — sẽ tự bỏ qua)</span>
                                )}
                              {!alreadyOn("instagram", a.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "instagram" && r.target_name === a.name && r.status === "uncertain",
                                ) && (
                                  <span className="font-semibold text-[var(--warn)]"> (lượt trước chưa xác định được kết quả — sẽ kiểm tra bài trùng trên Instagram trước khi đăng)</span>
                                )}
                            </li>
                          ))}
                          {pickedGroups.map((g) => (
                            <li key={`gr-${g.id}`}>
                              Nhóm {g.name} — khi bấm đăng, hệ thống xử lý đăng vào nhóm như khi bạn nhắn
                              trực tiếp trong chat (Muse mở cửa sổ trình duyệt của nó và đăng bằng
                              phiên Facebook đã lưu trong đó), kết quả hiện ở Lịch sử đăng Bài
                              {alreadyOn("group", g.name) && (
                                <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
                              )}
                              {!alreadyOn("group", g.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "group" && r.target_name === g.name && r.status === "queued",
                                ) && (
                                  <span className="font-semibold text-[var(--ok)]"> (đang xử lý đăng — sẽ tự bỏ qua)</span>
                                )}
                              {!alreadyOn("group", g.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "group" && r.target_name === g.name && r.status === "needs_login",
                                ) && (
                                  <span className="font-semibold text-[var(--warn)]"> (lượt trước đang chờ bạn đăng nhập trong cửa sổ trình duyệt Muse — nếu đã đăng nhập ở cửa sổ đó rồi, lượt này đăng tiếp bằng phiên đã lưu)</span>
                                )}
                            </li>
                          ))}
                          {nothingPicked && (
                            <li className="text-[var(--danger)]">
                              Chưa chọn đích nào — chọn ở “Chọn đích đăng” phía trên trước.
                            </li>
                          )}
                        </ul>
                        {pickedPages.length > 0 && d.caption.length > 1024 && (
                          <p className="mt-2 text-xs font-medium text-[var(--dim)]">
                            Lưu ý: caption dài {d.caption.length} ký tự — vượt giới hạn 1.024 ký tự của API
                            đăng Fanpage, nên Fanpage sẽ được xử lý đăng bằng trình duyệt như khi bạn nhắn
                            trực tiếp (app không tự cắt nội dung đã duyệt), kết quả hiện ở Lịch sử đăng Bài.
                            Instagram (giới hạn 2.200 ký tự) được xử lý đăng ở chế độ nền qua API, kết quả hiện ở Lịch sử đăng Bài.
                          </p>
                        )}
                        {pickedIg.length > 0 && d.drive_images.length === 0 && (
                          <p className="mt-2 text-xs font-medium text-[var(--danger)]">
                            Lưu ý: bài chưa có ảnh nào đã chốt — Instagram chỉ đăng được bài có ảnh, đích
                            Instagram sẽ báo lỗi.
                          </p>
                        )}
                        {(pickedGroups.length > 0 ||
                          (pickedPages.length > 0 && d.caption.length > 1024)) && (
                          <p className="mt-2 text-xs font-medium leading-5 text-[var(--dim)]">
                            Đích đăng bằng trình duyệt (nhóm, và fanpage khi caption dài): bấm
                            “Xác nhận đăng Bài” là app xử lý <strong>như khi bạn nhắn trực tiếp
                            trong chat</strong> — Muse mở cửa sổ trình duyệt của nó và đăng bằng
                            phiên Facebook đã lưu trong cửa sổ đó. Nếu cửa sổ đó chưa đăng nhập
                            Facebook, nó sẽ dừng ở trang đăng nhập và bài chuyển sang trạng thái
                            “🔑 Chờ bạn đăng nhập Facebook” (không tính là đăng lỗi): bạn đăng
                            nhập 1 lần ngay trong cửa sổ trình duyệt Muse đó bằng tài khoản
                            quản trị Page — phiên được lưu cho mọi lần sau — rồi bấm “Đăng Bài”
                            lại là đăng tiếp, không cần nhắn lại trong chat. Lưu ý: đăng nhập ở
                            tab Facebook trong Chrome của bạn hoặc trạng thái “Đã liên kết”
                            trong app không thay được phiên của cửa sổ này.
                          </p>
                        )}
                        <p className="mt-2 text-xs text-[var(--dim)]">
                          Nội dung đăng là caption nguyên văn đã duyệt, kèm đúng ảnh đã chốt trong bài.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className={btnPrimary}
                            disabled={nothingPicked || publish.isPending}
                            onClick={() =>
                              publish.mutate({
                                id: d.id,
                                group_ids: selected,
                                page_ids: selectedPages,
                                instagram_account_ids: selectedIg,
                              })
                            }
                          >
                            {publish.isPending ? "Đang đăng…" : "Xác nhận đăng Bài"}
                          </button>
                          <button
                            className={btnGhost}
                            disabled={publish.isPending}
                            onClick={() => setPublishConfirm((s) => ({ ...s, [d.id]: false }))}
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    );
                  })()}
          {d.status === "draft" && (
            <button className={btnDanger} onClick={() => del.mutate(d.id)} aria-label={`Xóa bản nháp ${d.code}`}>
              Xóa
            </button>
          )}
        </div>
      </li>
    );
  };

  // Thẻ bài ở trang "Lịch sử bài đăng": GỌN theo mặc định — chỉ
  // tên bài, các đích đã đăng thành công và lần đăng gần nhất.
  // Bấm "Xem chi tiết" mới mở toàn bộ nội dung (ảnh đã chốt,
  // caption, các đích ĐÃ ĐĂNG kèm link bài thật). Trang này
  // KHÔNG hiện gói đăng, và CHỈ hiện đích đã đăng thành công —
  // đích không chọn / chưa đăng / đăng lỗi không hiện ở đây.
  // Hành động duy nhất trên thẻ là nút "Xóa" (xóa hẳn bản nháp
  // đó, như nút Xóa ở các trang còn lại).
  const renderHistoryDraft = (d: Draft) => {
    // Mỗi đích chỉ hiện bản ghi ĐÃ ĐĂNG mới nhất của đích đó —
    // không chồng nhiều lượt của cùng một đích lên nhau.
    const publishedByTarget = new Map<
      string,
      Draft["publish_records"][number]
    >();
    for (const r of d.publish_records) {
      if (r.status !== "published") continue;
      const key = `${r.target_kind}:${r.target_name}`;
      if (!publishedByTarget.has(key)) publishedByTarget.set(key, r);
    }
    const publishedRecords = [...publishedByTarget.values()].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const latestPublished = publishedRecords[0];
    const open = !!historyOpen[d.id];
    const kindLabel = (kind: string) =>
      kind === "page"
        ? "Fanpage"
        : kind === "instagram"
          ? "Instagram"
          : kind === "group"
            ? "Nhóm"
            : "Tài khoản";
    const targetSummary = publishedRecords
      .map((r) => `${kindLabel(r.target_kind)} ${r.target_name}`)
      .join(" · ");
    return (
      <li
        key={d.id}
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{d.product_name}</p>
          <p className="font-mono text-xs text-[var(--dim)]">
            {d.code}
            {latestPublished
              ? ` · Đăng gần nhất ${fmtDate(latestPublished.created_at)}`
              : ""}
          </p>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
            ✓ Đã đăng
          </span>
          {targetSummary && (
            <span className="font-medium text-[var(--dim)]">{targetSummary}</span>
          )}
        </p>

        {open && (
          <div className="mt-3">
            <p className="text-xs text-[var(--dim)]">
              {d.sku ? `SKU ${d.sku} · ` : d.stt ? `STT ${d.stt} · ` : ""}
              {d.maker ? `Hãng xe ${d.maker} · ` : ""}
              {d.color || "chưa rõ màu"} · {d.price || "chưa có giá"} · tồn{" "}
              {d.stock}
              {d.size_cm ? ` · Kích thước: ${d.size_cm}` : ""}
              {` · Soạn ${fmtDate(d.created_at)}`}
            </p>

            <DriveImageStrip images={d.drive_images} label={d.product_name} />

            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 font-mono text-xs leading-5">
              {d.caption}
            </pre>

            <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
              <p className="text-xs font-bold">Đích đã đăng</p>
              <ul className="mt-1.5 space-y-1.5">
                {publishedRecords.map((r) => (
                  <li key={r.id} className="text-xs leading-5">
                    <span className="mr-1.5 rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
                      ✓ Đã đăng
                    </span>
                    <span className="font-semibold">
                      {kindLabel(r.target_kind)} {r.target_name}
                    </span>{" "}
                    <span className="text-[var(--dim)]">
                      · {fmtDate(r.created_at)}
                    </span>
                    {r.message && (
                      <span className="block text-[var(--dim)]">{r.message}</span>
                    )}
                    {r.post_url && (
                      <a
                        href={r.post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold underline"
                        aria-label={`Xem bài đã đăng của ${d.product_name} trên ${r.target_name}`}
                      >
                        Xem bài đã đăng
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnGhost}
            aria-expanded={open}
            aria-label={`${open ? "Thu gọn" : "Xem chi tiết"} bài đã đăng ${d.product_name}`}
            onClick={() =>
              setHistoryOpen((s) => ({ ...s, [d.id]: !open }))
            }
          >
            {open ? "Thu gọn ▲" : "Xem chi tiết ▼"}
          </button>
          <button
            type="button"
            className={btnDanger}
            disabled={del.isPending}
            onClick={() => del.mutate(d.id)}
            aria-label={`Xóa bài đã đăng ${d.product_name}`}
          >
            Xóa
          </button>
        </div>
      </li>
    );
  };

  const queueTabs: { id: QueueTab; label: string; emptyText: string; ariaLabel: string; matches: (d: Draft) => boolean }[] = [
    { id: "draft", label: "Chờ duyệt", emptyText: "Không có bản nháp nào đang chờ duyệt.", ariaLabel: "Chờ duyệt", matches: (d) => d.status === "draft" },
    { id: "ready", label: "Đã duyệt", emptyText: "Chưa có bài nào đã duyệt.", ariaLabel: "Đã duyệt", matches: (d) => d.status === "approved" || d.status === "packed" },
    { id: "history", label: "Lịch sử bài đăng", emptyText: "Chưa có bài nào đã đăng. Bài sẽ hiện ở đây sau khi đăng thành công lên ít nhất một đích ở trang “Đã duyệt”.", ariaLabel: "Lịch sử bài đăng", matches: (d) => d.publish_records.some((r) => r.status === "published") },
  ];
  const activeTabDef = queueTabs.find((t) => t.id === queueTab) ?? queueTabs[0]!;
  const listForTab = (t: (typeof queueTabs)[number]) => {
    const filtered = drafts.filter((d) => t.matches(d));
    if (t.id !== "history") return filtered;
    // Lịch sử xếp theo lần đăng thành công GẦN NHẤT lên đầu.
    const latestAt = (d: Draft) =>
      Math.max(
        0,
        ...d.publish_records
          .filter((r) => r.status === "published")
          .map((r) => new Date(r.created_at).getTime()),
      );
    return [...filtered].sort((a, b) => latestAt(b) - latestAt(a));
  };
  const activeList = listForTab(activeTabDef);
  const totalPages = Math.max(1, Math.ceil(activeList.length / QUEUE_PAGE_SIZE));
  const currentPage = Math.min(queuePage[queueTab], totalPages);
  const pageStart = (currentPage - 1) * QUEUE_PAGE_SIZE;
  const pagedList = activeList.slice(pageStart, pageStart + QUEUE_PAGE_SIZE);
  const setPageForTab = (tab: QueueTab, page: number) =>
    setQueuePage((s) => ({ ...s, [tab]: page }));

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Các trang Hàng đợi" className="flex flex-wrap gap-2">
        {queueTabs.map((t) => {
          const count = listForTab(t).length;
          const active = queueTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              aria-label={`${t.label} (${count} bài)`}
              onClick={() => setQueueTab(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap ${active ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"}`}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      <section aria-label={activeTabDef.ariaLabel}>
        <h2 className="text-lg font-bold">
          {`${activeTabDef.label} (${activeList.length})`}
        </h2>
        {loading && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>}
        <ul className="mt-3 space-y-3">
          {queueTab === "history"
            ? pagedList.map(renderHistoryDraft)
            : pagedList.map(renderDraft)}
        </ul>
        {!loading && activeList.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">{activeTabDef.emptyText}</p>
        )}
        {activeList.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label={`Phân trang ${activeTabDef.label}`}>
            <p className="text-xs text-[var(--dim)]">
              Trang {currentPage}/{totalPages} — hiển thị {pagedList.length} / {activeList.length} bài (tối đa {QUEUE_PAGE_SIZE} bài/trang)
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={btnGhost}
                disabled={currentPage <= 1}
                aria-label={`Trang trước — ${activeTabDef.label}`}
                onClick={() => setPageForTab(queueTab, currentPage - 1)}
              >
                ‹ Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  aria-label={`Trang ${p} — ${activeTabDef.label}`}
                  aria-current={p === currentPage ? "page" : undefined}
                  onClick={() => setPageForTab(queueTab, p)}
                  className={`min-w-9 rounded-[var(--radius)] px-2 py-2 text-sm font-semibold ${p === currentPage ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] bg-[var(--surface)]"}`}
                >
                  {p}
                </button>
              ))}
              <button
                className={btnGhost}
                disabled={currentPage >= totalPages}
                aria-label={`Trang sau — ${activeTabDef.label}`}
                onClick={() => setPageForTab(queueTab, currentPage + 1)}
              >
                Sau ›
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ Phân tích */

const SLOT_LABELS = [
  "06:00–09:00",
  "09:00–12:00",
  "12:00–13:00",
  "13:00–17:00",
  "17:00–19:00",
  "19:00–21:00",
  "21:00–23:00",
];

function AnalyticsSection({ onGoQueue }: { onGoQueue: () => void }) {
  const queryClient = useQueryClient();
  const metrics = useQuery({
    queryKey: ["metrics"],
    queryFn: () => api.listPostMetrics({}),
  });
  const analytics = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api.getAnalytics({}),
  });
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.listGroups({}),
  });
  const pagesQ = useQuery({
    queryKey: ["pages"],
    queryFn: () => api.listPages({}),
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts({}),
  });
  const draftsQ = useQuery({
    queryKey: ["drafts"],
    queryFn: () => api.listDrafts({}),
  });

  const [form, setForm] = useState({
    channel_type: "group" as "group" | "page" | "instagram",
    channel_key: "",
    media_kind: "video" as "image" | "video",
    draft_key: "",
    posted_at: "",
    reach: "",
    likes: "",
    comments: "",
    shares: "",
    clicks: "",
    inquiries: "",
    orders: "",
    notes: "",
  });
  const [msg, setMsg] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["metrics"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };
  const add = useMutation({
    mutationFn: () => {
      const [cidRaw, ...nameParts] = form.channel_key.split("|");
      const channel_id = Number(cidRaw || 0);
      const channel_name = nameParts.join("|");
      const draft = (draftsQ.data?.drafts ?? []).find(
        (d) => String(d.id) === form.draft_key,
      );
      return api.addPostMetric({
        draft_id: draft?.id,
        product_name: draft?.product_name ?? "",
        stt: draft?.stt ?? "",
        channel_type: form.channel_type,
        channel_id,
        channel_name,
        media_kind: form.media_kind,
        // Ô nhập là GIỜ VIỆT NAM (nhãn form đã ghi rõ) — phải hiểu
        // theo múi giờ VN bất kể máy đang đặt múi giờ nào, nếu không
        // giờ đăng và khung giờ tính ra sẽ lệch theo múi giờ của máy.
        posted_at: new Date(
          `${form.posted_at.length === 16 ? `${form.posted_at}:00` : form.posted_at}+07:00`,
        ).toISOString(),
        reach: Number(form.reach || 0),
        likes: Number(form.likes || 0),
        comments: Number(form.comments || 0),
        shares: Number(form.shares || 0),
        clicks: Number(form.clicks || 0),
        inquiries: Number(form.inquiries || 0),
        orders: Number(form.orders || 0),
        notes: form.notes,
      });
    },
    onSuccess: (res) => {
      setMsg(
        `Đã ghi chỉ số — bài này thuộc khung giờ ${res.hour_slot} (giờ VN). Khung giờ tốt nhất của kênh sẽ tự cập nhật bên dưới.`,
      );
      setForm({
        channel_type: form.channel_type,
        channel_key: form.channel_key,
        media_kind: form.media_kind,
        draft_key: "",
        posted_at: "",
        reach: "",
        likes: "",
        comments: "",
        shares: "",
        clicks: "",
        inquiries: "",
        orders: "",
        notes: "",
      });
      refresh();
    },
    onError: () => setMsg("Không ghi được — kiểm tra lại kênh và thời gian đăng."),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deletePostMetric({ id }),
    onSuccess: refresh,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.channel_key) {
      setMsg("Chọn kênh đã đăng (hội nhóm, fanpage hoặc Instagram) trước.");
      return;
    }
    if (!form.posted_at) {
      setMsg("Nhập thời gian đã đăng bài.");
      return;
    }
    add.mutate();
  };

  const channelOptions =
    form.channel_type === "group"
      ? (groups.data?.groups ?? []).map((g) => ({
          key: `${g.id}|${g.name}`,
          label: g.name,
        }))
      : form.channel_type === "page"
        ? (pagesQ.data?.pages ?? []).map((p) => ({
            key: `${p.id}|${p.name}`,
            label: `Page ${p.name}`,
          }))
        : (accountsQ.data?.accounts ?? [])
            .filter((a) => a.platform === "Instagram" && a.linked)
            .map((a) => ({
              key: `${a.id}|${a.name}`,
              label: `Instagram ${a.name}`,
            }));
  const packedDrafts = (draftsQ.data?.drafts ?? []).filter(
    (d) => d.status === "packed" || d.status === "approved",
  );
  const a: Analytics | undefined = analytics.data;

  return (
    <div className="space-y-6">
      <section aria-label="Cách hệ thống tối ưu">
        <h2 className="text-lg font-bold">Phân tích chỉ số & tối ưu khung giờ</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--dim)]">
          Sau khi đăng, ghi lại chỉ số của từng bài ở form dưới. Hệ thống tính{" "}
          <strong>điểm tương tác</strong> cho mỗi bài (like ×1, bình luận ×3,
          chia sẻ ×4, click ×2, inbox hỏi mua ×8, đơn chốt ×20) rồi xếp hạng{" "}
          <strong>7 khung giờ riêng cho từng hội nhóm, từng fanpage và từng tài khoản Instagram</strong>{" "}
          — nhóm nào hợp giờ nào, page nào hợp giờ nào, nick Instagram nào
          hợp giờ nào, không dùng một khung chung. Gói đăng ở Hàng đợi sẽ tự
          in khung giờ tốt nhất của đúng kênh đích.
          {a && a.total_posts > 0 && a.overall_best_slot
            ? ` Tổng thể các kênh, khung đang hiệu quả nhất là ${a.overall_best_slot} (điểm TB ${a.overall_best_avg}/bài) — nhưng hãy ưu tiên khung riêng của từng kênh bên dưới.`
            : ""}
        </p>
      </section>

      <section aria-label="Khung giờ tốt nhất theo từng kênh">
        <h2 className="text-lg font-bold">
          Khung giờ tốt nhất theo từng kênh ({a?.channels.length ?? 0} kênh đã có dữ liệu)
        </h2>
        {analytics.isPending && (
          <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>
        )}
        {a && a.channels.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa có bài đăng nào được ghi chỉ số — đăng bài đầu tiên (duyệt bài
            ở{" "}
            <button className="underline" onClick={onGoQueue}>
              Hàng đợi
            </button>
            ), rồi quay lại đây ghi chỉ số để bắt đầu tối ưu.
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {(a?.channels ?? []).map((c: ChannelInsight) => (
            <li
              key={`${c.channel_type}-${c.channel_id}-${c.channel_name}`}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  <span className="mr-1.5 rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-xs font-semibold">
                    {c.channel_type === "group"
                      ? "Hội nhóm"
                      : c.channel_type === "page"
                        ? "Fanpage"
                        : "Instagram"}
                  </span>
                  {c.channel_name}
                </p>
                <p className="font-mono text-xs text-[var(--dim)]">
                  {c.posts} bài · điểm TB {c.avg_score} · tiếp cận{" "}
                  {c.total_reach.toLocaleString("vi-VN")} · {c.total_inquiries}{" "}
                  inbox · {c.total_orders} đơn
                </p>
              </div>
              <p className="mt-2 text-sm">
                Khung giờ tốt nhất:{" "}
                <strong className="font-mono text-[var(--accent-ink)]">
                  {c.best_slot || "—"}
                </strong>{" "}
                (điểm TB {c.best_slot_avg}/bài qua {c.best_slot_posts} bài)
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--dim)]">
                {c.recommendation}
              </p>
              <div
                className="mt-3 grid grid-cols-7 gap-1"
                role="img"
                aria-label={`Điểm tương tác theo khung giờ của ${c.channel_name}: ${c.slots
                  .map((s) => `${s.slot}: ${s.posts} bài, điểm TB ${s.avg_score}`)
                  .join("; ")}`}
              >
                {SLOT_LABELS.map((slot) => {
                  const s = c.slots.find((x) => x.slot === slot);
                  const isBest = s && c.best_slot === slot && s.posts > 0;
                  const maxAvg = Math.max(1, ...c.slots.map((x) => x.avg_score));
                  const h = s && s.posts > 0 ? Math.max(12, (s.avg_score / maxAvg) * 56) : 4;
                  return (
                    <div key={slot} className="text-center">
                      <div className="flex h-14 items-end justify-center">
                        <div
                          className={`w-full max-w-8 rounded-t ${
                            isBest
                              ? "bg-[var(--accent)]"
                              : "bg-[var(--surface-alt)]"
                          }`}
                          style={{ height: `${h}px` }}
                        />
                      </div>
                      <p className="mt-1 font-mono text-[10px] leading-3 text-[var(--dim)]">
                        {slot.replace("–", "–\n")}
                      </p>
                      <p className="font-mono text-[10px] font-semibold">
                        {s && s.posts > 0 ? `${s.avg_score}đ · ${s.posts} bài` : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Ghi chỉ số bài đã đăng">
        <h2 className="text-lg font-bold">Ghi chỉ số bài đã đăng</h2>
        <form
          onSubmit={submit}
          className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="mt-type">Loại kênh *</label>
              <select
                id="mt-type"
                aria-label="Loại kênh"
                className={inputCls}
                value={form.channel_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    channel_type: e.target.value as "group" | "page" | "instagram",
                    channel_key: "",
                  })
                }
              >
                <option value="group">Hội nhóm</option>
                <option value="page">Fanpage</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="mt-media">Dạng media đã đăng</label>
              <select
                id="mt-media"
                aria-label="Dạng media đã đăng"
                className={inputCls}
                value={form.media_kind}
                onChange={(e) =>
                  setForm({ ...form, media_kind: e.target.value as "image" | "video" })
                }
              >
                <option value="image">Ảnh</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="mt-channel">Kênh đã đăng *</label>
              <select
                id="mt-channel"
                aria-label="Kênh đã đăng"
                className={inputCls}
                value={form.channel_key}
                onChange={(e) => setForm({ ...form, channel_key: e.target.value })}
                required
              >
                <option value="">— Chọn kênh —</option>
                {channelOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              {channelOptions.length === 0 && (
                <p className="mt-1 text-xs text-[var(--danger)]">
                  {form.channel_type === "group"
                    ? "Chưa có nhóm nào trong danh sách — thêm ở mục Hội nhóm."
                    : form.channel_type === "page"
                      ? "Chưa có Page nào — thêm Page ở mục Tài khoản."
                      : "Chưa có tài khoản Instagram nào đã liên kết — liên kết ở mục Tài khoản."}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="mt-draft">Bài đăng (gói đã xuất)</label>
              <select
                id="mt-draft"
                aria-label="Bài đăng"
                className={inputCls}
                value={form.draft_key}
                onChange={(e) => setForm({ ...form, draft_key: e.target.value })}
              >
                <option value="">— Không gắn bài cụ thể —</option>
                {packedDrafts.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.stt ? `STT ${d.stt} · ` : ""}
                    {d.product_name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="mt-when">Thời gian đã đăng (giờ VN) *</label>
              <input
                id="mt-when"
                aria-label="Thời gian đã đăng"
                type="datetime-local"
                className={inputCls}
                value={form.posted_at}
                onChange={(e) => setForm({ ...form, posted_at: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {(
              [
                ["reach", "Lượt tiếp cận"],
                ["likes", "Like"],
                ["comments", "Bình luận"],
                ["shares", "Chia sẻ"],
                ["clicks", "Click/xem ảnh"],
                ["inquiries", "Inbox hỏi mua"],
                ["orders", "Đơn đã chốt"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className={labelCls} htmlFor={`mt-${key}`}>
                  {label}
                </label>
                <input
                  id={`mt-${key}`}
                  aria-label={label}
                  type="number"
                  min={0}
                  className={inputCls}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className={labelCls} htmlFor="mt-notes">Ghi chú</label>
              <input
                id="mt-notes"
                aria-label="Ghi chú chỉ số"
                className={inputCls}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Nhập ghi chú"
              />
            </div>
          </div>
          <p className="text-xs text-[var(--dim)]">
            Dạng media ghi theo đúng bài đã đăng thực tế (ảnh hoặc
            video), không ép theo kênh. Khung giờ được tự xếp theo giờ
            đăng (giờ VN).
          </p>
          <button type="submit" className={btnPrimary} disabled={add.isPending}>
            Ghi chỉ số & cập nhật tối ưu
          </button>
          {msg && (
            <p className="text-sm font-medium" role="status">
              {msg}
            </p>
          )}
        </form>
      </section>

      <section aria-label="Lịch sử chỉ số đã ghi">
        <h2 className="text-lg font-bold">
          Lịch sử bài đã đo ({metrics.data?.metrics.length ?? 0})
        </h2>
        {metrics.isPending && (
          <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>
        )}
        <ul className="mt-3 space-y-3">
          {(metrics.data?.metrics ?? []).map((m: Metric) => (
            <li
              key={m.id}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {m.channel_type === "group"
                      ? "Nhóm"
                      : m.channel_type === "page"
                        ? "Page"
                        : "Instagram"}
                    : {m.channel_name}
                  </p>
                  <p className="text-xs text-[var(--dim)]">
                    {m.stt ? `STT ${m.stt} · ` : ""}
                    {m.product_name || "Sản phẩm không gắn bài"} · đăng{" "}
                    {fmtDate(m.posted_at)} · khung{" "}
                    <span className="font-mono font-semibold">{m.hour_slot}</span>{" "}
                    · {m.media_kind === "video"
                      ? "video"
                      : m.media_kind === "image"
                        ? "ảnh"
                        : "không media"}
                  </p>
                </div>
                <button
                  className={btnDanger}
                  onClick={() => del.mutate(m.id)}
                  aria-label={`Xóa chỉ số của bài ở ${m.channel_name}`}
                >
                  Xóa
                </button>
              </div>
              <dl className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1 text-sm sm:grid-cols-8">
                {[
                  ["Tiếp cận", m.reach],
                  ["Like", m.likes],
                  ["Bình luận", m.comments],
                  ["Chia sẻ", m.shares],
                  ["Click", m.clicks],
                  ["Inbox", m.inquiries],
                  ["Đơn", m.orders],
                  ["Điểm", m.score],
                ].map(([label, v]) => (
                  <div key={label as string}>
                    <dt className="text-xs text-[var(--dim)]">{label}</dt>
                    <dd className="font-mono font-semibold">
                      {(v as number).toLocaleString("vi-VN")}
                    </dd>
                  </div>
                ))}
              </dl>
              {m.notes && (
                <p className="mt-1 text-xs text-[var(--dim)]">{m.notes}</p>
              )}
            </li>
          ))}
        </ul>
        {metrics.data && metrics.data.metrics.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa ghi chỉ số nào.
          </p>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- Ảnh/video */

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function MediaSection() {
  const queryClient = useQueryClient();
  const media = useQuery({ queryKey: ["media"], queryFn: () => api.listMedia({}) });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = useMutation({
    mutationFn: (args: { name: string; mime: string; data_base64: string }) => api.uploadMedia(args),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteMedia({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg("");
    let okCount = 0;
    for (const file of Array.from(files)) {
      try {
        const b64 = await fileToBase64(file);
        const res = await upload.mutateAsync({
          name: file.name,
          mime: file.type || "application/octet-stream",
          data_base64: b64,
        });
        if (res.ok) okCount += 1;
        else setMsg(res.error);
      } catch {
        setMsg(`Không tải lên được file ${file.name}.`);
      }
    }
    setBusy(false);
    if (okCount > 0) setMsg(`Đã thêm ${okCount} file.`);
    queryClient.invalidateQueries({ queryKey: ["media"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  return (
    <div className="space-y-6">
      <section aria-label="Thêm ảnh video">
        <h2 className="text-lg font-bold">Ảnh/video sản phẩm</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Kho media dự phòng khi sản phẩm chưa có link trong Sheet. Quy tắc:{" "}
          <strong>media dùng chung cho mọi đích đăng</strong> — gói đăng liệt
          kê đúng ảnh/video đã gắn vào bài, không tách theo kênh. Ưu tiên vẫn là ảnh/video ngay trong Sheet
          của từng sản phẩm (cột Ảnh / Video, theo mã STT). Tối đa 25MB mỗi
          file.
        </p>
        <label className="mt-3 block">
          <span className="sr-only">Chọn ảnh hoặc video để tải lên</span>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            disabled={busy}
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
            className="block w-full text-sm text-[var(--dim)] file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
        </label>
        {busy && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải lên…</p>}
        {msg && <p className="mt-2 text-sm font-medium" role="status">{msg}</p>}
      </section>

      <section aria-label="Danh sách ảnh video">
        {media.isPending && <p className="text-sm text-[var(--dim)]">Đang tải…</p>}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(media.data?.media ?? []).map((m: MediaItem) => (
            <li key={m.id} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
              {m.mime.startsWith("image/") && m.url ? (
                <img src={m.url} alt={m.name} className="aspect-square w-full object-cover" />
              ) : m.mime.startsWith("video/") && m.url ? (
                <video src={m.url} controls className="aspect-square w-full object-cover" aria-label={m.name} />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-[var(--surface-alt)] text-xs text-[var(--dim)]">
                  Không xem trước được
                </div>
              )}
              <div className="p-2">
                <p className="truncate text-xs font-medium" title={m.name}>{m.name}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-[var(--dim)]">{fmtBytes(m.size)}</span>
                  <button className="text-xs font-semibold text-[var(--danger)]" onClick={() => del.mutate(m.id)} aria-label={`Xóa file ${m.name}`}>
                    Xóa
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {media.data && media.data.media.length === 0 && (
          <p className="text-sm text-[var(--dim)]">Chưa có ảnh/video nào — thêm ảnh sản phẩm thật trước khi duyệt bài.</p>
        )}
      </section>
    </div>
  );
}

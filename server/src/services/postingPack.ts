import { z } from "@hatch/space-sdk";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "./settings";
import { driveImageSchema, buildSku, normalizeSheetImageUrl, parseDriveImages } from "./drive";
import {
  findPlaceholders,
  hasColorPlaceholder,
  stripColorPlaceholders,
} from "./copywriting";
import {
  loadJoinContext,
  membershipStatusOf,
  postingJoinedIdentities,
} from "./groups";
import { deriveProfileUrl } from "../types";

export const publishRecordOut = z.object({
  id: z.number(),
  target_kind: z.enum(["page", "instagram", "group", "account"]),
  target_name: z.string(),
  status: z.enum([
    "published",
    "failed",
    "unsupported",
    "skipped",
    "queued",
    "uncertain",
    "needs_login",
  ]),
  post_url: z.string(),
  message: z.string(),
  created_at: z.string(),
});

// Dấu hiệu một lượt đăng bị NGẮT GIỮA CHỪNG vì quá ngân sách thời
// gian của lượt gọi (daemon request … wall-clock budget) chứ không
// phải lỗi nghiệp vụ rõ ràng: hệ thống tự cắt request trong khi
// lệnh đăng ở phía Instagram có thể đã chạy xong hoặc chưa — kết
// quả thật KHÔNG xác định được từ phía app.
export function isPublishTimeoutMessage(message: string): boolean {
  return /wall-clock budget|exceeded \d+\s*ms|timed?\s?out|quá thời gian chờ/i.test(
    message,
  );
}

// Dấu hiệu một lượt đăng bằng TRÌNH DUYỆT (nhóm / Page caption
// dài) bị chặn ở MÀN HÌNH ĐĂNG NHẬP Facebook: trình duyệt Muse
// của tác vụ đăng chưa có phiên facebook.com đã lưu. Đây không
// phải "đăng lỗi" — là trạng thái CHỜ người dùng đăng nhập 1 lần
// trong chính cửa sổ trình duyệt đó (phiên được lưu cho các lần
// đăng sau), nên khi đọc ra giao diện được chuẩn hoá thành
// "needs_login" kèm hướng dẫn, dữ liệu gốc giữ nguyên.
export function isFbLoginWallMessage(message: string): boolean {
  return /chưa đăng nhập|chưa có đăng nhập đã lưu|không có đăng nhập đã lưu|log into facebook|màn hình.{0,30}đăng nhập|hộp thoại đăng nhập|trang đăng nhập/i.test(
    message,
  );
}

// Trạng thái HIỆU LỰC của một bản ghi đăng: bản ghi cũ "failed"
// kèm lỗi quá thời gian chờ (Instagram) hoặc bị chặn ở màn hình
// đăng nhập Facebook (nhóm/Page) được chuẩn hoá khi hiển thị
// thành "uncertain" / "needs_login" (xem toPublishRecordOut) —
// mọi nơi cần phân loại bản ghi (hiển thị lịch sử, chống đăng
// trùng, dọn bản ghi cũ) đều phải dùng trạng thái hiệu lực này
// thay cho trạng thái thô lưu trong DB.
export function effectivePublishStatus(r: {
  targetKind: string;
  status: string;
  message: string;
}): string {
  if (
    r.targetKind === "instagram" &&
    r.status === "failed" &&
    isPublishTimeoutMessage(r.message)
  )
    return "uncertain";
  if (
    (r.targetKind === "group" || r.targetKind === "page") &&
    r.status === "failed" &&
    isFbLoginWallMessage(r.message)
  )
    return "needs_login";
  return r.status;
}

// Khóa nhận diện MỘT ĐÍCH đăng của một bản nháp (theo kênh + tên
// đích, chuẩn hoá tên như các lần so khớp chống trùng khác).
export function publishTargetKey(r: {
  targetKind: string;
  targetName: string;
}): string {
  return `${r.targetKind}:${normalizeNameKey(r.targetName)}`;
}

// Các trạng thái CHƯA thành công và có thể bị bản ghi mới của
// cùng một đích THAY THẾ: đăng lỗi, chờ đăng nhập, bị bỏ qua.
// Khi một đích có bản ghi mới, các bản ghi cũ ở các trạng thái
// này của cùng đích bị XÓA HẲN để Lịch sử đăng Bài chỉ còn
// thông tin mới nhất theo từng đích (người dùng chốt: "chỉ nên
// hiện thông tin mới thôi, còn cũ sẽ tự động xóa"). TUYỆT ĐỐI
// KHÔNG xóa: bản ghi "published" (bằng chứng đã đăng + link bài
// thật, và là căn cứ chống đăng trùng), bản ghi "queued" (đang
// chờ kết quả) và "uncertain" (lượt đăng Instagram chưa xác
// định — căn cứ bắt buộc kiểm tra trùng trước khi đăng lại).
export const SUPERSEDABLE_PUBLISH_STATUSES = new Set([
  "failed",
  "needs_login",
  "skipped",
  "unsupported",
]);

// Sau khi một bản ghi đăng MỚI được ghi cho một đích (theo id
// bản ghi vừa ghi), xóa các bản ghi CŨ bị thay thế của CÙNG
// đích trong CÙNG bản nháp. Trả về số bản ghi đã xóa.
export async function pruneSupersededPublishRecords(
  db: Db,
  keepRecordId: number,
): Promise<number> {
  if (keepRecordId <= 0) return 0;
  const [keep] = await db
    .select()
    .from(schema.publishRecords)
    .where(eq(schema.publishRecords.id, keepRecordId));
  if (!keep) return 0;
  const key = publishTargetKey(keep);
  const rows = await db
    .select()
    .from(schema.publishRecords)
    .where(eq(schema.publishRecords.draftId, keep.draftId));
  let removed = 0;
  for (const r of rows) {
    if (r.id === keep.id) continue;
    if (publishTargetKey(r) !== key) continue;
    if (!SUPERSEDABLE_PUBLISH_STATUSES.has(effectivePublishStatus(r)))
      continue;
    await db
      .delete(schema.publishRecords)
      .where(eq(schema.publishRecords.id, r.id));
    removed += 1;
  }
  return removed;
}

// Dọn TOÀN BỘ bản ghi đăng hiện có (áp dụng khi đọc danh sách
// bản nháp): với MỖI bản nháp + MỖI đích, chỉ giữ bản ghi MỚI
// NHẤT ở nhóm trạng thái có thể bị thay thế; các bản ghi cũ hơn
// trong nhóm đó bị xóa hẳn. Bản ghi "published" / "queued" /
// "uncertain" không bao giờ bị xóa bởi cơ chế này. Nhờ vậy dữ
// liệu tích lũy từ các lượt đăng trước bản sửa này cũng được
// dọn ngay ở lần đọc đầu tiên, và Lịch sử đăng Bài không còn
// chồng thông tin cũ lên thông tin mới.
export async function pruneAllSupersededPublishRecords(db: Db): Promise<number> {
  const rows = await db
    .select()
    .from(schema.publishRecords)
    .orderBy(desc(schema.publishRecords.id));
  const seen = new Set<string>();
  let removed = 0;
  for (const r of rows) {
    if (!SUPERSEDABLE_PUBLISH_STATUSES.has(effectivePublishStatus(r)))
      continue;
    const key = `${r.draftId}|${publishTargetKey(r)}`;
    if (seen.has(key)) {
      await db
        .delete(schema.publishRecords)
        .where(eq(schema.publishRecords.id, r.id));
      removed += 1;
    } else {
      seen.add(key);
    }
  }
  return removed;
}

// Đích đăng đã lưu cho một bản nháp (cột pack_targets, JSON).
// saved = false khi bản nháp chưa từng có lựa chọn nào được lưu —
// client khi đó mới suy lựa chọn từ các cờ chọn mặc định (nhóm
// đích / Page đang chọn / nick IG đang chọn); một khi đã lưu thì
// lựa chọn đã lưu THẮNG mặc định, kể cả khi người dùng bỏ chọn hết.
export const packTargetsOut = z.object({
  saved: z.boolean(),
  group_ids: z.array(z.number()),
  page_ids: z.array(z.number()),
  instagram_account_ids: z.array(z.number()),
});

export type PackTargets = z.infer<typeof packTargetsOut>;

export function parsePackTargets(raw: string): PackTargets {
  const empty: PackTargets = {
    saved: false,
    group_ids: [],
    page_ids: [],
    instagram_account_ids: [],
  };
  if (!raw.trim()) return empty;
  try {
    const parsed = JSON.parse(raw) as {
      group_ids?: unknown;
      page_ids?: unknown;
      instagram_account_ids?: unknown;
    };
    const ids = (v: unknown): number[] =>
      Array.isArray(v)
        ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0)
        : [];
    return {
      saved: true,
      group_ids: ids(parsed.group_ids),
      page_ids: ids(parsed.page_ids),
      instagram_account_ids: ids(parsed.instagram_account_ids),
    };
  } catch {
    return empty;
  }
}

export function serializePackTargets(t: {
  group_ids: number[];
  page_ids: number[];
  instagram_account_ids: number[];
}): string {
  return JSON.stringify({
    group_ids: t.group_ids,
    page_ids: t.page_ids,
    instagram_account_ids: t.instagram_account_ids,
  });
}

export type PublishRecordRow = typeof schema.publishRecords.$inferSelect;

export function toPublishRecordOut(
  r: PublishRecordRow,
): z.infer<typeof publishRecordOut> {
  // Chuẩn hoá trạng thái khi đọc (xem effectivePublishStatus):
  // lượt Instagram "failed" kèm lỗi quá thời gian chờ → "uncertain"
  // (chưa xác định bài đã lên hay chưa, không phải đăng lỗi chắc
  // chắn); lượt nhóm/Page "failed" bị chặn ở màn hình đăng nhập
  // Facebook → "needs_login" (chờ đăng nhập, không phải đăng lỗi).
  const effective = effectivePublishStatus(r);
  const timedOut = effective === "uncertain" && r.status === "failed";
  const loginWall = effective === "needs_login" && r.status === "failed";
  const status = effective as typeof r.status;
  return {
    id: r.id,
    target_kind: r.targetKind,
    target_name: r.targetName,
    status,
    post_url: r.postUrl,
    message: timedOut
      ? `Instagram ${r.targetName}: lượt đăng bị ngắt giữa chừng vì quá thời gian chờ của hệ thống — CHƯA XÁC ĐỊNH được bài đã lên Instagram hay chưa. Mở Instagram kiểm tra trước khi bấm đăng lại; khi đăng lại, hệ thống sẽ kiểm tra bài trùng trên Instagram trước rồi mới đăng tiếp.`
      : loginWall
        ? `${r.targetKind === "group" ? "Nhóm" : "Fanpage"} ${r.targetName}: đang chờ bạn đăng nhập Facebook trong cửa sổ trình duyệt Muse (cửa sổ tác vụ đăng mở ra, KHÔNG phải tab Facebook trong Chrome của bạn và KHÔNG phải trạng thái “Đã liên kết” ở mục Tài khoản). Đăng nhập bằng tài khoản quản trị Page trong cửa sổ đó — chỉ cần 1 lần, phiên được lưu cho mọi lần đăng sau — rồi bấm “Đăng Bài” lại là bài đăng tiếp bằng phiên đã lưu.`
        : r.message,
    created_at: r.createdAt.toISOString(),
  };
}

export const draftOut = z.object({
  id: z.number(),
  code: z.string(),
  idempotency_key: z.string(),
  publish_records: z.array(publishRecordOut),
  stt: z.string(),
  sku: z.string(),
  product_name: z.string(),
  scale: z.string(),
  maker: z.string(),
  color: z.string(),
  price: z.string(),
  stock: z.string(),
  ship: z.string(),
  image_url: z.string(),
  video_url: z.string(),
  drive_folder_id: z.string(),
  drive_status: z.string(),
  drive_error: z.string(),
  drive_images: z.array(driveImageSchema),
  has_real_image: z.boolean(),
  selling_point: z.string(),
  angle: z.string(),
  size_cm: z.string(),
  sale_days: z.string(),
  caption: z.string(),
  caption_source: z.enum(["ai", "template", "manual", ""]),
  status: z.enum(["draft", "approved", "packed"]),
  pack_text: z.string(),
  packed_at: z.string().nullable(),
  pack_targets: packTargetsOut,
  created_at: z.string(),
  placeholders: z.array(z.string()),
});

export type DraftRow = typeof schema.drafts.$inferSelect;

export function toDraftOut(
  r: DraftRow,
  publishRecords: PublishRecordRow[] = [],
): z.infer<typeof draftOut> {
  return {
    id: r.id,
    code: r.code,
    idempotency_key: r.idempotencyKey,
    publish_records: publishRecords.map(toPublishRecordOut),
    stt: r.stt,
    sku: r.sku || buildSku(r.stt, r.productName, r.color),
    product_name: r.productName,
    scale: r.scale,
    maker: r.maker,
    color: r.color,
    price: r.price,
    stock: r.stock,
    ship: r.ship,
    image_url: normalizeSheetImageUrl(r.imageUrl),
    video_url: r.videoUrl,
    drive_folder_id: r.driveFolderId,
    drive_status: r.driveStatus,
    drive_error: r.driveError,
    drive_images: parseDriveImages(r.driveImages),
    has_real_image:
      r.driveStatus === "ok" && parseDriveImages(r.driveImages).length > 0,
    selling_point: r.sellingPoint,
    angle: r.angle,
    size_cm: r.sizeCm,
    sale_days: r.saleDays,
    caption: r.caption,
    caption_source:
      r.captionSource === "ai" ||
      r.captionSource === "template" ||
      r.captionSource === "manual"
        ? r.captionSource
        : "",
    status: r.status,
    pack_text: r.packText,
    packed_at: r.packedAt ? r.packedAt.toISOString() : null,
    pack_targets: parsePackTargets(r.packTargets),
    created_at: r.createdAt.toISOString(),
    placeholders: findPlaceholders(r.caption),
  };
}

// Dọn placeholder màu còn sót trong các bản nháp CŨ (soạn từ trước
// khi khâu viết bài có chốt chặn "[màu]", hoặc do người bán dán tay
// vào caption ở các bản cũ): quét MỌI bản nháp ở mọi trạng thái,
// bản nào caption hoặc gói đăng đã xuất còn placeholder màu thì
// viết lại bằng bản đã gỡ — dòng "Màu sắc:" được điền đúng màu của
// chính bản nháp đó — và LƯU BỀN xuống dữ liệu, không chỉ che ở
// lớp hiển thị. Trả về số bản nháp đã dọn. seedDesk gọi hàm này
// mỗi lần mở app: sau lần dọn đầu tiên không còn bản nào khớp nữa
// nên các lần mở sau không ghi thêm gì.

// Giới hạn ký tự caption của từng kênh (theo tài liệu connector).
export const FB_PAGE_CAPTION_LIMIT = 1024;
export const IG_CAPTION_LIMIT = 2200;

export function normalizeNameKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// CLI của connector in JSON (có thể kèm khối _meta) — lấy JSON
// object cuối cùng parse được từ stdout.
export function parseCliJson(stdout: string): Record<string, unknown> | null {
  const text = stdout.trim();
  if (!text) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === "object" && v !== null
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const v = JSON.parse(text.slice(start, end + 1)) as unknown;
        return typeof v === "object" && v !== null
          ? (v as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function cliErrorText(res: { stdout: string; stderr: string }): string {
  const j = parseCliJson(res.stdout);
  const err =
    (typeof j?.error === "string" && j.error) ||
    (typeof (j?.error as { message?: unknown } | undefined)?.message ===
      "string" &&
      ((j?.error as { message: string }).message as string)) ||
    "";
  const raw = (err || res.stderr || res.stdout || "").trim();
  return raw.slice(0, 400);
}

// Tìm link/ID bài đã đăng trong JSON trả về của lệnh đăng — chỉ
// lấy giá trị connector THẬT SỰ trả về, không tự dựng link.
export function extractPostRef(j: Record<string, unknown> | null): {
  url: string;
  state: string;
} {
  if (!j) return { url: "", state: "" };
  const data =
    typeof j.data === "object" && j.data !== null
      ? (j.data as Record<string, unknown>)
      : j;
  const pick = (o: Record<string, unknown>, keys: string[]): string => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const url =
    pick(data, ["post_url", "url", "permalink", "postUrl"]) ||
    pick(j, ["post_url", "url", "permalink"]);
  const state = pick(data, ["state", "status"]) || pick(j, ["state", "status"]);
  return { url, state };
}

export interface FbPageRef {
  page_id: string;
  name: string;
}

export function parseFbPages(stdout: string): FbPageRef[] {
  const j = parseCliJson(stdout);
  const arr = Array.isArray(j?.data) ? j.data : [];
  const out: FbPageRef[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const pageId =
      typeof o.page_id === "string" || typeof o.page_id === "number"
        ? String(o.page_id)
        : "";
    const name = typeof o.name === "string" ? o.name : "";
    if (pageId) out.push({ page_id: pageId, name });
  }
  return out;
}

export interface IgAccountRef {
  user_fbid: string;
  username: string;
}

export function parseIgAccounts(stdout: string): IgAccountRef[] {
  const j = parseCliJson(stdout);
  const arr = Array.isArray(j?.accounts) ? j.accounts : [];
  const out: IgAccountRef[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const fbid =
      typeof o.user_fbid === "string" || typeof o.user_fbid === "number"
        ? String(o.user_fbid)
        : "";
    const username = typeof o.username === "string" ? o.username : "";
    if (fbid) out.push({ user_fbid: fbid, username });
  }
  return out;
}

// Username Instagram suy từ tài khoản trong app: handle (@tên /
// tên) hoặc link hồ sơ instagram.com/<tên>/.
export function igUsernameOf(a: {
  name: string;
  handle: string;
  profileUrl: string;
}): string {
  const fromUrl = a.profileUrl.match(/instagram\.com\/([^/?#]+)/);
  if (fromUrl && fromUrl[1]) return fromUrl[1].replace(/^@/, "").toLowerCase();
  const h = a.handle.trim().replace(/^@/, "");
  if (h && !/\s/.test(h)) return h.toLowerCase();
  const n = a.name.trim();
  return /\s/.test(n) ? "" : n.toLowerCase();
}

export type PackTargetsInput = {
  group_ids: number[];
  page_ids: number[];
  instagram_account_ids: number[];
};

export type BuildPackResult =
  | {
      ok: true;
      packText: string;
      cleanCaption: string;
      driveImageCount: number;
      hasMedia: boolean;
      hasVideo: boolean;
    }
  | { ok: false; message: string };

// Sinh text gói đăng cho một bản nháp — dùng CHUNG cho duyệt bài
// (tự xuất gói ngay khi duyệt), cho buildPack (giữ tương thích) và
// cho saveDraftTargets (đổi đích thì gói tự cập nhật theo). KHÔNG
// quét lại Drive: dùng đúng tập ảnh đã chốt trong bản nháp.
export async function buildPackTextForDraft(
  db: Db,
  row: DraftRow,
  args: PackTargetsInput,
  opts?: { explicit?: boolean },
): Promise<BuildPackResult> {
  const cleanCaption = hasColorPlaceholder(row.caption)
    ? stripColorPlaceholders(row.caption, row.color)
    : row.caption;
  const imagesCustomized = row.imagesCustomized === 1;
  const driveImages = parseDriveImages(row.driveImages);
  const packStatus = row.driveStatus;
  const packError = row.driveError;
  const driveImageLines =
    driveImages.length > 0
      ? driveImages
          .map((im, i) =>
            im.id.startsWith("upload-")
              ? `- Ảnh ${i + 1}: ${im.name} (tải lên từ thiết bị): ${im.jpeg_url}`
              : `- Ảnh ${i + 1}: ${im.name}${im.is_heic ? " (JPEG từ HEIC — đăng bản JPEG này)" : ""}: ${im.jpeg_url}${im.view_url ? ` · Drive: ${im.view_url}` : ""}`,
          )
          .join("\n")
      : "";
  const allGroups = await db
    .select()
    .from(schema.fbGroups)
    .orderBy(asc(schema.fbGroups.id));
  const chosen = allGroups.filter((g) => args.group_ids.includes(g.id));
  const joinCtx = await loadJoinContext(db);
  const joinedByGroup = new Map(
    chosen.map((g) => [g.id, postingJoinedIdentities(joinCtx, g)]),
  );
  const notJoined = chosen.filter(
    (g) => (joinedByGroup.get(g.id) ?? []).length === 0,
  );
  if (notJoined.length > 0)
    return {
      ok: false,
      message:
        "Chỉ đăng vào nhóm bằng danh tính đã tham gia nhóm đó (trạng thái của tài khoản chính và từng Page con tính riêng). Chưa có danh tính sẽ đăng nào đã tham gia: " +
        notJoined.map((g) => g.name).join(", "),
    };
  const media = await db.select().from(schema.mediaItems);
  const selectedAccounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.selected, 1));
  const postingAccounts = selectedAccounts.filter((a) => a.linked === 1);
  const allAccounts = await db.select().from(schema.accounts);
  const accountById = new Map(allAccounts.map((a) => [a.id, a]));
  const selectedPages = await db
    .select()
    .from(schema.fbPages)
    .where(eq(schema.fbPages.selected, 1));
  const postingPages = selectedPages;
  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const allPages = await db.select().from(schema.fbPages);
  const chosenPages = opts?.explicit
    ? allPages.filter((p) => args.page_ids.includes(p.id))
    : args.page_ids.length > 0
      ? allPages.filter((p) => args.page_ids.includes(p.id))
      : postingPages;
  const igAccounts = allAccounts.filter(
    (a) => a.platform === "Instagram" && a.linked === 1,
  );
  const chosenIgAccounts = opts?.explicit
    ? igAccounts.filter((a) => args.instagram_account_ids.includes(a.id))
    : args.instagram_account_ids.length > 0
      ? igAccounts.filter((a) => args.instagram_account_ids.includes(a.id))
      : igAccounts.filter((a) => a.selected === 1);
  const targetLines =
    chosen.length > 0
      ? chosen
          .map((g) => {
            const posting = joinCtx.identities.filter((i) => i.posting);
            const statusLines = posting
              .map((i) => {
                const label =
                  i.kind === "page"
                    ? `Page “${i.name}”`
                    : `Tài khoản chính ${i.name}`;
                return membershipStatusOf(joinCtx, g, i) === "joined"
                  ? `  - ${label}: Đã tham gia — đăng được bằng danh tính này`
                  : `  - ${label}: Chưa tham gia — KHÔNG đăng bằng danh tính này`;
              })
              .join("\n");
            return `- ${g.name}${g.url ? ` — ${g.url}` : ""}\n${statusLines}`;
          })
          .join("\n")
      : "";
  const uploadedImages = media.filter((m) => m.mime.startsWith("image/"));
  const uploadedVideos = media.filter((m) => m.mime.startsWith("video/"));
  const mediaParts: string[] = [];
  if (driveImages.length > 0) {
    mediaParts.push(
      `Ảnh đã chốt trong bản nháp (${driveImages.length} ảnh${row.sku ? `, SKU ${row.sku}` : ""}):\n${driveImageLines}`,
    );
  } else if (uploadedImages.length > 0) {
    mediaParts.push(
      uploadedImages.map((m) => `- Ảnh đã tải lên: ${m.name}`).join("\n"),
    );
  }
  if (row.videoUrl.trim()) {
    mediaParts.push(
      `- Video của sản phẩm${row.stt ? ` (STT ${row.stt})` : ""}: ${row.videoUrl.trim()}`,
    );
  }
  if (uploadedVideos.length > 0) {
    mediaParts.push(
      uploadedVideos.map((m) => `- Video đã tải lên: ${m.name}`).join("\n"),
    );
  }
  const packMediaLines =
    mediaParts.length > 0
      ? mediaParts.join("\n")
      : imagesCustomized
        ? "- Chưa gắn ảnh/video nào."
        : packStatus === "empty"
          ? "- Chưa gắn ảnh/video nào (thư mục Drive đang rỗng)."
          : packError
            ? `- Chưa gắn ảnh/video nào (${packError}).`
            : "- Chưa gắn ảnh/video nào.";
  const accountLines =
    postingAccounts.length > 0
      ? postingAccounts
          .map((a) => `- ${a.platform}: ${a.name}${a.handle ? ` (${a.handle})` : ""}`)
          .join("\n")
      : "";
  const pageLines =
    chosenPages.length > 0
      ? chosenPages
          .map((p) => {
            const owner = accountById.get(p.accountId);
            return `- Page “${p.name}”${p.url ? ` — ${p.url}` : ""} (quản trị bằng nick ${owner?.name ?? "?"})`;
          })
          .join("\n")
      : "";
  const igLines =
    chosenIgAccounts.length > 0
      ? chosenIgAccounts
          .map((a) => {
            const url = deriveProfileUrl(a);
            return `- Instagram ${a.name}${a.handle ? ` (${a.handle})` : ""}${url ? ` — ${url}` : ""}`;
          })
          .join("\n")
      : "";
  const hasDestination =
    postingAccounts.length > 0 ||
    chosen.length > 0 ||
    chosenPages.length > 0 ||
    chosenIgAccounts.length > 0;
  const packText = [
    `# Gói đăng bài — ${row.code}`,
    `Sản phẩm: ${row.productName}${row.sku ? ` | SKU: ${row.sku}` : row.stt ? ` | STT: ${row.stt}` : ""} | Tỉ lệ: ${row.scale} | Màu: ${row.color || "—"} | Xuất gói: ${dateFmt.format(now)} (giờ VN)`,
    "",
    "## Đích đăng",
    ...(postingAccounts.length > 0 ? ["Tài khoản đăng:", accountLines] : []),
    ...(chosen.length > 0 ? ["Nhóm:", targetLines] : []),
    ...(chosenPages.length > 0 ? ["Fanpage:", pageLines] : []),
    ...(chosenIgAccounts.length > 0 ? ["Instagram:", igLines] : []),
    ...(!hasDestination ? ["- Chưa chọn đích đăng nào."] : []),
    "",
    "## Media của bài",
    packMediaLines,
    "",
    "## Nội dung đã duyệt",
    "```",
    cleanCaption,
    "```",
  ].join("\n");
  return {
    ok: true,
    packText,
    cleanCaption,
    driveImageCount: driveImages.length,
    hasMedia: mediaParts.length > 0,
    hasVideo: !!row.videoUrl.trim(),
  };
}

// Đích đăng MẶC ĐỊNH dùng khi duyệt bài (chưa từng chọn tay cho
// bài này): nhóm đích đã đánh dấu là đích VÀ có ít nhất một danh
// tính sẽ đăng đã tham gia nhóm đó, Page đang chọn đăng, nick
// Instagram đã liên kết đang chọn. Khớp đúng mặc định phía client
// ở Hàng đợi (nhóm đích / Page đang chọn / IG đang chọn, chỉ tính
// nhóm đăng được theo từng danh tính).
export async function defaultPackTargets(db: Db): Promise<PackTargetsInput> {
  const allGroups = await db
    .select()
    .from(schema.fbGroups)
    .orderBy(asc(schema.fbGroups.id));
  const joinCtx = await loadJoinContext(db);
  const group_ids = allGroups
    .filter(
      (g) =>
        g.isTarget === 1 && postingJoinedIdentities(joinCtx, g).length > 0,
    )
    .map((g) => g.id);
  const allPages = await db.select().from(schema.fbPages);
  const page_ids = allPages.filter((p) => p.selected === 1).map((p) => p.id);
  const allAccounts = await db.select().from(schema.accounts);
  const instagram_account_ids = allAccounts
    .filter((a) => a.platform === "Instagram" && a.linked === 1 && a.selected === 1)
    .map((a) => a.id);
  return { group_ids, page_ids, instagram_account_ids };
}

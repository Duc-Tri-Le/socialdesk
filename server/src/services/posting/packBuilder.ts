import { asc, eq } from "drizzle-orm";
import * as schema from "../../schema";
import type { Db } from "../settings";
import { parseDriveImages } from "../drive";
import {
  hasColorPlaceholder,
  stripColorPlaceholders,
} from "../copywriting";
import {
  loadJoinContext,
  membershipStatusOf,
  postingJoinedIdentities,
} from "../groups";
import { deriveProfileUrl } from "../../types";
import type {
  DraftRow,
  PackTargets,
  PackTargetsInput,
  BuildPackResult,
} from "./postingTypes";

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
        ? v.filter(
            (x): x is number =>
              typeof x === "number" && Number.isInteger(x) && x > 0,
          )
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

// Sinh text gói đăng cho một bản nháp
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
  const groupIds = args.group_ids ?? [];
  const pageIds = args.page_ids ?? [];
  const igIds = args.instagram_account_ids ?? [];

  const allGroups = await db
    .select()
    .from(schema.fbGroups)
    .orderBy(asc(schema.fbGroups.id));
  const chosen = allGroups.filter((g) => groupIds.includes(g.id));
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
    ? allPages.filter((p) => pageIds.includes(p.id))
    : pageIds.length > 0
      ? allPages.filter((p) => pageIds.includes(p.id))
      : postingPages;
  const igAccounts = allAccounts.filter(
    (a) => a.platform === "Instagram" && a.linked === 1,
  );
  const chosenIgAccounts = opts?.explicit
    ? igAccounts.filter((a) => igIds.includes(a.id))
    : igIds.length > 0
      ? igAccounts.filter((a) => igIds.includes(a.id))
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
                    : `Nick “${i.name}”`;
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

// Đích đăng MẶC ĐỊNH dùng khi duyệt bài
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
    .filter(
      (a) => a.platform === "Instagram" && a.linked === 1 && a.selected === 1,
    )
    .map((a) => a.id);
  return { group_ids, page_ids, instagram_account_ids };
}

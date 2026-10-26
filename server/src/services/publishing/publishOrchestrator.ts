import type { Ctx } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import { privileged } from "../../privileged";
import { parseDriveImages } from "../drive";
import {
  findPlaceholders,
  hasColorPlaceholder,
  stripColorPlaceholders,
} from "../copywriting";
import {
  serializePackTargets,
  pruneSupersededPublishRecords,
  parseCliJson,
  isPublishTimeoutMessage,
  normalizeNameKey,
} from "../postingPack";
import type {
  PublishResultItem,
  PublishDraftArgs,
  PublishDraftResponse,
  BrowserQueueItem,
} from "./publishTypes";
import { publishToPages } from "./pagePublisher";
import {
  prepareInstagramQueue,
  dispatchInstagramQueue,
} from "./instagramPublisher";
import {
  prepareGroupQueue,
  prepareAccountQueue,
  dispatchBrowserQueue,
} from "./groupPublisher";

export * from "./publishTypes";
export * from "./publishOutcomeService";

/**
 * Xử lý toàn bộ quy trình đăng bài:
 * 1. Kiểm tra tính hợp lệ & caption của bản nháp
 * 2. Lưu bộ đích đăng đã chọn
 * 3. Chuẩn bị file media local cho Page/Instagram
 * 4. Đăng Page qua API Facebook
 * 5. Chuẩn bị hàng đợi Instagram & Group
 * 6. Kích hoạt Extension Chrome hoặc WebSocket cho Browser Queue
 * 7. Kích hoạt tác vụ agent nền cho Instagram Queue
 */
export async function executePublishDraft(
  ctx: Ctx,
  args: PublishDraftArgs,
): Promise<PublishDraftResponse> {
  const db = ctx.db<typeof schema>();
  const results: PublishResultItem[] = [];

  const [row] = await db
    .select()
    .from(schema.drafts)
    .where(eq(schema.drafts.id, args.id));

  if (!row) {
    return { ok: false, message: "Không tìm thấy bản nháp.", results };
  }
  if (row.status !== "approved" && row.status !== "packed") {
    return {
      ok: false,
      message: "Bài chưa được duyệt — duyệt bài trước khi đăng Bài.",
      results,
    };
  }

  const caption = hasColorPlaceholder(row.caption)
    ? stripColorPlaceholders(row.caption, row.color)
    : row.caption;
  const missing = findPlaceholders(caption);
  if (missing.length > 0) {
    return {
      ok: false,
      message: "Chưa đăng được — bài còn mục chưa điền: " + missing.join(", "),
      results,
    };
  }

  const accountIds = args.account_ids ?? [];
  if (
    args.page_ids.length === 0 &&
    args.instagram_account_ids.length === 0 &&
    args.group_ids.length === 0 &&
    accountIds.length === 0
  ) {
    return {
      ok: false,
      message:
        "Chưa chọn đích đăng nào — mở “Chọn đích đăng” và chọn ít nhất một fanpage, tài khoản Instagram, nhóm đích hoặc tài khoản chính.",
      results,
    };
  }

  await db
    .update(schema.drafts)
    .set({
      packTargets: serializePackTargets({
        group_ids: args.group_ids,
        page_ids: args.page_ids,
        instagram_account_ids: args.instagram_account_ids,
        account_ids: accountIds,
      }),
    })
    .where(eq(schema.drafts.id, args.id));

  const prior = await db
    .select()
    .from(schema.publishRecords)
    .where(eq(schema.publishRecords.draftId, row.id));

  const alreadyPublished = (kind: string, name: string): boolean =>
    prior.some(
      (p) =>
        p.targetKind === kind &&
        normalizeNameKey(p.targetName) === normalizeNameKey(name) &&
        p.status === "published",
    );

  const alreadyQueued = (kind: string, name: string): boolean =>
    prior.some(
      (p) =>
        p.targetKind === kind &&
        normalizeNameKey(p.targetName) === normalizeNameKey(name) &&
        p.status === "queued",
    );

  const alreadyUncertain = (kind: string, name: string): boolean =>
    prior.some(
      (p) =>
        p.targetKind === kind &&
        normalizeNameKey(p.targetName) === normalizeNameKey(name) &&
        (p.status === "uncertain" ||
          (p.status === "failed" && isPublishTimeoutMessage(p.message))),
    );

  const record = async (r: PublishResultItem): Promise<number> => {
    results.push(r);
    const [ins] = await db
      .insert(schema.publishRecords)
      .values({
        draftId: row.id,
        targetKind: r.kind,
        targetName: r.name,
        status: r.status,
        postUrl: r.post_url,
        message: r.message,
      })
      .returning({ id: schema.publishRecords.id });
    const newId = ins?.id ?? 0;
    await pruneSupersededPublishRecords(db, newId);
    return newId;
  };

  const driveImages = parseDriveImages(row.driveImages);
  const needsMedia =
    args.page_ids.length > 0 || args.instagram_account_ids.length > 0;
  let localFiles: string[] = [];
  let mediaNote = "";

  if (needsMedia && driveImages.length > 0) {
    try {
      const prep = await ctx.executePrivileged(
        privileged.preparePublishMedia,
        {
          code: row.code,
          urls: driveImages.map((im) => ({
            url: im.jpeg_url,
            name: im.name,
          })),
        },
      );
      const parsed = parseCliJson(prep.stdout) as {
        files?: Array<{ path?: string; ok?: boolean; error?: string }>;
      } | null;
      const files = parsed?.files ?? [];
      localFiles = files
        .filter((f) => f.ok && typeof f.path === "string" && f.path)
        .map((f) => f.path as string);
      const failedCount = files.length - localFiles.length;
      if (failedCount > 0)
        mediaNote = ` (${failedCount} ảnh tải về không thành công nên không đính kèm)`;
    } catch (e) {
      mediaNote = ` (không tải được ảnh đính kèm: ${e instanceof Error ? e.message.slice(0, 160) : "lỗi không rõ"})`;
    }
  }

  const helpers = { alreadyPublished, alreadyQueued, alreadyUncertain, record };

  const browserQueue: BrowserQueueItem[] = [];

  // 1. Fanpages
  const pageBrowserQueue = await publishToPages(
    ctx,
    db,
    args.page_ids,
    caption,
    localFiles,
    mediaNote,
    helpers,
  );
  browserQueue.push(...pageBrowserQueue);

  // 2. Instagram Queue (hỗ trợ đẩy vào browserQueue nếu không có Hatch CLI / localFiles)
  const igQueue = await prepareInstagramQueue(
    ctx,
    db,
    args.instagram_account_ids,
    caption,
    localFiles,
    driveImages.length,
    mediaNote,
    helpers,
    browserQueue,
  );

  // 3. Groups Queue
  const groupBrowserQueue = await prepareGroupQueue(
    db,
    args.group_ids,
    helpers,
  );
  browserQueue.push(...groupBrowserQueue);

  // 4. Personal Facebook Account Queue
  const accountBrowserQueue = await prepareAccountQueue(
    db,
    accountIds,
    helpers,
  );
  browserQueue.push(...accountBrowserQueue);

  // 5. Kích hoạt Browser Queue trên Chrome Extension
  await dispatchBrowserQueue(
    db,
    row,
    caption,
    driveImages,
    browserQueue,
    results,
  );

  // 6. Kích hoạt Instagram Queue (qua CLI nền nếu có)
  await dispatchInstagramQueue(ctx, db, row, caption, igQueue, results);

  const publishedCount = results.filter((r) => r.status === "published").length;
  const queuedCount = results.filter((r) => r.status === "queued").length;
  ctx.invalidateQueries();

  return {
    ok: results.length > 0,
    message:
      publishedCount > 0 && queuedCount > 0
        ? `Đã đăng thành công ${publishedCount} đích; ${queuedCount} đích đang được xử lý đăng như khi bạn nhắn trực tiếp trong chat — kết quả cập nhật ở Lịch sử đăng Bài. Đích đăng bằng trình duyệt: nếu cửa sổ trình duyệt Muse chưa đăng nhập Facebook, đích đó sẽ hiện trạng thái “Chờ đăng nhập” — đăng nhập 1 lần trong cửa sổ đó rồi bấm Đăng Bài lại.`
        : publishedCount > 0
          ? `Đã đăng thành công ${publishedCount}/${results.length} đích. Chi tiết từng đích ở dưới.`
          : queuedCount > 0
            ? `${queuedCount} đích đang được xử lý đăng như khi bạn nhắn trực tiếp trong chat — kết quả và link bài sẽ cập nhật ở Lịch sử đăng Bài, không cần nhắn lại. Đích đăng bằng trình duyệt: nếu cửa sổ trình duyệt Muse chưa đăng nhập Facebook, đích đó sẽ hiện trạng thái “Chờ đăng nhập” — đăng nhập 1 lần trong cửa sổ đó rồi bấm Đăng Bài lại.`
            : "Chưa đăng thành công đích nào — xem lý do của từng đích ở dưới.",
    results,
  };
}

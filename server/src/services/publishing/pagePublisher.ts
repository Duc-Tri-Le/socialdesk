import type { Ctx } from "@hatch/space-sdk";
import * as schema from "../../schema";
import type { Db } from "../settings";
import { privileged } from "../../privileged";
import {
  parseFbPages,
  cliErrorText,
  parseCliJson,
  extractPostRef,
  normalizeNameKey,
  FB_PAGE_CAPTION_LIMIT,
  type FbPageRef,
} from "../postingPack";
import type {
  BrowserQueueItem,
  PublishResultItem,
} from "./publishTypes";

export async function publishToPages(
  ctx: Ctx,
  db: Db,
  pageIds: number[],
  caption: string,
  localFiles: string[],
  mediaNote: string,
  helpers: {
    alreadyPublished: (kind: string, name: string) => boolean;
    alreadyQueued: (kind: string, name: string) => boolean;
    record: (r: PublishResultItem) => Promise<number>;
  },
): Promise<BrowserQueueItem[]> {
  const browserQueue: BrowserQueueItem[] = [];
  if (pageIds.length === 0) return browserQueue;

  const allPages = await db.select().from(schema.fbPages);
  const chosenPages = allPages.filter((p) => pageIds.includes(p.id));
  let fbPages: FbPageRef[] | null = null;
  let fbPagesError = "";

  if (chosenPages.length > 0) {
    try {
      const res = await ctx.executePrivileged(privileged.listFbPages, {});
      if (res.ok) fbPages = parseFbPages(res.stdout);
      else fbPagesError = cliErrorText(res);
    } catch (e) {
      fbPagesError = e instanceof Error ? e.message : String(e);
    }
  }

  for (const p of chosenPages) {
    const label = `Page “${p.name}”`;
    if (helpers.alreadyPublished("page", p.name)) {
      await helpers.record({
        kind: "page",
        name: p.name,
        status: "skipped",
        message: `${label} đã đăng thành công ở lần trước — bỏ qua để không đăng trùng.`,
        post_url: "",
      });
      continue;
    }
    if (helpers.alreadyQueued("page", p.name)) {
      await helpers.record({
        kind: "page",
        name: p.name,
        status: "skipped",
        message: `${label} đang được xử lý đăng bằng trình duyệt từ lần bấm trước — không tạo thêm yêu cầu trùng, chờ kết quả cập nhật ở Lịch sử đăng Bài.`,
        post_url: "",
      });
      continue;
    }
    if (caption.length > FB_PAGE_CAPTION_LIMIT) {
      const recordId = await helpers.record({
        kind: "page",
        name: p.name,
        status: "queued",
        message: `${label}: caption dài ${caption.length} ký tự, vượt giới hạn ${FB_PAGE_CAPTION_LIMIT} ký tự của API đăng Page nên không đăng qua API được — đang xử lý đăng bằng trình duyệt Muse như khi bạn nhắn trực tiếp trong chat. Nếu cửa sổ trình duyệt đó chưa đăng nhập Facebook, bài sẽ chuyển sang trạng thái “Chờ đăng nhập”: bạn đăng nhập 1 lần ngay trong cửa sổ trình duyệt Muse đó (phiên được lưu cho lần sau) rồi bấm Đăng Bài lại. Kết quả và link bài sẽ cập nhật ngay tại đây.`,
        post_url: "",
      });
      browserQueue.push({
        recordId,
        kind: "page",
        name: p.name,
        url: p.url,
        via: [`Page “${p.name}”`],
        note: `caption dài ${caption.length} ký tự (vượt giới hạn API Page) — đăng bằng trình duyệt`,
      });
      continue;
    }
    if (!fbPages) {
      await helpers.record({
        kind: "page",
        name: p.name,
        status: "failed",
        message: `${label}: không đọc được danh sách Page từ Facebook${fbPagesError ? ` — ${fbPagesError}` : ""}. Kiểm tra kết nối Facebook rồi thử lại.`,
        post_url: "",
      });
      continue;
    }
    const match = fbPages.find(
      (fp) => normalizeNameKey(fp.name) === normalizeNameKey(p.name),
    );
    if (!match) {
      await helpers.record({
        kind: "page",
        name: p.name,
        status: "failed",
        message: `${label}: không thấy Page này trong các Page tài khoản Facebook đã liên kết đang quản trị — kiểm tra lại tên Page ở mục Tài khoản.`,
        post_url: "",
      });
      continue;
    }
    try {
      const res = await ctx.executePrivileged(privileged.publishFbPagePost, {
        pageId: match.page_id,
        text: caption,
        files: localFiles,
      });
      const ref = extractPostRef(parseCliJson(res.stdout));
      if (res.ok && ref.state !== "scheduled") {
        await helpers.record({
          kind: "page",
          name: p.name,
          status: "published",
          message: `${label}: đã đăng thật${localFiles.length > 0 ? ` kèm ${localFiles.length} ảnh` : " (bài chữ, không đính ảnh)"}${mediaNote}.`,
          post_url: ref.url,
        });
      } else if (res.ok && ref.state === "scheduled") {
        await helpers.record({
          kind: "page",
          name: p.name,
          status: "published",
          message: `${label}: bài đã lên lịch đăng trên Page${mediaNote}.`,
          post_url: ref.url,
        });
      } else {
        await helpers.record({
          kind: "page",
          name: p.name,
          status: "failed",
          message: `${label}: đăng không thành công — ${cliErrorText(res) || "Facebook không trả lý do"}. Nếu chưa chắc bài đã lên hay chưa, kiểm tra Page trước khi bấm đăng lại.`,
          post_url: ref.url,
        });
      }
    } catch (e) {
      await helpers.record({
        kind: "page",
        name: p.name,
        status: "failed",
        message: `${label}: lỗi khi gọi đăng bài — ${e instanceof Error ? e.message.slice(0, 300) : "không rõ"}. Kiểm tra Page trước khi bấm đăng lại để tránh trùng.`,
        post_url: "",
      });
    }
  }

  return browserQueue;
}

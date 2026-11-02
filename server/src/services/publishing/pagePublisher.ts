import type { Ctx } from "@hatch/space-sdk";
import * as schema from "../../schema";
import type { Db } from "../settings";
import {
  publishToFacebookPage,
} from "./facebookGraphApi";
import type {
  BrowserQueueItem,
  PublishResultItem,
} from "./publishTypes";

export async function publishToPages(
  _ctx: Ctx,
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
  imageUrls: string[] = [],
): Promise<BrowserQueueItem[]> {
  const browserQueue: BrowserQueueItem[] = [];
  if (pageIds.length === 0) return browserQueue;

  const allPages = await db.select().from(schema.fbPages);
  const chosenPages = allPages.filter((p) => pageIds.includes(p.id));

  // Lấy danh sách tài khoản Facebook để lấy token cha (fallback nếu page chưa có token riêng)
  const allAccounts = await db.select().from(schema.accounts);
  const accountById = new Map(allAccounts.map((a) => [a.id, a]));

  for (const p of chosenPages) {
    const label = `Page “${p.name}”`;

    // 1. Kiểm tra đã đăng thành công trước đó chưa
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
        message: `${label} đang được xử lý đăng từ lần trước — chờ kết quả.`,
        post_url: "",
      });
      continue;
    }

    // 2. Xác định Page ID và Page Access Token
    let pageId = (p.fbPageId || "").trim();
    let accessToken = (p.accessToken || "").trim();

    // Nếu chưa có pageId, thử trích xuất từ URL nếu URL dạng facebook.com/{id}
    if (!pageId && p.url) {
      const match = p.url.match(/facebook\.com\/(?:pages\/[^/]+\/)?([0-9]+)/i);
      if (match && match[1]) pageId = match[1];
    }

    // Nếu page chưa có accessToken riêng, thử lấy token từ tài khoản Facebook cha
    if (!accessToken && p.accountId) {
      const parentAcc = accountById.get(p.accountId);
      if (parentAcc && parentAcc.accessToken) {
        accessToken = parentAcc.accessToken.trim();
      }
    }

    if (!pageId || !accessToken) {
      await helpers.record({
        kind: "page",
        name: p.name,
        status: "failed",
        message: `${label}: Chưa có cấu hình Facebook Graph API (thiếu ${!pageId ? "Page ID" : ""} ${!pageId && !accessToken ? "và " : ""}${!accessToken ? "Access Token" : ""}). Vui lòng vào mục "Tài khoản" để bấm "Kết nối Facebook" hoặc điền Access Token.`,
        post_url: "",
      });
      continue;
    }

    // 3. Đăng bài trực tiếp bằng Facebook Graph API
    try {
      const res = await publishToFacebookPage({
        pageId,
        accessToken,
        message: caption,
        localFiles,
        imageUrls,
      });

      if (res.ok && res.postId) {
        await helpers.record({
          kind: "page",
          name: p.name,
          status: "published",
          message: `${label}: Đã đăng thành công qua Facebook Graph API${localFiles.length > 0 || imageUrls.length > 0 ? ` kèm ảnh` : " (bài chữ)"}${mediaNote}.`,
          post_url: res.postUrl || `https://www.facebook.com/${res.postId}`,
        });
      } else {
        await helpers.record({
          kind: "page",
          name: p.name,
          status: "failed",
          message: `${label}: Lỗi Facebook Graph API: ${res.error || "Không thể đăng bài"}`,
          post_url: "",
        });
      }
    } catch (err: any) {
      await helpers.record({
        kind: "page",
        name: p.name,
        status: "failed",
        message: `${label}: Lỗi ngoại lệ khi gọi Facebook Graph API: ${err?.message || String(err)}`,
        post_url: "",
      });
    }
  }

  // Fanpage chỉ đăng qua API, không đưa vào browserQueue (Extension)
  return browserQueue;
}

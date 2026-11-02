import type { Ctx } from "@hatch/space-sdk";
import * as schema from "../../schema";
import type { Db } from "../settings";
import { IG_CAPTION_LIMIT } from "../postingPack";
import { publishToInstagramGraph } from "./instagramGraphApi";
import type {
  IgQueueItem,
  PublishResultItem,
  BrowserQueueItem,
} from "./publishTypes";

export async function prepareInstagramQueue(
  _ctx: Ctx,
  db: Db,
  accountIds: number[],
  caption: string,
  _localFiles: string[],
  driveImagesCount: number,
  _mediaNote: string,
  helpers: {
    alreadyPublished: (kind: string, name: string) => boolean;
    alreadyQueued: (kind: string, name: string) => boolean;
    alreadyUncertain: (kind: string, name: string) => boolean;
    record: (r: PublishResultItem) => Promise<number>;
  },
  _browserQueue?: BrowserQueueItem[],
  imageUrls: string[] = [],
): Promise<IgQueueItem[]> {
  const igQueue: IgQueueItem[] = [];
  if (accountIds.length === 0) return igQueue;

  const allAccounts = await db.select().from(schema.accounts);
  const chosenIg = allAccounts.filter(
    (a) =>
      a.platform === "Instagram" &&
      a.linked === 1 &&
      accountIds.includes(a.id),
  );

  for (const a of chosenIg) {
    const label = `Instagram ${a.name}`;

    if (helpers.alreadyPublished("instagram", a.name)) {
      await helpers.record({
        kind: "instagram",
        name: a.name,
        status: "skipped",
        message: `${label} đã đăng thành công ở lần trước — bỏ qua để không đăng trùng.`,
        post_url: "",
      });
      continue;
    }

    if (helpers.alreadyQueued("instagram", a.name)) {
      await helpers.record({
        kind: "instagram",
        name: a.name,
        status: "skipped",
        message: `${label} đang được xử lý đăng từ lần trước — chờ kết quả.`,
        post_url: "",
      });
      continue;
    }

    if (caption.length > IG_CAPTION_LIMIT) {
      await helpers.record({
        kind: "instagram",
        name: a.name,
        status: "failed",
        message: `${label}: caption dài ${caption.length} ký tự, vượt giới hạn ${IG_CAPTION_LIMIT} ký tự của Instagram — chưa đăng được.`,
        post_url: "",
      });
      continue;
    }

    if (driveImagesCount === 0 && imageUrls.length === 0) {
      await helpers.record({
        kind: "instagram",
        name: a.name,
        status: "failed",
        message: `${label}: bài chưa có ảnh nào đã chốt — Instagram chỉ đăng được bài có ảnh/video. Gắn ảnh vào bài ở khâu soạn rồi đăng lại.`,
        post_url: "",
      });
      continue;
    }

    const igId = (a.igBusinessAccountId || "").trim();
    const token = (a.accessToken || "").trim();

    if (!igId || !token) {
      await helpers.record({
        kind: "instagram",
        name: a.name,
        status: "failed",
        message: `${label}: Chưa có cấu hình Instagram Graph API (thiếu ${!igId ? "Instagram Business Account ID" : ""} ${!igId && !token ? "và " : ""}${!token ? "Access Token" : ""}). Vui lòng vào mục "Tài khoản" để kết nối Facebook hoặc nhập Access Token.`,
        post_url: "",
      });
      continue;
    }

    // Đăng bài trực tiếp bằng Instagram Graph API
    try {
      const res = await publishToInstagramGraph({
        igBusinessAccountId: igId,
        accessToken: token,
        caption,
        imageUrls,
      });

      if (res.ok && res.mediaId) {
        await helpers.record({
          kind: "instagram",
          name: a.name,
          status: "published",
          message: `${label}: Đã đăng thành công lên Instagram qua Graph API!`,
          post_url: res.postUrl || `https://www.instagram.com/p/${res.mediaId}`,
        });
      } else {
        await helpers.record({
          kind: "instagram",
          name: a.name,
          status: "failed",
          message: `${label}: Lỗi Instagram Graph API: ${res.error || "Không thể đăng bài"}`,
          post_url: "",
        });
      }
    } catch (err: any) {
      await helpers.record({
        kind: "instagram",
        name: a.name,
        status: "failed",
        message: `${label}: Lỗi ngoại lệ khi gọi Instagram Graph API: ${err?.message || String(err)}`,
        post_url: "",
      });
    }
  }

  // Instagram đăng trực tiếp qua API, không cần queue nền
  return igQueue;
}

export async function dispatchInstagramQueue(
  _ctx: Ctx,
  _db: Db,
  _row: { id: number; productName: string; code: string },
  _caption: string,
  _igQueue: IgQueueItem[],
  _results: PublishResultItem[],
): Promise<void> {
  // Giữ lại hàm rỗng để tương thích ngược nếu có module khác gọi
}

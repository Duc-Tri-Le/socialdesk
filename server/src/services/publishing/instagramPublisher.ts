import type { Ctx } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import type { Db } from "../settings";
import { privileged } from "../../privileged";
import {
  parseIgAccounts,
  igUsernameOf,
  cliErrorText,
  IG_CAPTION_LIMIT,
  type IgAccountRef,
} from "../postingPack";
import type {
  IgQueueItem,
  PublishResultItem,
  BrowserQueueItem,
} from "./publishTypes";

export async function prepareInstagramQueue(
  ctx: Ctx,
  db: Db,
  accountIds: number[],
  caption: string,
  localFiles: string[],
  driveImagesCount: number,
  _mediaNote: string,
  helpers: {
    alreadyPublished: (kind: string, name: string) => boolean;
    alreadyQueued: (kind: string, name: string) => boolean;
    alreadyUncertain: (kind: string, name: string) => boolean;
    record: (r: PublishResultItem) => Promise<number>;
  },
  browserQueue?: BrowserQueueItem[],
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
  let igRefs: IgAccountRef[] | null = null;
  let igError = "";

  if (chosenIg.length > 0) {
    try {
      const res = await ctx.executePrivileged(privileged.listIgAccounts, {});
      if (res.ok) igRefs = parseIgAccounts(res.stdout);
      else igError = cliErrorText(res);
    } catch (e) {
      igError = e instanceof Error ? e.message : String(e);
    }
  }

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
        message: `${label} đang được xử lý đăng ở chế độ nền từ lần bấm trước — không tạo thêm yêu cầu trùng, chờ kết quả cập nhật ở Lịch sử đăng Bài.`,
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
    if (driveImagesCount === 0) {
      await helpers.record({
        kind: "instagram",
        name: a.name,
        status: "failed",
        message: `${label}: bài chưa có ảnh nào đã chốt — Instagram chỉ đăng được bài có ảnh/video. Gắn ảnh vào bài ở khâu soạn rồi đăng lại.`,
        post_url: "",
      });
      continue;
    }
    if (!igRefs || localFiles.length === 0) {
      if (browserQueue) {
        const recordId = await helpers.record({
          kind: "instagram",
          name: a.name,
          status: "queued",
          message: `${label}: đã tiếp nhận — đang mở Instagram trên Chrome để tự động đăng bài...`,
          post_url: "",
        });
        browserQueue.push({
          recordId,
          kind: "instagram",
          name: a.name,
          url: a.profileUrl || "https://www.instagram.com/",
          via: [`Instagram “${a.name}”`],
          note: "đăng qua Chrome Extension",
        });
        continue;
      }
      await helpers.record({
        kind: "instagram",
        name: a.name,
        status: "failed",
        message: `${label}: không đọc được danh sách tài khoản Instagram đã liên kết${igError ? ` — ${igError}` : ""}. Kiểm tra kết nối Instagram rồi thử lại.`,
        post_url: "",
      });
      continue;
    }
    const username = igUsernameOf(a);
    const match =
      igRefs.find((r) => username && r.username.toLowerCase() === username) ??
      (igRefs.length === 1 && chosenIg.length === 1 ? igRefs[0] : undefined);
    if (!match) {
      if (browserQueue) {
        const recordId = await helpers.record({
          kind: "instagram",
          name: a.name,
          status: "queued",
          message: `${label}: đã tiếp nhận — đang mở Instagram trên Chrome để tự động đăng bài...`,
          post_url: "",
        });
        browserQueue.push({
          recordId,
          kind: "instagram",
          name: a.name,
          url: a.profileUrl || "https://www.instagram.com/",
          via: [`Instagram “${a.name}”`],
          note: "đăng qua Chrome Extension",
        });
        continue;
      }
      await helpers.record({
        kind: "instagram",
        name: a.name,
        status: "failed",
        message: `${label}: không khớp được với tài khoản Instagram đã liên kết${username ? ` (@${username})` : ""} — kiểm tra lại handle/link ở mục Tài khoản.`,
        post_url: "",
      });
      continue;
    }
    const hadUncertain = helpers.alreadyUncertain("instagram", a.name);
    const recordId = await helpers.record({
      kind: "instagram",
      name: a.name,
      status: "queued",
      message: hadUncertain
        ? `${label}: lượt đăng trước bị ngắt giữa chừng nên chưa rõ bài đã lên Instagram hay chưa — lượt này đang xử lý đăng ở chế độ nền và sẽ KIỂM TRA BÀI TRÙNG trên Instagram trước, thấy bài đã lên thì ghi nhận link bài đó thay vì đăng thêm bài mới. Kết quả cập nhật ngay tại đây.`
        : `${label}: đã tiếp nhận — đang xử lý đăng ở chế độ nền (đăng Instagram cần tải ảnh lên, lâu hơn một lượt bấm nên không chạy ngay trong lượt này). Kết quả và link bài sẽ cập nhật ngay tại đây.`,
      post_url: "",
    });
    igQueue.push({
      recordId,
      name: a.name,
      accountId: match.user_fbid,
      username: match.username,
      files: [...localFiles],
      hadUncertain,
    });
  }

  return igQueue;
}

export async function dispatchInstagramQueue(
  ctx: Ctx,
  db: Db,
  row: { id: number; productName: string; code: string },
  caption: string,
  igQueue: IgQueueItem[],
  results: PublishResultItem[],
): Promise<void> {
  if (igQueue.length === 0) return;

  const targetBlocks = igQueue
    .map((t, i) => {
      const fileLines = t.files.map((f) => `   - ${f}`).join("\n");
      return [
        `${i + 1}. Tài khoản “${t.name}” (@${t.username}) — account-id: ${t.accountId}`,
        `   File ảnh local theo đúng thứ tự đăng:\n${fileLines}`,
        t.hadUncertain
          ? "   ⚠ Lượt đăng trước của tài khoản này bị ngắt giữa chừng vì quá thời gian chờ — CHƯA RÕ bài đã lên hay chưa, nên bước kiểm tra trùng là BẮT BUỘC trước khi đăng."
          : "   Lượt đăng mới — vẫn kiểm tra trùng nhanh ở bước 1 để tránh đăng hai bài giống hệt.",
      ].join("\n");
    })
    .join("\n");

  const igTaskMessage = [
    `Người dùng vừa bấm nút “Đăng Bài” trong app Social Desk và ĐÃ XÁC NHẬN đăng công khai bài này lên Instagram — xử lý đúng như khi người dùng nhắn trực tiếp nhờ bạn đăng bằng công cụ Instagram đã liên kết, KHÔNG cần hỏi lại người dùng.`,
    `Bài: ${row.productName} (mã ${row.code}, draft_id = ${row.id}).`,
    `Các tài khoản Instagram cần đăng (xử lý lần lượt từng tài khoản):\n${targetBlocks}`,
    `Cách xử lý TỪNG tài khoản:\n1) KIỂM TRA TRÙNG TRƯỚC: chạy /opt/hatch/bin/instagram-cli posts --account-id <account-id> --limit 10 để đọc các bài gần nhất của chính tài khoản đó. Nếu thấy một bài có caption trùng với caption nguyên văn bên dưới (so khớp phần đầu caption, chấp nhận khác biệt khoảng trắng/xuống dòng) thì KHÔNG đăng thêm bài mới — ghi outcome "published" kèm post_url là link của bài đã có đó.\n2) Chưa có bài trùng: đăng bằng /opt/hatch/bin/instagram-cli post-feed --account-id <account-id>, tiếp theo là --file cho từng file ảnh theo đúng thứ tự đã liệt kê, và --caption là caption nguyên văn bên dưới (giữ nguyên văn, không sửa, không thêm bớt chữ; KHÔNG truyền --retries vì đăng lại có thể nhân đôi bài). Đọc output của lệnh để lấy link bài thật khi đăng thành công.\n3) Phân loại kết quả THẬT: lệnh báo lỗi rõ ràng TRƯỚC khi đăng (sai tài khoản, file lỗi, Instagram từ chối…) → "failed" kèm lý do thật. Lệnh bị ngắt/timeout/kết nối đứt GIỮA CHỪNG khiến không rõ bài đã lên hay chưa → "uncertain" kèm giải thích — tuyệt đối KHÔNG ghi "failed" cho trường hợp này và KHÔNG tự chạy lại lệnh đăng lần hai.`,
    `Sau khi xử lý xong TỪNG tài khoản — đăng thành công, lỗi hay chưa xác định — gọi action reportInstagramPublish của artifact social-desk với draft_id = ${row.id} và outcomes gồm name đúng tên tài khoản ở trên, status ("published" / "failed" / "uncertain"), post_url là LINK BÀI THẬT (chỉ ghi khi thật sự có link: lấy từ output của lệnh đăng hoặc từ bài trùng tìm được ở bước 1 — tuyệt đối không bịa link), message là tóm tắt kết quả thật bằng tiếng Việt. Phải gọi action này cho MỌI tài khoản trong danh sách, kể cả khi đăng lỗi, để app cập nhật Lịch sử đăng Bài cho người dùng.`,
    `Caption nguyên văn đã duyệt:\n"""\n${caption}\n"""`,
  ].join("\n\n");

  const markIgSpawnFailed = async (reason: string): Promise<void> => {
    for (const t of igQueue) {
      await db
        .update(schema.publishRecords)
        .set({
          status: "failed",
          message: `Instagram ${t.name}: không khởi động được khâu xử lý đăng ở chế độ nền (${reason}) — bấm Đăng Bài lại để thử lại.`,
        })
        .where(eq(schema.publishRecords.id, t.recordId));
      const item = results.find(
        (r) =>
          r.kind === "instagram" &&
          r.name === t.name &&
          r.status === "queued",
      );
      if (item) {
        item.status = "failed";
        item.message = `Instagram ${t.name}: không khởi động được khâu xử lý đăng ở chế độ nền — bấm Đăng Bài lại để thử lại.`;
      }
    }
  };

  try {
    const res = await ctx.agent.spawnTask(igTaskMessage, {
      expectsAction: "reportInstagramPublish",
      dedupeKey: `ig-publish-${row.id}-${igQueue.map((t) => t.recordId).join("-")}`,
    });
    if (!res.ok) await markIgSpawnFailed(res.error);
  } catch (e) {
    await markIgSpawnFailed(
      (e instanceof Error ? e.message : String(e)).slice(0, 200),
    );
  }
}

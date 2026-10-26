import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import type { Db } from "../settings";
import {
  loadJoinContext,
  postingJoinedIdentities,
} from "../groups";
import {
  prepareDriveImagesAsDataUrls,
  type DriveImage,
} from "../drive";
import type {
  BrowserQueueItem,
  PublishResultItem,
} from "./publishTypes";

export async function prepareGroupQueue(
  db: Db,
  groupIds: number[],
  helpers: {
    alreadyPublished: (kind: string, name: string) => boolean;
    alreadyQueued: (kind: string, name: string) => boolean;
    record: (r: PublishResultItem) => Promise<number>;
  },
): Promise<BrowserQueueItem[]> {
  const browserQueue: BrowserQueueItem[] = [];
  if (groupIds.length === 0) return browserQueue;

  const allGroups = await db.select().from(schema.fbGroups);
  const chosenGroups = allGroups.filter((g) => groupIds.includes(g.id));
  const joinCtx = await loadJoinContext(db);

  for (const g of chosenGroups) {
    if (helpers.alreadyPublished("group", g.name)) {
      await helpers.record({
        kind: "group",
        name: g.name,
        status: "skipped",
        message: `Nhóm ${g.name} đã ghi nhận đăng thành công ở lần trước — bỏ qua.`,
        post_url: "",
      });
      continue;
    }
    if (helpers.alreadyQueued("group", g.name)) {
      await helpers.record({
        kind: "group",
        name: g.name,
        status: "skipped",
        message: `Nhóm ${g.name} đang được xử lý đăng từ lần bấm trước — không tạo thêm yêu cầu trùng, chờ kết quả cập nhật ở Lịch sử đăng Bài.`,
        post_url: "",
      });
      continue;
    }
    const viaIdentities = postingJoinedIdentities(joinCtx, g);
    if (viaIdentities.length === 0) {
      await helpers.record({
        kind: "group",
        name: g.name,
        status: "failed",
        message: `Nhóm ${g.name}: chưa có danh tính sẽ đăng nào (tài khoản chính hoặc Page đang chọn đăng) được đánh dấu “Đã tham gia” nhóm này — đánh dấu ở mục Hội nhóm rồi bấm Đăng Bài lại.`,
        post_url: "",
      });
      continue;
    }
    const via = viaIdentities.map((i) =>
      i.kind === "page" ? `Page “${i.name}”` : `nick “${i.name}”`,
    );
    const recordId = await helpers.record({
      kind: "group",
      name: g.name,
      status: "queued",
      message: `Nhóm ${g.name}: đã tiếp nhận — đang xử lý đăng như khi bạn nhắn trực tiếp trong chat (đăng bằng trình duyệt Muse, bằng ${via.join(" / ")}). Nếu cửa sổ trình duyệt Muse chưa đăng nhập Facebook, bài sẽ chuyển sang trạng thái “Chờ đăng nhập”: bạn đăng nhập 1 lần ngay trong cửa sổ đó (phiên được lưu cho lần sau) rồi bấm Đăng Bài lại. Kết quả và link bài sẽ cập nhật ngay tại đây.`,
      post_url: "",
    });
    browserQueue.push({
      recordId,
      kind: "group",
      name: g.name,
      url: g.url,
      via,
      note: "",
    });
  }

  return browserQueue;
}

export async function prepareAccountQueue(
  db: Db,
  accountIds: number[],
  helpers: {
    alreadyPublished: (kind: string, name: string) => boolean;
    alreadyQueued: (kind: string, name: string) => boolean;
    record: (r: PublishResultItem) => Promise<number>;
  },
): Promise<BrowserQueueItem[]> {
  const browserQueue: BrowserQueueItem[] = [];
  if (accountIds.length === 0) return browserQueue;

  const allAccounts = await db.select().from(schema.accounts);
  const chosenAccounts = allAccounts.filter(
    (a) => a.platform === "Facebook" && accountIds.includes(a.id),
  );

  for (const a of chosenAccounts) {
    const label = `Tài khoản “${a.name}”`;
    if (helpers.alreadyPublished("account", a.name)) {
      await helpers.record({
        kind: "account",
        name: a.name,
        status: "skipped",
        message: `${label} đã đăng thành công ở lần trước — bỏ qua.`,
        post_url: "",
      });
      continue;
    }
    if (helpers.alreadyQueued("account", a.name)) {
      await helpers.record({
        kind: "account",
        name: a.name,
        status: "skipped",
        message: `${label} đang được xử lý đăng từ lần trước — chờ kết quả.`,
        post_url: "",
      });
      continue;
    }
    const recordId = await helpers.record({
      kind: "account",
      name: a.name,
      status: "queued",
      message: `${label}: đã tiếp nhận — đang mở Facebook trên Chrome để tự động đăng lên trang cá nhân...`,
      post_url: "",
    });
    browserQueue.push({
      recordId,
      kind: "account",
      name: a.name,
      url: a.profileUrl || "https://www.facebook.com/",
      via: [`Nick “${a.name}”`],
      note: "đăng trang cá nhân qua Chrome Extension",
    });
  }

  return browserQueue;
}

export async function dispatchBrowserQueue(
  db: Db,
  row: { id: number },
  caption: string,
  driveImages: DriveImage[],
  browserQueue: BrowserQueueItem[],
  results: PublishResultItem[],
): Promise<void> {
  if (browserQueue.length === 0) return;

  const globalAny = globalThis as any;
  const isOnline = globalAny.__socialDeskIsExtensionOnline;
  const sendTask = globalAny.__socialDeskSendExtensionTask;

  const allFbAccounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.platform, "Facebook"));
  const defaultAcc =
    allFbAccounts.find((a) => a.selected === 1) || allFbAccounts[0];

  const allIgAccounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.platform, "Instagram"));

  const finalImages = await prepareDriveImagesAsDataUrls(driveImages);

  for (const t of browserQueue) {
    const kindLabel =
      t.kind === "group"
        ? "Nhóm"
        : t.kind === "page"
          ? "Fanpage"
          : t.kind === "instagram"
            ? "Instagram"
            : "Tài khoản cá nhân";

    let targetAcc = defaultAcc;
    if (t.kind === "instagram") {
      targetAcc =
        allIgAccounts.find(
          (a) => a.name.toLowerCase() === t.name.toLowerCase(),
        ) ||
        allIgAccounts.find((a) => a.selected === 1) ||
        allIgAccounts[0];
    } else if (t.kind === "account") {
      targetAcc =
        allFbAccounts.find(
          (a) => a.name.toLowerCase() === t.name.toLowerCase(),
        ) || defaultAcc;
    }

    const extCode =
      targetAcc?.extensionCode?.trim().toUpperCase() ||
      defaultAcc?.extensionCode?.trim().toUpperCase() ||
      "";

    if (!extCode) {
      const noCodeMsg = `${kindLabel} "${t.name}": Chưa được gán Mã Extension Chrome. Vui lòng vào mục "Tài khoản" để gán mã từ Chrome tương ứng.`;
      await db
        .update(schema.publishRecords)
        .set({ status: "failed", message: noCodeMsg })
        .where(eq(schema.publishRecords.id, t.recordId));
      const item = results.find(
        (r) => r.kind === t.kind && r.name === t.name && r.status === "queued",
      );
      if (item) {
        item.status = "failed";
        item.message = noCodeMsg;
      }
      continue;
    }

    if (typeof isOnline === "function" && !isOnline(extCode)) {
      const offlineMsg = `${kindLabel} "${t.name}": Chrome mang mã [${extCode}] chưa được mở hoặc chưa kết nối Extension. Vui lòng mở cửa sổ Chrome đó lên và thử bấm Đăng Bài lại.`;
      await db
        .update(schema.publishRecords)
        .set({ status: "failed", message: offlineMsg })
        .where(eq(schema.publishRecords.id, t.recordId));
      const item = results.find(
        (r) => r.kind === t.kind && r.name === t.name && r.status === "queued",
      );
      if (item) {
        item.status = "failed";
        item.message = offlineMsg;
      }
      continue;
    }

    if (typeof sendTask === "function") {
      try {
        const destPlatform = t.kind === "instagram" ? "Instagram" : "Facebook";
        await db
          .update(schema.publishRecords)
          .set({
            message: `Đang gửi lệnh tới Chrome [${extCode}] để mở ${destPlatform} và tự động đăng bài vào ${kindLabel} "${t.name}"...`,
          })
          .where(eq(schema.publishRecords.id, t.recordId));

        const defaultUrl =
          t.kind === "instagram"
            ? (targetAcc?.profileUrl || "https://www.instagram.com/")
            : "https://www.facebook.com/";

        const taskPayload = {
          action: "PUBLISH_POST",
          taskId: `task_${Date.now()}_${t.recordId}`,
          draftId: row.id,
          targetKind: t.kind,
          targetName: t.name,
          targetUrl: t.kind === "instagram" ? (targetAcc?.profileUrl || t.url || defaultUrl) : (t.url || defaultUrl),
          profileUrl: targetAcc?.profileUrl || (t.kind === "instagram" ? t.url : "") || "",
          caption,
          images: finalImages,
        };

        sendTask(extCode, taskPayload, 90000)
          .then(async (res: any) => {
            const finalStatus =
              res?.status === "published" ? "published" : "failed";
            const finalMsg =
              res?.message ||
              (finalStatus === "published"
                ? `Đã đăng thành công lên ${destPlatform}`
                : "Đăng bài thất bại");
            await db
              .update(schema.publishRecords)
              .set({
                status: finalStatus,
                postUrl: res?.postUrl || t.url || "",
                message: `${kindLabel} "${t.name}": ${finalMsg}`,
              })
              .where(eq(schema.publishRecords.id, t.recordId));
          })
          .catch(async (taskErr: any) => {
            await db
              .update(schema.publishRecords)
              .set({
                status: "failed",
                message: `${kindLabel} "${t.name}": Lỗi Extension Chrome: ${taskErr?.message || "Không phản hồi"}`,
              })
              .where(eq(schema.publishRecords.id, t.recordId));
          });

        const item = results.find(
          (r) => r.kind === t.kind && r.name === t.name && r.status === "queued",
        );
        if (item) {
          item.message = `Đã kích hoạt Chrome [${extCode}] đăng bài tự động...`;
        }
      } catch (err: any) {
        await db
          .update(schema.publishRecords)
          .set({
            status: "failed",
            message: `${kindLabel} "${t.name}": Lỗi kết nối Chrome: ${err?.message || "Không rõ"}`,
          })
          .where(eq(schema.publishRecords.id, t.recordId));
      }
    }
  }
}

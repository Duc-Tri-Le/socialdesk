import type { Db } from "../settings";
import { updatePublishOutcomeRecord } from "../postingPack";

/**
 * Cập nhật kết quả đăng bài hàng loạt cho một bản nháp (dùng chung cho các webhook/report actions).
 */
export async function updatePublishBatchOutcome(
  db: Db,
  draftId: number,
  outcomes: Array<{
    kind?: "group" | "page" | "instagram" | "account";
    targetKind?: "group" | "page" | "instagram" | "account";
    name?: string;
    group_name?: string;
    status: "published" | "failed" | "needs_login" | "uncertain";
    post_url?: string;
    message?: string;
  }>,
  defaultKind: "group" | "page" | "instagram" | "account" = "group",
): Promise<number> {
  let updated = 0;
  for (const o of outcomes) {
    const kind = o.kind || o.targetKind || defaultKind;
    const name = (o.name || o.group_name || "").trim();
    const kindLabel =
      kind === "group" ? "Nhóm" : kind === "page" ? "Page" : "Instagram";
    const postUrl = (o.post_url ?? "").trim();
    const status = o.status;

    let defaultMsg = `${kindLabel} ${name}: đăng không thành công.`;
    if (status === "published") {
      defaultMsg =
        kind === "group"
          ? `Nhóm ${name}: đã đăng thành công vào nhóm.`
          : `${kindLabel} ${name}: đã đăng thành công.`;
    } else if (status === "needs_login") {
      defaultMsg =
        kind === "group"
          ? `Nhóm ${name}: đang chờ bạn đăng nhập Facebook trong cửa sổ trình duyệt Muse — đăng nhập 1 lần trong cửa sổ đó (phiên được lưu cho lần sau) rồi bấm Đăng Bài lại.`
          : `${kindLabel} ${name}: đang chờ bạn đăng nhập Facebook trong cửa sổ trình duyệt Muse — cửa sổ đó đang mở ở trang đăng nhập; đăng nhập 1 lần bằng tài khoản quản trị Page (phiên được lưu cho mọi lần sau) rồi bấm Đăng Bài lại là đăng tiếp.`;
    } else if (status === "uncertain") {
      defaultMsg = `Instagram ${name}: lượt đăng bị ngắt giữa chừng — chưa xác định được bài đã lên hay chưa, kiểm tra Instagram trước khi bấm đăng lại.`;
    }

    const message = (o.message ?? "").trim() || defaultMsg;

    await updatePublishOutcomeRecord(db, {
      draftId,
      targetKind: kind,
      targetName: name,
      status,
      postUrl,
      message,
    });
    updated += 1;
  }
  return updated;
}

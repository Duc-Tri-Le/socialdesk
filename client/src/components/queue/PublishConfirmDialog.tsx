import type { Account, Draft, Group, Page } from "../../types";
import { btnGhost, btnPrimary } from "../../utils/styles";

export interface PublishConfirmDialogProps {
  draft: Draft;
  selectedPageIds: number[];
  selectedIgIds: number[];
  selectedGroupIds: number[];
  allPages: Page[];
  igAccounts: Account[];
  joinedGroups: Group[];
  isPublishPending: boolean;
  onConfirmPublish: () => void;
  onCancel: () => void;
}

export function PublishConfirmDialog({
  draft: d,
  selectedPageIds,
  selectedIgIds,
  selectedGroupIds,
  allPages,
  igAccounts,
  joinedGroups,
  isPublishPending,
  onConfirmPublish,
  onCancel,
}: PublishConfirmDialogProps) {
  const pickedPages = allPages.filter((p) => selectedPageIds.includes(p.id));
  const pickedIg = igAccounts.filter((a) => selectedIgIds.includes(a.id));
  const pickedGroups = joinedGroups.filter((g) => selectedGroupIds.includes(g.id));
  const nothingPicked =
    pickedPages.length === 0 && pickedIg.length === 0 && pickedGroups.length === 0;

  const alreadyOn = (kind: "page" | "instagram" | "group", name: string) =>
    d.publish_records.some(
      (r) =>
        r.target_kind === kind &&
        r.target_name === name &&
        r.status === "published",
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
              <span className="text-[var(--dim)]">
                {" "}
                (caption dài hơn giới hạn API — xử lý đăng bằng trình duyệt như khi bạn nhắn trực tiếp)
              </span>
            )}
            {alreadyOn("page", p.name) && (
              <span className="font-semibold text-[var(--ok)]">
                {" "}
                (đã đăng ở lần trước — sẽ tự bỏ qua)
              </span>
            )}
            {!alreadyOn("page", p.name) &&
              d.publish_records.some(
                (r) =>
                  r.target_kind === "page" &&
                  r.target_name === p.name &&
                  r.status === "queued",
              ) && (
                <span className="font-semibold text-[var(--ok)]">
                  {" "}
                  (đang xử lý đăng — sẽ tự bỏ qua)
                </span>
              )}
            {!alreadyOn("page", p.name) &&
              d.publish_records.some(
                (r) =>
                  r.target_kind === "page" &&
                  r.target_name === p.name &&
                  r.status === "needs_login",
              ) && (
                <span className="font-semibold text-[var(--warn)]">
                  {" "}
                  (lượt trước đang chờ bạn đăng nhập trong cửa sổ trình duyệt Muse — nếu đã đăng nhập ở cửa sổ đó rồi, lượt này đăng tiếp bằng phiên đã lưu)
                </span>
              )}
          </li>
        ))}

        {pickedIg.map((a) => (
          <li key={`ig-${a.id}`}>
            Instagram {a.name} — đăng {d.drive_images.length} ảnh đã chốt (xử lý đăng ở chế độ nền, kết quả hiện ở Lịch sử đăng Bài)
            {alreadyOn("instagram", a.name) && (
              <span className="font-semibold text-[var(--ok)]">
                {" "}
                (đã đăng ở lần trước — sẽ tự bỏ qua)
              </span>
            )}
            {!alreadyOn("instagram", a.name) &&
              d.publish_records.some(
                (r) =>
                  r.target_kind === "instagram" &&
                  r.target_name === a.name &&
                  r.status === "queued",
              ) && (
                <span className="font-semibold text-[var(--ok)]">
                  {" "}
                  (đang xử lý đăng — sẽ tự bỏ qua)
                </span>
              )}
            {!alreadyOn("instagram", a.name) &&
              d.publish_records.some(
                (r) =>
                  r.target_kind === "instagram" &&
                  r.target_name === a.name &&
                  r.status === "uncertain",
              ) && (
                <span className="font-semibold text-[var(--warn)]">
                  {" "}
                  (lượt trước chưa xác định được kết quả — sẽ kiểm tra bài trùng trên Instagram trước khi đăng)
                </span>
              )}
          </li>
        ))}

        {pickedGroups.map((g) => (
          <li key={`gr-${g.id}`}>
            Nhóm {g.name} — khi bấm đăng, hệ thống xử lý đăng vào nhóm như khi bạn nhắn trực tiếp trong chat (Muse mở cửa sổ trình duyệt của nó và đăng bằng phiên Facebook đã lưu trong đó), kết quả hiện ở Lịch sử đăng Bài
            {alreadyOn("group", g.name) && (
              <span className="font-semibold text-[var(--ok)]">
                {" "}
                (đã đăng ở lần trước — sẽ tự bỏ qua)
              </span>
            )}
            {!alreadyOn("group", g.name) &&
              d.publish_records.some(
                (r) =>
                  r.target_kind === "group" &&
                  r.target_name === g.name &&
                  r.status === "queued",
              ) && (
                <span className="font-semibold text-[var(--ok)]">
                  {" "}
                  (đang xử lý đăng — sẽ tự bỏ qua)
                </span>
              )}
            {!alreadyOn("group", g.name) &&
              d.publish_records.some(
                (r) =>
                  r.target_kind === "group" &&
                  r.target_name === g.name &&
                  r.status === "needs_login",
              ) && (
                <span className="font-semibold text-[var(--warn)]">
                  {" "}
                  (lượt trước đang chờ bạn đăng nhập trong cửa sổ trình duyệt Muse — nếu đã đăng nhập ở cửa sổ đó rồi, lượt này đăng tiếp bằng phiên đã lưu)
                </span>
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
          Lưu ý: caption dài {d.caption.length} ký tự — vượt giới hạn 1.024 ký tự của API đăng Fanpage, nên Fanpage sẽ được xử lý đăng bằng trình duyệt như khi bạn nhắn trực tiếp (app không tự cắt nội dung đã duyệt), kết quả hiện ở Lịch sử đăng Bài. Instagram (giới hạn 2.200 ký tự) được xử lý đăng ở chế độ nền qua API, kết quả hiện ở Lịch sử đăng Bài.
        </p>
      )}

      {pickedIg.length > 0 && d.drive_images.length === 0 && (
        <p className="mt-2 text-xs font-medium text-[var(--danger)]">
          Lưu ý: bài chưa có ảnh nào đã chốt — Instagram chỉ đăng được bài có ảnh, đích Instagram sẽ báo lỗi.
        </p>
      )}

      {(pickedGroups.length > 0 ||
        (pickedPages.length > 0 && d.caption.length > 1024)) && (
        <p className="mt-2 text-xs font-medium leading-5 text-[var(--dim)]">
          Đích đăng bằng trình duyệt (nhóm, và fanpage khi caption dài): bấm “Xác nhận đăng Bài” là app xử lý <strong>như khi bạn nhắn trực tiếp trong chat</strong> — Muse mở cửa sổ trình duyệt của nó và đăng bằng phiên Facebook đã lưu trong cửa sổ đó. Nếu cửa sổ đó chưa đăng nhập Facebook, nó sẽ dừng ở trang đăng nhập và bài chuyển sang trạng thái “🔑 Chờ bạn đăng nhập Facebook” (không tính là đăng lỗi): bạn đăng nhập 1 lần ngay trong cửa sổ trình duyệt Muse đó bằng tài khoản quản trị Page — phiên được lưu cho mọi lần sau — rồi bấm “Đăng Bài” lại là đăng tiếp, không cần nhắn lại trong chat. Lưu ý: đăng nhập ở tab Facebook trong Chrome của bạn hoặc trạng thái “Đã liên kết” trong app không thay được phiên của cửa sổ này.
        </p>
      )}

      <p className="mt-2 text-xs text-[var(--dim)]">
        Nội dung đăng là caption nguyên văn đã duyệt, kèm đúng ảnh đã chốt trong bài.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={btnPrimary}
          disabled={nothingPicked || isPublishPending}
          onClick={onConfirmPublish}
        >
          {isPublishPending ? "Đang đăng…" : "Xác nhận đăng Bài"}
        </button>
        <button
          className={btnGhost}
          disabled={isPublishPending}
          onClick={onCancel}
        >
          Hủy
        </button>
      </div>
    </div>
  );
}

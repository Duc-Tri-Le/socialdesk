import type { Account, Draft, Group, Page } from "../../types";
import { btnGhost, btnPrimary } from "../../utils/styles";

export interface PublishConfirmDialogProps {
  draft: Draft;
  selectedPageIds: number[];
  selectedIgIds: number[];
  selectedGroupIds: number[];
  selectedAccountIds?: number[];
  allPages: Page[];
  igAccounts: Account[];
  joinedGroups: Group[];
  mainAccounts?: Account[];
  isPublishPending: boolean;
  onConfirmPublish: () => void;
  onCancel: () => void;
}

export function PublishConfirmDialog({
  draft: d,
  selectedPageIds,
  selectedIgIds,
  selectedGroupIds,
  selectedAccountIds = [],
  allPages,
  igAccounts,
  joinedGroups,
  mainAccounts = [],
  isPublishPending,
  onConfirmPublish,
  onCancel,
}: PublishConfirmDialogProps) {
  const pickedPages = allPages.filter((p) => selectedPageIds.includes(p.id));
  const pickedIg = igAccounts.filter((a) => selectedIgIds.includes(a.id));
  const pickedGroups = joinedGroups.filter((g) => selectedGroupIds.includes(g.id));
  const pickedAccounts = mainAccounts.filter((a) => selectedAccountIds.includes(a.id));
  const nothingPicked =
    pickedPages.length === 0 && pickedIg.length === 0 && pickedGroups.length === 0 && pickedAccounts.length === 0;

  const alreadyOn = (kind: "page" | "instagram" | "group" | "account", name: string) =>
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
      <p className="text-sm font-bold">Đăng Bài ngay — bài sẽ lên công khai đúng các đích đã chọn:</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
        {pickedPages.map((p) => (
          <li key={`pg-${p.id}`}>
            Fanpage “{p.name}” — đăng kèm {d.drive_images.length} ảnh đã chốt
            {alreadyOn("page", p.name) && (
              <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
            )}
          </li>
        ))}

        {pickedIg.map((a) => (
          <li key={`ig-${a.id}`}>
            Instagram {a.name} — đăng {d.drive_images.length} ảnh đã chốt
            {alreadyOn("instagram", a.name) && (
              <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
            )}
          </li>
        ))}

        {pickedGroups.map((g) => (
          <li key={`gr-${g.id}`}>
            Nhóm {g.name} — đăng vào nhóm qua Chrome Extension
            {alreadyOn("group", g.name) && (
              <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
            )}
          </li>
        ))}

        {pickedAccounts.map((a) => (
          <li key={`acc-${a.id}`}>
            Nick cá nhân “{a.name}” — đăng lên trang cá nhân Facebook kèm {d.drive_images.length} ảnh
            {alreadyOn("account", a.name) && (
              <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
            )}
          </li>
        ))}

        {nothingPicked && (
          <li className="text-[var(--danger)]">
            Chưa chọn đích nào — chọn ở “Chọn đích đăng” phía trên trước.
          </li>
        )}
      </ul>

      <p className="mt-2 text-xs text-[var(--dim)]">
        Hệ thống chỉ đăng đúng các đích được chọn ở trên. Đích nào không chọn sẽ KHÔNG đăng.
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

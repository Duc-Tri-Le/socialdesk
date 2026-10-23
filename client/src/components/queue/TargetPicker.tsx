import type { Account, Draft, Group, Page } from "../../types";
import { btnGhost } from "../../utils/styles";

export interface TargetPickerProps {
  draft: Draft;
  isOpen: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  selectedGroupIds: number[];
  selectedPageIds: number[];
  selectedIgIds: number[];
  onApplyTargets: (groupIds: number[], pageIds: number[], igIds: number[]) => void;
  joinedGroups: Group[];
  allPages: Page[];
  igAccounts: Account[];
  mainAccounts: Account[];
  selectedMainCount: number;
  onToggleMainAccount: (id: number, selected: boolean) => void;
  isMainAccountPending: boolean;
  onGoGroups: () => void;
}

export function TargetPicker({
  draft: d,
  isOpen,
  onToggleOpen,
  onClose,
  selectedGroupIds: selected,
  selectedPageIds,
  selectedIgIds,
  onApplyTargets,
  joinedGroups,
  allPages,
  igAccounts,
  mainAccounts,
  selectedMainCount,
  onToggleMainAccount,
  isMainAccountPending,
  onGoGroups,
}: TargetPickerProps) {
  const totalPicked =
    selected.length + selectedPageIds.length + selectedIgIds.length + selectedMainCount;
  const allGroupsPicked =
    joinedGroups.length > 0 && selected.length === joinedGroups.length;

  return (
    <div className="relative">
      <button
        type="button"
        className={`${btnGhost} flex w-full flex-wrap items-center justify-between gap-2 text-left`}
        aria-expanded={isOpen}
        aria-label={`Chọn đích đăng cho ${d.product_name} — đã chọn ${selected.length} nhóm đích, ${selectedPageIds.length} fanpage, ${selectedIgIds.length} tài khoản Instagram, ${selectedMainCount} tài khoản chính thức`}
        onClick={onToggleOpen}
      >
        <span className="font-semibold">Chọn đích đăng</span>
        <span className="text-xs font-medium text-[var(--dim)]">
          Đã chọn: {selected.length} nhóm đích · {selectedPageIds.length} fanpage · {selectedIgIds.length} tài khoản Instagram · {selectedMainCount} tài khoản chính thức (tổng {totalPicked} đích) {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen && (
        <div
          role="group"
          aria-label={`Danh sách đích đăng cho ${d.product_name}`}
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] space-y-4 overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">Danh sách đích đăng</p>
            <button
              type="button"
              className={btnGhost}
              aria-label={`Đóng danh sách đích đăng của ${d.product_name}`}
              onClick={onClose}
            >
              Đóng
            </button>
          </div>

          {/* Nhóm đích */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Nhóm đích — đã chọn {selected.length}/{joinedGroups.length} nhóm
              </p>
              {joinedGroups.length > 0 && (
                <button
                  type="button"
                  className={btnGhost}
                  disabled={allGroupsPicked}
                  aria-label={`Chọn tất cả nhóm đích cho ${d.product_name}`}
                  onClick={() =>
                    onApplyTargets(
                      joinedGroups.map((g) => g.id),
                      selectedPageIds,
                      selectedIgIds,
                    )
                  }
                >
                  Chọn tất cả nhóm đích
                </button>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--dim)]">
              Chỉ đăng bằng danh tính đã tham gia nhóm đó — trạng thái của tài khoản chính và từng Page tính riêng.
            </p>
            {joinedGroups.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--danger)]">
                Chưa có nhóm nào có tài khoản chính hoặc Page đang chọn đăng được đánh dấu “Đã tham gia”.{" "}
                <button className="underline" onClick={onGoGroups}>
                  Sang mục Hội nhóm để đánh dấu
                </button>{" "}
                — hoặc cứ để trống nhóm rồi bổ sung sau, gói đăng tự cập nhật theo.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {joinedGroups.map((g) => {
                  const on = selected.includes(g.id);
                  const activeMain =
                    mainAccounts.find((a) => a.selected) || mainAccounts[0];
                  const nickLabel = activeMain
                    ? `Nick ${activeMain.name}`
                    : "Nick Facebook";
                  const via = [
                    ...(g.account_joined ? [nickLabel] : []),
                    ...g.joined_pages.map((p) => `Page ${p.name}`),
                  ].join(" · ");
                  return (
                    <button
                      key={g.id}
                      aria-pressed={on}
                      onClick={() =>
                        onApplyTargets(
                          on
                            ? selected.filter((x) => x !== g.id)
                            : [...selected, g.id],
                          selectedPageIds,
                          selectedIgIds,
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        on
                          ? "bg-[var(--text)] text-[var(--bg)]"
                          : "border border-[var(--border)] text-[var(--dim)]"
                      }`}
                    >
                      {g.name} — đăng bằng: {via}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fanpage đích */}
          <div>
            <p className="text-sm font-medium">
              Fanpage đích — đã chọn {selectedPageIds.length}/{allPages.length} fanpage
            </p>
            {allPages.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--dim)]">
                Chưa có Page nào — thêm Page ở mục Tài khoản nếu muốn đăng lên fanpage. Bài vẫn đăng được cho các đích khác.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {allPages.map((p) => {
                  const on = selectedPageIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      aria-pressed={on}
                      onClick={() =>
                        onApplyTargets(
                          selected,
                          on
                            ? selectedPageIds.filter((x) => x !== p.id)
                            : [...selectedPageIds, p.id],
                          selectedIgIds,
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        on
                          ? "bg-[var(--accent)] text-white"
                          : "border border-[var(--border)] text-[var(--dim)]"
                      }`}
                    >
                      Page: {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tài khoản Instagram đích */}
          <div>
            <p className="text-sm font-medium">
              Tài khoản Instagram đích — đã chọn {selectedIgIds.length}/{igAccounts.length} tài khoản
            </p>
            {igAccounts.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--dim)]">
                Chưa có tài khoản Instagram nào đã liên kết — liên kết ở mục Tài khoản nếu muốn đăng lên Instagram. Bài vẫn đăng được cho các đích khác.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {igAccounts.map((a) => {
                  const on = selectedIgIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      aria-pressed={on}
                      onClick={() =>
                        onApplyTargets(
                          selected,
                          selectedPageIds,
                          on
                            ? selectedIgIds.filter((x) => x !== a.id)
                            : [...selectedIgIds, a.id],
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        on
                          ? "bg-[var(--accent)] text-white"
                          : "border border-[var(--border)] text-[var(--dim)]"
                      }`}
                    >
                      Instagram: {a.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nick Facebook đăng bài */}
          <div>
            <p className="text-sm font-medium">
              Nick Facebook đăng bài — đã chọn {selectedMainCount}/{mainAccounts.length} nick
            </p>
            {mainAccounts.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--dim)]">
                Chưa có nick Facebook nào đã liên kết — liên kết ở mục Tài khoản.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {mainAccounts.map((a) => {
                  const on = !!a.selected;
                  return (
                    <button
                      key={a.id}
                      aria-pressed={on}
                      disabled={isMainAccountPending}
                      onClick={() => onToggleMainAccount(a.id, !on)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        on
                          ? "bg-[var(--accent)] text-white"
                          : "border border-[var(--border)] text-[var(--dim)]"
                      }`}
                    >
                      Nick: {a.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

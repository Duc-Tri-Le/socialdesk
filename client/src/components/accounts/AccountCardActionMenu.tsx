import { useState, useRef, useEffect, type ReactNode } from "react";
import type { Account, Page } from "../../types";

export interface AccountCardActionMenuProps {
  account: Account;
  pages: Page[];
  sessionStatus: string;
  onSetSessionStatus?: (args: {
    id: number;
    status: "logged_in" | "expired" | "checkpoint";
  }) => void;
  onLink: (args: { id: number; linked: boolean }) => void;
  onStartEditName: () => void;
  onStartEditUrl: () => void;
  onRequestConfirm: (state: {
    type: "delete" | "unlink";
    title: string;
    message: ReactNode;
  }) => void;
}

export function AccountCardActionMenu({
  account: a,
  pages,
  sessionStatus,
  onSetSessionStatus,
  onLink,
  onStartEditName,
  onStartEditUrl,
  onRequestConfirm,
}: AccountCardActionMenuProps) {
  const [showActionMenu, setShowActionMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isFb = a.platform === "Facebook";
  const extCode = (a.extension_code || "").trim().toUpperCase();
  const myPages = pages.filter((p) => p.account_id === a.id);

  useEffect(() => {
    if (!showActionMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowActionMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showActionMenu]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setShowActionMenu(!showActionMenu)}
        aria-expanded={showActionMenu}
        aria-label={`Thao tác khác với tài khoản ${a.name}`}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-alt)] text-xs font-bold text-[var(--text)] hover:border-zinc-500 hover:bg-[var(--surface)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
      >
        ⋯
      </button>

      {showActionMenu && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
            Cập nhật phiên đăng nhập
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setShowActionMenu(false);
              if (onSetSessionStatus) {
                onSetSessionStatus({ id: a.id, status: "logged_in" });
              } else {
                onLink({ id: a.id, linked: true });
              }
            }}
            className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left transition-colors ${
              sessionStatus === "logged_in"
                ? "font-bold text-emerald-400 bg-emerald-500/10"
                : "text-[var(--text)] hover:bg-[var(--surface-alt)]"
            }`}
          >
            <span>🟢</span>
            <span>Đã đăng nhập</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setShowActionMenu(false);
              if (onSetSessionStatus) {
                onSetSessionStatus({ id: a.id, status: "expired" });
              } else {
                onLink({ id: a.id, linked: false });
              }
            }}
            className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left transition-colors ${
              sessionStatus === "expired" || !a.linked
                ? "font-bold text-[var(--dim)] bg-slate-500/10"
                : "text-[var(--text)] hover:bg-[var(--surface-alt)]"
            }`}
          >
            <span>⚪</span>
            <span>Hết phiên</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setShowActionMenu(false);
              if (onSetSessionStatus) {
                onSetSessionStatus({ id: a.id, status: "checkpoint" });
              } else {
                onLink({ id: a.id, linked: false });
              }
            }}
            className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left transition-colors ${
              sessionStatus === "checkpoint"
                ? "font-bold text-amber-400 bg-amber-500/10"
                : "text-[var(--text)] hover:bg-[var(--surface-alt)]"
            }`}
          >
            <span>⚠️</span>
            <span>Cần xác minh (Checkpoint)</span>
          </button>

          <div className="my-1 border-t border-[var(--border)]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setShowActionMenu(false);
              onStartEditName();
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-alt)] text-left transition-colors"
          >
            <span>✏️</span>
            <span>Đổi tên nick</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setShowActionMenu(false);
              onStartEditUrl();
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-alt)] text-left transition-colors"
          >
            <span>🔗</span>
            <span>Sửa link trang cá nhân</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setShowActionMenu(false);
              if (a.linked) {
                onRequestConfirm({
                  type: "unlink",
                  title: `Đánh dấu hết phiên tài khoản "${a.name}"`,
                  message: (
                    <div className="space-y-2.5">
                      <p>
                        Bạn có chắc muốn chuyển tài khoản <strong>"{a.name}"</strong> ({isFb ? "Facebook" : "Instagram"}) sang trạng thái <em>Hết phiên</em>?
                      </p>
                      <div className="rounded border border-amber-500/25 bg-amber-500/10 p-2.5 text-xs text-amber-300">
                        <p className="font-semibold text-amber-200">Tác động:</p>
                        <ul className="list-disc pl-4 space-y-1 text-[11px] mt-1 text-amber-200/90">
                          <li>Phiên đăng nhập sẽ được ghi nhận là <em>Hết phiên</em>.</li>
                          {myPages.length > 0 && (
                            <li>Hệ thống tạm dừng quyền đăng bài tự động tới <strong>{myPages.length} Fanpage trực thuộc</strong>.</li>
                          )}
                          <li>Tài khoản vẫn giữ nguyên trạng thái chọn dùng nếu bạn muốn thiết lập trước.</li>
                        </ul>
                      </div>
                    </div>
                  ),
                });
              } else {
                if (onSetSessionStatus) {
                  onSetSessionStatus({ id: a.id, status: "logged_in" });
                } else {
                  onLink({ id: a.id, linked: true });
                }
              }
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-alt)] text-left transition-colors"
          >
            <span>{a.linked ? "🔄" : "✅"}</span>
            <span>{a.linked ? "Báo hết phiên" : "Đánh dấu đã đăng nhập"}</span>
          </button>

          <div className="my-1 border-t border-[var(--border)]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setShowActionMenu(false);
              onRequestConfirm({
                type: "delete",
                title: `Xác nhận xóa vĩnh viễn tài khoản "${a.name}"`,
                message: (
                  <div className="space-y-2.5">
                    <p>
                      Hành động này <strong>không thể hoàn tác</strong>. Bạn sắp xóa hoàn toàn tài khoản <strong>"{a.name}"</strong> ({isFb ? "Facebook" : "Instagram"}) khỏi SocialDesk.
                    </p>
                    <div className="rounded border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-300">
                      <p className="font-semibold text-red-200">Dữ liệu sẽ bị xóa hoàn toàn:</p>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] mt-1 text-red-200/90">
                        <li>Toàn bộ thông tin nick, hồ sơ kết nối và mã Chrome Extension ({extCode || "Chưa gán"}).</li>
                        {myPages.length > 0 && (
                          <li><strong>{myPages.length} Fanpage trực thuộc</strong> ({myPages.map((p) => p.name).join(", ")}) sẽ bị xóa vĩnh viễn khỏi danh sách quản lý.</li>
                        )}
                        <li>Mọi kế hoạch đăng bài tự động đã chỉ định qua tài khoản này hoặc các Fanpage trực thuộc sẽ bị hủy.</li>
                      </ul>
                    </div>
                    <p className="text-[11px] text-[var(--dim)]">
                      ✅ Kho bài viết gốc, sản phẩm và dữ liệu nghiên cứu thị trường của bạn sẽ không bị ảnh hưởng.
                    </p>
                  </div>
                ),
              });
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-red-500/10 text-left transition-colors"
          >
            <span>🗑️</span>
            <span>Xóa tài khoản này</span>
          </button>
        </div>
      )}
    </div>
  );
}

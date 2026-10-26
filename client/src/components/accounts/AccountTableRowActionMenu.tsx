import { useState, useRef, useEffect } from "react";
import type { Account } from "../../types";

export interface AccountTableRowActionMenuProps {
  account: Account;
  sessionStatus: string;
  onSetSessionStatus?: (args: {
    id: number;
    status: "logged_in" | "expired" | "checkpoint";
  }) => void;
  onStartEditName: () => void;
  onSaveUrl: (args: { id: number; profile_url: string }) => void;
  onRequestDelete: (account: Account) => void;
  onSwitchProfile?: (args: { id: number }) => void;
}

export function AccountTableRowActionMenu({
  account: a,
  sessionStatus,
  onSetSessionStatus,
  onStartEditName,
  onSaveUrl,
  onRequestDelete,
  onSwitchProfile,
}: AccountTableRowActionMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  return (
    <td className="py-3 px-3 align-middle text-right relative">
      <button
        type="button"
        onClick={() => setIsMenuOpen((prev) => !prev)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-alt)] font-bold text-[var(--text)] hover:border-[var(--text)] transition-colors ml-auto"
        aria-label={`Thao tác với nick ${a.name}`}
      >
        ⋯
      </button>

      {isMenuOpen && (
        <div
          ref={menuRef}
          className="absolute right-3 top-10 z-40 w-52 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 text-left"
        >
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
            Phiên đăng nhập
          </div>
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              if (onSetSessionStatus) {
                onSetSessionStatus({ id: a.id, status: "logged_in" });
              }
            }}
            className={`flex w-full items-center gap-2 rounded px-2.5 py-1 text-xs ${
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
            onClick={() => {
              setIsMenuOpen(false);
              if (onSetSessionStatus) {
                onSetSessionStatus({ id: a.id, status: "expired" });
              }
            }}
            className={`flex w-full items-center gap-2 rounded px-2.5 py-1 text-xs ${
              sessionStatus === "expired"
                ? "font-bold text-[var(--dim)] bg-slate-500/10"
                : "text-[var(--text)] hover:bg-[var(--surface-alt)]"
            }`}
          >
            <span>⚪</span>
            <span>Hết phiên</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              if (onSetSessionStatus) {
                onSetSessionStatus({ id: a.id, status: "checkpoint" });
              }
            }}
            className={`flex w-full items-center gap-2 rounded px-2.5 py-1 text-xs ${
              sessionStatus === "checkpoint"
                ? "font-bold text-amber-400 bg-amber-500/10"
                : "text-[var(--text)] hover:bg-[var(--surface-alt)]"
            }`}
          >
            <span>⚠️</span>
            <span>Cần xác minh</span>
          </button>

          <div className="my-1 border-t border-[var(--border)]" />

          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              onStartEditName();
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-alt)]"
          >
            <span>✏️</span>
            <span>Đổi tên nick</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              const url = prompt("Nhập link trang cá nhân:", a.profile_url);
              if (url !== null) {
                onSaveUrl({ id: a.id, profile_url: url.trim() });
              }
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-alt)]"
          >
            <span>🔗</span>
            <span>Sửa link trang</span>
          </button>

          <div className="my-1 border-t border-[var(--border)]" />

          {a.platform === "Facebook" && onSwitchProfile && (
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onSwitchProfile({ id: a.id });
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/10"
              title="Mở Facebook và kích hoạt phiên tài khoản này trên Chrome"
            >
              <span>🔄</span>
              <span>Chuyển nick trên Facebook</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              onRequestDelete(a);
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-red-500/10"
          >
            <span>🗑️</span>
            <span>Xóa tài khoản này</span>
          </button>
        </div>
      )}
    </td>
  );
}

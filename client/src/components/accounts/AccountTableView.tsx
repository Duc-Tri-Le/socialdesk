import { useState, useRef, useEffect, Fragment, type ReactNode } from "react";
import type { Account, Page } from "../../types";
import {
  ConfirmModal,
  FacebookIcon,
  InstagramIcon,
  RefreshIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "../ui";
import { AccountPages } from "./AccountPages";

export interface AccountTableViewProps {
  accounts: Account[];
  pages: Page[];
  onlineCodes: string[];
  onSaveExtensionCode: (args: { id: number; extension_code: string }) => void;
  isSaveExtensionCodePending: boolean;
  onSelect: (args: { id: number; selected: boolean }) => void;
  isSelectPending: boolean;
  onSetSessionStatus?: (args: {
    id: number;
    status: "logged_in" | "expired" | "checkpoint";
  }) => void;
  onLink: (args: { id: number; linked: boolean }) => void;
  isLinkPending: boolean;
  onDelete: (id: number) => void;
  onSaveUrl: (args: { id: number; profile_url: string }) => void;
  isSaveUrlPending: boolean;
  onSaveName: (args: { id: number; name: string }) => void;
  isSaveNamePending: boolean;
  onRetryConnection?: () => void;
  onMsg: (msg: string) => void;
}

export function AccountTableView({
  accounts,
  pages,
  onlineCodes,
  onSaveExtensionCode,
  isSaveExtensionCodePending,
  onSelect,
  isSelectPending,
  onSetSessionStatus,
  onLink,
  isLinkPending,
  onDelete,
  onSaveUrl,
  isSaveUrlPending: _isSaveUrlPending,
  onSaveName,
  isSaveNamePending,
  onRetryConnection,
  onMsg,
}: AccountTableViewProps) {
  // Quản lý hàng mở rộng chi tiết Fanpage
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Menu thao tác phụ ⋯
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Chỉnh sửa inline mã Chrome
  const [editingExtId, setEditingExtId] = useState<number | null>(null);
  const [extInput, setExtInput] = useState("");

  // Chỉnh sửa tên inline
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  // Trạng thái retry tín hiệu
  const [retryingId, setRetryingId] = useState<number | null>(null);

  // Modal xác nhận hành động nguy hiểm
  const [confirmState, setConfirmState] = useState<{
    account: Account;
    type: "delete" | "unlink";
    title: string;
    message: ReactNode;
  } | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Đóng menu khi click ra ngoài
  useEffect(() => {
    if (activeMenuId === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeMenuId]);

  const handleRetry = (a: Account) => {
    setRetryingId(a.id);
    onRetryConnection?.();
    onMsg(`Đang kiểm tra lại tín hiệu Chrome Extension cho profile "${a.extension_code || "Chưa có"}"...`);
    setTimeout(() => {
      setRetryingId(null);
    }, 1200);
  };

  const handleConfirmAction = () => {
    if (!confirmState) return;
    if (confirmState.type === "delete") {
      onDelete(confirmState.account.id);
    } else if (confirmState.type === "unlink") {
      if (onSetSessionStatus) {
        onSetSessionStatus({ id: confirmState.account.id, status: "expired" });
      } else {
        onLink({ id: confirmState.account.id, linked: false });
      }
    }
    setConfirmState(null);
  };

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-alt)] font-semibold text-[var(--dim)]">
            <th className="py-3 px-3 w-14 text-center">Đang dùng</th>
            <th className="py-3 px-3 min-w-[190px]">Tài khoản</th>
            <th className="py-3 px-3 w-24">Nền tảng</th>
            <th className="py-3 px-3 min-w-[150px]">Phiên đăng nhập</th>
            <th className="py-3 px-3 min-w-[190px]">Chrome Extension</th>
            <th className="py-3 px-3 min-w-[150px]">Fanpage trực thuộc</th>
            <th className="py-3 px-3 w-20 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {accounts.map((a) => {
            const isFb = a.platform === "Facebook";
            const extCode = (a.extension_code || "").trim().toUpperCase();
            const isChromeOnline = extCode ? onlineCodes.includes(extCode) : false;
            const myPages = pages.filter((p) => p.account_id === a.id);
            const isExpanded = expandedRows.has(a.id);
            const isRetrying = retryingId === a.id;
            const sessionStatus = a.session_status || (a.linked ? "logged_in" : "expired");

            return (
              <Fragment key={a.id}>
                <tr
                  className={`transition-colors hover:bg-[var(--surface-alt)]/60 ${
                    a.selected ? "bg-[var(--accent)]/5" : ""
                  }`}
                >
                  {/* 1. Đang sử dụng (Tài khoản đang sử dụng) */}
                  <td className="py-3 px-3 text-center align-middle">
                    <button
                      type="button"
                      onClick={() => onSelect({ id: a.id, selected: !a.selected })}
                      disabled={isSelectPending}
                      title={
                        a.selected
                          ? "Đang chọn đăng — bấm để bỏ chọn"
                          : "Bấm để chọn nick này làm đích đăng bài"
                      }
                      className={`flex h-6 w-6 mx-auto items-center justify-center rounded transition-colors ${
                        a.selected
                          ? "bg-[var(--accent)] text-white shadow-sm font-bold"
                          : "border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--text)] text-transparent hover:text-[var(--dim)]"
                      }`}
                    >
                      ✓
                    </button>
                  </td>

                  {/* 2. Thông tin tài khoản */}
                  <td className="py-3 px-3 align-middle">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isFb
                            ? "bg-blue-600/15 text-blue-500"
                            : "bg-gradient-to-tr from-amber-500/20 via-pink-500/20 to-purple-500/20 text-pink-500"
                        }`}
                      >
                        {isFb ? (
                          <FacebookIcon className="h-4 w-4" />
                        ) : (
                          <InstagramIcon className="h-4 w-4" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        {editingNameId === a.id ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              value={nameDraft}
                              onChange={(e) => setNameDraft(e.target.value)}
                              className="text-xs px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] w-36"
                            />
                            <button
                              type="button"
                              disabled={isSaveNamePending || !nameDraft.trim()}
                              onClick={() => {
                                onSaveName({ id: a.id, name: nameDraft });
                                setEditingNameId(null);
                              }}
                              className="rounded bg-sky-600 px-2 py-0.5 text-[11px] text-white font-semibold hover:bg-sky-500"
                            >
                              Lưu
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingNameId(null)}
                              className="text-[11px] text-[var(--dim)] px-1"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="font-bold text-[var(--text)] truncate max-w-[170px]"
                              title={a.name}
                            >
                              {a.name || (isFb ? "Nick Facebook" : "Nick Instagram")}
                            </span>
                            {a.profile_url && (
                              <a
                                href={a.profile_url}
                                target="_blank"
                                rel="noreferrer"
                                title="Mở trang cá nhân"
                                className="text-[11px] text-[var(--accent-ink)] hover:underline"
                              >
                                ↗
                              </a>
                            )}
                          </div>
                        )}

                        <p
                          className="text-[11px] text-[var(--dim)] truncate max-w-[180px]"
                          title={a.handle}
                        >
                          {a.handle || (isFb ? "Tài khoản Facebook" : "Tài khoản Instagram")}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* 3. Nền tảng */}
                  <td className="py-3 px-3 align-middle">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isFb
                          ? "bg-blue-600/15 text-blue-400"
                          : "bg-pink-500/15 text-pink-400"
                      }`}
                    >
                      {isFb ? "Facebook" : "Instagram"}
                    </span>
                  </td>

                  {/* 4. Phiên đăng nhập (Đã đăng nhập / Hết phiên / Cần xác minh) */}
                  <td className="py-3 px-3 align-middle">
                    {sessionStatus === "checkpoint" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Cần xác minh
                      </span>
                    ) : sessionStatus === "expired" || !a.linked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] font-medium text-[var(--dim)] border border-[var(--border)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--dim)]" />
                        Hết phiên
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Đã đăng nhập
                      </span>
                    )}
                  </td>

                  {/* 5. Chrome Extension (Đã kết nối / Chưa kết nối / Lỗi) */}
                  <td className="py-3 px-3 align-middle">
                    {editingExtId === a.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={extInput}
                          onChange={(e) => setExtInput(e.target.value.toUpperCase())}
                          placeholder="SD-XXXX"
                          className="font-mono text-xs uppercase px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-sky-400 font-bold w-28"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onSaveExtensionCode({
                                id: a.id,
                                extension_code: extInput.trim().toUpperCase(),
                              });
                              setEditingExtId(null);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            onSaveExtensionCode({
                              id: a.id,
                              extension_code: extInput.trim().toUpperCase(),
                            });
                            setEditingExtId(null);
                          }}
                          disabled={isSaveExtensionCodePending}
                          className="rounded bg-sky-600 px-2 py-0.5 text-[11px] text-white font-semibold hover:bg-sky-500"
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingExtId(null)}
                          className="text-[11px] text-[var(--dim)] px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ) : isChromeOnline ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Đã kết nối
                        </span>
                        <strong className="font-mono text-[11px] text-emerald-300">
                          {extCode}
                        </strong>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExtId(a.id);
                            setExtInput(extCode);
                          }}
                          className="text-[10px] text-[var(--dim)] hover:text-sky-400 ml-0.5"
                          title="Đổi mã profile"
                        >
                          ⚙
                        </button>
                      </div>
                    ) : extCode ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-alt)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--dim)] border border-[var(--border)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--dim)]" />
                          Chưa kết nối
                        </span>
                        <strong className="font-mono text-[11px] text-[var(--text)]">
                          {extCode}
                        </strong>
                        <button
                          type="button"
                          onClick={() => handleRetry(a)}
                          className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400 hover:bg-sky-500/20 transition-colors"
                          title="Thử kết nối lại"
                        >
                          <RefreshIcon
                            className={`h-2.5 w-2.5 ${isRetrying ? "animate-spin" : ""}`}
                          />
                          <span>Thử lại</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExtId(a.id);
                            setExtInput(extCode);
                          }}
                          className="text-[10px] text-[var(--dim)] hover:text-sky-400 ml-0.5"
                          title="Đổi mã profile"
                        >
                          ⚙
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingExtId(a.id);
                          setExtInput("");
                        }}
                        className="inline-flex items-center gap-1 rounded border border-dashed border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20"
                      >
                        + Gán mã Chrome
                      </button>
                    )}
                  </td>

                  {/* 6. Fanpages trực thuộc */}
                  <td className="py-3 px-3 align-middle">
                    {isFb ? (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => toggleExpand(a.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-ink)] hover:underline"
                        >
                          <span>{myPages.length} Fanpage</span>
                          {isExpanded ? (
                            <ChevronUpIcon className="h-3 w-3" />
                          ) : (
                            <ChevronDownIcon className="h-3 w-3" />
                          )}
                        </button>
                        {myPages.length > 0 && !isExpanded && (
                          <div className="flex items-center gap-1 text-[10px] text-[var(--dim)] truncate max-w-[150px]">
                            {myPages.map((p) => p.name).join(", ")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-[var(--dim)]">—</span>
                    )}
                  </td>

                  {/* 7. Menu Thao tác ⋯ */}
                  <td className="py-3 px-3 align-middle text-right relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuId(activeMenuId === a.id ? null : a.id)
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-alt)] font-bold text-[var(--text)] hover:border-[var(--text)] transition-colors ml-auto"
                      aria-label={`Thao tác với nick ${a.name}`}
                    >
                      ⋯
                    </button>

                    {/* Dropdown menu */}
                    {activeMenuId === a.id && (
                      <div
                        ref={menuRef}
                        className="absolute right-3 top-10 z-40 w-52 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 text-left"
                      >
                        {/* Cập nhật phiên đăng nhập */}
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
                          Phiên đăng nhập
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null);
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
                            setActiveMenuId(null);
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
                            setActiveMenuId(null);
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
                            setActiveMenuId(null);
                            setEditingNameId(a.id);
                            setNameDraft(a.name);
                          }}
                          className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-alt)]"
                        >
                          <span>✏️</span>
                          <span>Đổi tên nick</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null);
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

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null);
                            setConfirmState({
                              account: a,
                              type: "delete",
                              title: `Xác nhận xóa tài khoản "${a.name}"`,
                              message: (
                                <div className="space-y-2 text-xs">
                                  <p>Hành động này không thể hoàn tác. Xóa tài khoản <strong>"{a.name}"</strong>:</p>
                                  <div className="rounded border border-red-500/25 bg-red-500/10 p-2 text-red-300">
                                    <p className="font-semibold text-red-200">Dữ liệu bị xóa vĩnh viễn:</p>
                                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] mt-1">
                                      <li>Toàn bộ thông tin tài khoản và mã Chrome ({extCode || "Chưa có"}).</li>
                                      {myPages.length > 0 && (
                                        <li><strong>{myPages.length} Fanpage trực thuộc</strong> sẽ bị xóa khỏi hệ thống.</li>
                                      )}
                                      <li>Các lịch đăng bài tự động nhắm tới tài khoản này sẽ bị hủy.</li>
                                    </ul>
                                  </div>
                                </div>
                              ),
                            });
                          }}
                          className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-red-500/10"
                        >
                          <span>🗑️</span>
                          <span>Xóa tài khoản này</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>

                {/* Hàng mở rộng quản lý Fanpage trực thuộc */}
                {isExpanded && isFb && (
                  <tr className="bg-[var(--surface-alt)]/40">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-inner">
                        <AccountPages
                          account={a}
                          pages={myPages}
                          onlineCodes={onlineCodes}
                          onMsg={onMsg}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Modal xác nhận nguy hiểm dùng chung cho Table View */}
      {confirmState && (
        <ConfirmModal
          isOpen={true}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={
            confirmState.type === "delete" ? "Xóa vĩnh viễn" : "Gỡ liên kết"
          }
          variant={confirmState.type === "delete" ? "danger" : "warn"}
          isLoading={isLinkPending}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

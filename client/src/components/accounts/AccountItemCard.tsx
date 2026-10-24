import { useState, useRef, useEffect, type ReactNode } from "react";
import type { Account, Page } from "../../types";
import { btnPrimary, inputCls } from "../../utils/styles";
import {
  ConfirmModal,
  FacebookIcon,
  InstagramIcon,
  RefreshIcon,
} from "../ui";
// Sub-component hiển thị và quản lý các trang Fanpage thuộc tài khoản
import { AccountPages } from "./AccountPages";

export interface AccountItemCardProps {
  account: Account;
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

export function AccountItemCard({
  account: a,
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
  isSaveUrlPending,
  onSaveName,
  isSaveNamePending,
  onRetryConnection,
  onMsg,
}: AccountItemCardProps) {
  const isFb = a.platform === "Facebook";
  const extCode = (a.extension_code || "").trim().toUpperCase();
  const isChromeOnline = extCode ? onlineCodes.includes(extCode) : false;
  const sessionStatus = a.session_status || (a.linked ? "logged_in" : "expired");
  const myPages = pages.filter((p) => p.account_id === a.id);

  // Trạng thái thu gọn/mở rộng Fanpage & form thêm Fanpage
  const [showPages, setShowPages] = useState(false);
  const [showAddPage, setShowAddPage] = useState(false);

  // Trạng thái cấu hình Chrome Extension (Progressive Disclosure)
  const [showExtConfig, setShowExtConfig] = useState(false);
  const [extInput, setExtInput] = useState(extCode);
  const [isRetrying, setIsRetrying] = useState(false);

  // Menu thao tác phụ ⋯
  const [showActionMenu, setShowActionMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Đổi tên & Sửa link
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(a.name);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(a.profile_url);

  // Modal xác nhận hành động nguy hiểm
  const [confirmState, setConfirmState] = useState<{
    type: "delete" | "unlink";
    title: string;
    message: ReactNode;
  } | null>(null);

  // Đóng menu ⋯ khi click bên ngoài
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

  const handleSaveExtCode = () => {
    onSaveExtensionCode({
      id: a.id,
      extension_code: extInput.trim().toUpperCase(),
    });
    setShowExtConfig(false);
  };

  const handleRetry = () => {
    setIsRetrying(true);
    onRetryConnection?.();
    onMsg(`Đang kiểm tra lại tín hiệu từ Chrome Extension cho profile "${extCode || "Chưa có"}"...`);
    setTimeout(() => {
      setIsRetrying(false);
    }, 1500);
  };

  const handleConfirmAction = () => {
    if (!confirmState) return;
    if (confirmState.type === "delete") {
      onDelete(a.id);
    } else if (confirmState.type === "unlink") {
      if (onSetSessionStatus) {
        onSetSessionStatus({ id: a.id, status: "expired" });
      } else {
        onLink({ id: a.id, linked: false });
      }
    }
    setConfirmState(null);
  };

  return (
    <li
      className={`rounded-lg border transition-all duration-200 p-3 sm:p-3.5 ${
        a.selected
          ? "border-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.12)] bg-gradient-to-b from-amber-500/[0.03] to-[var(--surface)] ring-1 ring-amber-400/30"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-zinc-700/80 hover:shadow-sm"
      }`}
    >
      {/* ================= 1. HEADER CARD (ICON, TÊN, TRẠNG THÁI, CHECKBOX & MENU) ================= */}
      <div className="flex items-start justify-between gap-2.5">
        {/* Khối bên trái: Icon + Tên + Trạng thái */}
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Avatar icon 32x32 với chấm trạng thái phiên đăng nhập */}
          <span
            aria-hidden="true"
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold shadow-sm ${
              isFb
                ? "bg-blue-600/15 text-blue-500 border border-blue-500/20"
                : "bg-gradient-to-tr from-amber-500/20 via-pink-500/20 to-purple-500/20 text-pink-500 border border-pink-500/20"
            }`}
          >
            {isFb ? (
              <FacebookIcon className="h-4 w-4" />
            ) : (
              <InstagramIcon className="h-4 w-4" />
            )}
            {/* Chấm tròn trạng thái phiên đăng nhập trên avatar */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface)] ${
                sessionStatus === "checkpoint"
                  ? "bg-amber-400 animate-pulse"
                  : sessionStatus === "expired" || !a.linked
                  ? "bg-zinc-500"
                  : "bg-emerald-400"
              }`}
              title={
                sessionStatus === "checkpoint"
                  ? "Phiên: Cần xác minh"
                  : sessionStatus === "expired" || !a.linked
                  ? "Phiên: Hết hạn"
                  : "Phiên: Đã đăng nhập"
              }
            />
          </span>

          <div className="min-w-0 flex-1">
            {/* Hàng 1: Tên nick + Tag nền tảng + Cảnh báo trạng thái nếu có */}
            <div className="flex flex-wrap items-center gap-1.5 leading-tight">
              <span
                title={a.name}
                className="text-sm font-bold text-[var(--text)] truncate max-w-[150px] sm:max-w-[200px]"
              >
                {a.name || (isFb ? "Nick Facebook" : "Nick Instagram")}
              </span>
              <span className="rounded bg-[var(--surface-alt)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--dim)]">
                {isFb ? "Facebook" : "Instagram"}
              </span>
              {!isFb && a.handle && a.handle.startsWith("@") && a.handle !== `@${a.name}` && (
                <span
                  title={a.handle}
                  className="hidden sm:inline text-[11px] text-[var(--dim)] truncate max-w-[120px]"
                >
                  {a.handle}
                </span>
              )}
              {sessionStatus === "checkpoint" && (
                <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-amber-400">
                  Cần xác minh
                </span>
              )}
              {(sessionStatus === "expired" || !a.linked) && (
                <span className="rounded bg-zinc-500/15 border border-zinc-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-zinc-400">
                  Hết phiên
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Khối bên phải: Checkbox chọn tài khoản (thay thế nút chọn lớn) + Menu ⋯ */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Checkbox chọn tài khoản */}
          <label
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs cursor-pointer select-none transition-colors border ${
              a.selected
                ? "border-amber-400/40 bg-amber-400/10 text-amber-300 font-bold"
                : "border-[var(--border)] bg-[var(--surface-alt)] text-[var(--dim)] hover:text-[var(--text)] hover:border-zinc-600"
            }`}
            title={a.selected ? "Đang chọn tài khoản này để đăng (Click để bỏ chọn)" : "Chọn làm tài khoản đăng bài"}
          >
            <input
              type="checkbox"
              checked={a.selected}
              onChange={() => onSelect({ id: a.id, selected: !a.selected })}
              disabled={isSelectPending}
              className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-1 focus:ring-amber-400/50 cursor-pointer accent-amber-400"
            />
            <span className="text-[11px] font-semibold whitespace-nowrap">
              {a.selected ? "Đang chọn" : "Chọn"}
            </span>
          </label>

          {/* Menu thao tác phụ ⋯ */}
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

            {/* Floating dropdown menu */}
            {showActionMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
              >
                {/* Quản lý trạng thái Phiên đăng nhập */}
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
                    setIsEditingName(true);
                    setNameDraft(a.name);
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
                    setIsEditingUrl(true);
                    setUrlDraft(a.profile_url);
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
                      setConfirmState({
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
                    setConfirmState({
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
        </div>
      </div>

      {/* ================= 2. KHỐI CHROME EXTENSION THU GỌN ================= */}
      {!showExtConfig ? (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-md border border-[var(--border)]/70 bg-[var(--surface-alt)]/50 px-2.5 py-1 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-medium text-[var(--dim)]">Extension:</span>
            {isChromeOnline ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-400 text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Đã kết nối ({extCode})
              </span>
            ) : extCode ? (
              <span className="inline-flex items-center gap-1 font-medium text-[var(--dim)] text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                Chưa mở Chrome ({extCode})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-amber-400 text-[11px]">
                Chưa gán Profile
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-sky-400 hover:bg-sky-500/10 transition-colors"
              title="Kiểm tra lại tín hiệu từ Chrome Extension"
            >
              <RefreshIcon className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} />
              <span>Kết nối lại</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowExtConfig(true);
                setExtInput(extCode);
              }}
              className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-[11px] font-medium text-[var(--dim)] hover:text-[var(--text)] hover:bg-[var(--surface-alt)] transition-colors"
              title="Thiết lập mã Profile Chrome Extension"
            >
              <span>⚙ Thiết lập</span>
            </button>
          </div>
        </div>
      ) : (
        /* Cấu hình mã Chrome Extension inline khi bấm Thiết lập */
        <div className="mt-2 rounded-md border border-sky-500/30 bg-sky-500/10 p-2.5 text-xs animate-in fade-in duration-100">
          <div className="flex items-center justify-between gap-1 border-b border-sky-500/20 pb-1.5 mb-2">
            <span className="font-bold text-sky-400 text-[11px]">
              Cấu hình mã Chrome Extension
            </span>
            <button
              type="button"
              onClick={() => setShowExtConfig(false)}
              className="text-[11px] text-[var(--dim)] hover:text-[var(--text)]"
            >
              ✕ Thu gọn
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              id={`ext-code-${a.id}`}
              value={extInput}
              onChange={(e) => setExtInput(e.target.value.toUpperCase())}
              placeholder="Ví dụ: SD-8492..."
              className="font-mono text-xs uppercase px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-sky-400 font-bold w-36"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveExtCode();
              }}
            />
            <button
              type="button"
              onClick={handleSaveExtCode}
              disabled={isSaveExtensionCodePending || !extInput.trim()}
              className="rounded px-2.5 py-1 text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSaveExtensionCodePending ? "Đang lưu…" : "Lưu mã"}
            </button>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1 rounded border border-sky-500/30 px-2 py-1 text-xs font-medium text-sky-300 hover:bg-sky-500/20 transition-colors"
            >
              <RefreshIcon className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} />
              <span>Thử lại</span>
            </button>
            <button
              type="button"
              onClick={() => setShowExtConfig(false)}
              className="rounded px-2 py-1 text-xs text-[var(--dim)] hover:text-[var(--text)]"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* ================= 3. CÁC HÀNG SỬA INLINE (TÊN / LINK) ================= */}
      {isEditingName && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded bg-[var(--surface-alt)] p-2">
          <input
            aria-label={`Tên nick của ${a.name}`}
            className={`${inputCls} min-w-0 flex-1 text-xs py-1`}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Nhập tên nick mới…"
          />
          <button
            type="button"
            className={`${btnPrimary} py-1 text-xs`}
            disabled={isSaveNamePending || !nameDraft.trim()}
            onClick={() => {
              onSaveName({ id: a.id, name: nameDraft });
              setIsEditingName(false);
            }}
          >
            {isSaveNamePending ? "Đang lưu…" : "Lưu"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditingName(false)}
            className="text-xs text-[var(--dim)] hover:text-[var(--text)] px-2"
          >
            Hủy
          </button>
        </div>
      )}

      {isEditingUrl && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded bg-[var(--surface-alt)] p-2">
          <input
            aria-label={`Link trang cá nhân của ${a.name}`}
            className={`${inputCls} min-w-0 flex-1 text-xs py-1`}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder={
              isFb
                ? "https://www.facebook.com/username…"
                : "https://www.instagram.com/username/"
            }
          />
          <button
            type="button"
            className={`${btnPrimary} py-1 text-xs`}
            disabled={isSaveUrlPending}
            onClick={() => {
              onSaveUrl({ id: a.id, profile_url: urlDraft });
              setIsEditingUrl(false);
            }}
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={() => setIsEditingUrl(false)}
            className="text-xs text-[var(--dim)] hover:text-[var(--text)] px-2"
          >
            Hủy
          </button>
        </div>
      )}

      {/* ================= 4. HÀNG THAO TÁC (Mở trang, Fanpage, Thêm Fanpage trên cùng một hàng) ================= */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs">
        {/* Nút mở trang cá nhân & Sửa link */}
        <div className="flex items-center gap-1.5">
          {a.profile_url ? (
            <>
              <a
                href={a.profile_url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Mở trang tài khoản ${a.name}`}
                className="font-semibold text-[var(--accent-ink)] hover:underline"
              >
                Mở trang
              </a>
              <span className="text-[var(--border)]">·</span>
              <button
                type="button"
                onClick={() => {
                  setIsEditingUrl(true);
                  setUrlDraft(a.profile_url || "");
                }}
                className="text-[11px] text-[var(--dim)] hover:text-[var(--text)] transition-colors"
                title="Xem hoặc chỉnh sửa link của tài khoản này"
              >
                Sửa link
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsEditingUrl(true);
                setUrlDraft("");
              }}
              className="text-[11px] text-[var(--dim)] hover:text-[var(--text)] underline"
            >
              + Gán link
            </button>
          )}
        </div>

        {/* Nhóm thao tác Fanpage (cho Facebook): Fanpage (N) và Thêm Fanpage cùng hàng */}
        {isFb && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowPages(!showPages)}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-alt)] transition-colors"
              title="Xem danh sách Fanpage trực thuộc nick này"
            >
              <span>Fanpage ({myPages.length})</span>
              <span className="text-[10px] text-[var(--dim)]">{showPages ? "▲" : "▼"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPages(true);
                setShowAddPage(true);
              }}
              className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent)]/10 transition-colors"
              title="Thêm Fanpage mới trực thuộc nick này"
            >
              <span>+ Thêm Fanpage</span>
            </button>
          </div>
        )}
      </div>

      {/* ================= 5. DANH SÁCH FANPAGE (CHO FACEBOOK - THU GỌN THEO Ý MUỐN) ================= */}
      {isFb && (
        <AccountPages
          account={a}
          pages={myPages}
          onlineCodes={onlineCodes}
          onMsg={onMsg}
          isExpanded={showPages}
          isAddOpen={showAddPage}
          onCloseAdd={() => setShowAddPage(false)}
          hideHeader={true}
        />
      )}

      {/* ================= 6. MODAL XÁC NHẬN NGUY HIỂM ================= */}
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
    </li>
  );
}

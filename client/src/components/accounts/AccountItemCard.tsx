import { useState, type ReactNode } from "react";
import type { Account, Page } from "../../types";
import { btnPrimary, inputCls } from "../../utils/styles";
import {
  ConfirmModal,
  FacebookIcon,
  InstagramIcon,
} from "../ui";
import { AccountPages } from "./AccountPages";
import { AccountCardActionMenu } from "./AccountCardActionMenu";
import { AccountExtensionPanel } from "./AccountExtensionPanel";

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
  const sessionStatus = a.session_status || (a.linked ? "logged_in" : "expired");
  const myPages = pages.filter((p) => p.account_id === a.id);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(a.name);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(a.profile_url);

  const [confirmState, setConfirmState] = useState<{
    type: "delete" | "unlink";
    title: string;
    message: ReactNode;
  } | null>(null);

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
      {/* 1. Header Card */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
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

        <div className="flex items-center gap-1.5 shrink-0">
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

          <AccountCardActionMenu
            account={a}
            pages={pages}
            sessionStatus={sessionStatus}
            onSetSessionStatus={onSetSessionStatus}
            onLink={onLink}
            onStartEditName={() => {
              setIsEditingName(true);
              setNameDraft(a.name);
            }}
            onStartEditUrl={() => {
              setIsEditingUrl(true);
              setUrlDraft(a.profile_url);
            }}
            onRequestConfirm={setConfirmState}
          />
        </div>
      </div>

      {/* 2. Extension Panel */}
      <AccountExtensionPanel
        account={a}
        onlineCodes={onlineCodes}
        onSaveExtensionCode={onSaveExtensionCode}
        isSaveExtensionCodePending={isSaveExtensionCodePending}
        onRetryConnection={onRetryConnection}
        onMsg={onMsg}
      />

      {/* 3. Inline Editors */}
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

      {/* 4. Sub-list Fanpage */}
      {isFb && (
        <AccountPages
          account={a}
          pages={myPages}
          onlineCodes={onlineCodes}
          onMsg={onMsg}
        />
      )}

      {/* 5. Confirm Modal */}
      {confirmState && (
        <ConfirmModal
          isOpen={true}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={
            confirmState.type === "delete"
              ? "Xóa vĩnh viễn"
              : "Xác nhận hết phiên"
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

import { useState, Fragment } from "react";
import type { Account, Page } from "../../types";
import {
  FacebookIcon,
  InstagramIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "../ui";
import { AccountPages } from "./AccountPages";
import { AccountTableRowActionMenu } from "./AccountTableRowActionMenu";
import { AccountTableExtensionCell } from "./AccountTableExtensionCell";

export interface AccountTableRowProps {
  account: Account;
  pages: Page[];
  onlineCodes: string[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: (args: { id: number; selected: boolean }) => void;
  isSelectPending: boolean;
  onSaveExtensionCode: (args: { id: number; extension_code: string }) => void;
  isSaveExtensionCodePending: boolean;
  onSetSessionStatus?: (args: {
    id: number;
    status: "logged_in" | "expired" | "checkpoint";
  }) => void;
  onSaveUrl: (args: { id: number; profile_url: string }) => void;
  onSaveName: (args: { id: number; name: string }) => void;
  isSaveNamePending: boolean;
  onRetryConnection?: () => void;
  onMsg: (msg: string) => void;
  onRequestDelete: (account: Account) => void;
  onSwitchProfile?: (args: { id: number }) => void;
}

export function AccountTableRow({
  account: a,
  pages,
  onlineCodes,
  isExpanded,
  onToggleExpand,
  onSelect,
  isSelectPending,
  onSaveExtensionCode,
  isSaveExtensionCodePending,
  onSetSessionStatus,
  onSaveUrl,
  onSaveName,
  isSaveNamePending,
  onRetryConnection,
  onMsg,
  onRequestDelete,
  onSwitchProfile,
}: AccountTableRowProps) {
  const isFb = a.platform === "Facebook";
  const myPages = pages.filter((p) => p.account_id === a.id);
  const sessionStatus = a.session_status || (a.linked ? "logged_in" : "expired");

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  return (
    <Fragment>
      <tr
        className={`transition-colors hover:bg-[var(--surface-alt)]/60 ${
          a.selected ? "bg-[var(--accent)]/5" : ""
        }`}
      >
        {/* 1. Đang sử dụng */}
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
              {isEditingName ? (
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
                      setIsEditingName(false);
                    }}
                    className="rounded bg-sky-600 px-2 py-0.5 text-[11px] text-white font-semibold hover:bg-sky-500"
                  >
                    Lưu
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(false)}
                    className="text-[11px] text-[var(--dim)] px-1"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {a.profile_url ? (
                    <a
                      href={a.profile_url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Mở trang ${a.name || (isFb ? "Facebook" : "Instagram")}`}
                      className="font-bold text-[var(--text)] hover:text-[var(--accent-ink)] hover:underline truncate max-w-[170px] inline-flex items-center gap-1"
                    >
                      <span className="truncate">{a.name || (isFb ? "Nick Facebook" : "Nick Instagram")}</span>
                      <span className="text-[11px] text-[var(--accent-ink)] font-normal shrink-0">↗</span>
                    </a>
                  ) : (
                    <span
                      className="font-bold text-[var(--text)] truncate max-w-[170px]"
                      title={a.name}
                    >
                      {a.name || (isFb ? "Nick Facebook" : "Nick Instagram")}
                    </span>
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

        {/* 4. Phiên đăng nhập */}
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

        {/* 5. Chrome Extension */}
        <AccountTableExtensionCell
          account={a}
          onlineCodes={onlineCodes}
          onSaveExtensionCode={onSaveExtensionCode}
          isSaveExtensionCodePending={isSaveExtensionCodePending}
          onRetryConnection={onRetryConnection}
          onMsg={onMsg}
        />

        {/* 6. Fanpages trực thuộc */}
        <td className="py-3 px-3 align-middle">
          {isFb ? (
            <div className="space-y-1">
              <button
                type="button"
                onClick={onToggleExpand}
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
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] text-[var(--dim)] max-w-[170px]">
                  {myPages.map((p, idx) => (
                    <span key={p.id} className="inline-flex items-center">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          title={`Mở Fanpage ${p.name}`}
                          className="font-medium text-[var(--accent-ink)] hover:underline truncate max-w-[130px]"
                        >
                          {p.name}
                        </a>
                      ) : (
                        <span className="truncate max-w-[130px]">{p.name}</span>
                      )}
                      {idx < myPages.length - 1 && <span className="text-[var(--dim)] mr-1">,</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-[var(--dim)]">—</span>
          )}
        </td>

        {/* 7. Menu Thao tác ⋯ */}
        <AccountTableRowActionMenu
          account={a}
          sessionStatus={sessionStatus}
          onSetSessionStatus={onSetSessionStatus}
          onStartEditName={() => {
            setIsEditingName(true);
            setNameDraft(a.name);
          }}
          onSaveUrl={onSaveUrl}
          onRequestDelete={onRequestDelete}
          onSwitchProfile={onSwitchProfile}
        />
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
}

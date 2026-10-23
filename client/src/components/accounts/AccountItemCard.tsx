import { useState } from "react";
import type { Account, Page } from "../../types";
import { btnPrimary, inputCls } from "../../utils/styles";
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
  onLink: (args: { id: number; linked: boolean }) => void;
  isLinkPending: boolean;
  onDelete: (id: number) => void;
  onSaveUrl: (args: { id: number; profile_url: string }) => void;
  isSaveUrlPending: boolean;
  onSaveName: (args: { id: number; name: string }) => void;
  isSaveNamePending: boolean;
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
  onLink,
  isLinkPending,
  onDelete,
  onSaveUrl,
  isSaveUrlPending,
  onSaveName,
  isSaveNamePending,
  onMsg,
}: AccountItemCardProps) {
  const isFb = a.platform === "Facebook";
  const extCode = (a.extension_code || "").trim().toUpperCase();
  const isChromeOnline = extCode ? onlineCodes.includes(extCode) : false;

  const [extInput, setExtInput] = useState(extCode);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(a.name);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(a.profile_url);

  const handleSaveExtCode = () => {
    onSaveExtensionCode({ id: a.id, extension_code: extInput.trim().toUpperCase() });
  };

  return (
    <li
      className={`rounded-[var(--radius)] border bg-[var(--surface)] p-4 ${a.selected && a.linked
        ? "border-2 border-[var(--accent)]"
        : "border-[var(--border)]"
        }`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] text-sm font-bold"
        >
          {isFb ? "f" : "◎"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {a.profile_url ? (
              <a
                href={a.profile_url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Mở trang của ${a.name}`}
                className="truncate text-base font-bold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
              >
                {a.name} ↗
              </a>
            ) : (
              <p className="truncate text-base font-bold">{a.name}</p>
            )}
            <span className="rounded bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] font-semibold text-[var(--dim)]">
              {isFb ? "Nick Facebook" : "Instagram"}
            </span>
          </div>
          <p className="truncate text-xs text-[var(--dim)] mt-0.5">
            {a.handle || (isFb ? "Tài khoản cá nhân Facebook" : "Tài khoản Instagram")}
          </p>
        </div>
        {a.linked && a.selected ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--ok)] px-2 py-1 text-xs font-semibold text-white">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
            Đang đăng nhập
          </span>
        ) : (
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${a.linked
              ? "bg-[var(--surface-alt)] text-[var(--ok)]"
              : "bg-[var(--surface-alt)] text-[var(--dim)]"
              }`}
          >
            {a.linked ? "Đã liên kết" : "Chưa liên kết"}
          </span>
        )}
      </div>

      {/* KHỐI NHẬP VÀ HIỂN THỊ MÃ CHROME EXTENSION */}
      <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-sky-400">🔌 Chrome Extension:</span>
            {isChromeOnline ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Chrome đang Online ({extCode})
              </span>
            ) : extCode ? (
              <span className="rounded-full bg-[var(--border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--dim)]">
                Chrome chưa mở ({extCode})
              </span>
            ) : (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                ⚠️ Chưa gán mã Extension
              </span>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <label
            htmlFor={`ext-code-${a.id}`}
            className="text-xs text-[var(--dim)] shrink-0 font-medium"
          >
            Mã Chrome:
          </label>
          <input
            id={`ext-code-${a.id}`}
            value={extInput}
            onChange={(e) => setExtInput(e.target.value.toUpperCase())}
            placeholder="Ví dụ: SD-8492, CHROME-1..."
            className="font-mono text-xs uppercase px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] w-48 font-bold text-sky-400"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSaveExtCode();
              }
            }}
          />
          <button
            onClick={handleSaveExtCode}
            disabled={isSaveExtensionCodePending}
            className="rounded px-3.5 py-1.5 text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isSaveExtensionCodePending ? "Đang lưu…" : "Lưu mã"}
          </button>
          <span className="text-[11px] text-[var(--dim)]">
            (Mở popup extension trên Chrome của nick này &rarr; sao chép mã dán vào đây)
          </span>
        </div>
      </div>

      {/* Các thao tác với tài khoản */}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.profile_url ? (
          <a
            href={a.profile_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Mở trang tài khoản ${a.name}`}
            className="rounded-full bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)]"
          >
            Mở trang tài khoản ↗
          </a>
        ) : (
          <button
            onClick={() => {
              setIsEditingUrl(true);
              setUrlDraft("");
            }}
            className="rounded-full bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)]"
          >
            Thêm link trang
          </button>
        )}

        <button
          onClick={() => onSelect({ id: a.id, selected: !a.selected })}
          aria-pressed={a.selected}
          disabled={isSelectPending}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${a.selected && a.linked
            ? "bg-[var(--accent)] text-white"
            : "border border-[var(--border)] text-[var(--dim)]"
            }`}
        >
          {a.selected ? "✓ Đang dùng nick này" : "Dùng nick này để đăng"}
        </button>
        <button
          onClick={() => onLink({ id: a.id, linked: !a.linked })}
          aria-pressed={a.linked}
          disabled={isLinkPending}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]"
        >
          {a.linked ? "Gỡ liên kết" : "Đánh dấu đã liên kết"}
        </button>
        <button
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)]"
          onClick={() => onDelete(a.id)}
          aria-label={`Xóa tài khoản ${a.name}`}
        >
          Xóa
        </button>
        <button
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]"
          onClick={() => {
            setIsEditingName(!isEditingName);
            setNameDraft(a.name);
          }}
          aria-expanded={isEditingName}
          aria-label={`Đổi tên nick của ${a.name}`}
        >
          Đổi tên nick
        </button>
        <button
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]"
          onClick={() => {
            setIsEditingUrl(!isEditingUrl);
            setUrlDraft(a.profile_url);
          }}
          aria-expanded={isEditingUrl}
          aria-label={`Sửa link trang của ${a.name}`}
        >
          Sửa link trang
        </button>
      </div>

      {isEditingName && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            aria-label={`Tên nick của ${a.name}`}
            className={`${inputCls} min-w-0 flex-1`}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Nhập tên nick Facebook…"
          />
          <button
            className={btnPrimary}
            disabled={isSaveNamePending || !nameDraft.trim()}
            onClick={() => {
              onSaveName({ id: a.id, name: nameDraft });
              setIsEditingName(false);
            }}
          >
            {isSaveNamePending ? "Đang lưu…" : "Lưu tên nick"}
          </button>
        </div>
      )}

      {isEditingUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            aria-label={`Link trang cá nhân của ${a.name}`}
            className={`${inputCls} min-w-0 flex-1`}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder={
              isFb
                ? "https://www.facebook.com/username…"
                : "https://www.instagram.com/username/"
            }
          />
          <button
            className={btnPrimary}
            disabled={isSaveUrlPending}
            onClick={() => {
              onSaveUrl({ id: a.id, profile_url: urlDraft });
              setIsEditingUrl(false);
            }}
          >
            Lưu link
          </button>
        </div>
      )}

      {isFb && (
        <AccountPages
          account={a}
          pages={pages.filter((p) => p.account_id === a.id)}
          onMsg={onMsg}
        />
      )}
    </li>
  );
}

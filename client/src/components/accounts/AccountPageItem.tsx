import { useState } from "react";
import type { Page } from "../../types";
import { btnPrimary, inputCls } from "../../utils/styles";
import { FacebookIcon } from "../ui";

export function AccountPageItem({
  page: p,
  isParentChromeOnline,
  extCode,
  onToggleSelected,
  isTogglePending,
  onOpenTokenModal,
  onSaveUrl,
  isSaveUrlPending,
  onRequestDelete,
}: {
  page: Page;
  isParentChromeOnline: boolean;
  extCode: string;
  onToggleSelected: (id: number, selected: boolean) => void;
  isTogglePending: boolean;
  onOpenTokenModal: (page: Page) => void;
  onSaveUrl: (id: number, url: string) => void;
  isSaveUrlPending: boolean;
  onRequestDelete: (page: Page) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editUrlDraft, setEditUrlDraft] = useState("");

  return (
    <li
      className={`rounded-lg border transition-all duration-200 p-2.5 sm:p-3 ${
        p.selected
          ? "border-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.12)] bg-gradient-to-b from-amber-500/[0.03] to-[var(--surface)] ring-1 ring-amber-400/30"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-hover)] hover:shadow-xs"
      }`}
    >
      {/* 1. Header Card (Icon, Tên Fanpage, Checkbox chọn) */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span
            aria-hidden="true"
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold shadow-sm bg-blue-600/15 text-blue-500 border border-blue-500/20"
          >
            <FacebookIcon className="h-4 w-4" />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface)] ${
                isParentChromeOnline ? "bg-emerald-400" : "bg-zinc-500"
              }`}
              title={isParentChromeOnline ? "Extension: Đã kết nối" : "Extension: Chưa mở Chrome"}
            />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 leading-tight pt-1">
              {p.url ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Mở Fanpage ${p.name || "Facebook"}`}
                  className="text-sm font-bold text-[var(--text)] hover:text-[var(--accent-ink)] hover:underline truncate max-w-[170px] sm:max-w-[240px] inline-flex items-center gap-1"
                >
                  <span className="truncate">{p.name || "Fanpage Facebook"}</span>
                  <span className="text-[11px] text-[var(--accent-ink)] font-normal shrink-0">↗</span>
                </a>
              ) : (
                <span
                  title={p.name}
                  className="text-sm font-bold text-[var(--text)] truncate max-w-[170px] sm:max-w-[240px]"
                >
                  {p.name || "Fanpage Facebook"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Checkbox chọn Fanpage */}
        <div className="flex items-center gap-1.5 shrink-0">
          <label
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs cursor-pointer select-none transition-colors border ${
              p.selected
                ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-ink)] font-bold"
                : "border-[var(--border)] bg-[var(--surface-alt)] text-[var(--dim)] hover:text-[var(--text)] hover:border-[var(--border-hover)]"
            }`}
            title={p.selected ? "Đang chọn Fanpage này để đăng (Click để bỏ chọn)" : "Chọn Fanpage này để đăng"}
          >
            <input
              type="checkbox"
              checked={p.selected}
              onChange={() => onToggleSelected(p.id, !p.selected)}
              disabled={isTogglePending}
              className="h-3.5 w-3.5 rounded border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/50 cursor-pointer accent-[var(--accent)]"
            />
            <span className="text-[11px] font-semibold whitespace-nowrap">
              {p.selected ? "Đang chọn" : "Chọn"}
            </span>
          </label>
        </div>
      </div>

      {/* 2. Trạng thái API Graph */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 rounded-md border border-[var(--border)]/70 bg-[var(--surface-alt)]/50 px-2.5 py-1 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-[var(--dim)]">Đăng bài:</span>
          {(p as any).has_api_token ? (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-400 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Graph API (ID: {(p as any).fb_page_id || "Sẵn sàng"})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-amber-400 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Chưa có Token API
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenTokenModal(p)}
          className="inline-flex items-center gap-1 rounded bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-ink)] hover:border-[var(--accent)] transition-colors cursor-pointer"
        >
          <span>🔑 Cài đặt Token API</span>
        </button>
      </div>

      {/* 3. Trạng thái Extension */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-md border border-[var(--border)]/70 bg-[var(--surface-alt)]/50 px-2.5 py-1 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-[var(--dim)]">Extension:</span>
          {isParentChromeOnline ? (
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
            <span className="inline-flex items-center gap-1 font-medium text-amber-400 text-[11px]">Chưa gán Profile</span>
          )}
        </div>
      </div>

      {/* 4. Thao tác trang */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs">
        <div className="flex items-center gap-2">
          {p.url ? (
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Mở trang ${p.name}`}
              className="inline-flex items-center gap-1 font-semibold text-[var(--accent-ink)] hover:underline"
            >
              <span>Mở trang ↗</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => { setIsEditing(true); setEditUrlDraft(""); }}
              className="text-[11px] text-[var(--dim)] hover:text-[var(--text)] underline cursor-pointer"
            >
              + Gán link
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (isEditing) setIsEditing(false);
              else { setIsEditing(true); setEditUrlDraft(p.url || ""); }
            }}
            className="text-[11px] text-[var(--dim)] hover:text-[var(--text)] underline cursor-pointer"
            title="Chỉnh sửa link Fanpage"
          >
            {isEditing ? "Đóng sửa" : "Sửa link"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onRequestDelete(p)}
          className="text-[11px] font-medium text-[var(--danger)] hover:underline hover:bg-red-500/10 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
        >
          Xóa
        </button>
      </div>

      {/* Ô sửa link inline */}
      {isEditing && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded bg-[var(--surface-alt)] p-2">
          <input
            aria-label={`Link Fanpage ${p.name}`}
            className={`${inputCls} min-w-0 flex-1 text-xs py-1`}
            value={editUrlDraft}
            onChange={(e) => setEditUrlDraft(e.target.value)}
            placeholder="https://www.facebook.com/..."
          />
          <button
            type="button"
            className={`${btnPrimary} py-1 text-xs`}
            disabled={isSaveUrlPending}
            onClick={() => {
              onSaveUrl(p.id, editUrlDraft.trim());
              setIsEditing(false);
            }}
          >
            {isSaveUrlPending ? "Đang lưu…" : "Lưu"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-xs text-[var(--dim)] hover:text-[var(--text)] px-2 cursor-pointer"
          >
            Hủy
          </button>
        </div>
      )}
    </li>
  );
}


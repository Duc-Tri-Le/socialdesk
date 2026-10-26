import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Account, Page } from "../../types";
import { btnPrimary, inputCls } from "../../utils/styles";
import { ConfirmModal, FacebookIcon } from "../ui";

export interface AccountPagesProps {
  account: Account;
  pages: Page[];
  onlineCodes?: string[];
  onMsg: (m: string) => void;
  isExpanded?: boolean;
  isAddOpen?: boolean;
  onCloseAdd?: () => void;
  hideHeader?: boolean;
}

export function AccountPages({
  account,
  pages,
  onlineCodes = [],
  onMsg,
  isExpanded,
  isAddOpen,
  onCloseAdd,
  hideHeader = false,
}: AccountPagesProps) {
  const queryClient = useQueryClient();
  const [localOpen, setLocalOpen] = useState(false);
  const isFormOpen = isAddOpen !== undefined ? isAddOpen : localOpen;
  const setIsFormOpen = (val: boolean) => {
    if (isAddOpen !== undefined && !val) {
      onCloseAdd?.();
    } else {
      setLocalOpen(val);
    }
  };

  const showList = isExpanded !== undefined ? isExpanded : true;
  const [pageUrl, setPageUrl] = useState("");
  const [pageToDelete, setPageToDelete] = useState<Page | null>(null);
  const [editingPageId, setEditingPageId] = useState<number | null>(null);
  const [editUrlDraft, setEditUrlDraft] = useState("");

  const extCode = (account.extension_code || "").trim().toUpperCase();
  const isParentChromeOnline = extCode ? onlineCodes.includes(extCode) : false;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["pages"] });
  };

  const add = useMutation({
    mutationFn: () =>
      api.addPage({
        account_id: account.id,
        url: pageUrl.trim(),
        name: "",
        role: "",
      }),
    onSuccess: (res) => {
      onMsg(res.message);
      if (res.ok) {
        setPageUrl("");
        setIsFormOpen(false);
      }
      refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: (args: { id: number; selected: boolean }) =>
      api.setPageSelected(args),
    onSuccess: (res) => {
      onMsg(res.message);
      refresh();
    },
  });

  const saveUrl = useMutation({
    mutationFn: (args: { id: number; url: string }) =>
      api.setPageUrl(args),
    onSuccess: (res) => {
      onMsg(res.message);
      if (res.ok) {
        setEditingPageId(null);
      }
      refresh();
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deletePage({ id }),
    onSuccess: () => {
      onMsg("Đã xóa Fanpage khỏi hệ thống.");
      setPageToDelete(null);
      refresh();
    },
  });

  if (!showList && !isFormOpen) {
    return null;
  }

  return (
    <div className={`border-t border-[var(--border)] pt-2.5 ${hideHeader ? "mt-2" : "mt-4"}`}>
      {/* Header danh sách Fanpage (chỉ hiện khi hideHeader là false) */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[var(--dim)]">
              Fanpage trực thuộc nick <span className="font-bold text-[var(--text)]">{account.name}</span> ({pages.length})
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsFormOpen(!isFormOpen)}
            aria-expanded={isFormOpen}
            className="text-xs font-semibold text-[var(--accent-ink)] hover:underline"
          >
            {isFormOpen ? "Đóng form" : "Thêm Fanpage"}
          </button>
        </div>
      )}

      {showList && pages.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {pages.map((p) => (
            <li
              key={p.id}
              className={`rounded-lg border transition-all duration-200 p-2.5 sm:p-3 ${
                p.selected
                  ? "border-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.12)] bg-gradient-to-b from-amber-500/[0.03] to-[var(--surface)] ring-1 ring-amber-400/30"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-hover)] hover:shadow-xs"
              }`}
            >
              {/* 1. HEADER CARD (ICON, TÊN FANPAGE, CHECKBOX CHỌN) */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  {/* Avatar 32x32 với chấm trạng thái */}
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

                {/* Checkbox chọn Fanpage (như tài khoản Insta) */}
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
                      onChange={() =>
                        toggle.mutate({ id: p.id, selected: !p.selected })
                      }
                      disabled={toggle.isPending}
                      className="h-3.5 w-3.5 rounded border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/50 cursor-pointer accent-[var(--accent)]"
                    />
                    <span className="text-[11px] font-semibold whitespace-nowrap">
                      {p.selected ? "Đang chọn" : "Chọn"}
                    </span>
                  </label>
                </div>
              </div>

              {/* 2. Trạng thái Extension */}
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

              {/* 3. Thao tác trang */}
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
                      onClick={() => { setEditingPageId(p.id); setEditUrlDraft(""); }}
                      className="text-[11px] text-[var(--dim)] hover:text-[var(--text)] underline"
                    >
                      + Gán link
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (editingPageId === p.id) setEditingPageId(null);
                      else { setEditingPageId(p.id); setEditUrlDraft(p.url || ""); }
                    }}
                    className="text-[11px] text-[var(--dim)] hover:text-[var(--text)] underline"
                    title="Chỉnh sửa link Fanpage"
                  >
                    {editingPageId === p.id ? "Đóng sửa" : "Sửa link"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setPageToDelete(p)}
                  className="text-[11px] font-medium text-[var(--danger)] hover:underline hover:bg-red-500/10 px-1.5 py-0.5 rounded transition-colors"
                >
                  Xóa
                </button>
              </div>

              {/* Ô sửa link inline cho Fanpage */}
              {editingPageId === p.id && (
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
                    disabled={saveUrl.isPending}
                    onClick={() => {
                      saveUrl.mutate({ id: p.id, url: editUrlDraft.trim() });
                    }}
                  >
                    {saveUrl.isPending ? "Đang lưu…" : "Lưu"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPageId(null)}
                    className="text-xs text-[var(--dim)] hover:text-[var(--text)] px-2"
                  >
                    Hủy
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Form thêm Fanpage (Chỉ cần dán link URL) */}
      {isFormOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!pageUrl.trim()) return;
            add.mutate();
          }}
          className="mt-3 space-y-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] p-3 animate-in fade-in duration-100"
        >
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
            <p className="font-semibold text-[var(--text)]">
              Thêm Fanpage do nick <strong className="text-[var(--accent-ink)]">{account.name}</strong> quản trị:
            </p>
            <span className="text-[11px] text-[var(--dim)]">Tên Fanpage tự nhận diện qua link</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              required
              autoFocus
              type="text"
              placeholder="Dán link Fanpage (ví dụ https://www.facebook.com/ducgarage)"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              className={`${inputCls} flex-1`}
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="submit"
                disabled={add.isPending || !pageUrl.trim()}
                className={btnPrimary}
              >
                {add.isPending ? "Đang lưu…" : "Lưu Fanpage"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setPageUrl("");
                }}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--dim)] hover:text-[var(--text)] transition-colors"
              >
                Hủy
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Modal xác nhận xóa Fanpage */}
      {pageToDelete && (
        <ConfirmModal
          isOpen={true}
          title="Xác nhận xóa Fanpage"
          message={
            <div className="space-y-2">
              <p>
                Bạn có chắc chắn muốn xóa Fanpage <strong>"{pageToDelete.name}"</strong>?
              </p>
              <div className="rounded border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-300">
                <p className="font-semibold text-red-200">Ảnh hưởng:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] mt-1">
                  <li>Fanpage này sẽ bị gỡ khỏi danh sách quản lý của nick <em>{account.name}</em>.</li>
                  <li>Các bài đăng đang lên lịch hoặc trong hàng đợi chỉ định tới Fanpage này sẽ không thể tự động phát hành.</li>
                </ul>
              </div>
            </div>
          }
          confirmLabel="Xóa Fanpage"
          variant="danger"
          isLoading={del.isPending}
          onConfirm={() => del.mutate(pageToDelete.id)}
          onCancel={() => setPageToDelete(null)}
        />
      )}
    </div>
  );
}


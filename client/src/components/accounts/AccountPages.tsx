import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Account, Page } from "../../types";
import { btnPrimary, inputCls } from "../../utils/styles";
import { ConfirmModal } from "../ui";

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
  const [form, setForm] = useState({ name: "", url: "", role: "" });
  const [pageToDelete, setPageToDelete] = useState<Page | null>(null);

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
        name: form.name,
        url: form.url,
        role: form.role,
      }),
    onSuccess: (res) => {
      onMsg(res.message);
      if (res.ok) {
        setForm({ name: "", url: "", role: "" });
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
            {isFormOpen ? "Đóng form" : "+ Thêm Fanpage"}
          </button>
        </div>
      )}

      {showList && pages.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {pages.map((p) => (
            <li
              key={p.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-alt)] p-2.5 text-xs transition-colors hover:border-[var(--text)]/40"
            >
              {/* Thông tin Fanpage & Trạng thái kết nối */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold text-indigo-400">
                    Fanpage
                  </span>
                  <a
                    href={p.url || `https://facebook.com`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-bold text-[var(--accent-ink)] hover:underline"
                    title={`Mở trang ${p.name}`}
                  >
                    {p.name} ↗
                  </a>
                  {p.role && (
                    <span className="text-[11px] text-[var(--dim)]">({p.role})</span>
                  )}
                </div>

                {/* Trạng thái kết nối của từng Fanpage (P0/P1) */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-[var(--dim)]">Nick quản trị: <strong className="text-[var(--text)]">{account.name}</strong></span>
                  <span className="text-[var(--dim)]">·</span>
                  {!account.linked ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-400">
                      ⚠️ Nick mẹ chưa liên kết
                    </span>
                  ) : isParentChromeOnline ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Sẵn sàng đăng qua Chrome ({extCode})
                    </span>
                  ) : extCode ? (
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--surface)] px-1.5 py-0.2 text-[10px] font-medium text-[var(--dim)] border border-[var(--border)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--dim)]" />
                      Chờ mở Chrome ({extCode})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-400">
                      ⚠️ Nick mẹ chưa gán mã Chrome
                    </span>
                  )}
                </div>
              </div>

              {/* Các nút hành động cho từng Fanpage */}
              <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() =>
                    toggle.mutate({ id: p.id, selected: !p.selected })
                  }
                  aria-pressed={p.selected}
                  disabled={toggle.isPending}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    p.selected
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "border border-[var(--border)] bg-[var(--surface)] text-[var(--dim)] hover:border-[var(--text)]"
                  }`}
                >
                  {p.selected ? "✓ Đang chọn đăng" : "Chọn đăng"}
                </button>
                <button
                  type="button"
                  onClick={() => setPageToDelete(p)}
                  aria-label={`Xóa fanpage ${p.name}`}
                  className="rounded-full px-2 py-1 text-[11px] font-medium text-[var(--danger)] hover:bg-red-500/10 transition-colors"
                >
                  Xóa
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Form thêm Fanpage */}
      {isFormOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="mt-3 space-y-2.5 rounded border border-[var(--border)] bg-[var(--surface-alt)] p-3 animate-in fade-in duration-100"
        >
          <p className="text-xs font-semibold">
            Thêm Fanpage do nick <strong className="text-[var(--accent-ink)]">{account.name}</strong> quản trị:
          </p>
          <input
            required
            placeholder="Tên Fanpage (Ví dụ: ĐỨC GARAGE, Shop Mô Hình...)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputCls}
          />
          <input
            required
            placeholder="Link Fanpage (https://facebook.com/…)"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder="Vai trò của nick này trên Page (Quản trị viên / Biên tập viên…)"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className={inputCls}
          />
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={add.isPending}
              className={btnPrimary}
            >
              {add.isPending ? "Đang lưu…" : "Lưu Fanpage"}
            </button>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--dim)] hover:text-[var(--text)]"
            >
              Hủy
            </button>
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


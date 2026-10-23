import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Account, Page } from "../../types";
import { btnPrimary, inputCls } from "../../utils/styles";

export function AccountPages({
  account,
  pages,
  onMsg,
}: {
  account: Account;
  pages: Page[];
  onMsg: (m: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", role: "" });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
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
        setOpen(false);
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
    onSuccess: refresh,
  });

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--dim)]">
          Fanpage thuộc nick này ({pages.length})
        </p>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="text-xs font-semibold text-[var(--accent-ink)]"
        >
          {open ? "Đóng" : "+ Thêm Fanpage"}
        </button>
      </div>

      {pages.length > 0 && (
        <ul className="mt-2 space-y-2">
          {pages.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded bg-[var(--surface-alt)] px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold text-indigo-400">
                    Fanpage
                  </span>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-bold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                  >
                    {p.name} ↗
                  </a>
                  {p.role && <span className="text-[11px] text-[var(--dim)]">({p.role})</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() =>
                    toggle.mutate({ id: p.id, selected: !p.selected })
                  }
                  aria-pressed={p.selected}
                  disabled={toggle.isPending}
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    p.selected
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--border)] text-[var(--dim)]"
                  }`}
                >
                  {p.selected ? "Đang chọn đăng" : "Chọn đăng"}
                </button>
                <button
                  onClick={() => del.mutate(p.id)}
                  aria-label={`Xóa fanpage ${p.name}`}
                  className="rounded-full px-2 py-0.5 text-[var(--danger)]"
                >
                  Xóa
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className="mt-3 space-y-2 rounded border border-[var(--border)] bg-[var(--surface-alt)] p-3"
        >
          <p className="text-xs font-semibold">Thêm Fanpage cho nick {account.name}</p>
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
            placeholder="Vai trò (Quản trị viên / Biên tập viên…)"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className={inputCls}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={add.isPending}
              className={btnPrimary}
            >
              Lưu Fanpage
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--dim)]"
            >
              Hủy
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

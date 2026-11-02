import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Account, Page } from "../../types";
import { btnPrimary, inputCls } from "../../utils/styles";
import { ConfirmModal } from "../ui";
import { ApiTokenEditModal } from "./ApiTokenEditModal";
import { AccountPageItem } from "./AccountPageItem";

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
  const [tokenModalPage, setTokenModalPage] = useState<Page | null>(null);

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
            className="text-xs font-semibold text-[var(--accent-ink)] hover:underline cursor-pointer"
          >
            {isFormOpen ? "Đóng form" : "Thêm Fanpage"}
          </button>
        </div>
      )}

      {showList && pages.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {pages.map((p) => (
            <AccountPageItem
              key={p.id}
              page={p}
              isParentChromeOnline={isParentChromeOnline}
              extCode={extCode}
              onToggleSelected={(id, selected) => toggle.mutate({ id, selected })}
              isTogglePending={toggle.isPending}
              onOpenTokenModal={(page) => setTokenModalPage(page)}
              onSaveUrl={(id, url) => saveUrl.mutate({ id, url })}
              isSaveUrlPending={saveUrl.isPending}
              onRequestDelete={(page) => setPageToDelete(page)}
            />
          ))}
        </ul>
      )}

      {/* Form thêm Fanpage */}
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
              aria-label="Link Fanpage Facebook"
              className={`${inputCls} min-w-0 flex-1 text-xs`}
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="Dán link Fanpage (vd: https://facebook.com/ducgarage)"
              autoFocus
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="submit"
                className={`${btnPrimary} text-xs py-1.5 px-3`}
                disabled={add.isPending || !pageUrl.trim()}
              >
                {add.isPending ? "Đang thêm…" : "Lưu Fanpage"}
              </button>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="text-xs text-[var(--dim)] hover:text-[var(--text)] px-2"
              >
                Hủy
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Modal xác nhận xóa Fanpage */}
      <ConfirmModal
        isOpen={Boolean(pageToDelete)}
        title="Xóa Fanpage"
        message={`Bạn có chắc muốn xóa Fanpage "${pageToDelete?.name || "này"}" khỏi hệ thống? Dữ liệu thống kê bài viết trên trang vẫn được lưu giữ.`}
        confirmLabel="Xác nhận xóa"
        variant="danger"
        isLoading={del.isPending}
        onConfirm={() => {
          if (pageToDelete) del.mutate(pageToDelete.id);
        }}
        onCancel={() => setPageToDelete(null)}
      />

      {/* Modal cấu hình Token API cho Page */}
      <ApiTokenEditModal
        isOpen={Boolean(tokenModalPage)}
        target={tokenModalPage ? { type: "page", page: tokenModalPage } : null}
        onClose={() => setTokenModalPage(null)}
        onMsg={onMsg}
        refresh={refresh}
      />
    </div>
  );
}

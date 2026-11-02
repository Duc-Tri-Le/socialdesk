import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../api";
import { btnPrimary, inputCls } from "../../utils/styles";
import type { Page, Account } from "../../types";

export interface ApiTokenEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: { type: "page"; page: Page } | { type: "instagram"; account: Account } | null;
  onMsg: (m: string) => void;
  refresh: () => void;
}

export function ApiTokenEditModal({
  isOpen,
  onClose,
  target,
  onMsg,
  refresh,
}: ApiTokenEditModalProps) {
  const [assetId, setAssetId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  useEffect(() => {
    if (target?.type === "page") {
      setAssetId((target.page as any).fb_page_id || "");
      setAccessToken((target.page as any).access_token || "");
    } else if (target?.type === "instagram") {
      setAssetId((target.account as any).ig_business_account_id || "");
      setAccessToken((target.account as any).access_token || "");
    }
  }, [target]);

  const savePageTokenMutation = useMutation({
    mutationFn: (args: { id: number; fb_page_id: string; access_token: string }) =>
      api.setPageApiToken(args),
    onSuccess: (res) => {
      onMsg(res.message);
      if (res.ok) {
        refresh();
        onClose();
      }
    },
    onError: (err: any) => {
      onMsg(`Lỗi lưu token Fanpage: ${err?.message || "Thất bại"}`);
    },
  });

  const saveAccountTokenMutation = useMutation({
    mutationFn: (args: { id: number; ig_business_account_id: string; access_token: string }) =>
      api.setAccountApiToken(args),
    onSuccess: (res) => {
      onMsg(res.message);
      if (res.ok) {
        refresh();
        onClose();
      }
    },
    onError: (err: any) => {
      onMsg(`Lỗi lưu token Instagram: ${err?.message || "Thất bại"}`);
    },
  });

  if (!isOpen || !target) return null;

  const isPage = target.type === "page";
  const title = isPage
    ? `Cài đặt API: Fanpage "${target.page.name}"`
    : `Cài đặt API: Instagram "${target.account.name}"`;

  const idLabel = isPage
    ? "Facebook Page ID (dãy số):"
    : "Instagram Business Account ID:";
  const idPlaceholder = isPage
    ? "Ví dụ: 102938475610293"
    : "Ví dụ: 17841400000000000";

  const handleSave = () => {
    if (isPage) {
      savePageTokenMutation.mutate({
        id: target.page.id,
        fb_page_id: assetId.trim(),
        access_token: accessToken.trim(),
      });
    } else {
      saveAccountTokenMutation.mutate({
        id: target.account.id,
        ig_business_account_id: assetId.trim(),
        access_token: accessToken.trim(),
      });
    }
  };

  const isPending =
    savePageTokenMutation.isPending || saveAccountTokenMutation.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--dim)] hover:bg-[var(--surface-alt)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </header>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-[var(--dim)] mb-1">
              {idLabel}
            </label>
            <input
              type="text"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              placeholder={idPlaceholder}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--dim)] mb-1">
              Page / Instagram Access Token:
            </label>
            <textarea
              rows={4}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Dán mã EAAB... từ Graph API Explorer hoặc Meta Business Suite"
              className={`${inputCls} font-mono text-[11px]`}
            />
            <p className="mt-1 text-[11px] text-[var(--dim)]">
              {isPage
                ? "Token này sẽ được sử dụng trực tiếp để đăng bài lên Fanpage qua Meta Graph API."
                : "Token này sẽ được sử dụng trực tiếp để đăng bài lên Instagram qua Meta Graph API."}
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)] hover:bg-[var(--surface-alt)]"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className={btnPrimary}
          >
            {isPending ? "Đang kiểm tra & lưu..." : "Lưu Token & ID"}
          </button>
        </footer>
      </div>
    </div>
  );
}


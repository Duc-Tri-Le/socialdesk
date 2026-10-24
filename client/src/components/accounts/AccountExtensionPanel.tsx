import { useState } from "react";
import type { Account } from "../../types";
import { RefreshIcon } from "../ui";

export interface AccountExtensionPanelProps {
  account: Account;
  onlineCodes: string[];
  onSaveExtensionCode: (args: { id: number; extension_code: string }) => void;
  isSaveExtensionCodePending: boolean;
  onRetryConnection?: () => void;
  onMsg: (msg: string) => void;
}

export function AccountExtensionPanel({
  account: a,
  onlineCodes,
  onSaveExtensionCode,
  isSaveExtensionCodePending,
  onRetryConnection,
  onMsg,
}: AccountExtensionPanelProps) {
  const extCode = (a.extension_code || "").trim().toUpperCase();
  const isChromeOnline = extCode ? onlineCodes.includes(extCode) : false;

  const [showExtConfig, setShowExtConfig] = useState(false);
  const [extInput, setExtInput] = useState(extCode);
  const [isRetrying, setIsRetrying] = useState(false);

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
    onMsg(
      `Đang kiểm tra lại tín hiệu từ Chrome Extension cho profile "${extCode || "Chưa có"}"...`,
    );
    setTimeout(() => {
      setIsRetrying(false);
    }, 1500);
  };

  if (!showExtConfig) {
    return (
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-md border border-[var(--border)]/70 bg-[var(--surface-alt)]/50 px-2.5 py-1 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-[var(--dim)]">
            Extension:
          </span>
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
            <RefreshIcon
              className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`}
            />
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
    );
  }

  return (
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
          <RefreshIcon
            className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`}
          />
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
  );
}

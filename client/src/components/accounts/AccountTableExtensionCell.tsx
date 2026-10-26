import { useState } from "react";
import type { Account } from "../../types";
import { RefreshIcon } from "../ui";

export interface AccountTableExtensionCellProps {
  account: Account;
  onlineCodes: string[];
  onSaveExtensionCode: (args: { id: number; extension_code: string }) => void;
  isSaveExtensionCodePending: boolean;
  onRetryConnection?: () => void;
  onMsg: (msg: string) => void;
}

export function AccountTableExtensionCell({
  account: a,
  onlineCodes,
  onSaveExtensionCode,
  isSaveExtensionCodePending,
  onRetryConnection,
  onMsg,
}: AccountTableExtensionCellProps) {
  const extCode = (a.extension_code || "").trim().toUpperCase();
  const isChromeOnline = extCode ? onlineCodes.includes(extCode) : false;

  const [isEditingExt, setIsEditingExt] = useState(false);
  const [extInput, setExtInput] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = () => {
    setIsRetrying(true);
    if (onRetryConnection) onRetryConnection();
    setTimeout(() => {
      setIsRetrying(false);
      onMsg(`Đã gửi yêu cầu kết nối lại tới Chrome Extension [${extCode}].`);
    }, 1200);
  };

  const handleSave = (codeToSave: string) => {
    onSaveExtensionCode({
      id: a.id,
      extension_code: codeToSave.trim().toUpperCase(),
    });
    setIsEditingExt(false);
  };

  return (
    <td className="py-3 px-3 align-middle">
      {isEditingExt ? (
        <div className="flex items-center gap-1">
          <input
            value={extInput}
            onChange={(e) => setExtInput(e.target.value.toUpperCase())}
            placeholder="SD-XXXX"
            className="font-mono text-xs uppercase px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-sky-400 font-bold w-28"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave(extInput);
            }}
          />
          <button
            type="button"
            onClick={() => handleSave(extInput)}
            disabled={isSaveExtensionCodePending}
            className="rounded bg-sky-600 px-2 py-0.5 text-[11px] text-white font-semibold hover:bg-sky-500 disabled:opacity-50"
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={() => setIsEditingExt(false)}
            className="text-[11px] text-[var(--dim)] px-1"
          >
            ✕
          </button>
        </div>
      ) : isChromeOnline ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Đã kết nối
          </span>
          <strong className="font-mono text-[11px] text-emerald-300">
            {extCode}
          </strong>
          <button
            type="button"
            onClick={() => {
              setIsEditingExt(true);
              setExtInput(extCode);
            }}
            className="text-[10px] text-[var(--dim)] hover:text-sky-400 ml-0.5"
            title="Đổi mã profile"
          >
            ⚙
          </button>
        </div>
      ) : extCode ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-alt)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--dim)] border border-[var(--border)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--dim)]" />
            Chưa kết nối
          </span>
          <strong className="font-mono text-[11px] text-[var(--text)]">
            {extCode}
          </strong>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400 hover:bg-sky-500/20 transition-colors"
            title="Thử kết nối lại"
          >
            <RefreshIcon
              className={`h-2.5 w-2.5 ${isRetrying ? "animate-spin" : ""}`}
            />
            <span>Thử lại</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsEditingExt(true);
              setExtInput(extCode);
            }}
            className="text-[10px] text-[var(--dim)] hover:text-sky-400 ml-0.5"
            title="Đổi mã profile"
          >
            ⚙
          </button>
          {onlineCodes.length > 0 && !onlineCodes.includes(extCode) && (
            <button
              type="button"
              onClick={() => handleSave(onlineCodes[0] ?? "")}
              disabled={isSaveExtensionCodePending}
              className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-colors"
              title={`Gán mã Chrome online (${onlineCodes[0]})`}
            >
              Gán [{onlineCodes[0]}]
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setIsEditingExt(true);
              setExtInput("");
            }}
            className="inline-flex items-center gap-1 rounded border border-dashed border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20"
          >
            + Gán mã Chrome
          </button>
          {onlineCodes.length > 0 && (
            <button
              type="button"
              onClick={() => handleSave(onlineCodes[0] ?? "")}
              disabled={isSaveExtensionCodePending}
              className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-colors"
              title={`Gán mã Chrome online (${onlineCodes[0]})`}
            >
              Gán [{onlineCodes[0]}]
            </button>
          )}
        </div>
      )}
    </td>
  );
}

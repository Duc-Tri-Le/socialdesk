import { useState } from "react";
import type { Draft } from "../../types";
import { fmtDate } from "../../utils/format";
import { btnGhost } from "../../utils/styles";

export interface DraftPackViewerProps {
  draft: Draft;
}

export function DraftPackViewer({ draft: d }: DraftPackViewerProps) {
  const [packOpen, setPackOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyPack = () => {
    if (!d.pack_text) return;
    navigator.clipboard.writeText(d.pack_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!d.pack_text) {
    return (
      <div className="mt-3 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface-alt)] p-2.5 text-xs text-[var(--dim)]">
        ℹ️ Bài này chưa có gói đăng — bạn chỉ cần chọn các đích đăng ở bên dưới rồi bấm nút <span className="font-semibold text-[var(--text)]">“Cập nhật gói đăng”</span> để tạo gói.
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        className={`${btnGhost} flex w-full items-center justify-between gap-2 text-left`}
        aria-expanded={packOpen}
        aria-label={`Gói đăng ${d.code}`}
        onClick={() => setPackOpen(!packOpen)}
      >
        <span className="text-xs font-semibold text-[var(--ok)]">
          Gói đăng{d.packed_at ? ` · ${fmtDate(d.packed_at)}` : ""}
        </span>
        <span className="text-xs font-medium text-[var(--dim)]">
          {packOpen ? "Ẩn ▲" : "Xem ▼"}
        </span>
      </button>
      {packOpen && (
        <div className="mt-2">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--ok)] p-3 font-mono text-xs leading-5">
            {d.pack_text}
          </pre>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <button
              className={btnGhost}
              onClick={handleCopyPack}
              aria-label={`Chép gói đăng ${d.code}`}
            >
              {copied ? "Đã chép ✓" : "Chép gói đăng"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

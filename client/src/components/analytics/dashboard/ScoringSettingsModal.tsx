import { memo, useState } from "react";
import { btnPrimary, btnOutline, cardCls } from "../../../utils/styles";

interface ScoringSettingsModalProps {
  initialWeights: {
    reactionWeight: number;
    commentWeight: number;
    shareWeight: number;
  };
  isOpen: boolean;
  onClose: () => void;
  onSave: (weights: { reactionWeight: number; commentWeight: number; shareWeight: number }) => void;
  isSaving: boolean;
}

export const ScoringSettingsModal = memo(function ScoringSettingsModal({
  initialWeights,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: ScoringSettingsModalProps) {
  const [wr, setWr] = useState(initialWeights.reactionWeight);
  const [wc, setWc] = useState(initialWeights.commentWeight);
  const [ws, setWs] = useState(initialWeights.shareWeight);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className={`${cardCls} w-full max-w-md p-6 space-y-4 shadow-xl`}>
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚖️</span>
            <h3 className="text-base font-bold text-[var(--ink)]">
              Cấu hình trọng số Weighted Engagement
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--dim)] hover:text-[var(--ink)] font-bold text-base"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-[var(--dim)] leading-relaxed">
          Điểm tương tác có trọng số phản ánh chất lượng thực sự của tương tác. Bình luận và chia sẻ thể hiện sự quan tâm sâu hơn so với lượt like thông thường.
        </p>

        {/* Công thức toán học */}
        <div className="rounded-lg bg-[var(--surface-muted)] p-3 font-mono text-xs text-[var(--ink)] border border-[var(--border)] text-center">
          <p className="font-bold text-rose-600">
            WE = (Likes × {wr}) + (Comments × {wc}) + (Shares × {ws})
          </p>
          <p className="text-[11px] text-[var(--dim)] mt-1">
            WER = (WE / Reach) × 100% (Chỉ tính khi có Reach hợp lệ)
          </p>
        </div>

        {/* Các trường nhập trọng số */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-[var(--ink)] mb-1">
              Trọng số Lượt thích / Reactions (wr):
            </label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 font-mono text-xs text-[var(--ink)]"
              value={wr}
              onChange={(e) => setWr(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--ink)] mb-1">
              Trọng số Bình luận / Comments (wc):
            </label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 font-mono text-xs text-[var(--ink)]"
              value={wc}
              onChange={(e) => setWc(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--ink)] mb-1">
              Trọng số Lượt chia sẻ / Shares (ws):
            </label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 font-mono text-xs text-[var(--ink)]"
              value={ws}
              onChange={(e) => setWs(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        {/* Nút hành động */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
          <button type="button" onClick={onClose} className={`${btnOutline} py-1.5 px-3 text-xs`}>
            Hủy
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onSave({ reactionWeight: wr, commentWeight: wc, shareWeight: ws })}
            className={`${btnPrimary} py-1.5 px-3 text-xs`}
          >
            {isSaving ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      </div>
    </div>
  );
});

import { memo } from "react";
import type { PostStatus } from "../analyticsTypes";
import { btnPrimary, btnDanger, btnOutline, inputCls } from "../../../utils/styles";

interface PublishPostsBatchBarProps {
  selectedCount: number;
  selectedIds: number[];
  isBatchScanning: boolean;
  onBatchScan: (ids: number[]) => void;
  onBatchUpdateStatus: (ids: number[], status: PostStatus) => void;
  onBatchDelete: (ids: number[]) => void;
  onClearSelection: () => void;
}

export const PublishPostsBatchBar = memo(function PublishPostsBatchBar({
  selectedCount,
  selectedIds,
  isBatchScanning,
  onBatchScan,
  onBatchUpdateStatus,
  onBatchDelete,
  onClearSelection,
}: PublishPostsBatchBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-white text-xs font-bold">
          ✓
        </span>
        <span className="text-sm font-bold text-[var(--ink)]">
          Đã chọn {selectedCount} bài đăng
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isBatchScanning}
          onClick={() => onBatchScan(selectedIds)}
          className={`${btnPrimary} text-xs py-1.5`}
        >
          {isBatchScanning ? "Đang quét…" : "Quét tương tác hàng loạt (Extension)"}
        </button>

        <select
          aria-label="Đổi trạng thái hàng loạt"
          className={`${inputCls} py-1 text-xs w-auto`}
          onChange={(e) => {
            if (e.target.value) {
              onBatchUpdateStatus(selectedIds, e.target.value as PostStatus);
              e.target.value = "";
            }
          }}
          defaultValue=""
        >
          <option value="" disabled>
            Đổi trạng thái…
          </option>
          <option value="active">Đang hiển thị</option>
          <option value="pending_approval">Chờ duyệt</option>
          <option value="removed">Bị xóa / Lỗi</option>
        </select>

        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Bạn có chắc muốn xóa ${selectedCount} bài đã chọn?`)) {
              onBatchDelete(selectedIds);
            }
          }}
          className={`${btnDanger} text-xs py-1.5`}
        >
          Xóa đã chọn
        </button>

        <button
          type="button"
          onClick={onClearSelection}
          className={`${btnOutline} text-xs py-1.5`}
        >
          Bỏ chọn
        </button>
      </div>
    </div>
  );
});

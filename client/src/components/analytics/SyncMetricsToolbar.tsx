import { memo } from "react";
import type { Analytics, ChannelType } from "./analyticsTypes";
import { btnPrimary, btnGhost, inputCls } from "../../utils/styles";

interface SyncMetricsToolbarProps {
  analytics: Analytics | undefined;
  onGoQueue: () => void;
  onSyncPublished: () => void;
  isSyncing: boolean;
  onScanExtension: () => void;
  isScanning: boolean;
  searchKeyword: string;
  onSearchChange: (val: string) => void;
  channelFilter: "all" | ChannelType;
  onChannelFilterChange: (val: "all" | ChannelType) => void;
}

export const SyncMetricsToolbar = memo(function SyncMetricsToolbar({
  analytics,
  onGoQueue,
  onSyncPublished,
  isSyncing,
  onScanExtension,
  isScanning,
  searchKeyword,
  onSearchChange,
  channelFilter,
  onChannelFilterChange,
}: SyncMetricsToolbarProps) {
  return (
    <section aria-label="Điều khiển phân tích & tối ưu" className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--ink)]">
          Phân tích chỉ số & tối ưu khung giờ
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--dim)]">
          Hệ thống tính <strong>điểm tương tác</strong> cho mỗi bài (like ×1, bình luận ×3,
          chia sẻ ×4, click ×2, inbox hỏi mua ×8, đơn chốt ×20) rồi xếp hạng{" "}
          <strong>7 khung giờ riêng cho từng hội nhóm, từng fanpage và từng tài khoản Instagram</strong>{" "}
          — nhóm nào hợp giờ nào, page nào hợp giờ nào, không dùng một khung chung. Gói đăng ở{" "}
          <button
            type="button"
            className="text-[var(--accent)] underline hover:text-[var(--accent)]/80"
            onClick={onGoQueue}
          >
            Hàng đợi
          </button>{" "}
          sẽ tự in khung giờ tốt nhất của đúng kênh đích.
          {analytics && analytics.total_posts > 0 && analytics.overall_best_slot
            ? ` Tổng thể các kênh, khung đang hiệu quả nhất là ${analytics.overall_best_slot} (điểm TB ${analytics.overall_best_avg}/bài).`
            : ""}
        </p>
      </div>

      {/* Thanh hành động đồng bộ & quét tự động */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSyncPublished}
            disabled={isSyncing}
            className={`${btnPrimary} text-xs font-semibold`}
            title="Đồng bộ các bài đăng thành công trong Hàng đợi vào bảng chỉ số phân tích"
          >
            {isSyncing ? "Đang đồng bộ…" : "Đồng bộ bài đã đăng"}
          </button>

          <button
            type="button"
            onClick={onScanExtension}
            disabled={isScanning}
            className={`${btnGhost} text-xs font-semibold text-[var(--accent)]`}
            title="Sử dụng Chrome Extension đang kết nối để tự động cào like, bình luận, chia sẻ từ Facebook"
          >
            {isScanning ? "Đang quét tương tác…" : "Quét tương tác tự động từ Extension"}
          </button>
        </div>

        {/* Thanh tìm kiếm và bộ lọc kênh */}
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-md">
          <input
            type="text"
            placeholder="Tìm theo sản phẩm, STT, kênh..."
            className={`${inputCls} text-xs py-1.5`}
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
          />

          <select
            className={`${inputCls} text-xs py-1.5 w-auto`}
            value={channelFilter}
            onChange={(e) => onChannelFilterChange(e.target.value as "all" | ChannelType)}
          >
            <option value="all">Tất cả kênh</option>
            <option value="group">Hội nhóm</option>
            <option value="page">Fanpage</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
      </div>
    </section>
  );
});

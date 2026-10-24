import { memo, useState } from "react";
import type { Analytics, GroupHeatmap } from "../analyticsTypes";
import { ChannelBestSlotCard } from "../ChannelBestSlotCard";
import { GroupSlotHeatmapTable } from "../heatmap/GroupSlotHeatmapTable";
import { EmptyState } from "../../ui";

interface OptimalSlotsTabProps {
  analytics?: Analytics;
  isLoading: boolean;
  heatmap?: GroupHeatmap;
  isHeatmapLoading?: boolean;
  onGoQueue: () => void;
}

export const OptimalSlotsTab = memo(function OptimalSlotsTab({
  analytics,
  isLoading,
  heatmap,
  isHeatmapLoading,
  onGoQueue,
}: OptimalSlotsTabProps) {
  const [viewMode, setViewMode] = useState<"heatmap" | "cards">("heatmap");

  if (isLoading && !heatmap) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--dim)]">
        Đang phân tích 7 khung giờ đăng bài tối ưu theo múi giờ Việt Nam…
      </div>
    );
  }

  const channels = analytics?.channels ?? [];

  return (
    <div className="space-y-4">
      {/* 1. Header giải thích & bộ chuyển đổi chế độ xem */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--ink)]">
            Phân tích khung giờ đăng bài theo từng nhóm Facebook
          </h2>
          <p className="text-xs text-[var(--dim)]">
            Ma trận Heatmap 2D phân tích 7 khung giờ chuẩn Việt Nam (UTC+7), chuẩn hóa hiệu suất theo thời gian đo lường và đánh giá độ tin cậy mẫu.
          </p>
        </div>

        {/* Nút chuyển đổi View Mode */}
        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("heatmap")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              viewMode === "heatmap"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm font-semibold"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            <span>🔥</span>
            <span>Ma trận Heatmap Nhóm</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              viewMode === "cards"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm font-semibold"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            <span>📋</span>
            <span>Thẻ tóm tắt theo Kênh ({channels.length})</span>
          </button>
        </div>
      </div>

      {/* 2. Hiển thị theo chế độ được chọn */}
      {viewMode === "heatmap" ? (
        <GroupSlotHeatmapTable heatmap={heatmap} isLoading={isHeatmapLoading} />
      ) : channels.length === 0 ? (
        <EmptyState
          title="Chưa đủ dữ liệu khung giờ"
          description="Chưa có bài đăng nào được ghi nhận. Hãy duyệt bài ở Hàng đợi, sau đó đồng bộ bài đã đăng để hệ thống bắt đầu đo lường."
          actionLabel="Đi tới Hàng đợi duyệt bài"
          onAction={onGoQueue}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {channels.map((c) => (
            <ChannelBestSlotCard
              key={`${c.channel_type}-${c.channel_id}-${c.channel_name}`}
              channel={c}
            />
          ))}
        </ul>
      )}
    </div>
  );
});


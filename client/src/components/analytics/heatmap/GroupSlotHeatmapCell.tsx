import { memo } from "react";
import type { HeatmapCell } from "../analyticsTypes";

interface GroupSlotHeatmapCellProps {
  cell: HeatmapCell;
  maxScore: number;
}

export const GroupSlotHeatmapCell = memo(function GroupSlotHeatmapCell({
  cell: c,
  maxScore,
}: GroupSlotHeatmapCellProps) {
  // 1. Ô chưa có bài đăng nào
  if (c.posts_count === 0) {
    return (
      <td className="p-2.5 text-center text-xs text-[var(--dim)] border-b border-r border-[var(--border)] bg-[var(--surface-alt)]/20">
        <span className="opacity-40">—</span>
      </td>
    );
  }

  // 2. Ô chỉ có 1 bài (Độ tin cậy thấp - KHÔNG tô màu chiến thắng)
  if (c.confidence === "low") {
    return (
      <td
        className="p-2.5 border-b border-r border-[var(--border)] bg-amber-500/5 hover:bg-amber-500/10 transition"
        title={`Ô mới có 1 bài: Điểm thô ${c.raw_avg_score}đ (quy đổi 24h: ${c.normalized_avg_score}đ). Tuổi bài: ~${c.avg_age_hours}h. Chưa đủ mẫu tối thiểu 3 bài để kết luận khung giờ tối ưu.`}
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-mono text-xs font-semibold text-[var(--ink)]">
            {c.normalized_avg_score}đ
          </span>
          <span className="inline-block rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-medium text-amber-800">
            1 bài (ít mẫu)
          </span>
          {c.last_scanned_at && (
            <span className="text-[9px] text-[var(--dim)] truncate max-w-[80px]">
              quét {c.avg_age_hours}h
            </span>
          )}
        </div>
      </td>
    );
  }

  // 3. Ô có 2 bài (Độ tin cậy trung bình)
  if (c.confidence === "medium") {
    return (
      <td
        className="p-2.5 border-b border-r border-[var(--border)] bg-blue-500/5 hover:bg-blue-500/10 transition"
        title={`Đo qua 2 bài: Điểm thô ${c.raw_avg_score}đ (quy đổi 24h: ${c.normalized_avg_score}đ). Cần thêm 1 bài nữa để đạt độ tin cậy chuẩn.`}
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-mono text-xs font-bold text-blue-700">
            {c.normalized_avg_score}đ
          </span>
          <span className="inline-block rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-medium text-blue-800">
            2 bài (cần thêm)
          </span>
          {c.orders > 0 && (
            <span className="text-[10px] font-bold text-emerald-600">
              {c.orders} đơn
            </span>
          )}
        </div>
      </td>
    );
  }

  // 4. Ô có >= 3 bài (Độ tin cậy CAO - Tô màu Heatmap theo điểm số)
  const ratio = maxScore > 0 ? Math.min(1, c.normalized_avg_score / maxScore) : 0;
  const isWinner = c.is_winner;

  return (
    <td
      className={`p-2.5 border-b border-r border-[var(--border)] transition ${
        isWinner
          ? "bg-emerald-500/20 ring-2 ring-emerald-500/50 ring-inset"
          : ratio > 0.6
            ? "bg-emerald-500/15"
            : ratio > 0.3
              ? "bg-emerald-500/10"
              : "bg-emerald-500/5"
      }`}
      title={`ĐỘ TIN CẬY CAO (${c.posts_count} bài): Điểm quy đổi 24h: ${c.normalized_avg_score}đ (Điểm thô: ${c.raw_avg_score}đ). ${c.orders} đơn, ${c.inquiries} inbox. Quét gần nhất: ${c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleTimeString("vi-VN") : "chưa rõ"}`}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex items-center gap-1">
          {isWinner && <span className="text-xs" title="Khung giờ tối ưu dẫn đầu có độ tin cậy cao">⭐</span>}
          <span
            className={`font-mono text-xs font-extrabold ${
              isWinner ? "text-emerald-700" : "text-[var(--ink)]"
            }`}
          >
            {c.normalized_avg_score}đ
          </span>
        </div>

        <span
          className={`inline-block rounded px-1.5 py-0.2 text-[10px] font-bold ${
            isWinner
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {c.posts_count} bài (tin cậy)
        </span>

        {c.orders > 0 ? (
          <span className="text-[10px] font-bold text-emerald-700">
            {c.orders} đơn chốt
          </span>
        ) : c.inquiries > 0 ? (
          <span className="text-[10px] text-blue-600 font-medium">
            {c.inquiries} inbox
          </span>
        ) : null}
      </div>
    </td>
  );
});

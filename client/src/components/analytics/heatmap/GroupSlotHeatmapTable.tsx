import { memo, useMemo } from "react";
import type { GroupHeatmap } from "../analyticsTypes";
import { cardCls, tableThCls } from "../../../utils/styles";
import { GroupSlotHeatmapCell } from "./GroupSlotHeatmapCell";

interface GroupSlotHeatmapTableProps {
  heatmap?: GroupHeatmap;
  isLoading?: boolean;
}

export const GroupSlotHeatmapTable = memo(function GroupSlotHeatmapTable({
  heatmap,
  isLoading = false,
}: GroupSlotHeatmapTableProps) {
  const groups = heatmap?.groups ?? [];
  const slots = heatmap?.slots ?? [];

  // Tìm điểm chuẩn hóa lớn nhất trong các ô có độ tin cậy cao để chia thang màu heatmap
  const maxScore = useMemo(() => {
    let max = 1;
    for (const g of groups) {
      for (const c of g.cells) {
        if (c.confidence === "high" && c.normalized_avg_score > max) {
          max = c.normalized_avg_score;
        }
      }
    }
    return max;
  }, [groups]);

  if (isLoading) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--dim)]">
        Đang xây dựng ma trận Heatmap Nhóm × Khung giờ chuẩn theo múi giờ Việt Nam…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--dim)]">
        Chưa có dữ liệu bài đăng nào ở Hội nhóm Facebook để hiển thị Heatmap.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Bảng ma trận 2D Heatmap */}
      <div className={`${cardCls} overflow-hidden shadow-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[var(--surface-alt)] border-b border-[var(--border)] font-semibold text-[var(--dim)]">
              <tr>
                <th className={`${tableThCls} w-56 min-w-[200px] border-r border-[var(--border)]`}>
                  Hội nhóm Facebook
                </th>
                {slots.map((s) => (
                  <th
                    key={s}
                    className="p-2.5 text-center font-mono border-r border-[var(--border)] min-w-[110px]"
                  >
                    <div>{s.replace("–", " – ")}</div>
                    <span className="text-[10px] text-[var(--dim)] font-normal">Giờ VN (+7)</span>
                  </th>
                ))}
                <th className={`${tableThCls} text-center w-40 min-w-[140px]`}>
                  Khung giờ chiến thắng
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {groups.map((g) => (
                <tr key={g.group_name} className="hover:bg-[var(--surface-alt)]/20 transition">
                  {/* Cột Tên nhóm & Tổng số bài */}
                  <td className="p-3 border-r border-[var(--border)] font-medium text-[var(--ink)] bg-[var(--surface)]">
                    <div className="flex items-center gap-2">
                      <span className="text-base">👥</span>
                      <div>
                        <p className="font-semibold text-xs leading-snug">{g.group_name}</p>
                        <span className="text-[11px] text-[var(--dim)]">
                          Đã đo: <strong className="text-[var(--ink)]">{g.total_posts}</strong> bài
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* 7 Cột Khung giờ */}
                  {g.cells.map((cell) => (
                    <GroupSlotHeatmapCell
                      key={cell.slot}
                      cell={cell}
                      maxScore={maxScore}
                    />
                  ))}

                  {/* Cột Khung giờ chiến thắng có độ tin cậy */}
                  <td className="p-3 text-center border-b border-[var(--border)] bg-[var(--surface)]">
                    {g.best_reliable_slot ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="rounded bg-emerald-100 px-2.5 py-1 font-mono font-bold text-xs text-emerald-800 flex items-center gap-1">
                          ⭐ {g.best_reliable_slot}
                        </span>
                        <span className="text-[10px] text-emerald-600 font-medium">
                          Đủ mẫu tin cậy (≥ 3 bài)
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5 text-center">
                        <span className="rounded bg-[var(--surface-alt)] px-2 py-0.5 font-mono text-[11px] text-[var(--dim)] border border-[var(--border)]">
                          Chưa đủ dữ liệu
                        </span>
                        <span className="text-[9px] text-[var(--dim)]">
                          (cần ≥ 3 bài để xác nhận)
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Chú thích màu sắc & Hướng dẫn chuẩn hóa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chú thích mức độ tin cậy mẫu */}
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-xs space-y-2.5">
          <h3 className="font-bold text-[var(--ink)] flex items-center gap-1.5">
            <span>🎨</span> Chú thích độ tin cậy & màu sắc Heatmap:
          </h3>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded bg-[var(--surface-alt)]/60 border border-[var(--border)] inline-block" />
              <span><strong>0 bài (—)</strong>: Chưa có bài đăng</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded bg-amber-100 border border-amber-300 inline-block" />
              <span><strong>1 bài (vàng nhạt)</strong>: Thiếu mẫu, không tô màu thắng</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded bg-blue-100 border border-blue-300 inline-block" />
              <span><strong>2 bài (xanh dương)</strong>: Cần thêm 1 bài nữa</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded bg-emerald-500/30 border border-emerald-500 inline-block" />
              <span><strong>≥ 3 bài (xanh lá)</strong>: Đủ mẫu tin cậy thống kê</span>
            </div>
          </div>
          <p className="text-[11px] text-[var(--dim)] italic pt-1">
            * Nguyên tắc bảo vệ dữ liệu: Chỉ những ô có <strong>từ 3 bài trở lên</strong> mới được xem xét làm "Khung giờ chiến thắng" (⭐) của nhóm.
          </p>
        </div>

        {/* Nguyên lý chuẩn hóa thời gian */}
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-xs space-y-2">
          <h3 className="font-bold text-[var(--ink)] flex items-center gap-1.5">
            <span>⏱️</span> Chuẩn hóa theo thời gian từ lúc đăng:
          </h3>
          <p className="text-[11px] text-[var(--dim)] leading-relaxed">
            Một bài vừa đăng được 2 giờ không thể so sánh điểm thô với bài đã chạy 48 giờ. Hệ thống tự động tách biệt <strong>thời điểm đăng</strong> và <strong>thời điểm quét</strong>, quy đổi điểm tương tác về cùng <strong>chu kỳ chuẩn 24 giờ</strong> để bảo đảm so sánh công bằng.
          </p>
          <div className="flex items-center gap-2 pt-1 font-mono text-[10px] text-[var(--dim)]">
            <span className="rounded bg-[var(--surface-alt)] px-2 py-0.5">
              Múi giờ: Asia/Ho_Chi_Minh (+07:00)
            </span>
            <span className="rounded bg-[var(--surface-alt)] px-2 py-0.5">
              Baseline: 24 giờ tương tác
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

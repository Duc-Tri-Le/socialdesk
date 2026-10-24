import { memo } from "react";
import type { DashboardHeatmapRow } from "../analyticsTypes";
import { cardCls, tableThCls, tableTdCls } from "../../../utils/styles";

interface BestPostingTimeSectionProps {
  heatmap: {
    slots: string[];
    rows: DashboardHeatmapRow[];
  };
  view: "all_groups" | "by_group" | "by_dow";
  onViewChange: (view: "all_groups" | "by_group" | "by_dow") => void;
}

export const BestPostingTimeSection = memo(function BestPostingTimeSection({
  heatmap,
  view,
  onViewChange,
}: BestPostingTimeSectionProps) {
  const slots = heatmap?.slots ?? [];
  const rows = heatmap?.rows ?? [];

  return (
    <div className={`${cardCls} p-5 space-y-4`}>
      {/* Header & View Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">⏰</span>
            <h2 className="text-base font-bold text-[var(--ink)]">
              Phân tích khung giờ đăng tối ưu (Best Posting Time Heatmap)
            </h2>
          </div>
          <p className="text-xs text-[var(--dim)] mt-0.5">
            Đánh giá theo 4 mức độ tin cậy dữ liệu (0 bài: No Data · 1–2 bài: Collecting Data · 3–9 bài: Preliminary · 10+ bài: Eligible for Trend Analysis)
          </p>
        </div>

        {/* Nút chuyển đổi View Y Axis */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1 text-xs">
          <button
            type="button"
            onClick={() => onViewChange("all_groups")}
            className={`rounded px-2.5 py-1 font-medium transition ${
              view === "all_groups"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-semibold"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            Tất cả nhóm
          </button>
          <button
            type="button"
            onClick={() => onViewChange("by_group")}
            className={`rounded px-2.5 py-1 font-medium transition ${
              view === "by_group"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-semibold"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            Theo từng nhóm
          </button>
          <button
            type="button"
            onClick={() => onViewChange("by_dow")}
            className={`rounded px-2.5 py-1 font-medium transition ${
              view === "by_dow"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-semibold"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            Theo thứ trong tuần
          </button>
        </div>
      </div>

      {/* Ma trận Heatmap Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-center text-xs">
          <thead className="bg-[var(--surface-alt)] border-b border-[var(--border)] font-semibold text-[var(--dim)]">
            <tr>
              <th className={`${tableThCls} text-left min-w-[160px]`}>
                {view === "by_dow" ? "Thứ trong tuần" : "Nhóm Facebook"}
              </th>
              {slots.map((s: string) => (
                <th key={s} className={`${tableThCls} text-center min-w-[105px] font-mono text-[11px]`}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((r: DashboardHeatmapRow) => (
              <tr key={r.rowKey} className="hover:bg-[var(--surface-alt)]/20 transition">
                <td className={`${tableTdCls} text-left font-semibold text-[var(--ink)]`}>
                  {r.rowLabel}
                </td>
                {r.cells.map((c: DashboardHeatmapRow["cells"][number]) => {
                  let bgCls = "bg-[var(--surface-muted)]/40 text-[var(--dim)]";
                  let badgeCls = "bg-gray-100 text-gray-600";

                  if (c.confidenceTier === "low") {
                    bgCls = "bg-amber-50 text-amber-900 border border-amber-200/50";
                    badgeCls = "bg-amber-100 text-amber-800";
                  } else if (c.confidenceTier === "medium") {
                    bgCls = "bg-blue-50 text-blue-900 border border-blue-200/50";
                    badgeCls = "bg-blue-100 text-blue-800";
                  } else if (c.confidenceTier === "high") {
                    bgCls = "bg-emerald-100 text-emerald-950 font-bold border border-emerald-300";
                    badgeCls = "bg-emerald-200 text-emerald-900";
                  }

                  return (
                    <td
                      key={c.slot}
                      className={`${tableTdCls} p-2 text-center transition ${bgCls}`}
                      title={`${r.rowLabel} @ ${c.slot}: ${c.postsCount} bài, WE TB: ${c.avgWeightedEngagement} (${c.label})`}
                    >
                      {c.postsCount === 0 ? (
                        <span className="text-[11px] text-gray-400 font-mono">—</span>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-mono font-bold text-xs">
                            {c.avgWeightedEngagement} <span className="text-[9px] font-normal">WE</span>
                          </span>
                          <span className={`rounded px-1.5 py-0.2 text-[9px] font-semibold ${badgeCls}`}>
                            {c.postsCount} bài ({c.confidenceTier})
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend & Chú thích chuẩn hóa 24h */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--surface-muted)] p-3 text-[11px] text-[var(--dim)] border border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-[var(--ink)]">Mức độ mẫu:</span>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-gray-200 border border-gray-300" />
            <span>0 bài (No Data)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-amber-100 border border-amber-300" />
            <span>1–2 bài (Collecting Data)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-blue-100 border border-blue-300" />
            <span>3–9 bài (Preliminary)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-emerald-200 border border-emerald-400" />
            <span>10+ bài (Trend Analysis)</span>
          </div>
        </div>

        <p className="text-[11px] italic text-[var(--dim)]">
          ⚠️ Ưu tiên so sánh bài cùng thời điểm sau đăng (mốc 24h). Không vội khẳng định giờ vàng khi ít hơn 3 bài.
        </p>
      </div>
    </div>
  );
});

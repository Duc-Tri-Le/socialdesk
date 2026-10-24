import { memo, useState, useMemo } from "react";
import type { DashboardTrend } from "../analyticsTypes";
import { cardCls } from "../../../utils/styles";

interface EngagementTrendSectionProps {
  trend: DashboardTrend;
  isLoading?: boolean;
  onModeChange: (mode: "cohort" | "growth") => void;
}

type SeriesKey = "reactions" | "comments" | "shares" | "total" | "weighted";

interface SeriesConfig {
  key: SeriesKey;
  label: string;
  color: string;
  field: "reactions" | "comments" | "shares" | "totalEngagement" | "weightedEngagement";
}

const SERIES_CONFIGS: SeriesConfig[] = [
  { key: "total", label: "Total Engagement", color: "#f59e0b", field: "totalEngagement" },
  { key: "weighted", label: "Weighted (WE)", color: "#ef4444", field: "weightedEngagement" },
  { key: "reactions", label: "Reactions (👍)", color: "#3b82f6", field: "reactions" },
  { key: "comments", label: "Comments (💬)", color: "#10b981", field: "comments" },
  { key: "shares", label: "Shares (🔁)", color: "#8b5cf6", field: "shares" },
];

export const EngagementTrendSection = memo(function EngagementTrendSection({
  trend,
  isLoading,
  onModeChange,
}: EngagementTrendSectionProps) {
  const [activeSeries, setActiveSeries] = useState<Record<SeriesKey, boolean>>({
    total: true,
    weighted: true,
    reactions: true,
    comments: true,
    shares: true,
  });

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const toggleSeries = (key: SeriesKey) => {
    setActiveSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const points = trend?.points ?? [];

  // Tìm giá trị max để scale trục Y
  const maxY = useMemo(() => {
    let max = 5;
    for (const p of points) {
      if (activeSeries.total && p.totalEngagement > max) max = p.totalEngagement;
      if (activeSeries.weighted && p.weightedEngagement > max) max = p.weightedEngagement;
      if (activeSeries.reactions && p.reactions > max) max = p.reactions;
      if (activeSeries.comments && p.comments > max) max = p.comments;
      if (activeSeries.shares && p.shares > max) max = p.shares;
    }
    return Math.ceil(max * 1.15);
  }, [points, activeSeries]);

  const chartWidth = 900;
  const chartHeight = 240;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const innerW = chartWidth - paddingLeft - paddingRight;
  const innerH = chartHeight - paddingTop - paddingBottom;

  const getX = (idx: number) => {
    if (points.length <= 1) return paddingLeft + innerW / 2;
    return paddingLeft + (idx / (points.length - 1)) * innerW;
  };

  const getY = (val: number) => {
    if (maxY <= 0) return paddingTop + innerH;
    return paddingTop + innerH - (val / maxY) * innerH;
  };

  return (
    <div className={`${cardCls} p-5 space-y-4`}>
      {/* Header điều khiển: Chế độ Cohort vs Growth & Series toggles */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">
            Biểu đồ xu hướng tương tác (Engagement Trend)
          </h2>
          <p className="text-xs text-[var(--dim)]">
            {trend.mode === "cohort"
              ? "Posting Cohort: Phân bổ tương tác theo ngày bài được đăng lên Facebook"
              : "Engagement Growth: Đo lường tốc độ tương tác gia tăng giữa các lần quét"}
          </p>
        </div>

        {/* Chuyển chế độ Cohort / Growth */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1 text-xs">
          <button
            type="button"
            onClick={() => onModeChange("cohort")}
            className={`rounded px-2.5 py-1 font-medium transition ${
              trend.mode === "cohort"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-semibold"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            📅 Posting Cohort
          </button>
          <button
            type="button"
            onClick={() => onModeChange("growth")}
            className={`rounded px-2.5 py-1 font-medium transition ${
              trend.mode === "growth"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-semibold"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            📈 Engagement Growth
          </button>
        </div>
      </div>

      {/* Series Toggle Buttons */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[var(--dim)]">Đường dữ liệu:</span>
        {SERIES_CONFIGS.map((cfg) => {
          const isOn = activeSeries[cfg.key];
          return (
            <button
              key={cfg.key}
              type="button"
              onClick={() => toggleSeries(cfg.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                isOn
                  ? "border-transparent text-white"
                  : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--dim)] opacity-60"
              }`}
              style={{ backgroundColor: isOn ? cfg.color : undefined }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: isOn ? "#ffffff" : cfg.color }}
              />
              <span>{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* Vùng vẽ biểu đồ SVG */}
      {isLoading ? (
        <div className="h-60 flex items-center justify-center text-sm text-[var(--dim)] animate-pulse">
          Đang tải dữ liệu xu hướng…
        </div>
      ) : trend.mode === "growth" && !trend.hasGrowthData ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-8 text-center text-xs text-[var(--dim)]">
          <p className="font-semibold text-[var(--ink)] mb-1">Chưa đủ dữ liệu Snapshot để đo tăng trưởng</p>
          <p>Cần tối thiểu 2 lần quét tương tác ở các mốc thời gian khác nhau để so sánh độ gia tăng.</p>
        </div>
      ) : points.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-[var(--dim)] italic">
          Không có dữ liệu bài đăng trong khoảng thời gian đã chọn.
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-auto min-w-[650px] overflow-visible"
          >
            {/* Lưới ngang Y & Nhãn Y */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const y = paddingTop + innerH * (1 - pct);
              const val = Math.round(maxY * pct);
              return (
                <g key={i}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={chartWidth - paddingRight}
                    y2={y}
                    stroke="var(--border)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--dim)"
                    fontFamily="monospace"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Các đường Series */}
            {SERIES_CONFIGS.map((cfg) => {
              if (!activeSeries[cfg.key]) return null;
              const pathD = points
                .map((p, idx) => {
                  const x = getX(idx);
                  const y = getY(p[cfg.field]);
                  return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
                })
                .join(" ");

              return (
                <g key={cfg.key}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={cfg.color}
                    strokeWidth={cfg.key === "weighted" ? 2.5 : 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Điểm nút */}
                  {points.map((p, idx) => (
                    <circle
                      key={idx}
                      cx={getX(idx)}
                      cy={getY(p[cfg.field])}
                      r={hoveredIdx === idx ? 5 : 2.5}
                      fill={cfg.color}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  ))}
                </g>
              );
            })}

            {/* Nhãn trục X (Ngày) */}
            {points.map((p, idx) => {
              // Hiển thị cách quãng nếu có nhiều ngày
              const step = Math.ceil(points.length / 8);
              if (idx % step !== 0 && idx !== points.length - 1) return null;
              const x = getX(idx);
              const dayStr = p.date.slice(5); // MM-DD
              return (
                <text
                  key={idx}
                  x={x}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--dim)"
                  fontFamily="monospace"
                >
                  {dayStr}
                </text>
              );
            })}

            {/* Overlay bắt chuột Hover */}
            {points.map((_, idx) => {
              const x = getX(idx);
              const w = innerW / Math.max(1, points.length);
              return (
                <rect
                  key={idx}
                  x={x - w / 2}
                  y={paddingTop}
                  width={w}
                  height={innerH}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })}
          </svg>

          {/* Tooltip khi Hover */}
          {hoveredIdx !== null && points[hoveredIdx] && (
            <div
              className="pointer-events-none absolute top-4 right-4 z-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs shadow-md space-y-1 font-mono"
            >
              <p className="font-bold text-[var(--ink)] border-b border-[var(--border)] pb-1">
                📅 Ngày {points[hoveredIdx].date}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                <span className="text-amber-600 font-semibold">Total:</span>
                <span className="text-right font-bold">{points[hoveredIdx].totalEngagement}</span>
                <span className="text-rose-600 font-semibold">Weighted:</span>
                <span className="text-right font-bold">{points[hoveredIdx].weightedEngagement}</span>
                <span className="text-blue-600">Reactions:</span>
                <span className="text-right">{points[hoveredIdx].reactions}</span>
                <span className="text-emerald-600">Comments:</span>
                <span className="text-right">{points[hoveredIdx].comments}</span>
                <span className="text-purple-600">Shares:</span>
                <span className="text-right">{points[hoveredIdx].shares}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

import { memo } from "react";
import type { DashboardRecommendation, AnalyticsSubTab } from "../analyticsTypes";
import { cardCls, btnOutline } from "../../../utils/styles";

interface RecommendationsSectionProps {
  items: DashboardRecommendation[];
  onNavigate: (tab: AnalyticsSubTab) => void;
}

export const RecommendationsSection = memo(function RecommendationsSection({
  items,
  onNavigate,
}: RecommendationsSectionProps) {
  return (
    <div className={`${cardCls} p-5 space-y-4 flex flex-col justify-between`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">💡</span>
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">
              Gợi ý tối ưu hóa (Optimization Insights)
            </h2>
            <p className="text-xs text-[var(--dim)]">
              Phát hiện tự động dựa trên số liệu thực tế đã đo lường
            </p>
          </div>
        </div>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
          {items.length} khuyến nghị
        </span>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--dim)] italic">
          Chưa có đủ dữ liệu tương tác để phát hiện xu hướng tối ưu. Hãy tiếp tục đồng bộ và quét bài viết.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const badgeCls =
              item.confidence === "high"
                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                : item.confidence === "medium"
                  ? "bg-blue-50 text-blue-800 border-blue-300"
                  : "bg-amber-50 text-amber-800 border-amber-300";

            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3.5 transition hover:border-[var(--accent)] hover:bg-[var(--surface)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xs text-[var(--ink)]">{item.title}</h3>
                    <span className={`rounded-full px-2 py-0.2 text-[10px] font-semibold border ${badgeCls}`}>
                      Độ tin cậy: {item.confidence === "high" ? "Cao" : item.confidence === "medium" ? "Trung bình" : "Thấp (ít mẫu)"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--dim)] leading-relaxed">{item.description}</p>
                  <p className="text-[11px] font-mono text-[var(--accent)]">
                    📊 Bằng chứng: <strong>{item.evidence}</strong>
                  </p>
                </div>

                <div className="shrink-0 pt-1 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => onNavigate(item.actionTarget as AnalyticsSubTab)}
                    className={`${btnOutline} py-1 px-3 text-xs`}
                  >
                    {item.actionLabel} →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

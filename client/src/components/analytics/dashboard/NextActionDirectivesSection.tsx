import { memo, useMemo } from "react";
import type { Metric, Analytics, AnalyticsSubTab } from "../analyticsTypes";
import {
  generateActionDirectives,
  type ActionDirective,
} from "../helpers/analyticsCalculations";
import { cardCls, btnOutline, btnPrimary } from "../../../utils/styles";

interface NextActionDirectivesSectionProps {
  metrics: Metric[];
  analytics?: Analytics;
  onNavigate: (tab: AnalyticsSubTab) => void;
  onGoQueue?: () => void;
}

export const NextActionDirectivesSection = memo(function NextActionDirectivesSection({
  metrics,
  analytics,
  onNavigate,
  onGoQueue,
}: NextActionDirectivesSectionProps) {
  const directives = useMemo(
    () => generateActionDirectives(metrics, analytics),
    [metrics, analytics],
  );

  const handleActionClick = (target: ActionDirective["targetTab"]) => {
    if (target === "queue" && onGoQueue) {
      onGoQueue();
      return;
    }
    if (target === "compose") {
      const tabBtn = document.querySelector('button[aria-label="Soạn bài"]') as HTMLElement;
      if (tabBtn) {
        tabBtn.click();
      } else if (onGoQueue) {
        onGoQueue();
      }
      return;
    }
    onNavigate(target as AnalyticsSubTab);
  };

  return (
    <div className={`${cardCls} p-5 space-y-4`}>
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-[var(--ink)]">
            Hướng đăng tiếp theo
          </h2>
          <span
            title="Nguyên lý phân biệt: Bài reach thấp = vấn đề giờ đăng hoặc nhóm duyệt; Bài reach cao nhưng 0 inbox = vấn đề nội dung hoặc CTA. Hệ thống tự động phân tích và đưa ra hành động cụ thể."
            className="cursor-help rounded-full border border-[var(--border)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--dim)] hover:text-[var(--ink)]"
          >
            !
          </span>
          <span className="rounded bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] font-mono text-[var(--dim)] border border-[var(--border)]">
            Tuần tới đăng gì
          </span>
        </div>

        <p className="text-xs text-[var(--dim)]">
          Gợi ý tự suy ra từ số liệu thực tế · Bấm nút để thực hiện ngay
        </p>
      </div>

      {/* Danh sách các chỉ dẫn hành động cụ thể */}
      <div className="space-y-3">
        {directives.map((dir) => {
          const badgeCls =
            dir.badgeType === "priority"
              ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-ink)] font-bold"
              : dir.badgeType === "cta_fix"
                ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold"
                : dir.badgeType === "channel_shift"
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold"
                  : "border-[var(--border)] bg-[var(--surface-alt)] text-[var(--dim)] font-semibold";

          return (
            <div
              key={dir.id}
              className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]/30 p-3.5 transition hover:border-[var(--accent)] hover:bg-[var(--surface)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1 flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-mono border ${badgeCls}`}>
                    {dir.badge}
                  </span>
                  <p className="text-xs font-bold text-[var(--ink)] leading-snug">
                    {dir.directive}
                  </p>
                </div>
                <p className="text-[11px] text-[var(--dim)] pl-1 leading-relaxed italic">
                  💡 {dir.reasoning}
                </p>
              </div>

              <div className="shrink-0 pt-1 sm:pt-0">
                <button
                  type="button"
                  onClick={() => handleActionClick(dir.targetTab)}
                  className={`${dir.badgeType === "priority" ? btnPrimary : btnOutline} py-1.5 px-3 text-xs font-semibold whitespace-nowrap`}
                >
                  {dir.actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

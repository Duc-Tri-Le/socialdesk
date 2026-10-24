import { memo } from "react";
import type { DashboardTopContent, AnalyticsSubTab } from "../analyticsTypes";
import { cardCls } from "../../../utils/styles";

interface TopContentSectionProps {
  content: DashboardTopContent[];
  onSelectContent: (draftId: number) => void;
  onNavigate: (tab: AnalyticsSubTab) => void;
}

export const TopContentSection = memo(function TopContentSection({
  content,
  onSelectContent,
  onNavigate,
}: TopContentSectionProps) {
  return (
    <div className={`${cardCls} p-5 space-y-4 flex flex-col justify-between`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">
            📦 Top nội dung & Biến thể hiệu quả cao
          </h2>
          <p className="text-xs text-[var(--dim)]">
            Xếp hạng theo điểm tương tác có trọng số (WE) và độ lan tỏa trên nhiều nhóm
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("content")}
          className="text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          Cây sản phẩm →
        </button>
      </div>

      {content.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--dim)] italic">
          Chưa có dữ liệu nội dung bài đăng trong khoảng thời gian này.
        </div>
      ) : (
        <div className="space-y-3">
          {content.slice(0, 5).map((c, idx) => (
            <div
              key={c.draftId || idx}
              onClick={() => onSelectContent(c.draftId)}
              className="flex items-center gap-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/50 p-2.5 transition hover:border-[var(--accent)] hover:bg-[var(--surface)] cursor-pointer"
              title="Bấm để lọc dashboard theo biến thể nội dung này"
            >
              {/* Thứ hạng */}
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-alt)] font-mono text-xs font-bold text-[var(--ink)] border border-[var(--border)]">
                {idx + 1}
              </span>

              {/* Thumbnail ảnh */}
              {c.thumbnail ? (
                <img
                  src={c.thumbnail}
                  alt={c.productName}
                  className="h-12 w-12 rounded-md object-cover border border-[var(--border)] shrink-0"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[var(--surface-alt)] text-lg border border-[var(--border)] shrink-0">
                  🚗
                </div>
              )}

              {/* Thông tin sản phẩm & biến thể */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs text-[var(--ink)] truncate">{c.productName}</h3>
                  <span className="rounded bg-[var(--surface)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--dim)] border border-[var(--border)]">
                    #{c.draftId}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--dim)] truncate">{c.variantLabel}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--dim)]">
                  <span>👥 {c.groupsCount} nhóm</span>
                  <span>·</span>
                  <span>📝 {c.postsCount} lượt đăng</span>
                  <span>·</span>
                  <span className="truncate max-w-[150px]">
                    ⭐ Tốt nhất tại: <strong>{c.bestGroupName}</strong>
                  </span>
                </div>
              </div>

              {/* Điểm WE & Tương tác TB */}
              <div className="text-right shrink-0">
                <span className="block text-sm font-extrabold text-rose-600 font-mono">
                  {c.avgWeightedEngagement} WE
                </span>
                <span className="text-[10px] text-[var(--dim)] font-mono">
                  {c.avgEngagement} tương tác TB
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

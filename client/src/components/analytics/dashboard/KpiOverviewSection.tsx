import { memo } from "react";
import type { DashboardKpis, AnalyticsSubTab } from "../analyticsTypes";
import { cardCls } from "../../../utils/styles";

interface KpiOverviewSectionProps {
  kpis: DashboardKpis;
  onNavigate: (tab: AnalyticsSubTab) => void;
}

export const KpiOverviewSection = memo(function KpiOverviewSection({
  kpis,
  onNavigate,
}: KpiOverviewSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Card 1: Total Posts */}
      <div
        onClick={() => onNavigate("posts")}
        className={`${cardCls} cursor-pointer p-4 transition hover:border-[var(--accent)] hover:shadow-md flex flex-col justify-between`}
        title="Bấm để xem danh sách chi tiết các lượt đăng"
      >
        <div>
          <div className="flex items-center justify-between text-xs text-[var(--dim)]">
            <span className="font-semibold uppercase tracking-wider">Total Posts</span>
            <span className="rounded bg-blue-50 px-2 py-0.5 font-bold text-blue-700">📝 Lượt đăng</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-3xl">
              {kpis.totalPosts.toLocaleString()}
            </span>
            {kpis.postsGrowthPct !== null && (
              <span
                className={`text-xs font-semibold ${
                  kpis.postsGrowthPct >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {kpis.postsGrowthPct >= 0 ? `+${kpis.postsGrowthPct}%` : `${kpis.postsGrowthPct}%`} vs kỳ trước
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--dim)] flex items-center justify-between">
          <span>{kpis.uniqueVariants} nội dung gốc</span>
          <span>·</span>
          <span>{kpis.uniqueGroups} nhóm đã đăng</span>
          <span className="text-[var(--accent)] font-semibold">Xem bài →</span>
        </div>
      </div>

      {/* Card 2: Total Engagement */}
      <div className={`${cardCls} p-4 flex flex-col justify-between`}>
        <div>
          <div className="flex items-center justify-between text-xs text-[var(--dim)]">
            <span className="font-semibold uppercase tracking-wider">Total Engagement</span>
            <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
              ❤️ Tương tác
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-3xl">
              {kpis.totalEngagement.toLocaleString()}
            </span>
            {kpis.engagementGrowthPct !== null && (
              <span
                className={`text-xs font-semibold ${
                  kpis.engagementGrowthPct >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {kpis.engagementGrowthPct >= 0
                  ? `+${kpis.engagementGrowthPct}%`
                  : `${kpis.engagementGrowthPct}%`}{" "}
                vs kỳ trước
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--dim)] flex items-center justify-between">
          <span>{kpis.reactionsCount} 👍</span>
          <span>·</span>
          <span>{kpis.commentsCount} 💬</span>
          <span>·</span>
          <span>{kpis.sharesCount} 🔁</span>
          <span className="text-[10px] text-gray-400">({kpis.validMeasurablePosts} bài đo)</span>
        </div>
      </div>

      {/* Card 3: Engagement Rate */}
      <div className={`${cardCls} p-4 flex flex-col justify-between`}>
        <div>
          <div className="flex items-center justify-between text-xs text-[var(--dim)]">
            <span className="font-semibold uppercase tracking-wider">Engagement Rate</span>
            <span className="rounded bg-purple-50 px-2 py-0.5 font-bold text-purple-700">
              📊 Tỷ lệ
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-3xl">
              {kpis.reachAvailable && kpis.engagementRate !== null ? `${kpis.engagementRate}%` : "N/A"}
            </span>
            <span className="text-[11px] text-[var(--dim)]">
              {kpis.reachAvailable ? "trên tổng Reach" : "Reach data unavailable"}
            </span>
          </div>
        </div>

        <div className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--dim)]">
          {kpis.reachAvailable ? (
            <span>Đo lường trên {kpis.eligibleReachPosts} bài có Reach hợp lệ</span>
          ) : (
            <span className="italic text-amber-700">
              ⚠️ Reach chỉ có khi là Admin/Page. Không lấy thành viên thay Reach.
            </span>
          )}
        </div>
      </div>

      {/* Card 4: Active Groups */}
      <div
        onClick={() => onNavigate("groups")}
        className={`${cardCls} cursor-pointer p-4 transition hover:border-[var(--accent)] hover:shadow-md flex flex-col justify-between`}
        title="Bấm để xem danh sách các nhóm Facebook"
      >
        <div>
          <div className="flex items-center justify-between text-xs text-[var(--dim)]">
            <span className="font-semibold uppercase tracking-wider">Active Groups</span>
            <span className="rounded bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700">
              👥 Hội nhóm
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-3xl">
              {kpis.activeGroupsCount}{" "}
              <span className="text-base font-normal text-[var(--dim)]">/ {kpis.totalTrackedGroups}</span>
            </span>
            <span className="text-xs text-[var(--dim)]">nhóm có bài</span>
          </div>
        </div>

        <div className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--dim)] flex items-center justify-between">
          <span className="text-emerald-600 font-semibold">{kpis.activeGroupsCount} đang chạy</span>
          <span>·</span>
          <span>{kpis.inactiveGroupsCount} chưa có bài</span>
          <span className="text-[var(--accent)] font-semibold">Xem nhóm →</span>
        </div>
      </div>
    </div>
  );
});

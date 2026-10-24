import { memo, useState, useMemo } from "react";
import type { DashboardTopGroup, AnalyticsSubTab } from "../analyticsTypes";
import { cardCls, tableThCls, tableTdCls, btnOutline } from "../../../utils/styles";

interface TopGroupsSectionProps {
  groups: DashboardTopGroup[];
  onSelectGroup: (groupId: number) => void;
  onNavigate: (tab: AnalyticsSubTab) => void;
}

type SortField = "avgWE" | "avgEng" | "posts" | "er";

export const TopGroupsSection = memo(function TopGroupsSection({
  groups,
  onSelectGroup,
  onNavigate,
}: TopGroupsSectionProps) {
  const [sortField, setSortField] = useState<SortField>("avgWE");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedGroups = useMemo(() => {
    const list = [...groups];
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortField === "avgWE") {
        valA = a.avgWeightedEngagement;
        valB = b.avgWeightedEngagement;
      } else if (sortField === "avgEng") {
        valA = a.avgEngagement;
        valB = b.avgEngagement;
      } else if (sortField === "posts") {
        valA = a.totalPosts;
        valB = b.totalPosts;
      } else if (sortField === "er") {
        valA = a.engagementRate ?? -1;
        valB = b.engagementRate ?? -1;
      }
      return sortAsc ? valA - valB : valB - valA;
    });
    return list;
  }, [groups, sortField, sortAsc]);

  return (
    <div className={`${cardCls} p-5 space-y-4 flex flex-col justify-between`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">
            🏆 Top nhóm Facebook hiệu quả nhất
          </h2>
          <p className="text-xs text-[var(--dim)]">
            Đánh giá theo tương tác bình quân và độ tin cậy mẫu (Không mặc định nhóm nhiều bài là tốt nhất)
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("groups")}
          className="text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          Tất cả nhóm →
        </button>
      </div>

      {sortedGroups.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--dim)] italic">
          Chưa có bài đăng nào trên các nhóm trong khoảng thời gian này.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-alt)] border-b border-[var(--border)] font-semibold text-[var(--dim)]">
              <tr>
                <th className="p-2 text-center w-10">#</th>
                <th className={tableThCls}>Hội nhóm Facebook</th>
                <th
                  onClick={() => handleSort("posts")}
                  className={`${tableThCls} text-center cursor-pointer hover:text-[var(--ink)]`}
                  title="Sắp xếp theo số bài"
                >
                  Bài {sortField === "posts" ? (sortAsc ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => handleSort("avgEng")}
                  className={`${tableThCls} text-center cursor-pointer hover:text-[var(--ink)]`}
                  title="Tương tác TB / bài"
                >
                  Tương tác TB {sortField === "avgEng" ? (sortAsc ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => handleSort("avgWE")}
                  className={`${tableThCls} text-center cursor-pointer hover:text-[var(--ink)]`}
                  title="Điểm WE bình quân"
                >
                  Điểm WE {sortField === "avgWE" ? (sortAsc ? "▲" : "▼") : ""}
                </th>
                <th
                  onClick={() => handleSort("er")}
                  className={`${tableThCls} text-center cursor-pointer hover:text-[var(--ink)]`}
                  title="Tỷ lệ tương tác (khi có Reach)"
                >
                  ER (%) {sortField === "er" ? (sortAsc ? "▲" : "▼") : ""}
                </th>
                <th className={`${tableThCls} text-center`}>Khung giờ tốt</th>
                <th className={`${tableThCls} text-right`}>Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {sortedGroups.slice(0, 5).map((g, idx) => (
                <tr key={g.groupId || g.groupName} className="hover:bg-[var(--surface-alt)]/40 transition">
                  <td className="p-2 text-center font-bold text-[var(--dim)] font-mono">
                    {idx + 1}
                  </td>
                  <td className={tableTdCls}>
                    <p className="font-semibold text-[var(--ink)] truncate max-w-[200px]" title={g.groupName}>
                      {g.groupName}
                    </p>
                    <span className="text-[10px] text-[var(--dim)]">
                      {g.totalPosts} bài đăng đo lường
                    </span>
                  </td>
                  <td className={`${tableTdCls} text-center font-mono font-medium`}>
                    {g.totalPosts}
                  </td>
                  <td className={`${tableTdCls} text-center font-mono font-semibold text-amber-600`}>
                    {g.avgEngagement}
                  </td>
                  <td className={`${tableTdCls} text-center font-mono font-bold text-rose-600`}>
                    {g.avgWeightedEngagement}
                  </td>
                  <td className={`${tableTdCls} text-center font-mono`}>
                    {g.engagementRate !== null ? (
                      <span className="text-purple-600 font-bold">{g.engagementRate}%</span>
                    ) : (
                      <span className="text-[var(--dim)] text-[10px]">N/A</span>
                    )}
                  </td>
                  <td className={`${tableTdCls} text-center font-mono text-[11px]`}>
                    <span className="rounded bg-[var(--surface-alt)] px-1.5 py-0.5 border border-[var(--border)]">
                      {g.bestSlot || "—"}
                    </span>
                  </td>
                  <td className={`${tableTdCls} text-right`}>
                    <button
                      type="button"
                      onClick={() => onSelectGroup(g.groupId)}
                      className={`${btnOutline} py-0.5 px-2 text-[10px]`}
                      title="Lọc dashboard theo nhóm này"
                    >
                      Lọc nhóm
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

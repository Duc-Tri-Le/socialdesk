import { memo, useState, useMemo } from "react";
import type { GroupPerformance } from "../analyticsTypes";
import { SearchInput, EmptyState } from "../../ui";
import { cardCls, tableThCls, tableTdCls } from "../../../utils/styles";

interface FacebookGroupsTabProps {
  groups: GroupPerformance[];
  isLoading: boolean;
}

export const FacebookGroupsTab = memo(function FacebookGroupsTab({
  groups,
  isLoading,
}: FacebookGroupsTabProps) {
  const [keyword, setKeyword] = useState("");

  const filteredGroups = useMemo(() => {
    if (!keyword.trim()) return groups;
    const kw = keyword.trim().toLowerCase();
    return groups.filter((g) => g.group_name.toLowerCase().includes(kw));
  }, [groups, keyword]);

  if (isLoading) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--dim)]">
        Đang tải thống kê hiệu quả các nhóm Facebook…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Header & Tìm kiếm */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--ink)]">
            Hiệu quả theo từng Hội nhóm Facebook ({groups.length} nhóm đã có bài đăng)
          </h2>
          <p className="text-xs text-[var(--dim)]">
            Đo lường tỷ lệ duyệt bài, mức độ tương tác và chuyển đổi đơn hàng của từng nhóm để tối ưu lịch đăng bài.
          </p>
        </div>

        <div className="w-full sm:w-64">
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder="Tìm theo tên nhóm…"
            ariaLabel="Tìm kiếm nhóm"
          />
        </div>
      </div>

      {/* 2. Bảng thống kê chi tiết từng nhóm */}
      {filteredGroups.length === 0 ? (
        <EmptyState
          title="Chưa có dữ liệu nhóm"
          description={
            keyword
              ? `Không tìm thấy nhóm Facebook nào khớp với từ khóa "${keyword}".`
              : "Chưa có bài viết nào được đăng vào Hội nhóm Facebook. Hãy duyệt bài ở Hàng đợi và đồng bộ để bắt đầu theo dõi."
          }
        />
      ) : (
        <div className={`${cardCls} overflow-hidden shadow-sm`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-alt)] border-b border-[var(--border)] text-xs font-semibold text-[var(--dim)]">
                <tr>
                  <th className={tableThCls}>Tên Hội nhóm Facebook</th>
                  <th className={`${tableThCls} text-center`}>Tổng lượt đăng</th>
                  <th className={`${tableThCls} text-center`}>Tỷ lệ duyệt bài</th>
                  <th className={`${tableThCls} text-center`}>Trạng thái (Hiện / Chờ / Gỡ)</th>
                  <th className={`${tableThCls} text-center`}>Tương tác (L/C/S)</th>
                  <th className={`${tableThCls} text-center`}>Chuyển đổi (Inbox / Đơn)</th>
                  <th className={`${tableThCls} text-right`}>Điểm TB/bài</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredGroups.map((g) => {
                  return (
                    <tr key={g.group_name} className="hover:bg-[var(--surface-alt)]/40 transition">
                      {/* Tên nhóm */}
                      <td className={tableTdCls}>
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                            👥
                          </span>
                          <div>
                            <p className="font-semibold text-[var(--ink)]">{g.group_name}</p>
                            <span className="text-[11px] text-[var(--dim)]">
                              Tiếp cận: {g.total_reach.toLocaleString("vi-VN")} lượt
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Tổng lượt đăng */}
                      <td className={`${tableTdCls} text-center font-mono font-semibold text-[var(--ink)]`}>
                        {g.total_posts}
                      </td>

                      {/* Tỷ lệ duyệt */}
                      <td className={`${tableTdCls} text-center`}>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            g.approval_rate >= 80
                              ? "bg-emerald-100 text-emerald-800"
                              : g.approval_rate >= 50
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {g.approval_rate}%
                        </span>
                      </td>

                      {/* Trạng thái */}
                      <td className={`${tableTdCls} text-center`}>
                        <div className="flex items-center justify-center gap-2 text-xs font-mono">
                          <span className="text-emerald-600 font-semibold" title="Đang hiển thị">
                            {g.active_posts}
                          </span>
                          <span className="text-[var(--dim)]">/</span>
                          <span className="text-amber-600 font-semibold" title="Đang chờ duyệt">
                            {g.pending_posts}
                          </span>
                          <span className="text-[var(--dim)]">/</span>
                          <span className="text-rose-600 font-semibold" title="Bị xóa hoặc gỡ">
                            {g.removed_posts}
                          </span>
                        </div>
                      </td>

                      {/* Tương tác */}
                      <td className={`${tableTdCls} text-center text-xs font-mono`}>
                        <span title="Lượt thích">{g.total_likes} 👍</span> ·{" "}
                        <span title="Bình luận">{g.total_comments} 💬</span> ·{" "}
                        <span title="Chia sẻ">{g.total_shares} 🔁</span>
                      </td>

                      {/* Chuyển đổi */}
                      <td className={`${tableTdCls} text-center text-xs`}>
                        <span className="font-semibold text-blue-600">{g.total_inquiries} inbox</span>
                        <span className="mx-1 text-[var(--dim)]">·</span>
                        <strong className="font-bold text-emerald-600">{g.total_orders} đơn</strong>
                      </td>

                      {/* Điểm TB */}
                      <td className={`${tableTdCls} text-right font-mono font-bold text-[var(--accent)]`}>
                        {g.avg_score}đ
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});

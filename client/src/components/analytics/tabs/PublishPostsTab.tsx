import { memo, useState, useCallback } from "react";
import type { Metric, ChannelType, PostStatus, QuickEditSalesData } from "../analyticsTypes";
import { EmptyState } from "../../ui";
import { cardCls, tableThCls } from "../../../utils/styles";
import { PublishPostsFilters } from "../posts/PublishPostsFilters";
import { PublishPostsBatchBar } from "../posts/PublishPostsBatchBar";
import { PublishPostsTableRow } from "../posts/PublishPostsTableRow";
import { PublishPostsPagination } from "../posts/PublishPostsPagination";

interface PublishPostsTabProps {
  metrics: Metric[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newSize: number) => void;
  isLoading: boolean;
  searchKeyword: string;
  onSearchChange: (kw: string) => void;
  channelFilter: "all" | ChannelType;
  onChannelFilterChange: (ch: "all" | ChannelType) => void;
  postStatusFilter: "all" | PostStatus;
  onPostStatusFilterChange: (st: "all" | PostStatus) => void;
  startDate: string;
  onStartDateChange: (d: string) => void;
  endDate: string;
  onEndDateChange: (d: string) => void;
  editingId: number | null;
  editSalesForm: QuickEditSalesData;
  setEditSalesForm: (val: QuickEditSalesData | ((p: QuickEditSalesData) => QuickEditSalesData)) => void;
  startEditSales: (m: Metric) => void;
  cancelEditSales: () => void;
  saveEditSales: () => void;
  isSavingSales: boolean;
  onDeleteMetric: (id: number) => void;
  onScanSingleMetric: (id: number) => void;
  onUpdateStatus: (id: number, status: PostStatus) => void;
  onBatchScan: (ids: number[]) => void;
  isBatchScanning: boolean;
  onBatchUpdateStatus: (ids: number[], status: PostStatus) => void;
  onBatchDelete: (ids: number[]) => void;
}

export const PublishPostsTab = memo(function PublishPostsTab({
  metrics,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
  isLoading,
  searchKeyword,
  onSearchChange,
  channelFilter,
  onChannelFilterChange,
  postStatusFilter,
  onPostStatusFilterChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  editingId,
  editSalesForm,
  setEditSalesForm,
  startEditSales,
  cancelEditSales,
  saveEditSales,
  isSavingSales,
  onDeleteMetric,
  onScanSingleMetric,
  onUpdateStatus,
  onBatchScan,
  isBatchScanning,
  onBatchUpdateStatus,
  onBatchDelete,
}: PublishPostsTabProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.length === metrics.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(metrics.map((m) => m.id));
    }
  }, [selectedIds, metrics]);

  const toggleSelectOne = useCallback((id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleBatchDelete = useCallback(
    (ids: number[]) => {
      onBatchDelete(ids);
      setSelectedIds([]);
    },
    [onBatchDelete],
  );

  return (
    <div className="space-y-4">
      {/* 1. Bộ lọc chuyên sâu */}
      <PublishPostsFilters
        searchKeyword={searchKeyword}
        onSearchChange={onSearchChange}
        channelFilter={channelFilter}
        onChannelFilterChange={onChannelFilterChange}
        postStatusFilter={postStatusFilter}
        onPostStatusFilterChange={onPostStatusFilterChange}
        startDate={startDate}
        onStartDateChange={onStartDateChange}
        endDate={endDate}
        onEndDateChange={onEndDateChange}
      />

      {/* 2. Thanh tác vụ hàng loạt khi có bài được chọn */}
      <PublishPostsBatchBar
        selectedCount={selectedIds.length}
        selectedIds={selectedIds}
        isBatchScanning={isBatchScanning}
        onBatchScan={onBatchScan}
        onBatchUpdateStatus={onBatchUpdateStatus}
        onBatchDelete={handleBatchDelete}
        onClearSelection={() => setSelectedIds([])}
      />

      {/* 3. Lưu ý chính sách thu thập số liệu */}
      <div className="flex items-center gap-2 rounded-lg bg-blue-50/70 border border-blue-200/70 px-3 py-2 text-xs text-blue-900">
        <span className="text-sm">ℹ️</span>
        <p className="leading-snug">
          <strong>Lưu ý thu thập số liệu:</strong> Extension quét tự động các chỉ số công khai (Like, Comment, Share, Trạng thái bài). Lượt tiếp cận (Reach) chỉ có khi bạn là Admin nhóm hoặc Fanpage. Inbox và Đơn hàng là dữ liệu hội thoại riêng, được ghi nhận qua nút &ldquo;Sửa&rdquo; hoặc CRM.
        </p>
      </div>

      {/* 4. Bảng danh sách lượt đăng thực tế */}
      {isLoading ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--dim)]">
          Đang tải danh sách bài đăng từ máy chủ…
        </div>
      ) : metrics.length === 0 ? (
        <EmptyState
          title="Không tìm thấy bài đăng nào"
          description={
            searchKeyword || channelFilter !== "all" || postStatusFilter !== "all" || startDate || endDate
              ? "Không có bài đăng nào khớp với điều kiện lọc hiện tại. Thử đổi từ khóa hoặc bộ lọc."
              : "Chưa có lượt đăng thực tế nào trong cơ sở dữ liệu."
          }
        />
      ) : (
        <div className={`${cardCls} overflow-hidden shadow-sm`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-alt)] border-b border-[var(--border)] text-xs font-semibold text-[var(--dim)]">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả bài đăng trên trang này"
                      checked={selectedIds.length === metrics.length && metrics.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-[var(--border)]"
                    />
                  </th>
                  <th className={tableThCls}>Sản phẩm & Nội dung</th>
                  <th className={tableThCls}>Kênh đăng & Quyền</th>
                  <th className={tableThCls}>Thời gian & Khung giờ</th>
                  <th className={tableThCls}>Ghi chú (Link bài đăng)</th>
                  <th className={`${tableThCls} text-center`}>Trạng thái Facebook</th>
                  <th className={`${tableThCls} text-center`}>Tương tác (DOM)</th>
                  <th className={`${tableThCls} text-center`}>Chuyển đổi (Bán hàng)</th>
                  <th className={`${tableThCls} text-right`}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {metrics.map((m) => (
                  <PublishPostsTableRow
                    key={m.id}
                    metric={m}
                    isSelected={selectedIds.includes(m.id)}
                    onToggleSelect={toggleSelectOne}
                    isEditing={editingId === m.id}
                    editSalesForm={editSalesForm}
                    setEditSalesForm={setEditSalesForm}
                    startEditSales={startEditSales}
                    cancelEditSales={cancelEditSales}
                    saveEditSales={saveEditSales}
                    isSavingSales={isSavingSales}
                    onDeleteMetric={onDeleteMetric}
                    onScanSingleMetric={onScanSingleMetric}
                    onUpdateStatus={onUpdateStatus}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. Thanh phân trang phía máy chủ */}
          <PublishPostsPagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      )}
    </div>
  );
});

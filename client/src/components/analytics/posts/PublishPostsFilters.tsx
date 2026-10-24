import { memo } from "react";
import type { ChannelType, PostStatus } from "../analyticsTypes";
import { SearchInput } from "../../ui";
import { cardCls, inputCls, labelCls } from "../../../utils/styles";

interface PublishPostsFiltersProps {
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
}

export const PublishPostsFilters = memo(function PublishPostsFilters({
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
}: PublishPostsFiltersProps) {
  return (
    <div className={`${cardCls} p-4 space-y-3`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Tìm kiếm */}
        <div>
          <label className={labelCls} htmlFor="post-search">
            Tìm kiếm
          </label>
          <SearchInput
            value={searchKeyword}
            onChange={onSearchChange}
            placeholder="Sản phẩm, STT, kênh, link…"
            ariaLabel="Tìm kiếm lượt đăng"
          />
        </div>

        {/* Lọc loại kênh */}
        <div>
          <label className={labelCls} htmlFor="filter-channel">
            Kênh đăng
          </label>
          <select
            id="filter-channel"
            className={inputCls}
            value={channelFilter}
            onChange={(e) => onChannelFilterChange(e.target.value as any)}
          >
            <option value="all">Tất cả các kênh</option>
            <option value="group">Hội nhóm Facebook</option>
            <option value="page">Fanpage Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>

        {/* Lọc trạng thái bài viết Facebook */}
        <div>
          <label className={labelCls} htmlFor="filter-status">
            Trạng thái bài Facebook
          </label>
          <select
            id="filter-status"
            className={inputCls}
            value={postStatusFilter}
            onChange={(e) => onPostStatusFilterChange(e.target.value as any)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">🟢 Đang hiển thị</option>
            <option value="pending_approval">🟡 Đang chờ duyệt</option>
            <option value="removed">🔴 Bị xóa / Không truy cập</option>
          </select>
        </div>

        {/* Khoảng ngày đăng */}
        <div>
          <label className={labelCls} htmlFor="filter-start-date">
            Khoảng ngày đăng
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="filter-start-date"
              type="date"
              className={`${inputCls} py-1 text-xs`}
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
            <span className="text-[var(--dim)] text-xs">→</span>
            <input
              id="filter-end-date"
              type="date"
              aria-label="Đến ngày"
              className={`${inputCls} py-1 text-xs`}
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

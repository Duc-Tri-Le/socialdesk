import { SearchInput } from "../ui";
import { inputCls, labelCls } from "../../utils/styles";
import {
  type GroupSort,
  GROUP_SORT_OPTIONS,
  groupSortLabel,
} from "./groupTypes";

export interface GroupListControlsProps {
  searchId?: string;
  sortId?: string;
  search: string;
  onSearchChange: (value: string) => void;
  sort: GroupSort;
  onSortChange: (value: GroupSort) => void;
  total: number;
  allTotal: number;
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: number;
  onClearSearch?: () => void;
}

export function GroupListControls({
  searchId = "groups-search",
  sortId = "groups-sort",
  search,
  onSearchChange,
  sort,
  onSortChange,
  total,
  allTotal,
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  pageSize,
  onClearSearch,
}: GroupListControlsProps) {
  const needle = search.trim();

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor={searchId}>
            Tìm kiếm nhóm
          </label>
          <SearchInput
            id={searchId}
            ariaLabel="Tìm kiếm nhóm theo tên, link, mô tả, tài khoản"
            value={search}
            onChange={onSearchChange}
            placeholder="Tìm theo tên nhóm, link, mô tả, nick Facebook, Page…"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor={sortId}>
            Sắp xếp danh sách nhóm
          </label>
          <select
            id={sortId}
            aria-label="Sắp xếp danh sách nhóm Facebook"
            className={inputCls}
            value={sort}
            onChange={(e) => onSortChange(e.target.value as GroupSort)}
          >
            {GROUP_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Thông tin phạm vi đang xem và tìm kiếm */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs text-[var(--dim)]">
          <span>
            Đang xem{" "}
            <strong className="font-mono text-[var(--text)]">
              {rangeStart}–{rangeEnd} / {total}
            </strong>{" "}
            nhóm · Trang {page}/{totalPages} ({pageSize} nhóm/trang)
            {needle ? (
              <>
                {" "}
                · đang tìm theo <strong className="text-[var(--text)]">“{needle}”</strong>
                {allTotal !== total && ` (trong tổng số ${allTotal} nhóm)`}
              </>
            ) : null}
            {sort !== "default" ? ` · ${groupSortLabel(sort)}` : null}
          </span>

          {needle && onClearSearch && (
            <button
              type="button"
              onClick={onClearSearch}
              className="font-semibold text-[var(--accent)] hover:underline"
            >
              Xóa tìm kiếm
            </button>
          )}
        </div>
      )}
    </div>
  );
}

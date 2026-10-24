import { useState, useMemo } from "react";
import type { Account, Page } from "../../../types";
import type { SortOption, StatusFilter } from "../accountTypes";
import {
  filterAndSortAccounts,
  getSessionStatus,
  isAccountOnline,
} from "../utils/accountFilters";
import { usePagination } from "../../ui/Pagination";

export const PAGE_SIZE = 10;

export interface UsePlatformAccountManagerProps {
  platformAccounts: Account[];
  pages: Page[];
  onlineCodes: string[];
  scrollLayout: "paged" | "scroll";
  onSelect: (args: { id: number; selected: boolean }) => void;
  setMsg: (msg: string) => void;
  platformLabel: string;
}

export function usePlatformAccountManager({
  platformAccounts,
  pages,
  onlineCodes,
  scrollLayout,
  onSelect,
  setMsg,
  platformLabel,
}: UsePlatformAccountManagerProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("selected_first");

  // Thống kê nhanh theo trạng thái (chỉ tính lại khi danh sách nick đổi)
  const stats = useMemo(() => {
    let selected = 0;
    let online = 0;
    let loggedIn = 0;
    let expired = 0;
    let checkpoint = 0;

    for (const a of platformAccounts) {
      if (a.selected) selected++;
      if (isAccountOnline(a, onlineCodes)) online++;
      const session = getSessionStatus(a);
      if (session === "logged_in") loggedIn++;
      else if (session === "expired") expired++;
      else if (session === "checkpoint") checkpoint++;
    }

    return { selected, online, loggedIn, expired, checkpoint };
  }, [platformAccounts, onlineCodes]);

  // Danh sách tài khoản đã lọc và sắp xếp (memoized để tránh re-calc thừa khi timer 3s refetch)
  const filteredAccounts = useMemo(() => {
    return filterAndSortAccounts(platformAccounts, {
      search,
      filter,
      sort,
      onlineCodes,
      pages,
    });
  }, [platformAccounts, search, filter, sort, onlineCodes, pages]);

  // Phân trang dùng chung qua usePagination
  const pagination = usePagination(filteredAccounts, { pageSize: PAGE_SIZE });

  const pagedAccounts = useMemo(() => {
    if (scrollLayout === "scroll") {
      return filteredAccounts;
    }
    return pagination.pagedItems;
  }, [filteredAccounts, scrollLayout, pagination.pagedItems]);

  // Handlers
  const handleSearchChange = (val: string) => {
    setSearch(val);
    pagination.resetPage();
  };

  const handleFilterChange = (newFilter: StatusFilter) => {
    setFilter(newFilter);
    pagination.resetPage();
  };

  const handleSelectAll = () => {
    filteredAccounts.forEach((acc) => {
      if (!acc.selected) {
        onSelect({ id: acc.id, selected: true });
      }
    });
    setMsg(`Đã chọn dùng tất cả nick ${platformLabel}.`);
  };

  const handleDeselectAll = () => {
    filteredAccounts.forEach((acc) => {
      if (acc.selected) {
        onSelect({ id: acc.id, selected: false });
      }
    });
    setMsg(`Đã bỏ chọn tất cả nick ${platformLabel}.`);
  };

  const handleSelectOnline = () => {
    filteredAccounts.forEach((acc) => {
      if (isAccountOnline(acc, onlineCodes) && !acc.selected) {
        onSelect({ id: acc.id, selected: true });
      }
    });
    setMsg(`Đã chọn dùng các nick ${platformLabel} có Extension online.`);
  };

  return {
    search,
    filter,
    sort,
    page: pagination.page,
    totalPages: pagination.totalPages,
    totalItems: pagination.totalItems,
    paginationProps: pagination.paginationProps,
    stats,
    filteredAccounts,
    pagedAccounts,
    setSort,
    setPage: pagination.setPage,
    handleSearchChange,
    handleFilterChange,
    handleSelectAll,
    handleDeselectAll,
    handleSelectOnline,
  };
}

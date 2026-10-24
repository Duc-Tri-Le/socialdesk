import type { Account, Page } from "../../../types";
import { fuzzyMatchVi } from "../../../utils/search";
import type { SortOption, StatusFilter } from "../accountTypes";

/**
 * Trả về trạng thái phiên đăng nhập của tài khoản
 */
export function getSessionStatus(
  a: Account,
): "logged_in" | "expired" | "checkpoint" {
  return a.session_status || (a.linked ? "logged_in" : "expired");
}

/**
 * Kiểm tra tài khoản có đang kết nối Chrome Extension Online không
 */
export function isAccountOnline(a: Account, onlineCodes: string[]): boolean {
  const code = (a.extension_code || "").trim().toUpperCase();
  return Boolean(code && onlineCodes.includes(code));
}

/**
 * Sắp xếp danh sách tài khoản theo tùy chọn được chỉ định
 */
export function sortAccounts(
  accs: Account[],
  sort: SortOption,
  pages: Page[] = [],
  onlineCodes: string[] = [],
): Account[] {
  return [...accs].sort((x, y) => {
    if (sort === "selected_first") {
      const xSel = x.selected ? 1 : 0;
      const ySel = y.selected ? 1 : 0;
      if (xSel !== ySel) return ySel - xSel;
    }
    if (sort === "online_first") {
      const xOnline = isAccountOnline(x, onlineCodes) ? 1 : 0;
      const yOnline = isAccountOnline(y, onlineCodes) ? 1 : 0;
      if (xOnline !== yOnline) return yOnline - xOnline;
    }
    if (sort === "name_asc") {
      return x.name.localeCompare(y.name, "vi");
    }
    if (sort === "name_desc") {
      return y.name.localeCompare(x.name, "vi");
    }
    if (sort === "most_pages") {
      const xCount = pages.filter((p) => p.account_id === x.id).length;
      const yCount = pages.filter((p) => p.account_id === y.id).length;
      if (xCount !== yCount) return yCount - xCount;
    }
    if (sort === "newest") {
      return y.id - x.id;
    }
    return 0;
  });
}

export interface FilterAccountsOptions {
  search?: string;
  filter?: StatusFilter;
  sort?: SortOption;
  onlineCodes: string[];
  pages?: Page[];
  includePlatformInSearch?: boolean;
}

/**
 * Lọc và sắp xếp tài khoản theo các tiêu chí tìm kiếm, trạng thái và sắp xếp
 */
export function filterAndSortAccounts(
  accounts: Account[],
  options: FilterAccountsOptions,
): Account[] {
  const {
    search = "",
    filter = "all",
    sort = "selected_first",
    onlineCodes,
    pages = [],
    includePlatformInSearch = false,
  } = options;

  const trimmedSearch = search.trim();

  const filtered = accounts.filter((a) => {
    // 1. Lọc theo trạng thái
    if (filter === "selected" && !a.selected) return false;
    if (filter === "online" && !isAccountOnline(a, onlineCodes)) return false;
    if (filter === "logged_in" && getSessionStatus(a) !== "logged_in") return false;
    if (filter === "expired" && getSessionStatus(a) !== "expired") return false;
    if (filter === "checkpoint" && getSessionStatus(a) !== "checkpoint") return false;

    // 2. Lọc theo từ khóa tìm kiếm (hỗ trợ tiếng Việt không dấu)
    if (trimmedSearch) {
      const searchTarget = includePlatformInSearch
        ? `${a.name} ${a.handle || ""} ${a.extension_code || ""} ${a.platform}`
        : `${a.name} ${a.handle || ""} ${a.extension_code || ""}`;

      if (fuzzyMatchVi(searchTarget, trimmedSearch)) {
        return true;
      }

      // Tìm kiếm trong tên các Fanpage thuộc tài khoản
      const myPages = pages.filter((p) => p.account_id === a.id);
      return myPages.some((p) => fuzzyMatchVi(p.name, trimmedSearch));
    }

    return true;
  });

  return sortAccounts(filtered, sort, pages, onlineCodes);
}

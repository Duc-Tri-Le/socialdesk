import { useMemo, useState } from "react";
import type { Group } from "../../types";
import { fuzzyMatchVi } from "../../utils/search";
import { usePagination } from "../ui";

export type GroupSort =
  | "default"
  | "target_first"
  | "members_desc"
  | "members_asc"
  | "name_asc"
  | "name_desc"
  | "joined_first"
  | "newest";

export const GROUP_SORT_OPTIONS: { value: GroupSort; label: string }[] = [
  { value: "default", label: "Mặc định (theo thứ tự ban đầu)" },
  { value: "target_first", label: "★ Nhóm đích đăng bài lên đầu" },
  { value: "members_desc", label: "Thành viên: Nhiều nhất → Ít nhất" },
  { value: "members_asc", label: "Thành viên: Ít nhất → Nhiều nhất" },
  { value: "name_asc", label: "Tên nhóm: A → Z" },
  { value: "name_desc", label: "Tên nhóm: Z → A" },
  { value: "joined_first", label: "✓ Đã tham gia lên đầu" },
  { value: "newest", label: "Mới thêm gần đây" },
];

export function groupSortLabel(sort: GroupSort): string {
  const found = GROUP_SORT_OPTIONS.find((o) => o.value === sort);
  return found ? found.label : sort;
}

export function hasAnyJoinedIdentity(g: Group): boolean {
  if (g.account_joined) return true;
  if (g.joined_pages && g.joined_pages.length > 0) return true;
  return g.memberships?.some((m) => m.status === "joined") ?? false;
}

export function matchesGroupSearch(g: Group, query: string): boolean {
  if (!query.trim()) return true;

  const identities = (g.memberships ?? [])
    .map((m) => `${m.identity_name} ${m.identity_kind === "page" ? "page fanpage" : "nick facebook"}`)
    .join(" ");

  const combined = [
    g.name,
    g.url,
    identities,
    g.is_target ? "dich muc tieu target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return fuzzyMatchVi(combined, query);
}

export function sortGroups(list: Group[], sort: GroupSort): Group[] {
  if (sort === "default") return list;
  const arr = [...list];

  switch (sort) {
    case "target_first":
      return arr.sort((a, b) => {
        if (a.is_target === b.is_target) return 0;
        return a.is_target ? -1 : 1;
      });

    case "members_desc":
      return arr.sort((a, b) => (b.members ?? 0) - (a.members ?? 0));

    case "members_asc":
      return arr.sort((a, b) => (a.members ?? 0) - (b.members ?? 0));

    case "name_asc":
      return arr.sort((a, b) =>
        a.name.localeCompare(b.name, "vi", { sensitivity: "base" }),
      );

    case "name_desc":
      return arr.sort((a, b) =>
        b.name.localeCompare(a.name, "vi", { sensitivity: "base" }),
      );

    case "joined_first":
      return arr.sort((a, b) => {
        const aJoined = hasAnyJoinedIdentity(a);
        const bJoined = hasAnyJoinedIdentity(b);
        if (aJoined === bJoined) return 0;
        return aJoined ? -1 : 1;
      });

    case "newest":
      return arr.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : a.id;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : b.id;
        return bTime - aTime;
      });

    default:
      return arr;
  }
}

export const GROUPS_PAGE_SIZE = 10;

/**
 * Hook kết hợp tìm kiếm (fuzzyMatchVi), sắp xếp và phân trang (dùng usePagination có sẵn)
 */
export function useGroupFilterPagination(
  allGroups: Group[],
  pageSize: number = GROUPS_PAGE_SIZE,
) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<GroupSort>("default");

  const filtered = useMemo(() => {
    if (!search.trim()) return allGroups;
    return allGroups.filter((g) => matchesGroupSearch(g, search));
  }, [allGroups, search]);

  const sorted = useMemo(() => {
    return sortGroups(filtered, sort);
  }, [filtered, sort]);

  const pagination = usePagination<Group>(sorted, { pageSize });

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    pagination.resetPage();
  };

  const handleSortChange = (newSort: GroupSort) => {
    setSort(newSort);
    pagination.resetPage();
  };

  const resetFilter = () => {
    setSearch("");
    setSort("default");
    pagination.resetPage();
  };

  return {
    search,
    setSearch: handleSearchChange,
    sort,
    setSort: handleSortChange,
    resetFilter,
    filteredCount: filtered.length,
    total: pagination.totalItems,
    ...pagination,
  };
}

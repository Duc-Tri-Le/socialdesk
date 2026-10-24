import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Group } from "../../types";
import { EmptyState, Pagination } from "../ui";
import { useGroupFilterPagination } from "../groups/groupTypes";
import { GroupListControls } from "../groups/GroupListControls";
import { GroupItemCard } from "../groups/GroupItemCard";
import { GroupLinkScanner } from "../groups/GroupLinkScanner";

export function GroupsSection() {
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.listGroups({}),
  });
  const allGroups: Group[] = groups.data?.groups ?? [];

  const adderAccount = useQuery({
    queryKey: ["group-adder-account"],
    queryFn: () => api.getGroupAdderAccount({}),
  });

  const [pasteText, setPasteText] = useState("");

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["groups"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const saveLinks = useMutation({
    mutationFn: () => api.saveGroupLinks({ links_text: pasteText }),
    onSuccess: (res) => {
      if (res.ok) setPasteText("");
      refreshAll();
    },
  });

  const submitSave = (e: FormEvent) => {
    e.preventDefault();
    if (pasteText.trim()) saveLinks.mutate();
  };

  const setMembership = useMutation({
    mutationFn: (args: {
      group_id: number;
      identity_kind: "account" | "page";
      identity_id: number;
      status: "joined" | "not_joined";
    }) => api.setGroupMembership(args),
    onSuccess: refreshAll,
  });

  const flags = useMutation({
    mutationFn: (args: { id: number; joined?: boolean; is_target?: boolean }) =>
      api.setGroupFlags(args),
    onSuccess: refreshAll,
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteGroup({ id }),
    onSuccess: refreshAll,
  });

  // Sử dụng hook lọc, sắp xếp và phân trang dùng chung
  const {
    search,
    setSearch,
    sort,
    setSort,
    page,
    totalPages,
    total,
    rangeStart,
    rangeEnd,
    pagedItems,
    pageSize,
    resetFilter,
    paginationProps,
  } = useGroupFilterPagination(allGroups);

  return (
    <div className="space-y-6">
      {/* Khối quét & dán link nhóm */}
      <GroupLinkScanner
        isAdderLinked={!!adderAccount.data?.linked}
        pasteText={pasteText}
        onPasteTextChange={setPasteText}
        onSubmit={submitSave}
        isPending={saveLinks.isPending}
        error={
          saveLinks.isError
            ? saveLinks.error instanceof Error
              ? saveLinks.error.message
              : "Lỗi không xác định."
            : null
        }
        scannedResult={saveLinks.data}
      />

      {/* Danh sách nhóm */}
      <section aria-label="Danh sách hội nhóm">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">
              Danh sách nhóm ({allGroups.length})
            </h2>
            <p className="mt-0.5 text-sm text-[var(--dim)]">
              Chỉ đăng vào nhóm bạn <strong>đã tham gia</strong> — đăng vào nhóm lạ dễ bị Facebook coi là spam.
            </p>
          </div>
        </header>

        {/* Thanh tìm kiếm & sắp xếp */}
        {allGroups.length > 0 && (
          <GroupListControls
            search={search}
            onSearchChange={setSearch}
            sort={sort}
            onSortChange={setSort}
            total={total}
            allTotal={allGroups.length}
            page={page}
            totalPages={totalPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            pageSize={pageSize}
            onClearSearch={resetFilter}
          />
        )}

        {groups.isPending && (
          <p className="mt-3 text-sm text-[var(--dim)]">Đang tải danh sách nhóm…</p>
        )}

        {/* Danh sách thẻ nhóm */}
        <ul className="mt-3 space-y-3">
          {pagedItems.map((g: Group) => (
            <GroupItemCard
              key={g.id}
              group={g}
              onDelete={(id) => del.mutate(id)}
              isDeletePending={del.isPending}
              onToggleTarget={(id, currentTarget) =>
                flags.mutate({ id, is_target: !currentTarget })
              }
              isTargetPending={flags.isPending}
              onSetMembership={(args) => setMembership.mutate(args)}
              isMembershipPending={setMembership.isPending}
            />
          ))}
        </ul>

        {/* Trạng thái chưa có nhóm nào trong hệ thống */}
        {groups.data && allGroups.length === 0 && (
          <p className="mt-3 text-sm text-[var(--dim)]">
            Chưa có nhóm nào — dán link nhóm Facebook vào ô ở trên rồi bấm “Lưu &amp; quét nhóm”.
          </p>
        )}

        {/* Trạng thái không tìm thấy kết quả theo từ khóa */}
        {allGroups.length > 0 && total === 0 && (
          <div className="mt-3">
            <EmptyState
              message={`Không tìm thấy nhóm nào khớp với “${search.trim()}”.`}
              actionLabel="Xóa từ khóa tìm kiếm"
              onAction={resetFilter}
            />
          </div>
        )}

        {/* Phân trang chuẩn với nhãn Trang trước, Trang sau, tối đa 5 trang kèm ... */}
        {total > pageSize && (
          <div className="mt-4">
            <Pagination
              {...paginationProps}
              itemLabel="nhóm"
              navLabel="Phân trang danh sách nhóm"
              prevLabel="Trang trước"
              nextLabel="Trang sau"
            />
          </div>
        )}
      </section>
    </div>
  );
}

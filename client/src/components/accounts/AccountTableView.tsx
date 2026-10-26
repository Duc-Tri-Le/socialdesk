import { useState, useEffect, useRef, type ReactNode } from "react";
import type { Account, Page } from "../../types";
import { ConfirmModal, Pagination, usePagination } from "../ui";
import { AccountTableRow } from "./AccountTableRow";

export interface AccountTableViewProps {
  accounts: Account[];
  pages: Page[];
  onlineCodes: string[];
  onSaveExtensionCode: (args: { id: number; extension_code: string }) => void;
  isSaveExtensionCodePending: boolean;
  onSelect: (args: { id: number; selected: boolean }) => void;
  isSelectPending: boolean;
  onSetSessionStatus?: (args: {
    id: number;
    status: "logged_in" | "expired" | "checkpoint";
  }) => void;
  onLink: (args: { id: number; linked: boolean }) => void;
  isLinkPending: boolean;
  onDelete: (id: number) => void;
  onSaveUrl: (args: { id: number; profile_url: string }) => void;
  isSaveUrlPending: boolean;
  onSaveName: (args: { id: number; name: string }) => void;
  isSaveNamePending: boolean;
  onRetryConnection?: () => void;
  onMsg: (msg: string) => void;
}

export function AccountTableView({
  accounts,
  pages,
  onlineCodes,
  onSaveExtensionCode,
  isSaveExtensionCodePending,
  onSelect,
  isSelectPending,
  onSetSessionStatus,
  onLink,
  isLinkPending,
  onDelete,
  onSaveUrl,
  isSaveUrlPending: _isSaveUrlPending,
  onSaveName,
  isSaveNamePending,
  onRetryConnection,
  onMsg,
}: AccountTableViewProps) {
  const pagination = usePagination(accounts, { pageSize: 10 });
  const prevAccountsRef = useRef(accounts);
  useEffect(() => {
    if (prevAccountsRef.current !== accounts) {
      pagination.resetPage();
      prevAccountsRef.current = accounts;
    }
  }, [accounts]);

  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const [confirmState, setConfirmState] = useState<{
    account: Account;
    type: "delete" | "unlink";
    title: string;
    message: ReactNode;
  } | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmAction = () => {
    if (!confirmState) return;
    const { account, type } = confirmState;
    if (type === "delete") {
      onDelete(account.id);
    } else if (type === "unlink") {
      onLink({ id: account.id, linked: false });
    }
    setConfirmState(null);
  };

  const handleRequestDelete = (a: Account) => {
    const extCode = (a.extension_code || "").trim().toUpperCase();
    const myPages = pages.filter((p) => p.account_id === a.id);
    setConfirmState({
      account: a,
      type: "delete",
      title: `Xác nhận xóa tài khoản "${a.name}"`,
      message: (
        <div className="space-y-2 text-xs">
          <p>
            Hành động này không thể hoàn tác. Xóa tài khoản <strong>"{a.name}"</strong>:
          </p>
          <div className="rounded border border-red-500/25 bg-red-500/10 p-2 text-red-300">
            <p className="font-semibold text-red-200">Dữ liệu bị xóa vĩnh viễn:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px] mt-1">
              <li>Toàn bộ thông tin tài khoản và mã Chrome ({extCode || "Chưa có"}).</li>
              {myPages.length > 0 && (
                <li>
                  <strong>{myPages.length} Fanpage trực thuộc</strong> sẽ bị xóa khỏi hệ thống.
                </li>
              )}
              <li>Các lịch đăng bài tự động nhắm tới tài khoản này sẽ bị hủy.</li>
            </ul>
          </div>
        </div>
      ),
    });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-alt)] font-semibold text-[var(--dim)]">
            <th className="py-3 px-3 w-14 text-center">Đang dùng</th>
            <th className="py-3 px-3 min-w-[190px]">Tài khoản</th>
            <th className="py-3 px-3 w-24">Nền tảng</th>
            <th className="py-3 px-3 min-w-[150px]">Phiên đăng nhập</th>
            <th className="py-3 px-3 min-w-[190px]">Chrome Extension</th>
            <th className="py-3 px-3 min-w-[150px]">Fanpage trực thuộc</th>
            <th className="py-3 px-3 w-20 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {pagination.pagedItems.map((a) => (
            <AccountTableRow
              key={a.id}
              account={a}
              pages={pages}
              onlineCodes={onlineCodes}
              isExpanded={expandedRows.has(a.id)}
              onToggleExpand={() => toggleExpand(a.id)}
              onSelect={onSelect}
              isSelectPending={isSelectPending}
              onSaveExtensionCode={onSaveExtensionCode}
              isSaveExtensionCodePending={isSaveExtensionCodePending}
              onSetSessionStatus={onSetSessionStatus}
              onSaveUrl={onSaveUrl}
              onSaveName={onSaveName}
              isSaveNamePending={isSaveNamePending}
              onRetryConnection={onRetryConnection}
              onMsg={onMsg}
              onRequestDelete={handleRequestDelete}
            />
          ))}
        </tbody>
      </table>
    </div>

      {accounts.length > 0 && (
        <Pagination
          {...pagination.paginationProps}
          itemLabel="tài khoản"
          navLabel="Phân trang bảng tài khoản"
          prevLabel="Trang trước"
          nextLabel="Trang sau"
        />
      )}

      {confirmState && (
        <ConfirmModal
          isOpen={true}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={
            confirmState.type === "delete" ? "Xóa vĩnh viễn" : "Gỡ liên kết"
          }
          variant={confirmState.type === "delete" ? "danger" : "warn"}
          isLoading={isLinkPending}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

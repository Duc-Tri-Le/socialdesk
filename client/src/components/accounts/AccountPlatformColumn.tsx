import type { Account, Page } from "../../types";
import type { SortOption } from "./accountTypes";
import {
  Badge,
  EmptyState,
  FacebookIcon,
  InstagramIcon,
  Pagination,
  SearchInput,
} from "../ui";
import { AccountItemCard } from "./AccountItemCard";
import { usePlatformAccountManager } from "./hooks/usePlatformAccountManager";

export interface AccountPlatformColumnProps {
  platform: "Facebook" | "Instagram";
  accounts: Account[];
  pages: Page[];
  onlineCodes: string[];
  scrollLayout: "paged" | "scroll";
  onToggleScrollLayout: () => void;
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
  onOpenAddForm: () => void;
  onSwitchProfile?: (args: { id: number }) => void;
}

export function AccountPlatformColumn({
  platform,
  accounts,
  pages,
  onlineCodes,
  scrollLayout,
  onToggleScrollLayout,
  onSaveExtensionCode,
  isSaveExtensionCodePending,
  onSelect,
  isSelectPending,
  onSetSessionStatus,
  onLink,
  isLinkPending,
  onDelete,
  onSaveUrl,
  isSaveUrlPending,
  onSaveName,
  isSaveNamePending,
  onRetryConnection,
  onMsg,
  onOpenAddForm,
  onSwitchProfile,
}: AccountPlatformColumnProps) {
  const isFb = platform === "Facebook";

  const {
    search,
    filter,
    sort,
    totalItems,
    paginationProps,
    stats,
    filteredAccounts,
    pagedAccounts,
    setSort,
    handleSearchChange,
    handleFilterChange,
    handleSelectAll,
    handleDeselectAll,
    handleSelectOnline,
  } = usePlatformAccountManager({
    platformAccounts: accounts,
    pages,
    onlineCodes,
    scrollLayout,
    onSelect,
    setMsg: onMsg,
    platformLabel: platform,
  });

  return (
    <section
      aria-label={`Danh sách tài khoản ${platform}`}
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
    >
      {/* Header mục nền tảng */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              isFb
                ? "bg-blue-600/15 text-blue-500"
                : "bg-gradient-to-tr from-amber-500/20 via-pink-500/20 to-purple-500/20 text-pink-500"
            }`}
          >
            {isFb ? (
              <FacebookIcon className="h-3.5 w-3.5" />
            ) : (
              <InstagramIcon className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--text)]">
              Tài khoản {platform}
            </h3>
            <Badge
              variant={isFb ? "info" : "accent"}
              className="text-[10px] px-1.5 py-0"
            >
              {filteredAccounts.length}/{accounts.length} nick
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {filteredAccounts.length > 5 && (
            <button
              type="button"
              onClick={onToggleScrollLayout}
              className="text-[11px] font-semibold text-[var(--accent-ink)] hover:underline"
            >
              {scrollLayout === "scroll" ? "📄 Phân trang" : "📜 Cuộn list"}
            </button>
          )}
        </div>
      </header>

      {/* Thanh công cụ tìm kiếm, sắp xếp và bộ lọc nhỏ gọn */}
      <div className="mt-2.5 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]/40 p-2 text-xs">
        {/* Hàng 1: Tìm kiếm + Sắp xếp + Thao tác nhanh */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="min-w-[130px] flex-1">
            <SearchInput
              id={`search-${platform.toLowerCase()}-accounts`}
              value={search}
              onChange={handleSearchChange}
              placeholder={
                isFb
                  ? "Tìm tên, mã Chrome, Fanpage..."
                  : "Tìm tên, username, mã Chrome..."
              }
              ariaLabel={`Tìm kiếm tài khoản ${platform}`}
              compact
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px] font-medium text-[var(--text)] focus:outline-none"
              title="Sắp xếp danh sách"
            >
              <option value="selected_first">Đang chọn</option>
              <option value="online_first">Chrome Online</option>
              <option value="name_asc">Tên A &rarr; Z</option>
              <option value="name_desc">Tên Z &rarr; A</option>
              {isFb && <option value="most_pages">Nhiều Page nhất</option>}
              <option value="newest">Mới thêm</option>
            </select>

            <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5 text-[10px]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="rounded px-1.5 py-0.5 text-[var(--dim)] hover:text-[var(--text)] transition-colors"
                title={`Chọn tất cả nick ${platform}`}
              >
                Tất cả
              </button>
              {stats.selected > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="rounded px-1.5 py-0.5 text-[var(--dim)] hover:text-[var(--text)] transition-colors"
                  title={`Bỏ chọn tất cả nick ${platform}`}
                >
                  Bỏ chọn
                </button>
              )}
              {stats.online > 0 && (
                <button
                  type="button"
                  onClick={handleSelectOnline}
                  className="rounded px-1.5 py-0.5 font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                  title={`Chọn các nick ${platform} đang có Extension Online`}
                >
                  Online
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Hàng 2: Bộ lọc trạng thái dạng chip nhỏ gọn (bắt đầu trực tiếp từ Tất cả) */}
        {accounts.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px] scrollbar-none">
            <button
              type="button"
              onClick={() => handleFilterChange("all")}
              className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-colors ${
                filter === "all"
                  ? "bg-[var(--accent)] text-white shadow-xs"
                  : "bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--text)] border border-[var(--border)]"
              }`}
            >
              Tất cả ({accounts.length})
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange("selected")}
              className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-colors ${
                filter === "selected"
                  ? "bg-amber-500 text-zinc-950 font-semibold shadow-xs"
                  : "bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--text)] border border-[var(--border)]"
              }`}
            >
              Chọn ({stats.selected})
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange("online")}
              className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-colors ${
                filter === "online"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--text)] border border-[var(--border)]"
              }`}
            >
              Online ({stats.online})
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange("logged_in")}
              className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-colors ${
                filter === "logged_in"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--text)] border border-[var(--border)]"
              }`}
            >
              Đăng nhập ({stats.loggedIn})
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange("expired")}
              className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-colors ${
                filter === "expired"
                  ? "bg-zinc-600 text-white shadow-xs"
                  : "bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--text)] border border-[var(--border)]"
              }`}
            >
              Hết phiên ({stats.expired})
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange("checkpoint")}
              className={`shrink-0 rounded-md px-2 py-0.5 font-medium transition-colors ${
                filter === "checkpoint"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-[var(--surface)] text-[var(--dim)] hover:text-[var(--text)] border border-[var(--border)]"
              }`}
            >
              Xác minh ({stats.checkpoint})
            </button>
          </div>
        )}
      </div>

      {/* Danh sách nick (Cuộn list hoặc Phân trang) */}
      <ul
        className={`mt-3 space-y-3 ${
          scrollLayout === "scroll"
            ? "max-h-[640px] overflow-y-auto pr-1.5 scrollbar-thin"
            : ""
        }`}
      >
        {pagedAccounts.map((a) => (
          <AccountItemCard
            key={a.id}
            account={a}
            pages={pages}
            onlineCodes={onlineCodes}
            onSaveExtensionCode={onSaveExtensionCode}
            isSaveExtensionCodePending={isSaveExtensionCodePending}
            onSelect={onSelect}
            isSelectPending={isSelectPending}
            onSetSessionStatus={onSetSessionStatus}
            onLink={onLink}
            isLinkPending={isLinkPending}
            onDelete={onDelete}
            onSaveUrl={onSaveUrl}
            isSaveUrlPending={isSaveUrlPending}
            onSaveName={onSaveName}
            isSaveNamePending={isSaveNamePending}
            onRetryConnection={onRetryConnection}
            onMsg={onMsg}
            onSwitchProfile={onSwitchProfile}
          />
        ))}
      </ul>

      {/* Trạng thái trống */}
      {filteredAccounts.length === 0 && (
        <EmptyState
          title={
            search.trim() || filter !== "all"
              ? `Không tìm thấy nick ${platform} phù hợp`
              : `Chưa có tài khoản ${platform} nào`
          }
          description={
            search.trim() || filter !== "all"
              ? "Hãy thử đổi từ khóa tìm kiếm hoặc bấm lọc Tất cả."
              : isFb
              ? "Kết nối Chrome Extension để thêm nick Facebook đăng bài tự động."
              : "Thêm tài khoản Instagram để quản lý đăng bài đa nền tảng."
          }
          actionLabel={
            search.trim() || filter !== "all"
              ? "Xóa bộ lọc"
              : `+ Thêm nick ${platform}`
          }
          onAction={
            search.trim() || filter !== "all"
              ? () => {
                  handleSearchChange("");
                  handleFilterChange("all");
                }
              : onOpenAddForm
          }
          className="mt-3"
        />
      )}

      {/* Phân trang chuẩn dùng chung (chỉ hiện khi paged mode) */}
      {scrollLayout === "paged" && totalItems > 0 && (
        <Pagination
          {...paginationProps}
          itemLabel="tài khoản"
          navLabel={`Phân trang tài khoản ${platform}`}
          prevLabel="Trang trước"
          nextLabel="Trang sau"
        />
      )}
    </section>
  );
}

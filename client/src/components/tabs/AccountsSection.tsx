import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { useAccountMutations } from "../accounts/useAccountMutations";
import type { Account, Page } from "../../types";
import {
  FeedbackBanner,
  GridIcon,
  SearchInput,
  TableIcon,
} from "../ui";
import {
  AccountAddForm,
  AccountPlatformColumn,
  AccountTableView,
  ExtensionStatusCard,
  filterAndSortAccounts,
  getSessionStatus,
  isAccountOnline,
} from "../accounts";

export function AccountsSection({
  accounts,
  pages,
}: {
  accounts: Account[];
  pages: Page[];
}) {
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState("");

  // Chế độ xem: Dạng thẻ 2 cột (cards) hoặc Dạng bảng desktop (table)
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Kiểu hiển thị trong dạng thẻ: Phân trang (paged) hoặc Danh sách cuộn (scroll)
  const [scrollLayout, setScrollLayout] = useState<"paged" | "scroll">("paged");

  // Trạng thái mở/đóng form thêm tài khoản
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  // Bộ lọc cho chế độ bảng desktop
  const [tablePlatformFilter, setTablePlatformFilter] = useState<
    "all" | "Facebook" | "Instagram"
  >("all");
  const [tableSearch, setTableSearch] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["pages"] });
  };

  // Polling danh sách mã Chrome Extension đang online qua WebSocket
  const connectedExtQ = useQuery({
    queryKey: ["connectedExtensions"],
    queryFn: () => api.getConnectedExtensions({}),
    refetchInterval: 3000,
  });

  const onlineCodes = useMemo(() => {
    return (connectedExtQ.data?.online_codes || []).map((c: string) =>
      c.toUpperCase(),
    );
  }, [connectedExtQ.data?.online_codes]);

  // Mutations
  const {
    addAccount,
    select,
    saveExtensionCode,
    setSessionStatus,
    link,
    del,
    saveUrl,
    saveName,
  } = useAccountMutations({
    setMsg,
    setIsAddFormOpen,
    refresh,
    refetchExtensions: connectedExtQ.refetch,
  });

  const handleGlobalRetry = () => {
    connectedExtQ.refetch();
    setMsg("Đang kiểm tra lại tín hiệu từ toàn bộ Chrome Extension...");
  };

  // Phân tách tài khoản theo nền tảng
  const fbAccounts = useMemo(
    () => accounts.filter((a) => a.platform.toLowerCase() === "facebook"),
    [accounts],
  );
  const instaAccounts = useMemo(
    () => accounts.filter((a) => a.platform.toLowerCase() === "instagram"),
    [accounts],
  );

  // Thống kê tổng hợp (chỉ tính lại khi danh sách accounts hoặc onlineCodes đổi)
  const summaryStats = useMemo(() => {
    let totalLoggedIn = 0;
    let totalExpired = 0;
    let totalCheckpoint = 0;
    let totalOnline = 0;
    let totalSelected = 0;

    for (const a of accounts) {
      if (a.selected) totalSelected++;
      if (isAccountOnline(a, onlineCodes)) totalOnline++;
      const session = getSessionStatus(a);
      if (session === "logged_in") totalLoggedIn++;
      else if (session === "expired") totalExpired++;
      else if (session === "checkpoint") totalCheckpoint++;
    }

    return {
      totalLoggedIn,
      totalExpired,
      totalCheckpoint,
      totalOnline,
      totalSelected,
    };
  }, [accounts, onlineCodes]);

  // Lọc tài khoản cho chế độ Bảng Desktop
  const tableAccounts = useMemo(() => {
    return filterAndSortAccounts(accounts, {
      search: tableSearch,
      sort: "selected_first",
      onlineCodes,
      pages,
      includePlatformInSearch: true,
      filter: "all",
    }).filter((a) => {
      if (tablePlatformFilter === "all") return true;
      return a.platform.toLowerCase() === tablePlatformFilter.toLowerCase();
    });
  }, [accounts, tableSearch, tablePlatformFilter, onlineCodes, pages]);

  return (
    <div className="space-y-6">
      {/* ================= HEADER TỔNG THỂ (GỌN 2 HÀNG RÕ RÀNG) ================= */}
      <section aria-label="Danh sách tài khoản">
        <header className="flex flex-col gap-2">
          {/* Hàng 1: Tiêu đề + Tổng số tài khoản (trái) và Chuyển chế độ xem + Nút thêm mới (phải) */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-[var(--text)]">
                Quản lý tài khoản mạng xã hội
              </h2>
              <span className="inline-flex items-center rounded-md bg-[var(--surface-alt)] px-2 py-0.5 text-xs font-semibold text-[var(--dim)] border border-[var(--border)]">
                {accounts.length} nick ({fbAccounts.length} FB · {instaAccounts.length} IG)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Bộ chuyển đổi chế độ xem: Dạng Thẻ vs Dạng Bảng */}
              <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors ${
                    viewMode === "cards"
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "text-[var(--dim)] hover:text-[var(--text)]"
                  }`}
                  title="Xem dạng thẻ 2 cột"
                >
                  <GridIcon className="h-3.5 w-3.5" />
                  <span>Dạng thẻ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors ${
                    viewMode === "table"
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "text-[var(--dim)] hover:text-[var(--text)]"
                  }`}
                  title="Xem dạng bảng dữ liệu desktop"
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  <span>Bảng desktop</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsAddFormOpen(!isAddFormOpen)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
              >
                {isAddFormOpen ? "✕ Đóng form" : "+ Thêm tài khoản mới"}
              </button>
            </div>
          </div>

          {/* Hàng 2: Thống kê trạng thái gom gọn trên 1 hàng */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-1 text-[var(--dim)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Phiên: <strong className="text-emerald-400 font-semibold">{summaryStats.totalLoggedIn}</strong> Đã đăng nhập
              {summaryStats.totalExpired > 0 && <span className="text-zinc-400">· {summaryStats.totalExpired} Hết phiên</span>}
              {summaryStats.totalCheckpoint > 0 && <span className="text-amber-400 font-semibold">· {summaryStats.totalCheckpoint} Cần xác minh</span>}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-1 text-[var(--dim)]">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              Extension: <strong className="text-sky-400 font-semibold">{summaryStats.totalOnline}</strong> Online
              {accounts.length - summaryStats.totalOnline > 0 && <span className="text-zinc-400">· {accounts.length - summaryStats.totalOnline} Offline</span>}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-1 text-[var(--dim)]">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Đang dùng: <strong className="text-amber-300 font-semibold">{summaryStats.totalSelected}</strong> nick
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-1 text-[var(--dim)]">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              <strong className="text-indigo-300 font-semibold">{pages.length}</strong> Fanpage
            </span>
          </div>
        </header>

        {/* Thông báo phản hồi */}
        <FeedbackBanner
          message={msg}
          onDismiss={() => setMsg("")}
          className="mt-3"
        />

        {/* Form thêm tài khoản mới */}
        <AccountAddForm
          isOpen={isAddFormOpen}
          onToggle={setIsAddFormOpen}
          onSubmit={(args) => addAccount.mutate(args)}
          isPending={addAccount.isPending}
        />

        {/* Trạng thái kết nối Chrome Extension + nút Thử kết nối lại toàn bộ */}
        <ExtensionStatusCard
          onlineCodes={onlineCodes}
          isFetching={connectedExtQ.isFetching}
          onRetryAll={handleGlobalRetry}
        />
      </section>

      {/* ================= CHẾ ĐỘ 1: BẢNG DESKTOP KHI SỐ LƯỢNG TÀI KHOẢN LỚN ================= */}
      {viewMode === "table" ? (
        <section
          aria-label="Bảng quản lý tài khoản"
          className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
        >
          {/* Toolbar lọc và tìm kiếm cho bảng */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[var(--text)]">Lọc bảng:</span>
              <button
                type="button"
                onClick={() => setTablePlatformFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  tablePlatformFilter === "all"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-alt)] text-[var(--dim)] hover:text-[var(--text)]"
                }`}
              >
                Tất cả ({accounts.length})
              </button>
              <button
                type="button"
                onClick={() => setTablePlatformFilter("Facebook")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  tablePlatformFilter === "Facebook"
                    ? "bg-blue-600 text-white"
                    : "bg-[var(--surface-alt)] text-[var(--dim)] hover:text-[var(--text)]"
                }`}
              >
                Facebook ({fbAccounts.length})
              </button>
              <button
                type="button"
                onClick={() => setTablePlatformFilter("Instagram")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  tablePlatformFilter === "Instagram"
                    ? "bg-pink-600 text-white"
                    : "bg-[var(--surface-alt)] text-[var(--dim)] hover:text-[var(--text)]"
                }`}
              >
                Instagram ({instaAccounts.length})
              </button>
            </div>

            <div className="w-full sm:w-72">
              <SearchInput
                id="search-table-accounts"
                value={tableSearch}
                onChange={setTableSearch}
                placeholder="Tìm nick, nền tảng, mã Chrome, Page..."
                ariaLabel="Tìm kiếm trong bảng tài khoản"
                compact
              />
            </div>
          </div>

          <AccountTableView
            accounts={tableAccounts}
            pages={pages}
            onlineCodes={onlineCodes}
            onSelect={(args) => select.mutate(args)}
            isSelectPending={select.isPending}
            onSetSessionStatus={(args) => setSessionStatus.mutate(args)}
            onLink={(args) => link.mutate(args)}
            isLinkPending={link.isPending}
            onSaveExtensionCode={(args) => saveExtensionCode.mutate(args)}
            isSaveExtensionCodePending={saveExtensionCode.isPending}
            onSaveName={(args) => saveName.mutate(args)}
            isSaveNamePending={saveName.isPending}
            onSaveUrl={(args) => saveUrl.mutate(args)}
            isSaveUrlPending={saveUrl.isPending}
            onDelete={(id) => del.mutate(id)}
            onMsg={setMsg}
          />
        </section>
      ) : (
        /* ================= CHẾ ĐỘ 2: BỐ CỤC 2 CỘT DẠNG THẺ (FACEBOOK & INSTAGRAM) ================= */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* CỘT 1: TÀI KHOẢN FACEBOOK */}
          <AccountPlatformColumn
            platform="Facebook"
            accounts={fbAccounts}
            pages={pages}
            onlineCodes={onlineCodes}
            scrollLayout={scrollLayout}
            onToggleScrollLayout={() =>
              setScrollLayout(scrollLayout === "scroll" ? "paged" : "scroll")
            }
            onSelect={(args) => select.mutate(args)}
            isSelectPending={select.isPending}
            onSaveExtensionCode={(args) => saveExtensionCode.mutate(args)}
            isSaveExtensionCodePending={saveExtensionCode.isPending}
            onSetSessionStatus={(args) => setSessionStatus.mutate(args)}
            onLink={(args) => link.mutate(args)}
            isLinkPending={link.isPending}
            onDelete={(id) => del.mutate(id)}
            onSaveUrl={(args) => saveUrl.mutate(args)}
            isSaveUrlPending={saveUrl.isPending}
            onSaveName={(args) => saveName.mutate(args)}
            isSaveNamePending={saveName.isPending}
            onRetryConnection={() => connectedExtQ.refetch()}
            onMsg={setMsg}
            onOpenAddForm={() => setIsAddFormOpen(true)}
          />

          {/* CỘT 2: TÀI KHOẢN INSTAGRAM */}
          <AccountPlatformColumn
            platform="Instagram"
            accounts={instaAccounts}
            pages={pages}
            onlineCodes={onlineCodes}
            scrollLayout={scrollLayout}
            onToggleScrollLayout={() =>
              setScrollLayout(scrollLayout === "scroll" ? "paged" : "scroll")
            }
            onSelect={(args) => select.mutate(args)}
            isSelectPending={select.isPending}
            onSaveExtensionCode={(args) => saveExtensionCode.mutate(args)}
            isSaveExtensionCodePending={saveExtensionCode.isPending}
            onSetSessionStatus={(args) => setSessionStatus.mutate(args)}
            onLink={(args) => link.mutate(args)}
            isLinkPending={link.isPending}
            onDelete={(id) => del.mutate(id)}
            onSaveUrl={(args) => saveUrl.mutate(args)}
            isSaveUrlPending={saveUrl.isPending}
            onSaveName={(args) => saveName.mutate(args)}
            isSaveNamePending={saveName.isPending}
            onRetryConnection={() => connectedExtQ.refetch()}
            onMsg={setMsg}
            onOpenAddForm={() => setIsAddFormOpen(true)}
          />
        </div>
      )}
    </div>
  );
}

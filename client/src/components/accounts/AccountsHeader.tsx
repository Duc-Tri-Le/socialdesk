import type { Account, Page } from "../../types";
import { FeedbackBanner, FacebookIcon, GridIcon, TableIcon } from "../ui";
import { AccountAddForm, ExtensionStatusCard } from "../accounts";

export interface AccountsSummaryStats {
  totalLoggedIn: number;
  totalExpired: number;
  totalCheckpoint: number;
  totalOnline: number;
  totalSelected: number;
}

export function AccountsHeader({
  accounts,
  fbAccountsCount,
  instaAccountsCount,
  pages,
  onlineCodes,
  viewMode,
  setViewMode,
  onOpenFbApiModal,
  isAddFormOpen,
  setIsAddFormOpen,
  onAddAccount,
  isAddAccountPending,
  summaryStats,
  msg,
  setMsg,
  isExtensionFetching,
  onGlobalRetry,
}: {
  accounts: Account[];
  fbAccountsCount: number;
  instaAccountsCount: number;
  pages: Page[];
  onlineCodes: string[];
  viewMode: "cards" | "table";
  setViewMode: (mode: "cards" | "table") => void;
  onOpenFbApiModal: () => void;
  isAddFormOpen: boolean;
  setIsAddFormOpen: (open: boolean) => void;
  onAddAccount: (args: any) => void;
  isAddAccountPending: boolean;
  summaryStats: AccountsSummaryStats;
  msg: string;
  setMsg: (msg: string) => void;
  isExtensionFetching: boolean;
  onGlobalRetry: () => void;
}) {
  const apiGraphPagesCount = pages.filter((p: any) => p.has_api_token).length;
  const apiGraphIgCount = accounts.filter(
    (a) => a.platform === "Instagram" && a.has_api_token,
  ).length;

  return (
    <section aria-label="Danh sách tài khoản">
      <header className="flex flex-col gap-2">
        {/* Hàng 1: Tiêu đề + Chuyển chế độ xem + Nút thêm mới */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[var(--text)]">
              Quản lý tài khoản mạng xã hội
            </h2>
            <span className="inline-flex items-center rounded-md bg-[var(--surface-alt)] px-2 py-0.5 text-xs font-semibold text-[var(--dim)] border border-[var(--border)]">
              {accounts.length} nick ({fbAccountsCount} FB · {instaAccountsCount} IG)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Bộ chuyển đổi chế độ xem */}
            <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
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
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors cursor-pointer ${
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
              onClick={onOpenFbApiModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-600/10 px-3 py-1.5 text-xs font-semibold text-blue-400 hover:bg-blue-600/20 transition-colors shadow-xs cursor-pointer"
              title="Kết nối Facebook OAuth hoặc cấu hình App ID/Secret"
            >
              <FacebookIcon className="h-3.5 w-3.5" />
              <span>Kết nối API Facebook</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddFormOpen(!isAddFormOpen)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              {isAddFormOpen ? "✕ Đóng form" : "+ Thêm tài khoản mới"}
            </button>
          </div>
        </div>

        {/* Hàng 2: Thống kê trạng thái gom gọn */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-1 text-[var(--dim)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
            Phiên: <strong className="text-[var(--ok)] font-semibold">{summaryStats.totalLoggedIn}</strong> Đã đăng nhập
            {summaryStats.totalExpired > 0 && <span className="text-[var(--dim)]">· {summaryStats.totalExpired} Hết phiên</span>}
            {summaryStats.totalCheckpoint > 0 && <span className="text-[var(--warn)] font-semibold">· {summaryStats.totalCheckpoint} Cần xác minh</span>}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-1 text-[var(--dim)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--info)]" />
            Extension: <strong className="text-[var(--info)] font-semibold">{summaryStats.totalOnline}</strong> Online
            {accounts.length - summaryStats.totalOnline > 0 && <span className="text-[var(--dim)]">· {accounts.length - summaryStats.totalOnline} Offline</span>}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-1 text-[var(--dim)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Đang dùng: <strong className="text-[var(--accent)] font-semibold">{summaryStats.totalSelected}</strong> nick
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-1 text-[var(--dim)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--info)]" />
            <strong className="text-[var(--info)] font-semibold">{pages.length}</strong> Fanpage
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-1 text-[var(--dim)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            API Graph: <strong className="text-emerald-400 font-semibold">{apiGraphPagesCount}</strong> Page · <strong className="text-emerald-400 font-semibold">{apiGraphIgCount}</strong> IG
          </span>
        </div>
      </header>

      <FeedbackBanner
        message={msg}
        onDismiss={() => setMsg("")}
        className="mt-3"
      />

      <AccountAddForm
        isOpen={isAddFormOpen}
        onToggle={setIsAddFormOpen}
        onSubmit={onAddAccount}
        isPending={isAddAccountPending}
      />

      <ExtensionStatusCard
        onlineCodes={onlineCodes}
        isFetching={isExtensionFetching}
        onRetryAll={onGlobalRetry}
      />
    </section>
  );
}


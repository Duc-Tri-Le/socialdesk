import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { useAccountMutations } from "../accounts/useAccountMutations";
import type { Account, Page } from "../../types";
import { SearchInput } from "../ui";
import {
  AccountsHeader,
  AccountPlatformColumn,
  AccountTableView,
  FacebookApiConfigModal,
  ApiTokenEditModal,
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

  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [scrollLayout, setScrollLayout] = useState<"paged" | "scroll">("paged");
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isFbApiModalOpen, setIsFbApiModalOpen] = useState(false);
  const [tokenModalTarget, setTokenModalTarget] = useState<
    { type: "page"; page: Page } | { type: "instagram"; account: Account } | null
  >(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    if (code) {
      setMsg("Đang hoàn tất đồng bộ tài khoản Facebook OAuth...");
      const redirectUri = window.location.origin + window.location.pathname;
      api.handleFacebookOAuthCallback({ code, redirect_uri: redirectUri })
        .then((res) => {
          setMsg(res.message);
          refresh();
        })
        .catch((err) => {
          setMsg("Lỗi xác thực OAuth: " + (err?.message || "Thất bại"));
        })
        .finally(() => {
          const newUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        });
    }
  }, []);

  const [tablePlatformFilter, setTablePlatformFilter] = useState<
    "all" | "Facebook" | "Instagram"
  >("all");
  const [tableSearch, setTableSearch] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["pages"] });
  };

  const connectedExtQ = useQuery({
    queryKey: ["connectedExtensions"],
    queryFn: () => api.getConnectedExtensions({}),
    refetchInterval: 2500,
  });

  const onlineCodes = useMemo(() => {
    return (connectedExtQ.data?.online_codes || []).map((c: string) =>
      c.toUpperCase(),
    );
  }, [connectedExtQ.data?.online_codes]);

  const prevCodesRef = useRef<string>("");
  useEffect(() => {
    const serialized = onlineCodes.join(",");
    if (prevCodesRef.current !== "" && prevCodesRef.current !== serialized) {
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
    prevCodesRef.current = serialized;
  }, [onlineCodes, queryClient]);

  const {
    addAccount,
    select,
    setSessionStatus,
    link,
    saveExtensionCode,
    saveName,
    saveUrl,
    del,
    switchProfile,
  } = useAccountMutations({
    setMsg,
    setIsAddFormOpen,
    refresh,
    refetchExtensions: connectedExtQ.refetch,
  });

  const handleGlobalRetry = async () => {
    setMsg("Đang kiểm tra lại tín hiệu từ toàn bộ Chrome Extension...");
    try {
      const res = await api.retryConnectedExtensions({});
      if (res?.message) setMsg(res.message);
    } catch {}
    connectedExtQ.refetch();
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const fbAccounts = useMemo(
    () => accounts.filter((a) => a.platform === "Facebook"),
    [accounts],
  );
  const instaAccounts = useMemo(
    () => accounts.filter((a) => a.platform === "Instagram"),
    [accounts],
  );

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
      <AccountsHeader
        accounts={accounts}
        fbAccountsCount={fbAccounts.length}
        instaAccountsCount={instaAccounts.length}
        pages={pages}
        onlineCodes={onlineCodes}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onOpenFbApiModal={() => setIsFbApiModalOpen(true)}
        isAddFormOpen={isAddFormOpen}
        setIsAddFormOpen={setIsAddFormOpen}
        onAddAccount={(args) => addAccount.mutate(args)}
        isAddAccountPending={addAccount.isPending}
        summaryStats={summaryStats}
        msg={msg}
        setMsg={setMsg}
        isExtensionFetching={connectedExtQ.isFetching}
        onGlobalRetry={handleGlobalRetry}
      />

      {/* CHẾ ĐỘ 1: BẢNG DESKTOP */}
      {viewMode === "table" ? (
        <section
          aria-label="Bảng quản lý tài khoản"
          className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[var(--text)]">Lọc bảng:</span>
              <button
                type="button"
                onClick={() => setTablePlatformFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
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
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  tablePlatformFilter === "Facebook"
                    ? "bg-[#1877F2] text-white"
                    : "bg-[var(--surface-alt)] text-[var(--dim)] hover:text-[var(--text)]"
                }`}
              >
                Facebook ({fbAccounts.length})
              </button>
              <button
                type="button"
                onClick={() => setTablePlatformFilter("Instagram")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  tablePlatformFilter === "Instagram"
                    ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                    : "bg-[var(--surface-alt)] text-[var(--dim)] hover:text-[var(--text)]"
                }`}
              >
                Instagram ({instaAccounts.length})
              </button>
            </div>

            <div className="w-full sm:w-64">
              <SearchInput
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
            onSwitchProfile={(args) => switchProfile.mutate(args)}
            onMsg={setMsg}
          />
        </section>
      ) : (
        /* CHẾ ĐỘ 2: BỐ CỤC 2 CỘT DẠNG THẺ (FACEBOOK & INSTAGRAM) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <AccountPlatformColumn
            platform="Facebook"
            accounts={fbAccounts}
            pages={pages}
            onlineCodes={onlineCodes}
            scrollLayout={scrollLayout}
            onToggleScrollLayout={() => setScrollLayout(scrollLayout === "scroll" ? "paged" : "scroll")}
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
            onSwitchProfile={(args) => switchProfile.mutate(args)}
            onRetryConnection={() => connectedExtQ.refetch()}
            onMsg={setMsg}
            onOpenAddForm={() => setIsAddFormOpen(true)}
          />

          <AccountPlatformColumn
            platform="Instagram"
            accounts={instaAccounts}
            pages={pages}
            onlineCodes={onlineCodes}
            scrollLayout={scrollLayout}
            onToggleScrollLayout={() => setScrollLayout(scrollLayout === "scroll" ? "paged" : "scroll")}
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

      {/* Modal cấu hình Facebook App & OAuth flow */}
      <FacebookApiConfigModal
        isOpen={isFbApiModalOpen}
        onClose={() => setIsFbApiModalOpen(false)}
        onMsg={setMsg}
        refresh={refresh}
      />

      {/* Modal chỉnh sửa Page/IG API Access Token */}
      <ApiTokenEditModal
        isOpen={Boolean(tokenModalTarget)}
        target={tokenModalTarget}
        onClose={() => setTokenModalTarget(null)}
        onMsg={setMsg}
        refresh={refresh}
      />
    </div>
  );
}

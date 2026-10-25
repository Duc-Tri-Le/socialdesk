import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { TABS, type Tab } from "./types";
import { ComposeJobsProvider } from "./context/ComposeJobsContext";
import { OverviewSection } from "./components/tabs/OverviewSection";
import { AccountsSection } from "./components/tabs/AccountsSection";
import { ProductsSection } from "./components/tabs/ProductsSection";
import { ResearchSection } from "./components/tabs/ResearchSection";
import { GroupsSection } from "./components/tabs/GroupsSection";
import { ComposeSection } from "./components/tabs/ComposeSection";
import { QueueSection } from "./components/tabs/QueueSection";
import { AnalyticsSection } from "./components/tabs/AnalyticsSection";
import { MediaSection } from "./components/tabs/MediaSection";

function getInitialTab(): Tab {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    if (TABS.some((t) => t.id === hash)) return hash as Tab;
    const saved = localStorage.getItem("socialdesk_active_tab");
    if (saved && TABS.some((t) => t.id === saved)) return saved as Tab;
  } catch {}
  return "overview";
}

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem("socialdesk_theme") as Theme | null;
    if (saved === "light" || saved === "dark") return saved;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
  } catch {}
  return "light";
}

export function App() {
  const [tab, setTabState] = useState<Tab>(getInitialTab);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const queryClient = useQueryClient();
  const seeded = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("socialdesk_theme", theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const setTab = (nextTab: Tab) => {
    setTabState(nextTab);
    try {
      localStorage.setItem("socialdesk_active_tab", nextTab);
      if (window.location.hash.replace(/^#/, "") !== nextTab) {
        window.location.hash = nextTab;
      }
    } catch {}
  };

  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (TABS.some((t) => t.id === h)) {
        setTabState(h as Tab);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const seed = useMutation({
    mutationFn: () => api.seedDesk({}),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      seed.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.getOverview({}),
  });
  const drafts = useQuery({
    queryKey: ["drafts"],
    queryFn: () => api.listDrafts({}),
  });

  const pending = overview.data?.counts.drafts_pending ?? 0;

  return (
    <ComposeJobsProvider>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)] pt-safe">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <nav
              aria-label="Mục chính"
              className="flex flex-1 flex-wrap items-center gap-1"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                    tab === t.id
                      ? "bg-[var(--text)] text-[var(--bg)]"
                      : "text-[var(--dim)] hover:text-[var(--text)]"
                  }`}
                >
                  {t.label}
                  {t.id === "queue" && pending > 0 && (
                    <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
                      {pending}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* Nút chuyển đổi giao diện sáng / tối ở góc phải trong cùng */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === "dark"
                  ? "Chuyển sang giao diện sáng"
                  : "Chuyển sang giao diện tối"
              }
              title={
                theme === "dark"
                  ? "Chuyển sang giao diện sáng"
                  : "Chuyển sang giao diện tối"
              }
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] shadow-xs transition-all hover:bg-[var(--surface-alt)] active:scale-95 cursor-pointer"
            >
              {theme === "dark" ? (
                <>
                  <svg
                    className="h-4 w-4 text-[var(--warn)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                  <span className="hidden sm:inline">Giao diện sáng</span>
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4 text-[var(--dim)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                  </svg>
                  <span className="hidden sm:inline">Giao diện tối</span>
                </>
              )}
            </button>
          </div>
        </header>

        <main
          className={`mx-auto w-full px-4 pb-16 pt-4 ${
            tab === "compose" || tab === "products" || tab === "analytics"
              ? "max-w-6xl"
              : "max-w-3xl"
          }`}
        >
          {tab === "overview" && (
            <OverviewSection
              overview={overview.data}
              loading={overview.isPending}
              onGoQueue={() => setTab("queue")}
              onGoCompose={() => setTab("compose")}
              onGoProducts={() => setTab("products")}
              onGoAccounts={() => setTab("accounts")}
              onGoAnalytics={() => setTab("analytics")}
              onRetry={() => overview.refetch()}
            />
          )}
          {tab === "accounts" &&
            (overview.isPending || !overview.data ? (
              <p className="text-sm text-[var(--dim)]">Đang tải…</p>
            ) : (
              <AccountsSection
                accounts={overview.data.accounts}
                pages={overview.data.pages}
              />
            ))}
          {tab === "products" && <ProductsSection />}
          {tab === "research" && <ResearchSection />}
          {tab === "groups" && <GroupsSection />}
          {tab === "compose" && (
            <ComposeSection
              onGoQueue={() => setTab("queue")}
              onGoProducts={() => setTab("products")}
            />
          )}
          {tab === "queue" && (
            <QueueSection
              drafts={drafts.data?.drafts ?? []}
              loading={drafts.isPending}
              onGoGroups={() => setTab("groups")}
              onGoMedia={() => setTab("media")}
            />
          )}
          {tab === "analytics" && (
            <AnalyticsSection onGoQueue={() => setTab("queue")} />
          )}
          {tab === "media" && <MediaSection />}
        </main>
      </div>
    </ComposeJobsProvider>
  );
}

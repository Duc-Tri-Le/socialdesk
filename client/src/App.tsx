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

export function App() {
  const [tab, setTabState] = useState<Tab>(getInitialTab);
  const queryClient = useQueryClient();
  const seeded = useRef(false);

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
          <nav
            aria-label="Mục chính"
            className="flex flex-wrap gap-1 px-3 py-2"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ${
                  tab === t.id
                    ? "bg-[var(--text)] text-[var(--bg)]"
                    : "text-[var(--dim)]"
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
        </header>

        <main
          className={`mx-auto w-full px-4 pb-16 pt-4 ${
            tab === "compose" || tab === "products"
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

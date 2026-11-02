import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Account, Page, Draft } from "../../types";
import { FacebookIcon, InstagramIcon, RefreshIcon, WarningIcon } from "../ui";
import { CommentsPostPicker } from "../comments/CommentsPostPicker";
import { CommentsFeedView } from "../comments/CommentsFeedView";

export function CommentsSection({
  accounts,
  pages,
  drafts = [],
}: {
  accounts: Account[];
  pages: Page[];
  drafts?: Draft[];
}) {
  const queryClient = useQueryClient();

  const [platformTab, setPlatformTab] = useState<"facebook" | "instagram">("facebook");
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  const [activePostId, setActivePostId] = useState<string>("");
  const [activePostTitle, setActivePostTitle] = useState<string>("");
  const [activePostUrl, setActivePostUrl] = useState<string>("");
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fbPages = useMemo(() => pages, [pages]);
  const igAccounts = useMemo(
    () => accounts.filter((a) => a.platform === "Instagram"),
    [accounts],
  );

  useEffect(() => {
    if (platformTab === "facebook") {
      const active = fbPages.find((p) => p.has_api_token) || fbPages[0];
      if (active && (!selectedPageId || !fbPages.some((p) => p.id === selectedPageId))) {
        setSelectedPageId(active.id);
      }
    } else {
      const active = igAccounts.find((a) => a.has_api_token) || igAccounts[0];
      if (active && (!selectedAccountId || !igAccounts.some((a) => a.id === selectedAccountId))) {
        setSelectedAccountId(active.id);
      }
    }
    setActivePostId("");
    setActivePostTitle("");
    setActivePostUrl("");
  }, [platformTab, fbPages, igAccounts]);

  const currentPage = useMemo(
    () => fbPages.find((p) => p.id === selectedPageId),
    [fbPages, selectedPageId],
  );

  const currentAccount = useMemo(
    () => igAccounts.find((a) => a.id === selectedAccountId),
    [igAccounts, selectedAccountId],
  );

  const targetId = platformTab === "facebook"
    ? (currentPage?.fb_page_id || String(currentPage?.id || ""))
    : (currentAccount?.ig_business_account_id || String(currentAccount?.id || ""));

  const accessToken = platformTab === "facebook"
    ? (currentPage?.access_token || "")
    : (currentAccount?.access_token || "");

  const hasToken = platformTab === "facebook"
    ? Boolean(currentPage?.has_api_token && currentPage?.access_token)
    : Boolean(currentAccount?.has_api_token && currentAccount?.access_token);

  // 1. Fetch Recent Posts from Meta API
  const recentPostsQuery = useQuery({
    queryKey: ["recentPosts", platformTab, targetId],
    queryFn: async () => {
      if (!hasToken || !targetId || !accessToken) return [];
      const res = await api.getRecentPosts({
        target_id: targetId,
        channel: platformTab === "facebook" ? "page" : "instagram",
        access_token: accessToken,
      });
      if (!res.ok) throw new Error(res.message);
      return res.posts;
    },
    enabled: Boolean(hasToken && targetId && accessToken),
    staleTime: 30000,
  });

  const recentPosts = recentPostsQuery.data ?? [];

  // 2. Posts published through Social Desk
  const appPublishedPosts = useMemo(() => {
    const list: Array<{ id: string; title: string; postUrl: string; publishedAt: string }> = [];
    for (const d of drafts) {
      for (const r of d.publish_records) {
        if (r.status === "published" && r.post_url) {
          const isMatchingChannel =
            platformTab === "facebook"
              ? r.target_kind === "page" && (!currentPage || r.target_name.toLowerCase().includes(currentPage.name.toLowerCase()))
              : r.target_kind === "instagram" && (!currentAccount || r.target_name.toLowerCase().includes(currentAccount.name.toLowerCase()));

          if (isMatchingChannel) {
            let pid = r.post_url;
            if (platformTab === "facebook") {
              const m = r.post_url.match(/posts\/([0-9_]+)|\/([0-9]{10,})/);
              if (m) pid = m[1] || m[2] || pid;
            } else {
              const m = r.post_url.match(/\/p\/([a-zA-Z0-9_-]+)/);
              if (m) pid = m[1] || pid;
            }

            list.push({
              id: pid,
              title: d.product_name ? `${d.sku} - ${d.product_name}` : d.caption.slice(0, 60),
              postUrl: r.post_url,
              publishedAt: r.created_at,
            });
          }
        }
      }
    }
    return list;
  }, [drafts, platformTab, currentPage, currentAccount]);

  // Auto-select first post if none selected
  useEffect(() => {
    if (!activePostId) {
      if (recentPosts.length > 0 && recentPosts[0]) {
        const first = recentPosts[0];
        setActivePostId(first.id);
        setActivePostTitle(first.message);
        setActivePostUrl(first.permalink || "");
      } else if (appPublishedPosts.length > 0 && appPublishedPosts[0]) {
        const first = appPublishedPosts[0];
        setActivePostId(first.id);
        setActivePostTitle(first.title);
        setActivePostUrl(first.postUrl);
      }
    }
  }, [activePostId, recentPosts, appPublishedPosts]);

  // 3. Fetch comments of active post
  const commentsQuery = useQuery({
    queryKey: ["postComments", platformTab, activePostId],
    queryFn: async () => {
      if (!activePostId || !accessToken) return [];
      const res = await api.getPostComments({
        post_id: activePostId,
        channel: platformTab === "facebook" ? "page" : "instagram",
        access_token: accessToken,
      });
      if (!res.ok) throw new Error(res.message);
      return res.comments;
    },
    enabled: Boolean(activePostId && accessToken),
    staleTime: 10000,
  });

  const commentsList = commentsQuery.data ?? [];

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: async ({ commentId, message }: { commentId: string; message: string }) => {
      if (!accessToken) throw new Error("Chưa có Access Token.");
      return api.replyComment({
        comment_id: commentId,
        channel: platformTab === "facebook" ? "page" : "instagram",
        access_token: accessToken,
        message,
      });
    },
    onSuccess: (res) => {
      if (res.ok) {
        setFeedbackMsg({ type: "success", text: "Đã phản hồi bình luận thành công!" });
        queryClient.invalidateQueries({ queryKey: ["postComments", platformTab, activePostId] });
      } else {
        setFeedbackMsg({ type: "error", text: res.message || "Gửi phản hồi thất bại." });
      }
    },
    onError: (err: any) => {
      setFeedbackMsg({ type: "error", text: err.message || "Lỗi khi phản hồi bình luận." });
    },
  });

  return (
    <div className="space-y-4">
      {/* Header & Platform Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Quản lý Bình luận</h1>
          <p className="text-xs text-[var(--dim)] mt-0.5">
            Theo dõi, lọc và trả lời bình luận của khách hàng trên các bài đăng Fanpage và Instagram
          </p>
        </div>

        <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] p-1">
          <button
            type="button"
            onClick={() => {
              setPlatformTab("facebook");
              setFeedbackMsg(null);
            }}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              platformTab === "facebook"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                : "text-[var(--dim)] hover:text-[var(--text)]"
            }`}
          >
            <FacebookIcon className="h-4 w-4 text-[#1877F2]" />
            <span>Facebook (Fanpage)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPlatformTab("instagram");
              setFeedbackMsg(null);
            }}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              platformTab === "instagram"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                : "text-[var(--dim)] hover:text-[var(--text)]"
            }`}
          >
            <InstagramIcon className="h-4 w-4 text-[#E4405F]" />
            <span>Instagram</span>
          </button>
        </div>
      </div>

      {/* Asset Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--dim)]">
            {platformTab === "facebook" ? "Chọn Fanpage:" : "Chọn Nick Instagram:"}
          </span>
          {platformTab === "facebook" ? (
            <select
              value={selectedPageId ?? ""}
              onChange={(e) => setSelectedPageId(Number(e.target.value))}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] focus:outline-hidden focus:ring-1 focus:ring-[var(--accent)]"
            >
              {fbPages.length === 0 ? (
                <option value="">Chưa có Fanpage nào</option>
              ) : (
                fbPages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.has_api_token ? "(Đã có API Token)" : "(Chưa có Token)"}
                  </option>
                ))
              )}
            </select>
          ) : (
            <select
              value={selectedAccountId ?? ""}
              onChange={(e) => setSelectedAccountId(Number(e.target.value))}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] focus:outline-hidden focus:ring-1 focus:ring-[var(--accent)]"
            >
              {igAccounts.length === 0 ? (
                <option value="">Chưa có tài khoản Instagram nào</option>
              ) : (
                igAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.has_api_token ? "(Đã có API Token)" : "(Chưa có Token)"}
                  </option>
                ))
              )}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            recentPostsQuery.refetch();
            if (activePostId) commentsQuery.refetch();
          }}
          disabled={recentPostsQuery.isFetching || commentsQuery.isFetching}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-medium text-[var(--dim)] hover:text-[var(--ink)] hover:bg-[var(--border)] transition-colors cursor-pointer"
        >
          <RefreshIcon
            className={`h-3.5 w-3.5 ${recentPostsQuery.isFetching || commentsQuery.isFetching ? "animate-spin" : ""}`}
          />
          <span>Làm mới danh sách</span>
        </button>
      </div>

      {/* Warning when Token API is missing */}
      {!hasToken && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
          <WarningIcon className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">
              {platformTab === "facebook"
                ? `Fanpage "${currentPage?.name || "này"}" chưa được liên kết Access Token API`
                : `Tài khoản Instagram "${currentAccount?.name || "này"}" chưa có Token API hoặc Instagram Business ID`}
            </p>
            <p className="text-[var(--dim)]">
              Để đọc và phản hồi bình luận qua Meta Graph API v22.0, bạn cần cấp quyền <code>pages_manage_engagement</code> hoặc{" "}
              <code>instagram_manage_comments</code>. Vui lòng chuyển sang tab{" "}
              <a href="#accounts" className="font-bold underline text-[var(--accent)]">
                Tài khoản
              </a>{" "}
              để cấu hình Token API.
            </p>
          </div>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <CommentsPostPicker
          platformTab={platformTab}
          recentPosts={recentPosts}
          appPublishedPosts={appPublishedPosts}
          activePostId={activePostId}
          onSelectPost={(id, title, url) => {
            setActivePostId(id);
            setActivePostTitle(title);
            setActivePostUrl(url);
            setFeedbackMsg(null);
          }}
          isPendingRecent={recentPostsQuery.isPending}
          isFetchingRecent={recentPostsQuery.isFetching}
          hasToken={hasToken}
        />

        <CommentsFeedView
          platformTab={platformTab}
          activePostId={activePostId}
          activePostTitle={activePostTitle}
          activePostUrl={activePostUrl}
          comments={commentsList}
          isPending={commentsQuery.isPending}
          isFetching={commentsQuery.isFetching}
          onRefreshComments={() => commentsQuery.refetch()}
          onSendReply={(commentId, text) => {
            setFeedbackMsg(null);
            replyMutation.mutate({ commentId, message: text });
          }}
          isSendingReply={replyMutation.isPending}
          feedbackMsg={feedbackMsg}
          hasToken={hasToken}
        />
      </div>
    </div>
  );
}

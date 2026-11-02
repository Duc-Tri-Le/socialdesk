import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Account, Page } from "../../types";
import {
  FacebookIcon,
  InstagramIcon,
  RefreshIcon,
  WarningIcon,
} from "../ui";
import { ConversationsList } from "../messages/ConversationsList";
import { ConversationChatView } from "../messages/ConversationChatView";

export function MessagesSection({
  accounts,
  pages,
}: {
  accounts: Account[];
  pages: Page[];
}) {
  const queryClient = useQueryClient();

  const [platformTab, setPlatformTab] = useState<"facebook" | "instagram">("facebook");
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
    setSelectedConvId(null);
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

  // Fetch Conversations
  const convsQuery = useQuery({
    queryKey: ["conversations", platformTab, targetId],
    queryFn: async () => {
      if (!hasToken || !targetId || !accessToken) return [];
      const res = await api.getConversations({
        target_id: targetId,
        channel: platformTab === "facebook" ? "page" : "instagram",
        access_token: accessToken,
      });
      if (!res.ok) throw new Error(res.message);
      return res.conversations;
    },
    enabled: Boolean(hasToken && targetId && accessToken),
    staleTime: 15000,
  });

  const conversations = convsQuery.data ?? [];

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      (c) =>
        c.participant_name.toLowerCase().includes(q) ||
        c.snippet.toLowerCase().includes(q),
    );
  }, [conversations, searchQuery]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConvId),
    [conversations, selectedConvId],
  );

  useEffect(() => {
    if (!selectedConvId && filteredConversations.length > 0 && filteredConversations[0]) {
      setSelectedConvId(filteredConversations[0].id);
    }
  }, [filteredConversations, selectedConvId]);

  // Fetch Messages
  const messagesQuery = useQuery({
    queryKey: ["conversationMessages", selectedConvId],
    queryFn: async () => {
      if (!selectedConvId || !accessToken) return [];
      const res = await api.getMessages({
        conversation_id: selectedConvId,
        access_token: accessToken,
      });
      if (!res.ok) throw new Error(res.message);
      return res.messages;
    },
    enabled: Boolean(selectedConvId && accessToken),
    refetchInterval: 10000,
  });

  const messagesList = messagesQuery.data ?? [];

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!activeConversation || !targetId || !accessToken) {
        throw new Error("Thiếu thông tin người nhận hoặc token.");
      }
      return api.sendMessage({
        target_id: targetId,
        recipient_id: activeConversation.participant_id || activeConversation.id,
        access_token: accessToken,
        text,
      });
    },
    onSuccess: (res) => {
      if (res.ok) {
        setFeedbackMsg({ type: "success", text: "Đã gửi tin nhắn thành công!" });
        queryClient.invalidateQueries({ queryKey: ["conversationMessages", selectedConvId] });
        queryClient.invalidateQueries({ queryKey: ["conversations", platformTab, targetId] });
      } else {
        setFeedbackMsg({ type: "error", text: res.message || "Gửi tin nhắn thất bại." });
      }
    },
    onError: (err: any) => {
      setFeedbackMsg({ type: "error", text: err.message || "Lỗi khi gửi tin nhắn." });
    },
  });

  return (
    <div className="space-y-4">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Quản lý Tin nhắn</h1>
          <p className="text-xs text-[var(--dim)] mt-0.5">
            Hộp thư tương tác trực tiếp với khách hàng qua Facebook Messenger và Instagram Direct
          </p>
        </div>

        <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] p-1">
          <button
            type="button"
            onClick={() => {
              setPlatformTab("facebook");
              setFeedbackMsg(null);
            }}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              platformTab === "facebook"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                : "text-[var(--dim)] hover:text-[var(--text)]"
            }`}
          >
            <FacebookIcon className="h-4 w-4 text-[#1877F2]" />
            <span>Facebook (Messenger)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPlatformTab("instagram");
              setFeedbackMsg(null);
            }}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              platformTab === "instagram"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                : "text-[var(--dim)] hover:text-[var(--text)]"
            }`}
          >
            <InstagramIcon className="h-4 w-4 text-[#E4405F]" />
            <span>Instagram (Direct)</span>
          </button>
        </div>
      </div>

      {/* Asset Selector Bar */}
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
            convsQuery.refetch();
            if (selectedConvId) messagesQuery.refetch();
          }}
          disabled={convsQuery.isFetching || messagesQuery.isFetching}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-medium text-[var(--dim)] hover:text-[var(--ink)] hover:bg-[var(--border)] transition-colors cursor-pointer"
        >
          <RefreshIcon
            className={`h-3.5 w-3.5 ${convsQuery.isFetching || messagesQuery.isFetching ? "animate-spin" : ""}`}
          />
          <span>Làm mới hộp thư</span>
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
              Để đọc và gửi tin nhắn qua Meta Graph API v22.0, bạn cần cấp quyền <code>pages_messaging</code> hoặc{" "}
              <code>instagram_manage_messages</code>. Vui lòng chuyển sang tab{" "}
              <a href="#accounts" className="font-bold underline text-[var(--accent)]">
                Tài khoản
              </a>{" "}
              để đồng bộ Facebook OAuth hoặc nhập Token thủ công.
            </p>
          </div>
        </div>
      )}

      {/* Main Chat Layout: 2 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 min-h-[560px] rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs">
        <ConversationsList
          conversations={filteredConversations}
          selectedConvId={selectedConvId}
          onSelectConv={(id) => {
            setSelectedConvId(id);
            setFeedbackMsg(null);
          }}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isPending={convsQuery.isPending}
          isFetching={convsQuery.isFetching}
          hasToken={hasToken}
        />

        <ConversationChatView
          activeConversation={activeConversation}
          platformTab={platformTab}
          messages={messagesList}
          isPending={messagesQuery.isPending}
          isFetching={messagesQuery.isFetching}
          onRefreshMessages={() => messagesQuery.refetch()}
          onSendMessage={(text) => {
            setFeedbackMsg(null);
            sendMutation.mutate(text);
          }}
          isSending={sendMutation.isPending}
          feedbackMsg={feedbackMsg}
          hasToken={hasToken}
          currentPageName={currentPage?.name}
          currentAccountName={currentAccount?.name}
        />
      </div>
    </div>
  );
}

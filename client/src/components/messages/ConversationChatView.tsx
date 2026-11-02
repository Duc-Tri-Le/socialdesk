import { useState, useRef, useEffect } from "react";
import { RefreshIcon } from "../ui";
import type { ConversationItemData } from "./ConversationsList";

export interface MessageItemData {
  id: string;
  text: string;
  created_time: string;
  sender_name: string;
}

const QUICK_REPLIES = [
  "Dạ em chào anh/chị, em có thể hỗ trợ gì cho mình ạ?",
  "Dạ mẫu xe này bên em còn hàng sẵn fullbox mới 100% ạ!",
  "Anh/chị cho em xin số điện thoại và địa chỉ giao hàng để bên em lên đơn nhé ạ!",
  "Dạ cảm ơn anh/chị đã quan tâm và ủng hộ shop ạ ❤️",
];

export function ConversationChatView({
  activeConversation,
  platformTab,
  messages,
  isPending,
  isFetching,
  onRefreshMessages,
  onSendMessage,
  isSending,
  feedbackMsg,
  hasToken,
  currentPageName = "",
  currentAccountName = "",
}: {
  activeConversation: ConversationItemData | undefined;
  platformTab: "facebook" | "instagram";
  messages: MessageItemData[];
  isPending: boolean;
  isFetching: boolean;
  onRefreshMessages: () => void;
  onSendMessage: (text: string) => void;
  isSending: boolean;
  feedbackMsg: { type: "success" | "error"; text: string } | null;
  hasToken: boolean;
  currentPageName?: string;
  currentAccountName?: string;
}) {
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = () => {
    if (!replyText.trim() || isSending) return;
    onSendMessage(replyText.trim());
    setReplyText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeConversation) {
    return (
      <div className="md:col-span-8 lg:col-span-8 flex flex-col items-center justify-center p-8 text-center text-[var(--dim)] space-y-2 bg-[var(--surface-alt)]/20">
        <div className="h-12 w-12 rounded-full bg-[var(--surface-alt)] flex items-center justify-center text-[var(--dim)] mb-1">
          💬
        </div>
        <h3 className="text-sm font-semibold text-[var(--ink)]">Chọn một cuộc hội thoại</h3>
        <p className="text-xs max-w-sm">
          Bấm vào một khách hàng ở danh sách bên trái để đọc toàn bộ lịch sử tin nhắn và gửi phản hồi trực tiếp.
        </p>
      </div>
    );
  }

  return (
    <div className="md:col-span-8 lg:col-span-8 flex flex-col bg-[var(--surface-alt)]/20">
      {/* Chat Header */}
      <div className="p-3 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center font-bold text-xs text-[var(--accent)]">
            {activeConversation.participant_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold text-xs text-[var(--ink)] flex items-center gap-1.5">
              {activeConversation.participant_name}
              <span className="inline-flex items-center rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-[10px] font-medium text-[var(--dim)]">
                {platformTab === "facebook" ? "Messenger" : "Direct"}
              </span>
            </h3>
            <p className="text-[10px] text-[var(--dim)]">
              ID: {activeConversation.participant_id || activeConversation.id}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefreshMessages}
          disabled={isFetching}
          className="rounded p-1 text-[var(--dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-alt)] transition-colors"
          title="Tải lại tin nhắn"
        >
          <RefreshIcon className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Messages History List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px]">
        {isPending ? (
          <div className="py-12 text-center text-xs text-[var(--dim)]">
            <RefreshIcon className="h-5 w-5 animate-spin mx-auto mb-2 text-[var(--accent)]" />
            Đang tải lịch sử tin nhắn...
          </div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--dim)]">
            Chưa có tin nhắn văn bản nào trong cuộc hội thoại này.
          </div>
        ) : (
          messages.map((m) => {
            const isFromCustomer =
              m.sender_name.toLowerCase() === activeConversation.participant_name.toLowerCase() ||
              (!m.sender_name.includes(currentPageName) && !m.sender_name.includes(currentAccountName));

            const timeStr = m.created_time
              ? new Date(m.created_time).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isFromCustomer ? "items-start" : "items-end"}`}
              >
                <span className="text-[10px] text-[var(--dim)] mb-0.5 px-1 font-mono">
                  {m.sender_name} • {timeStr}
                </span>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-xs ${
                    isFromCustomer
                      ? "bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] rounded-tl-xs"
                      : "bg-[var(--accent)] text-white rounded-tr-xs"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies Suggestions */}
      <div className="px-3 pt-2 pb-1 bg-[var(--surface)] border-t border-[var(--border)]">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
          <span className="text-[var(--dim)] shrink-0 font-medium">Gợi ý nhanh:</span>
          {QUICK_REPLIES.map((qr, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setReplyText(qr)}
              className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-0.5 text-[var(--dim)] hover:text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors cursor-pointer"
            >
              {qr}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Input & Send Action */}
      <div className="p-3 bg-[var(--surface)] border-t border-[var(--border)]">
        {feedbackMsg && (
          <div
            className={`mb-2 rounded-md p-2 text-xs font-medium ${
              feedbackMsg.type === "success"
                ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                : "bg-red-500/10 text-red-800 dark:text-red-200"
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập nội dung tin nhắn gửi khách hàng... (Enter để gửi, Shift+Enter xuống dòng)"
            className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] p-2.5 text-xs text-[var(--ink)] placeholder-[var(--dim)] focus:outline-hidden focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!replyText.trim() || isSending || !hasToken}
            className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer shrink-0"
          >
            {isSending ? "Đang gửi..." : "Gửi tin"}
          </button>
        </div>
      </div>
    </div>
  );
}


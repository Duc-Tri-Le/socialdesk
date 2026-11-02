import { useState } from "react";
import { RefreshIcon, ExternalLinkIcon } from "../ui";

export interface CommentItemData {
  id: string;
  user_name: string;
  text: string;
  created_time: string;
  like_count: number;
}

const QUICK_COMMENT_REPLIES = [
  "Dạ em đã gửi tin nhắn chi tiết cho mình rồi ạ, anh/chị kiểm tra hộp thư giúp em nhé!",
  "Dạ mẫu xe này bên em còn hàng sẵn fullbox mới 100% anh/chị nhé ạ!",
  "Dạ em cảm ơn anh/chị đã quan tâm và ủng hộ sản phẩm của shop ạ ❤️",
];

export function CommentsFeedView({
  platformTab,
  activePostId,
  activePostTitle,
  activePostUrl,
  comments,
  isPending,
  isFetching,
  onRefreshComments,
  onSendReply,
  isSendingReply,
  feedbackMsg,
  hasToken,
}: {
  platformTab: "facebook" | "instagram";
  activePostId: string;
  activePostTitle: string;
  activePostUrl: string;
  comments: CommentItemData[];
  isPending: boolean;
  isFetching: boolean;
  onRefreshComments: () => void;
  onSendReply: (commentId: string, text: string) => void;
  isSendingReply: boolean;
  feedbackMsg: { type: "success" | "error"; text: string } | null;
  hasToken: boolean;
}) {
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const handleSend = (commentId: string) => {
    if (!replyText.trim() || isSendingReply) return;
    onSendReply(commentId, replyText.trim());
    setReplyText("");
    setReplyingCommentId(null);
  };

  if (!activePostId) {
    return (
      <div className="md:col-span-7 lg:col-span-8 flex flex-col items-center justify-center p-12 text-center text-[var(--dim)] space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="h-12 w-12 rounded-full bg-[var(--surface-alt)] flex items-center justify-center text-[var(--dim)] mb-1">
          💬
        </div>
        <h3 className="text-sm font-semibold text-[var(--ink)]">Chọn một bài viết</h3>
        <p className="text-xs max-w-sm">
          Bấm vào một bài viết từ danh sách bên trái hoặc nhập ID bài viết để tải danh sách bình luận và phản hồi khách hàng.
        </p>
      </div>
    );
  }

  return (
    <div className="md:col-span-7 lg:col-span-8 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs">
      {/* Post Info Bar */}
      <div className="p-3.5 border-b border-[var(--border)] bg-[var(--surface-alt)]/40 flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
              {platformTab === "facebook" ? "Fanpage Post" : "Instagram Media"}
            </span>
            <span className="text-[11px] font-mono text-[var(--dim)] truncate">
              ID: {activePostId}
            </span>
          </div>
          <p className="text-xs font-semibold text-[var(--ink)] line-clamp-2">
            {activePostTitle || "(Bài viết đang chọn)"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activePostUrl && (
            <a
              href={activePostUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1.5 text-[var(--dim)] hover:text-[var(--accent)] hover:bg-[var(--surface-alt)] transition-colors"
              title="Mở bài viết gốc"
            >
              <ExternalLinkIcon className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onRefreshComments}
            disabled={isFetching}
            className="rounded p-1.5 text-[var(--dim)] hover:text-[var(--ink)] hover:bg-[var(--surface-alt)] transition-colors"
            title="Tải lại bình luận"
          >
            <RefreshIcon className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedbackMsg && (
        <div
          className={`m-3 rounded-md p-2.5 text-xs font-medium ${
            feedbackMsg.type === "success"
              ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "bg-red-500/10 text-red-800 dark:text-red-200"
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Comments Feed List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]">
        {isPending ? (
          <div className="py-16 text-center text-xs text-[var(--dim)]">
            <RefreshIcon className="h-5 w-5 animate-spin mx-auto mb-2 text-[var(--accent)]" />
            Đang tải bình luận từ Meta Graph API...
          </div>
        ) : comments.length === 0 ? (
          <div className="py-16 text-center text-xs text-[var(--dim)] space-y-1">
            <p className="font-semibold text-[var(--text)]">Chưa có bình luận nào</p>
            <p className="text-[11px]">Bài viết này hiện chưa có phản hồi nào từ khách hàng.</p>
          </div>
        ) : (
          comments.map((c) => {
            const isReplying = replyingCommentId === c.id;
            const dateStr = c.created_time
              ? new Date(c.created_time).toLocaleDateString("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";

            return (
              <div
                key={c.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]/30 p-3.5 space-y-2.5 transition-all"
              >
                {/* Commenter header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center font-bold text-xs text-[var(--accent)]">
                      {c.user_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-xs text-[var(--ink)]">
                      {c.user_name}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--dim)] font-mono">
                    {dateStr}
                  </span>
                </div>

                {/* Comment Content */}
                <p className="text-xs text-[var(--ink)] leading-relaxed pl-9">
                  {c.text}
                </p>

                {/* Footer: Likes and Reply Action */}
                <div className="flex items-center justify-between pt-1 pl-9 border-t border-[var(--border)]/50 text-[11px]">
                  <span className="text-[var(--dim)]">
                    👍 {c.like_count} lượt thích
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (isReplying) {
                        setReplyingCommentId(null);
                      } else {
                        setReplyingCommentId(c.id);
                        setReplyText("");
                      }
                    }}
                    className="font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    {isReplying ? "Đóng trả lời" : "Trả lời"}
                  </button>
                </div>

                {/* Inline Reply Input Box */}
                {isReplying && (
                  <div className="mt-2 pl-9 pt-2 border-t border-[var(--border)] space-y-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] no-scrollbar">
                      <span className="text-[var(--dim)] shrink-0 font-medium">Gợi ý:</span>
                      {QUICK_COMMENT_REPLIES.map((qr, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setReplyText(qr)}
                          className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[var(--dim)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                        >
                          {qr}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={2}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Nhập câu trả lời cho ${c.user_name}...`}
                      className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-xs text-[var(--ink)] placeholder-[var(--dim)] focus:outline-hidden focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReplyingCommentId(null)}
                        className="rounded px-2.5 py-1 text-xs text-[var(--dim)] hover:text-[var(--ink)] cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSend(c.id)}
                        disabled={!replyText.trim() || isSendingReply || !hasToken}
                        className="rounded bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                      >
                        {isSendingReply ? "Đang gửi..." : "Gửi phản hồi"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


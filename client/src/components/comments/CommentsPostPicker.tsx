import { useState } from "react";
import { RefreshIcon } from "../ui";

export interface RecentPostData {
  id: string;
  message: string;
  created_time: string;
  permalink: string;
  comments_count: number;
  likes_count: number;
}

export interface AppPublishedPostData {
  id: string;
  title: string;
  postUrl: string;
  publishedAt: string;
}

export function CommentsPostPicker({
  platformTab,
  recentPosts,
  appPublishedPosts,
  activePostId,
  onSelectPost,
  isPendingRecent,
  isFetchingRecent,
  hasToken,
}: {
  platformTab: "facebook" | "instagram";
  recentPosts: RecentPostData[];
  appPublishedPosts: AppPublishedPostData[];
  activePostId: string;
  onSelectPost: (id: string, title: string, url: string) => void;
  isPendingRecent: boolean;
  isFetchingRecent: boolean;
  hasToken: boolean;
}) {
  const [postSourceTab, setPostSourceTab] = useState<"recent" | "app_published" | "manual">("recent");
  const [manualPostInput, setManualPostInput] = useState("");

  const handleApplyManual = () => {
    if (!manualPostInput.trim()) return;
    const clean = manualPostInput.trim();
    onSelectPost(clean, `Bài viết ID: ${clean}`, /^https?:\/\//i.test(clean) ? clean : "");
  };

  return (
    <div className="md:col-span-5 lg:col-span-4 space-y-3">
      {/* Post Source Tabs */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
        <div className="grid grid-cols-3 gap-1 text-[11px] font-semibold text-center">
          <button
            type="button"
            onClick={() => setPostSourceTab("recent")}
            className={`rounded py-1.5 transition-all cursor-pointer ${
              postSourceTab === "recent"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            Gần đây
          </button>
          <button
            type="button"
            onClick={() => setPostSourceTab("app_published")}
            className={`rounded py-1.5 transition-all cursor-pointer ${
              postSourceTab === "app_published"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            Từ Hàng đợi
          </button>
          <button
            type="button"
            onClick={() => setPostSourceTab("manual")}
            className={`rounded py-1.5 transition-all cursor-pointer ${
              postSourceTab === "manual"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--dim)] hover:text-[var(--ink)]"
            }`}
          >
            Nhập tay
          </button>
        </div>
      </div>

      {/* Posts List by Tab */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs">
        {postSourceTab === "recent" && (
          <div className="divide-y divide-[var(--border)] max-h-[520px] overflow-y-auto">
            <div className="p-2.5 bg-[var(--surface-alt)]/50 text-[11px] font-medium text-[var(--dim)] flex items-center justify-between">
              <span>Bài viết trên trang ({recentPosts.length})</span>
              {isFetchingRecent && <span className="animate-pulse">Đang tải...</span>}
            </div>
            {isPendingRecent ? (
              <div className="p-6 text-center text-xs text-[var(--dim)]">
                <RefreshIcon className="h-5 w-5 animate-spin mx-auto mb-2 text-[var(--accent)]" />
                Đang tải bài viết gần đây...
              </div>
            ) : recentPosts.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--dim)]">
                {hasToken
                  ? "Không tìm thấy bài viết nào gần đây."
                  : "Cần kết nối Token API để tải danh sách bài viết."}
              </div>
            ) : (
              recentPosts.map((p) => {
                const isSelected = p.id === activePostId;
                const dateStr = p.created_time
                  ? new Date(p.created_time).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "";
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPost(p.id, p.message, p.permalink)}
                    className={`w-full text-left p-3 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[var(--accent-subtle)] border-l-4 border-l-[var(--accent)]"
                        : "hover:bg-[var(--surface-alt)]/60"
                    }`}
                  >
                    <p className="text-xs font-medium text-[var(--ink)] line-clamp-2">
                      {p.message}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--dim)]">
                      <span>{dateStr}</span>
                      <span className="font-semibold text-[var(--accent)]">
                        💬 {p.comments_count} bình luận
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {postSourceTab === "app_published" && (
          <div className="divide-y divide-[var(--border)] max-h-[520px] overflow-y-auto">
            <div className="p-2.5 bg-[var(--surface-alt)]/50 text-[11px] font-medium text-[var(--dim)]">
              Bài đăng thành công từ ứng dụng ({appPublishedPosts.length})
            </div>
            {appPublishedPosts.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--dim)]">
                Chưa có bài viết nào được đăng lên {platformTab === "facebook" ? "Fanpage" : "Instagram"} từ Hàng đợi.
              </div>
            ) : (
              appPublishedPosts.map((p, idx) => {
                const isSelected = p.id === activePostId;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectPost(p.id, p.title, p.postUrl)}
                    className={`w-full text-left p-3 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[var(--accent-subtle)] border-l-4 border-l-[var(--accent)]"
                        : "hover:bg-[var(--surface-alt)]/60"
                    }`}
                  >
                    <p className="text-xs font-medium text-[var(--ink)] line-clamp-2">
                      {p.title}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--dim)] truncate">
                      ID: {p.id}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        )}

        {postSourceTab === "manual" && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-[var(--dim)]">
              Dán link bài viết Facebook/Instagram hoặc nhập trực tiếp Post ID / Media ID:
            </p>
            <input
              type="text"
              placeholder="https://facebook.com/... hoặc ID bài viết"
              value={manualPostInput}
              onChange={(e) => setManualPostInput(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-xs text-[var(--ink)] focus:outline-hidden focus:ring-1 focus:ring-[var(--accent)]"
            />
            <button
              type="button"
              onClick={handleApplyManual}
              disabled={!manualPostInput.trim()}
              className="w-full rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
            >
              Tải bình luận bài này
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


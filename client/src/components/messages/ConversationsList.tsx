import { SearchIcon, RefreshIcon } from "../ui";

export interface ConversationItemData {
  id: string;
  snippet: string;
  updated_time: string;
  unread_count: number;
  participant_name: string;
  participant_id: string;
}

export function ConversationsList({
  conversations,
  selectedConvId,
  onSelectConv,
  searchQuery,
  setSearchQuery,
  isPending,
  isFetching,
  hasToken,
}: {
  conversations: ConversationItemData[];
  selectedConvId: string | null;
  onSelectConv: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isPending: boolean;
  isFetching: boolean;
  hasToken: boolean;
}) {
  return (
    <div className="md:col-span-4 lg:col-span-4 border-r border-[var(--border)] flex flex-col bg-[var(--surface)]">
      {/* Search Header */}
      <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-alt)]/50">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--dim)]" />
          <input
            type="text"
            placeholder="Tìm người gửi, nội dung tin..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 py-1.5 text-xs text-[var(--ink)] placeholder-[var(--dim)] focus:outline-hidden focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--dim)]">
          <span>{conversations.length} cuộc hội thoại</span>
          {isFetching && <span className="animate-pulse">Đang cập nhật...</span>}
        </div>
      </div>

      {/* Conversations Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)] max-h-[500px]">
        {isPending ? (
          <div className="p-6 text-center text-xs text-[var(--dim)]">
            <RefreshIcon className="h-5 w-5 animate-spin mx-auto mb-2 text-[var(--accent)]" />
            Đang tải danh sách hội thoại...
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--dim)] space-y-1">
            <p className="font-medium text-[var(--text)]">Không có cuộc hội thoại nào</p>
            <p className="text-[11px]">
              {searchQuery
                ? "Không tìm thấy kết quả phù hợp với từ khóa."
                : hasToken
                  ? "Chưa có tin nhắn nào từ khách hàng gửi đến trang này."
                  : "Vui lòng kết nối Token API để đồng bộ tin nhắn."}
            </p>
          </div>
        ) : (
          conversations.map((c) => {
            const isSelected = c.id === selectedConvId;
            const dateStr = c.updated_time
              ? new Date(c.updated_time).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConv(c.id)}
                className={`w-full text-left p-3 transition-colors flex items-start gap-3 cursor-pointer ${
                  isSelected
                    ? "bg-[var(--accent-subtle)] border-l-4 border-l-[var(--accent)]"
                    : "hover:bg-[var(--surface-alt)]/60"
                }`}
              >
                {/* Avatar Initials */}
                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-tr from-[var(--border)] to-[var(--surface-alt)] border border-[var(--border)] flex items-center justify-center font-bold text-xs text-[var(--ink)]">
                  {c.participant_name.charAt(0).toUpperCase() || "K"}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-xs text-[var(--ink)] truncate">
                      {c.participant_name}
                    </span>
                    <span className="text-[10px] text-[var(--dim)] shrink-0 font-mono">
                      {dateStr}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--dim)] truncate mt-0.5">
                    {c.snippet || "(Tin nhắn phương tiện/ảnh)"}
                  </p>
                </div>

                {c.unread_count > 0 && (
                  <span className="h-4 min-w-4 rounded-full bg-[var(--accent)] px-1 flex items-center justify-center text-[10px] font-bold text-white">
                    {c.unread_count}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}


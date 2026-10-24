import { memo, useState } from "react";
import type { ProductContentTree, ContentDraft } from "../analyticsTypes";
import { EmptyState } from "../../ui";
import { cardCls } from "../../../utils/styles";

interface ContentProductsTabProps {
  products: ProductContentTree[];
  isLoading: boolean;
}

export const ContentProductsTab = memo(function ContentProductsTab({
  products,
  isLoading,
}: ContentProductsTabProps) {
  const [expandedDrafts, setExpandedDrafts] = useState<Record<number, boolean>>({});

  const toggleDraft = (id: number) => {
    setExpandedDrafts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (isLoading) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--dim)]">
        Đang tải cấu trúc cây Sản phẩm → Nội dung gốc → Lượt đăng thực tế…
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        title="Chưa có dữ liệu nội dung sản phẩm"
        description="Hãy tạo bản nháp trong mục Soạn bài để hệ thống phân cấp Sản phẩm và các Phiên bản nội dung gốc."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header giải thích cấu trúc phân biệt */}
      <div className="rounded-[var(--radius)] border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 text-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white font-bold text-xs">
            💡
          </span>
          <div>
            <h2 className="font-bold text-[var(--ink)]">
              Phân biệt Nội dung gốc và Lượt đăng thực tế
            </h2>
            <p className="mt-1 text-xs text-[var(--dim)] leading-relaxed">
              Một <strong>Sản phẩm</strong> có thể có nhiều <strong>Phiên bản nội dung gốc</strong> (A, B, C với góc viết hoặc mô tả khác nhau). Mỗi phiên bản nội dung này lại được xuất bản thành nhiều <strong>Lượt đăng thực tế</strong> trên các Hội nhóm, Fanpage và Instagram.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Danh sách theo từng Sản phẩm */}
      <div className="space-y-6">
        {products.map((p) => {
          return (
            <div key={p.product_name} className={`${cardCls} overflow-hidden shadow-sm`}>
              {/* Header Sản phẩm */}
              <div className="bg-[var(--surface-alt)]/60 border-b border-[var(--border)] px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                    <span className="text-lg">📦</span>
                    {p.product_name}
                  </h3>
                  <p className="text-xs text-[var(--dim)] mt-0.5">
                    Gồm <strong className="text-[var(--ink)]">{p.drafts_count}</strong> phiên bản nội dung gốc · Tổng cộng{" "}
                    <strong className="text-[var(--accent)]">{p.total_posts}</strong> lượt đăng thực tế
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 border border-emerald-200">
                    {p.total_orders} đơn chốt
                  </span>
                  <span className="rounded bg-blue-50 px-2 py-1 font-semibold text-blue-700 border border-blue-200">
                    {p.total_inquiries} inbox
                  </span>
                  <span className="rounded bg-amber-50 px-2 py-1 font-mono font-bold text-amber-800 border border-amber-200">
                    {p.total_score} điểm
                  </span>
                </div>
              </div>

              {/* Danh sách các phiên bản nội dung gốc thuộc sản phẩm */}
              <div className="divide-y divide-[var(--border)] p-4 space-y-4">
                {p.drafts.map((d: ContentDraft) => {
                  const isExpanded = !!expandedDrafts[d.draft_id];

                  return (
                    <div key={d.draft_id} className="pt-3 first:pt-0">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        {/* Chi tiết bản nội dung */}
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="rounded bg-[var(--surface-alt)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--ink)] border border-[var(--border)]">
                              Bản #{d.stt || d.draft_id}
                            </span>
                            <span className="rounded bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-semibold">
                              Góc: {d.angle === "chot_don" ? "Chốt đơn" : d.angle === "review" ? "Đánh giá" : d.angle}
                            </span>
                            <span className="text-xs text-[var(--dim)]">
                              ID nháp: #{d.draft_id}
                            </span>
                          </div>

                          <p className="text-xs text-[var(--ink)]/80 line-clamp-2 leading-relaxed whitespace-pre-line">
                            {d.caption}
                          </p>

                          {d.drive_images.length > 0 && (
                            <div className="flex items-center gap-1.5 pt-1 text-[11px] text-[var(--dim)]">
                              <span>📸 {d.drive_images.length} ảnh gắn kèm:</span>
                              <span className="truncate font-mono">{d.drive_images.slice(0, 3).join(", ")}</span>
                            </div>
                          )}
                        </div>

                        {/* Thống kê lượt đăng của bản nội dung này */}
                        <div className="flex flex-col md:items-end shrink-0 gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                              {d.posts_count} lượt đăng
                            </span>
                            <span className="font-mono text-xs font-bold text-[var(--accent)]">
                              {d.total_score}đ
                            </span>
                          </div>

                          <p className="text-[11px] text-[var(--dim)] font-mono">
                            {d.total_likes}L · {d.total_comments}C · {d.total_shares}S · {d.total_orders} đơn
                          </p>

                          {d.posts_count > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleDraft(d.draft_id)}
                              className="text-xs font-semibold text-[var(--accent)] hover:underline mt-1"
                            >
                              {isExpanded ? "▲ Thu gọn lượt đăng" : `▼ Xem ${d.posts_count} lượt đăng thực tế`}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Chi tiết từng lượt đăng thực tế của bản nội dung */}
                      {isExpanded && d.posts.length > 0 && (
                        <div className="mt-3 rounded border border-[var(--border)] bg-[var(--surface-alt)]/30 p-3">
                          <p className="text-xs font-bold text-[var(--ink)] mb-2">
                            Danh sách các kênh đã xuất bản nội dung này:
                          </p>
                          <ul className="divide-y divide-[var(--border)] text-xs">
                            {d.posts.map((post) => (
                              <li key={post.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-[var(--ink)]">
                                    {post.channel_type === "group" ? "👥" : "📄"} {post.channel_name}
                                  </span>
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                      post.post_status === "active"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : post.post_status === "pending_approval"
                                          ? "bg-amber-100 text-amber-800"
                                          : "bg-rose-100 text-rose-800"
                                    }`}
                                  >
                                    {post.post_status === "active"
                                      ? "Đang hiển thị"
                                      : post.post_status === "pending_approval"
                                        ? "Chờ duyệt"
                                        : "Bị gỡ"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-[var(--dim)]">
                                    {post.hour_slot} ({new Date(post.posted_at).toLocaleDateString("vi-VN")})
                                  </span>

                                  {post.notes ? (
                                    <a
                                      href={post.notes}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[var(--accent)] font-medium underline hover:text-[var(--accent)]/80 flex items-center gap-1"
                                      title={post.notes}
                                    >
                                      🔗 Link bài viết
                                    </a>
                                  ) : (
                                    <span className="text-[var(--dim)] italic">Chưa có link</span>
                                  )}

                                  <span className="font-mono font-bold text-[var(--ink)]">
                                    {post.score}đ
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

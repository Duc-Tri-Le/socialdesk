import { memo } from "react";
import type { Metric, QuickEditSalesData } from "./analyticsTypes";
import type { UsePaginationReturn } from "../ui/Pagination";
import { Pagination } from "../ui/Pagination";
import { fmtDate } from "../../utils/format";
import {
  btnPrimary,
  btnDanger,
  btnGhost,
  inputCls,
  labelCls,
} from "../../utils/styles";

interface MetricsHistoryListProps {
  metrics: Metric[];
  pagination: UsePaginationReturn<Metric>;
  isLoading: boolean;
  editingId: number | null;
  editSalesForm: QuickEditSalesData;
  setEditSalesForm: (val: QuickEditSalesData | ((prev: QuickEditSalesData) => QuickEditSalesData)) => void;
  startEditSales: (m: Metric) => void;
  cancelEditSales: () => void;
  saveEditSales: () => void;
  isSavingSales: boolean;
  deleteMetric: (id: number) => void;
  scanSingleMetric: (id: number) => void;
}

export const MetricsHistoryList = memo(function MetricsHistoryList({
  metrics,
  pagination,
  isLoading,
  editingId,
  editSalesForm,
  setEditSalesForm,
  startEditSales,
  cancelEditSales,
  saveEditSales,
  isSavingSales,
  deleteMetric,
  scanSingleMetric,
}: MetricsHistoryListProps) {
  const { pagedItems, paginationProps } = pagination;

  return (
    <section aria-label="Lịch sử bài đã đo chỉ số" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--ink)]">
          Lịch sử bài đã đo ({paginationProps.totalItems} bài)
        </h2>
        {paginationProps.totalItems > 0 && (
          <p className="text-xs text-[var(--dim)]">
            Hiển thị bài {paginationProps.rangeStart}–{paginationProps.rangeEnd} trên tổng số {paginationProps.totalItems}
          </p>
        )}
      </div>

      {isLoading && (
        <p className="py-4 text-sm text-[var(--dim)]">Đang tải chỉ số bài đăng…</p>
      )}

      {pagedItems.length === 0 && !isLoading && (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-8 text-center">
          <p className="text-sm text-[var(--dim)]">
            {metrics.length === 0
              ? "Chưa có bài đăng nào được ghi chỉ số. Bạn có thể bấm 'Đồng bộ bài đã đăng' hoặc nhập ở form bên dưới."
              : "Không tìm thấy bài viết nào phù hợp với bộ lọc hiện tại."}
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {pagedItems.map((m: Metric) => {
          const isEditing = editingId === m.id;

          return (
            <li
              key={m.id}
              className={`rounded-[var(--radius)] border bg-[var(--surface)] p-4 shadow-sm transition ${
                isEditing
                  ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                  : "border-[var(--border)] hover:border-[var(--accent)]/40"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-xs font-semibold text-[var(--dim)]">
                      {m.channel_type === "group"
                        ? "Nhóm"
                        : m.channel_type === "page"
                          ? "Fanpage"
                          : "Instagram"}
                    </span>
                    <span className="font-semibold text-[var(--ink)]">
                      {m.channel_name}
                    </span>
                    {m.post_url ? (
                      <a
                        href={m.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-[var(--accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--accent)] hover:underline"
                        title={m.post_url}
                      >
                        Xem bài đăng ↗
                      </a>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs text-[var(--dim)]">
                    {m.stt ? <strong className="text-[var(--ink)]">STT {m.stt} · </strong> : ""}
                    {m.product_name || "Sản phẩm không gắn bài"} · đăng{" "}
                    {fmtDate(m.posted_at)} · khung{" "}
                    <span className="rounded bg-[var(--surface-alt)] px-1.5 py-0.5 font-mono font-semibold text-[var(--ink)]">
                      {m.hour_slot}
                    </span>{" "}
                    · {m.media_kind === "video" ? "video" : m.media_kind === "image" ? "ảnh" : "không media"}
                  </p>
                </div>

                {/* Các nút hành động */}
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <>
                      <button
                        type="button"
                        onClick={() => startEditSales(m)}
                        className={`${btnGhost} text-xs`}
                        title="Cập nhật nhanh lượt inbox hỏi mua và đơn đã chốt"
                      >
                        Sửa đơn/inbox
                      </button>
                      {m.post_url && (
                        <button
                          type="button"
                          onClick={() => scanSingleMetric(m.id)}
                          className={`${btnGhost} text-xs text-[var(--accent)]`}
                          title="Tự động quét tương tác mới nhất qua Chrome Extension"
                        >
                          Quét lại
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteMetric(m.id)}
                        className={`${btnDanger} text-xs`}
                        aria-label={`Xóa chỉ số của bài ở ${m.channel_name}`}
                      >
                        Xóa
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Form Sửa Nhanh Đơn / Inbox */}
              {isEditing ? (
                <div className="mt-3 rounded border border-[var(--accent)]/20 bg-[var(--surface-alt)]/40 p-3">
                  <div className="flex items-center justify-between pb-2">
                    <p className="text-xs font-semibold text-[var(--accent)]">
                      Cập nhật chuyển đổi bán hàng & số liệu bài viết
                    </p>
                    <span className="text-[11px] text-[var(--dim)]">
                      Hệ thống tự động tính lại điểm tương tác ngay sau khi lưu
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <label className={labelCls} htmlFor={`edit-inq-${m.id}`}>
                        Inbox hỏi mua (×8đ)
                      </label>
                      <input
                        id={`edit-inq-${m.id}`}
                        type="number"
                        min={0}
                        className={inputCls}
                        value={editSalesForm.inquiries}
                        onChange={(e) =>
                          setEditSalesForm((prev) => ({
                            ...prev,
                            inquiries: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`edit-ord-${m.id}`}>
                        Đơn chốt thành công (×20đ)
                      </label>
                      <input
                        id={`edit-ord-${m.id}`}
                        type="number"
                        min={0}
                        className={inputCls}
                        value={editSalesForm.orders}
                        onChange={(e) =>
                          setEditSalesForm((prev) => ({
                            ...prev,
                            orders: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`edit-reach-${m.id}`}>
                        Lượt tiếp cận
                      </label>
                      <input
                        id={`edit-reach-${m.id}`}
                        type="number"
                        min={0}
                        className={inputCls}
                        value={editSalesForm.reach}
                        onChange={(e) =>
                          setEditSalesForm((prev) => ({
                            ...prev,
                            reach: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`edit-url-${m.id}`}>
                        Đường link bài đăng
                      </label>
                      <input
                        id={`edit-url-${m.id}`}
                        type="text"
                        placeholder="https://facebook.com/..."
                        className={inputCls}
                        value={editSalesForm.post_url}
                        onChange={(e) =>
                          setEditSalesForm((prev) => ({
                            ...prev,
                            post_url: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEditSales}
                      className={`${btnGhost} text-xs`}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="button"
                      onClick={saveEditSales}
                      disabled={isSavingSales}
                      className={`${btnPrimary} text-xs`}
                    >
                      {isSavingSales ? "Đang lưu…" : "Lưu thay đổi"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Bảng 8 chỉ số tương tác chuẩn */
                <dl className="mt-3 grid grid-cols-4 gap-2 rounded bg-[var(--surface-alt)]/40 p-2.5 text-sm sm:grid-cols-8">
                  {[
                    { label: "Tiếp cận", val: m.reach, highlight: false },
                    { label: "Like", val: m.likes, highlight: false },
                    { label: "Bình luận", val: m.comments, highlight: false },
                    { label: "Chia sẻ", val: m.shares, highlight: false },
                    { label: "Click", val: m.clicks, highlight: false },
                    { label: "Inbox", val: m.inquiries, highlight: m.inquiries > 0 },
                    { label: "Đơn chốt", val: m.orders, highlight: m.orders > 0 },
                    { label: "Điểm tổng", val: m.score, highlight: true },
                  ].map((item) => (
                    <div key={item.label} className="text-center sm:text-left">
                      <dt className="text-[11px] text-[var(--dim)]">{item.label}</dt>
                      <dd
                        className={`font-mono text-xs font-semibold ${
                          item.highlight
                            ? "text-[var(--accent)] font-bold"
                            : "text-[var(--ink)]"
                        }`}
                      >
                        {item.val.toLocaleString("vi-VN")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {m.notes && !isEditing && (
                <p className="mt-2 text-xs italic text-[var(--dim)]">
                  Ghi chú: {m.notes}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* Phân trang chuẩn toàn hệ thống */}
      {paginationProps.totalPages > 1 && (
        <div className="pt-2">
          <Pagination {...paginationProps} />
        </div>
      )}
    </section>
  );
});

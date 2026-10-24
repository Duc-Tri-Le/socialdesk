import { memo, useState, useCallback } from "react";
import type { Metric, PostStatus, QuickEditSalesData } from "../analyticsTypes";
import { btnOutline, btnDanger, tableTdCls } from "../../../utils/styles";

interface PublishPostsTableRowProps {
  metric: Metric;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
  isEditing: boolean;
  editSalesForm: QuickEditSalesData;
  setEditSalesForm: (val: QuickEditSalesData | ((p: QuickEditSalesData) => QuickEditSalesData)) => void;
  startEditSales: (m: Metric) => void;
  cancelEditSales: () => void;
  saveEditSales: () => void;
  isSavingSales: boolean;
  onDeleteMetric: (id: number) => void;
  onScanSingleMetric: (id: number) => void;
  onUpdateStatus: (id: number, status: PostStatus) => void;
}

export const PublishPostsTableRow = memo(function PublishPostsTableRow({
  metric: m,
  isSelected,
  onToggleSelect,
  isEditing,
  editSalesForm,
  setEditSalesForm,
  startEditSales,
  cancelEditSales,
  saveEditSales,
  isSavingSales,
  onDeleteMetric,
  onScanSingleMetric,
  onUpdateStatus,
}: PublishPostsTableRowProps) {
  const [copied, setCopied] = useState(false);
  const link = m.post_url || m.notes;

  const handleCopy = useCallback(() => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [link]);

  return (
    <tr
      className={`transition ${
        isSelected ? "bg-[var(--accent)]/5" : "hover:bg-[var(--surface-alt)]/30"
      }`}
    >
      {/* Checkbox */}
      <td className="p-3 text-center">
        <input
          type="checkbox"
          aria-label={`Chọn bài ${m.product_name}`}
          checked={isSelected}
          onChange={() => onToggleSelect(m.id)}
          className="rounded border-[var(--border)]"
        />
      </td>

      {/* Sản phẩm & STT bản nội dung */}
      <td className={tableTdCls}>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[var(--surface-alt)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--ink)] border border-[var(--border)]">
            #{m.stt || m.draft_id || m.id}
          </span>
          <div>
            <p className="font-semibold text-[var(--ink)]">{m.product_name}</p>
            {m.draft_id && (
              <span className="text-[11px] text-[var(--dim)]">Bản nháp #{m.draft_id}</span>
            )}
          </div>
        </div>
      </td>

      {/* Kênh đăng */}
      <td className={tableTdCls}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">
              {m.channel_type === "group" ? "👥" : m.channel_type === "page" ? "📄" : "📸"}
            </span>
            <span className="font-medium text-[var(--ink)]">{m.channel_name}</span>
          </div>
          <div className="text-[10px] text-[var(--dim)]">
            {m.channel_type === "page" ? (
              <span className="text-purple-600 font-medium">Fanpage (Hỗ trợ Reach)</span>
            ) : m.reach > 0 ? (
              <span className="text-purple-600 font-medium">Nhóm Admin ({m.reach.toLocaleString()} reach)</span>
            ) : (
              <span title="Facebook chỉ cấp Reach cho Quản trị viên nhóm; thành viên thường không thể xem">Nhóm thường · Reach: Chỉ Admin</span>
            )}
          </div>
        </div>
      </td>

      {/* Thời gian & Khung giờ */}
      <td className={tableTdCls}>
        <p className="font-mono text-xs text-[var(--ink)]">
          {new Date(m.posted_at).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
          })}
        </p>
        <span className="rounded bg-[var(--surface-alt)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--dim)]">
          {m.hour_slot}
        </span>
      </td>

      {/* Ghi chú (Link bài đăng thực tế) */}
      <td className={tableTdCls}>
        {link ? (
          <div className="flex items-center gap-2">
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-[var(--accent)] underline hover:text-[var(--accent)]/80 truncate max-w-[180px] inline-block"
              title={link}
            >
              🔗 Mở bài viết
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className="text-[11px] text-[var(--dim)] hover:text-[var(--ink)]"
              title="Copy link bài đăng"
            >
              {copied ? "✓ Đã copy" : "📋"}
            </button>
          </div>
        ) : (
          <span className="text-xs text-[var(--dim)] italic">Chưa có link</span>
        )}
      </td>

      {/* Trạng thái bài Facebook */}
      <td className={`${tableTdCls} text-center`}>
        <select
          aria-label={`Trạng thái bài ở ${m.channel_name}`}
          className={`rounded px-2 py-0.5 text-xs font-semibold border ${
            m.post_status === "active"
              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
              : m.post_status === "pending_approval"
                ? "bg-amber-50 text-amber-800 border-amber-300"
                : "bg-rose-50 text-rose-800 border-rose-300"
          }`}
          value={m.post_status}
          onChange={(e) => onUpdateStatus(m.id, e.target.value as PostStatus)}
        >
          <option value="active">🟢 Đang hiển thị</option>
          <option value="pending_approval">🟡 Chờ duyệt</option>
          <option value="removed">🔴 Bị xóa / Gỡ</option>
        </select>
      </td>

      {/* Tương tác công khai (Quét qua Extension DOM) */}
      <td className={`${tableTdCls} text-center font-mono text-xs`}>
        <div className="flex flex-col items-center gap-0.5">
          <div>
            <span>{m.likes} 👍</span> · <span>{m.comments} 💬</span> · <span>{m.shares} 🔁</span>
          </div>
          <span className="text-[10px] text-[var(--dim)] font-sans">
            {m.scanned_at ? "Quét từ DOM" : "Chưa quét"}
          </span>
        </div>
      </td>

      {/* Chuyển đổi bán hàng (Ghi nhận thực tế / CRM) */}
      <td className={`${tableTdCls} text-center text-xs`}>
        {isEditing ? (
          <div className="flex flex-col gap-1 items-center">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[var(--dim)]">Inq:</span>
              <input
                type="number"
                min={0}
                className="w-12 rounded border p-0.5 text-center font-mono text-xs"
                value={editSalesForm.inquiries}
                onChange={(e) =>
                  setEditSalesForm((p) => ({
                    ...p,
                    inquiries: Math.max(0, parseInt(e.target.value) || 0),
                  }))
                }
              />
              <span className="text-[11px] text-[var(--dim)]">Đơn:</span>
              <input
                type="number"
                min={0}
                className="w-12 rounded border p-0.5 text-center font-mono text-xs"
                value={editSalesForm.orders}
                onChange={(e) =>
                  setEditSalesForm((p) => ({
                    ...p,
                    orders: Math.max(0, parseInt(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div className="flex gap-1 mt-1">
              <button
                type="button"
                disabled={isSavingSales}
                onClick={saveEditSales}
                className="bg-emerald-600 text-white rounded px-2 py-0.5 text-[10px] font-bold"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={cancelEditSales}
                className="bg-gray-200 text-gray-700 rounded px-2 py-0.5 text-[10px]"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center justify-center gap-1.5 font-mono">
              <span className="text-blue-600 font-semibold">{m.inquiries} inbox</span>
              <span>·</span>
              <span className="text-emerald-600 font-bold">{m.orders} đơn</span>
              <span>·</span>
              <span className="font-bold text-[var(--accent)]">{m.score}đ</span>
            </div>
            <span className="text-[10px] text-[var(--dim)] font-sans">
              Nhập tay / CRM
            </span>
          </div>
        )}
      </td>

      {/* Thao tác */}
      <td className={`${tableTdCls} text-right`}>
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onScanSingleMetric(m.id)}
            className={`${btnOutline} text-[11px] px-2 py-1`}
            title="Quét tương tác Facebook qua Extension"
          >
            Quét
          </button>
          {!isEditing && (
            <button
              type="button"
              onClick={() => startEditSales(m)}
              className={`${btnOutline} text-[11px] px-2 py-1`}
              title="Sửa số liệu inbox & đơn hàng"
            >
              Sửa
            </button>
          )}
          <button
            type="button"
            onClick={() => onDeleteMetric(m.id)}
            className={`${btnDanger} text-[11px] px-2 py-1`}
            title="Xóa bài đăng"
          >
            Xóa
          </button>
        </div>
      </td>
    </tr>
  );
});

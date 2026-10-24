import { memo } from "react";
import { cardCls } from "../../../utils/styles";

export const ScanPolicyNoticeCard = memo(function ScanPolicyNoticeCard() {
  return (
    <div className={`${cardCls} p-5 space-y-4 border-l-4 border-l-blue-500`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚖️</span>
          <h3 className="text-sm font-bold text-[var(--ink)]">
            Quy tắc thu thập số liệu & Giới hạn kỹ thuật theo chính sách Facebook
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
          Chính sách minh bạch số liệu
        </span>
      </div>

      <p className="text-xs text-[var(--dim)] leading-relaxed">
        Hệ thống không giả định mọi chỉ số đều có thể lấy tự động từ mọi nhóm. Việc quét phụ thuộc vào quyền truy cập thực tế của tài khoản, giới hạn kỹ thuật của Extension và chính sách bảo mật của Facebook.
      </p>

      {/* 3 Tầng chỉ số */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 pt-1">
        {/* Tầng 1: Công khai */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
              ✓
            </span>
            <h4 className="text-xs font-bold text-emerald-900">1. Chỉ số công khai (DOM)</h4>
          </div>
          <p className="text-[11px] text-emerald-800 leading-snug">
            <strong>Likes, Comments, Shares, Trạng thái bài viết</strong> (Đang hiển thị, Chờ duyệt, Bị gỡ).
          </p>
          <div className="rounded bg-emerald-100/70 p-2 text-[10px] text-emerald-900 leading-tight">
            ⚡ <strong>Cơ chế:</strong> Extension tự động mở ngầm URL và bóc tách các thành phần HTML công khai hiển thị trên giao diện Facebook.
          </div>
        </div>

        {/* Tầng 2: Reach / Insights */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
              ⚠️
            </span>
            <h4 className="text-xs font-bold text-amber-900">2. Lượt tiếp cận (Reach)</h4>
          </div>
          <p className="text-[11px] text-amber-800 leading-snug">
            <strong>Chỉ khả dụng khi có quyền Admin hoặc Fanpage</strong> (Admin Insights).
          </p>
          <div className="rounded bg-amber-100/70 p-2 text-[10px] text-amber-900 leading-tight">
            🛡️ <strong>Chính sách FB:</strong> Facebook không cấp Reach cho thành viên thường trong nhóm. Nếu tài khoản không phải Admin, hệ thống hiển thị N/A để đảm bảo trung thực.
          </div>
        </div>

        {/* Tầng 3: Chuyển đổi bán hàng */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
              💬
            </span>
            <h4 className="text-xs font-bold text-blue-900">3. Inbox & Đơn hàng</h4>
          </div>
          <p className="text-[11px] text-blue-800 leading-snug">
            <strong>Khách hỏi mua & Đơn chốt thành công</strong> (Chuyển đổi kinh doanh thực tế).
          </p>
          <div className="rounded bg-blue-100/70 p-2 text-[10px] text-blue-900 leading-tight">
            🔒 <strong>Bảo mật:</strong> Đây là dữ liệu hội thoại riêng (Messenger/Zalo), không nằm trên bài viết nhóm. Cập nhật qua nút &ldquo;Sửa&rdquo; hoặc CRM.
          </div>
        </div>
      </div>

      {/* Thông tin an toàn & Phòng ngừa Checkpoint */}
      <div className="rounded-lg bg-[var(--surface-muted)] p-3 text-[11px] text-[var(--dim)] space-y-1 border border-[var(--border)]">
        <div className="flex items-center gap-1.5 font-semibold text-[var(--ink)]">
          <span>⏱️</span>
          <span>Chính sách an toàn & Chống Checkpoint Facebook:</span>
        </div>
        <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
          <li>
            <strong>Giãn cách an toàn (Safe Rate Limiting):</strong> Máy chủ tự động giãn cách 2–3 giây giữa các lần quét để không vi phạm quy tắc tần suất của Facebook.
          </li>
          <li>
            <strong>Quyền truy cập thực tế:</strong> Extension sử dụng phiên đăng nhập của trình duyệt Chrome hiện tại. Nhóm kín chưa tham gia hoặc bài viết bị hạn chế quyền riêng tư sẽ được ghi nhận là <em>Không thể truy cập</em>.
          </li>
        </ul>
      </div>
    </div>
  );
});

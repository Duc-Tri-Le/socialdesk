import { Badge, CollapsibleCard, RefreshIcon } from "../ui";

export interface ExtensionStatusCardProps {
  onlineCodes: string[];
  isFetching: boolean;
  onRetryAll: () => void;
}

export function ExtensionStatusCard({
  onlineCodes,
  isFetching,
  onRetryAll,
}: ExtensionStatusCardProps) {
  return (
    <CollapsibleCard
      title="Trạng thái kết nối Chrome Extension"
      badge={
        onlineCodes.length > 0 ? (
          <Badge variant="ok">🟢 {onlineCodes.length} Chrome Online</Badge>
        ) : (
          <Badge variant="dim">⚪ Chưa có Chrome kết nối</Badge>
        )
      }
      subtitle="Đăng bài đa tài khoản tự động qua từng profile Chrome riêng biệt"
      defaultOpen={onlineCodes.length === 0}
      className="mt-4 border-sky-500/30 bg-sky-500/5"
    >
      <div className="p-3.5 text-xs text-[var(--text)] space-y-3 border-t border-sky-500/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[var(--dim)] leading-5 max-w-2xl">
            Mỗi tài khoản Facebook đăng nhập ở 1 cửa sổ/profile Chrome riêng biệt. Mở Chrome của tài khoản đó &rarr; bật extension &rarr; lấy mã trong popup và dán vào ô <strong>Mã Chrome</strong> của tài khoản tương ứng. Khi bấm <strong>Đăng bài</strong>, hệ thống sẽ tự động kích hoạt cửa sổ Chrome đó để đăng!
          </p>
          <button
            type="button"
            onClick={onRetryAll}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 transition-colors shadow-sm"
          >
            <RefreshIcon
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
            <span>Thử kết nối lại toàn bộ</span>
          </button>
        </div>

        {onlineCodes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-medium text-emerald-400">
              Các mã Chrome đang sẵn sàng:
            </span>
            {onlineCodes.map((code) => (
              <span
                key={code}
                className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300"
              >
                {code}
              </span>
            ))}
          </div>
        )}

        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-5 text-amber-200">
          💡 <strong>Lưu ý để đăng bài tự động thành công (bản v1.2.0):</strong> Khi mã nguồn vừa được cập nhật, hãy mở tab <code>chrome://extensions</code> trên Chrome và bấm nút <strong>Tải lại (🔄 Reload)</strong> trên thẻ <em>Social Desk Connector</em> (phiên bản <strong>v1.2.0</strong>) để Chrome áp dụng cơ chế tự động chờ tải ảnh và chuyển bước Fanpage mới nhất!
        </div>
      </div>
    </CollapsibleCard>
  );
}

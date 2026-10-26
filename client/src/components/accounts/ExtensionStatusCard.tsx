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
          <p className="text-[var(--text)] dark:text-[var(--dim)] leading-5 max-w-2xl">
            Mỗi tài khoản Facebook đăng nhập ở 1 cửa sổ/profile Chrome riêng biệt. Mở Chrome của tài khoản đó &rarr; bật extension &rarr; lấy mã trong popup và dán vào ô <strong>Mã Chrome</strong> của tài khoản tương ứng. Khi bấm <strong>Đăng bài</strong>, hệ thống sẽ tự động kích hoạt cửa sổ Chrome đó để đăng!
          </p>
          <button
            type="button"
            onClick={onRetryAll}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/50 dark:border-sky-500/30 bg-sky-100/80 dark:bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-900 dark:text-sky-200 hover:bg-sky-200 dark:hover:bg-sky-500/25 transition-colors shadow-xs"
          >
            <RefreshIcon
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
            <span>Thử kết nối lại toàn bộ</span>
          </button>
        </div>

        {onlineCodes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-400">
              Các mã Chrome đang sẵn sàng:
            </span>
            {onlineCodes.map((code) => (
              <span
                key={code}
                className="rounded-md bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-400/60 dark:border-emerald-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-950 dark:text-emerald-300 shadow-2xs"
              >
                {code}
              </span>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50/95 dark:bg-amber-500/10 p-3 text-xs leading-relaxed text-stone-900 dark:text-amber-200 shadow-xs">
          💡 <strong className="font-bold text-amber-950 dark:text-amber-100">Lưu ý để đăng bài và quét chỉ số thành công (bản v1.2.8):</strong> Khi mã nguồn vừa được cập nhật, hãy mở tab <code className="rounded bg-amber-200/80 dark:bg-amber-950/70 px-1.5 py-0.5 font-mono text-[11px] text-stone-950 dark:text-amber-200 border border-amber-400/60 dark:border-amber-800/60 font-bold">chrome://extensions</code> trên Chrome và bấm nút <strong className="font-bold text-stone-950 dark:text-amber-100">Tải lại (🔄 Reload)</strong> trên thẻ <em className="font-bold text-stone-950 dark:text-amber-100 not-italic">Social Desk Connector</em> (phiên bản <strong className="font-bold text-stone-950 dark:text-amber-100">v1.2.8</strong>) để cập nhật cơ chế tự động nhận diện Page Admin và tự động đóng modal tương tác!
        </div>
      </div>
    </CollapsibleCard>
  );
}

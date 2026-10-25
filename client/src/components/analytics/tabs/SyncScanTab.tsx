import { memo } from "react";
import { btnPrimary, btnOutline, cardCls } from "../../../utils/styles";
import { ScanPolicyNoticeCard } from "./ScanPolicyNoticeCard";

interface SyncScanTabProps {
  onSyncPublished: () => void;
  isSyncing: boolean;
  onScanExtension: () => void;
  isScanning: boolean;
  onGoQueue: () => void;
  onlineExtensionCodes?: string[];
}

export const SyncScanTab = memo(function SyncScanTab({
  onSyncPublished,
  isSyncing,
  onScanExtension,
  isScanning,
  onGoQueue,
  onlineExtensionCodes = [],
}: SyncScanTabProps) {
  const isExtensionConnected = onlineExtensionCodes.length > 0;

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div>
        <h2 className="text-lg font-bold text-[var(--ink)]">
          Đồng bộ bài đã đăng & Tự động quét tương tác Facebook
        </h2>
        <p className="text-xs text-[var(--dim)]">
          Quản lý việc đưa bài đã xuất bản từ Hàng đợi vào hệ thống đo lường và kết nối Chrome Extension để đọc số liệu Like, Bình luận, Chia sẻ thực tế.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Card 1: Đồng bộ từ Hàng đợi */}
        <div className={`${cardCls} p-5 space-y-4`}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-xl font-bold text-blue-700">
              🔄
            </span>
            <div>
              <h3 className="font-bold text-[var(--ink)]">Đồng bộ từ Hàng đợi duyệt</h3>
              <p className="text-xs text-[var(--dim)]">Lấy các bài đăng đã xuất bản thành công</p>
            </div>
          </div>

          <p className="text-xs text-[var(--dim)] leading-relaxed">
            Hệ thống sẽ quét toàn bộ lịch sử xuất bản trong Hàng đợi (`publish_records` với trạng thái <em>published</em>), tự động ghép với bản nháp và đưa vào danh sách đo lường mà không gây trùng lặp.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isSyncing}
              onClick={onSyncPublished}
              className={`${btnPrimary} text-xs py-2`}
            >
              {isSyncing ? "Đang đồng bộ bài đăng…" : "Đồng bộ bài đã đăng ngay"}
            </button>
            <button
              type="button"
              onClick={onGoQueue}
              className={`${btnOutline} text-xs py-2`}
            >
              Xem Hàng đợi →
            </button>
          </div>
        </div>

        {/* Card 2: Quét tương tác tự động qua Chrome Extension */}
        <div className={`${cardCls} p-5 space-y-4`}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-xl font-bold text-purple-700">
              🔌
            </span>
            <div>
              <h3 className="font-bold text-[var(--ink)]">Chrome Extension Connector</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${isExtensionConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                    }`}
                />
                <span className="text-xs font-semibold text-[var(--ink)]">
                  {isExtensionConnected
                    ? `Đang kết nối: [${onlineExtensionCodes.join(", ")}]`
                    : "Extension chưa kết nối"}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-[var(--dim)] leading-relaxed">
            Khi Extension kết nối qua WebSocket, máy chủ sẽ điều khiển Extension tự động mở ngầm URL bài viết trên Facebook để đọc chính xác lượt Like, Bình luận, Chia sẻ và cập nhật về hệ thống.
          </p>

          <div className="pt-2">
            <button
              type="button"
              disabled={isScanning || !isExtensionConnected}
              onClick={onScanExtension}
              className={`${btnPrimary} text-xs py-2 disabled:opacity-50`}
            >
              {isScanning ? "Đang quét tương tác Facebook…" : "Quét tương tác các bài gần nhất"}
            </button>
            {!isExtensionConnected && (
              <p className="mt-2 text-[11px] text-amber-700 font-medium">
                ⚠️ Hãy mở trình duyệt Chrome có cài Social Desk Extension để quét tự động.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 3. Bảng quy tắc & giới hạn kỹ thuật theo chính sách Facebook */}
      <ScanPolicyNoticeCard />
    </div>
  );
});

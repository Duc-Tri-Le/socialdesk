import { memo } from "react";
import type { DashboardFilters } from "../analyticsTypes";
import { cardCls } from "../../../utils/styles";

interface FilterOptions {
  groups: Array<{ id: number; name: string }>;
  products: string[];
  variants: Array<{ id: number; label: string; productName: string }>;
}

interface DashboardFilterBarProps {
  filters: DashboardFilters;
  options: FilterOptions;
  onChange: (updated: Partial<DashboardFilters>) => void;
  onReset: () => void;
}

export const DashboardFilterBar = memo(function DashboardFilterBar({
  filters,
  options,
  onChange,
  onReset,
}: DashboardFilterBarProps) {
  const isCustom = filters.dateRangePreset === "custom";

  return (
    <div className={`${cardCls} p-4 space-y-3 shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
        {/* Preset Ngày */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-[var(--ink)]">Khoảng ngày:</span>
          {(
            [
              { id: "today", label: "Hôm nay" },
              { id: "7d", label: "7 ngày" },
              { id: "30d", label: "30 ngày" },
              { id: "90d", label: "90 ngày" },
              { id: "custom", label: "Tùy chọn ngày" },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ dateRangePreset: p.id })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                filters.dateRangePreset === p.id
                  ? "bg-[var(--accent)] text-white shadow-xs"
                  : "bg-[var(--surface-alt)] text-[var(--ink)] hover:bg-[var(--border)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Múi giờ & Nút Reset */}
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
            🕒 Asia/Ho_Chi_Minh (UTC+7)
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-medium text-[var(--dim)] hover:text-rose-600 underline"
          >
            ↺ Đặt lại bộ lọc
          </button>
        </div>
      </div>

      {/* Dòng bộ lọc dropdown */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Nhóm Facebook */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[var(--dim)]">
            Hội nhóm Facebook:
          </label>
          <select
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
            value={filters.groupIds[0] ?? 0}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChange({ groupIds: val > 0 ? [val] : [] });
            }}
          >
            <option value={0}>Tất cả các nhóm ({options.groups.length} nhóm)</option>
            {options.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Sản phẩm */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[var(--dim)]">
            Sản phẩm:
          </label>
          <select
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
            value={filters.productName || ""}
            onChange={(e) => onChange({ productName: e.target.value, contentVariantId: 0 })}
          >
            <option value="">Tất cả sản phẩm ({options.products.length})</option>
            {options.products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Phiên bản nội dung */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[var(--dim)]">
            Biến thể nội dung:
          </label>
          <select
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
            value={filters.contentVariantId || 0}
            onChange={(e) => onChange({ contentVariantId: Number(e.target.value) })}
          >
            <option value={0}>Tất cả phiên bản ({options.variants.length})</option>
            {options.variants
              .filter((v) => !filters.productName || v.productName === filters.productName)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
          </select>
        </div>

        {/* 4. Trạng thái quét */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[var(--dim)]">
            Trạng thái quét Extension:
          </label>
          <select
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
            value={filters.scanStatus || "all"}
            onChange={(e) => onChange({ scanStatus: e.target.value as any })}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="scanned">🟢 Đã quét (Scanned)</option>
            <option value="not_scanned">⚪ Chưa quét (Not Scanned)</option>
            <option value="partial">🟡 Chờ duyệt (Partial)</option>
            <option value="failed">🔴 Bài bị gỡ / Lỗi (Failed)</option>
          </select>
        </div>
      </div>

      {/* Date Pickers khi chọn Custom */}
      {isCustom && (
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-[var(--border)]/60 text-xs">
          <span className="font-medium text-[var(--dim)]">Khoảng ngày tùy chọn:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--dim)]">Từ:</span>
            <input
              type="date"
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)]"
              value={filters.startDate || ""}
              onChange={(e) => onChange({ startDate: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--dim)]">Đến:</span>
            <input
              type="date"
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)]"
              value={filters.endDate || ""}
              onChange={(e) => onChange({ endDate: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
});

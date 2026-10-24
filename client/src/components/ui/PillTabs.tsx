export interface PillTabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number | string;
  ariaLabel?: string;
}

export interface PillTabsProps<T extends string = string> {
  tabs: PillTabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Component thanh tab dạng viên thuốc (pill tabs) chuyển trang con dùng chung:
 * - Hiển thị tên tab kèm số lượng đếm
 * - Trạng thái active nổi bật với var(--accent)
 * - Tuân thủ tiêu chuẩn WAI-ARIA tablist/tab
 */
export function PillTabs<T extends string = string>({
  tabs,
  activeId,
  onChange,
  ariaLabel = "Danh sách tab",
  className = "",
}: PillTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-2 ${className}`}
    >
      {tabs.map((t) => {
        const isActive = activeId === t.id;
        const countText = t.count !== undefined ? ` (${t.count})` : "";
        const fullAria = t.ariaLabel || `${t.label}${countText}`;

        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={fullAria}
            onClick={() => onChange(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--text)]"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1 opacity-90">({t.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

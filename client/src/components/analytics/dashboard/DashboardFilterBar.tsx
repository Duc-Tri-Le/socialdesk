import { memo, useState, useMemo, useRef, useEffect } from "react";
import type { DashboardFilters } from "../analyticsTypes";

interface FilterOptions {
  groups: Array<{ id: number; name: string }>;
  products: string[];
  variants: Array<{ id: number; label: string; productName: string }>;
}

interface DashboardFilterBarProps {
  filters: DashboardFilters;
  options: FilterOptions;
  onChange: (updated: Partial<DashboardFilters>) => void;
  onReset?: () => void;
}

interface CustomDropdownProps<T extends string | number> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (val: T) => void;
  icon?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  alignRight?: boolean;
}

/**
 * Dropdown tùy chỉnh nền đen (#121214) đồng bộ hoàn toàn với Dark theme
 * Đảm bảo text và icon cân bằng, không bị popup xám/trắng của browser
 */
function CustomDropdown<T extends string | number>({
  label,
  value,
  options,
  onChange,
  icon,
  isOpen,
  onToggle,
  onClose,
  alignRight = false,
}: CustomDropdownProps<T>) {
  const selectedOption = options.find((o) => o.value === value) || options[0];
  const displayLabel = selectedOption ? selectedOption.label : "";

  return (
    <div className="relative">
      <label className="text-[11px] font-medium text-[var(--dim)] block mb-1.5 truncate">
        {label}
      </label>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full h-9.5 px-3 flex items-center justify-between gap-2 rounded-xl border bg-[var(--surface-alt)]/60 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)] transition cursor-pointer text-left ${
          isOpen
            ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/30"
            : "border-[var(--border)] hover:border-[var(--border-hover)]"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="text-[var(--dim)] shrink-0 flex items-center">{icon}</span>}
          <span className="truncate">{displayLabel}</span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-[var(--dim)] shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[var(--accent)]" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 z-50 w-full min-w-[210px] max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl scrollbar-thin ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left transition cursor-pointer ${
                  isSelected
                    ? "bg-[var(--accent-subtle)] text-[var(--accent-ink)] font-semibold"
                    : "text-[var(--text)] hover:text-[var(--ink)] hover:bg-[var(--surface-alt)]"
                }`}
                title={opt.label}
              >
                <span className="truncate pr-2">{opt.label}</span>
                {isSelected && (
                  <svg
                    className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 ml-1.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const DashboardFilterBar = memo(function DashboardFilterBar({
  filters,
  options,
  onChange,
}: DashboardFilterBarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"time" | "group" | "product" | "variant" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const variants = options?.variants ?? [];
  const groups = options?.groups ?? [];
  const products = options?.products ?? [];
  const selectedGroupIds = filters?.groupIds ?? [];
  const isCustom = filters?.dateRangePreset === "custom";

  // Đóng dropdown khi click ra ngoài hoặc bấm Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenDropdown(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const availableVariants = useMemo(() => {
    return variants.filter(
      (v) => !filters?.productName || v.productName === filters.productName,
    );
  }, [variants, filters?.productName]);

  const handleProductChange = (newProductName: string) => {
    if (!newProductName) {
      onChange({ productName: "", contentVariantId: 0 });
      return;
    }
    const productVariants = variants.filter((v) => v.productName === newProductName);
    const currentVariantMatches = productVariants.some((v) => v.id === filters?.contentVariantId);

    if (currentVariantMatches) {
      onChange({ productName: newProductName });
    } else if ((filters?.contentVariantId ?? 0) > 0 && productVariants.length > 0 && productVariants[0]) {
      onChange({ productName: newProductName, contentVariantId: productVariants[0].id });
    } else {
      onChange({ productName: newProductName, contentVariantId: 0 });
    }
  };

  const handleVariantChange = (variantId: number) => {
    if (variantId === 0) {
      onChange({ contentVariantId: 0 });
      return;
    }
    const selectedVariant = variants.find((v) => v.id === variantId);
    if (selectedVariant && selectedVariant.productName) {
      onChange({ contentVariantId: variantId, productName: selectedVariant.productName });
    } else {
      onChange({ contentVariantId: variantId });
    }
  };

  // Danh sách các tùy chọn cho từng dropdown
  const timeOptions = useMemo(
    () => [
      { value: "today", label: "Hôm nay" },
      { value: "7d", label: "7 ngày qua" },
      { value: "30d", label: "30 ngày qua" },
      { value: "90d", label: "90 ngày qua" },
      { value: "custom", label: "Tùy chọn ngày…" },
    ],
    [],
  );

  const groupOptions = useMemo(() => {
    return [
      { value: 0, label: `Tất cả các nhóm (${groups.length} nhóm)` },
      ...groups.map((g) => ({ value: g.id, label: g.name })),
    ];
  }, [groups]);

  const productOptions = useMemo(() => {
    return [
      { value: "", label: `Tất cả sản phẩm (${products.length})` },
      ...products.map((p) => ({ value: p, label: p })),
    ];
  }, [products]);

  const variantOptions = useMemo(() => {
    const defaultLabel = filters.productName
      ? `Tất cả phiên bản của ${filters.productName} (${availableVariants.length})`
      : `Tất cả phiên bản (${availableVariants.length})`;
    return [
      { value: 0, label: defaultLabel },
      ...availableVariants.map((v) => ({ value: v.id, label: v.label })),
    ];
  }, [filters.productName, availableVariants]);

  return (
    <div
      ref={containerRef}
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs transition space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Lưới 4 dropdown bộ lọc tùy chỉnh tự động đồng bộ theme sáng/tối */}
        {!isCollapsed && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 flex-1 min-w-0">
            {/* 1. Chọn thời gian - Đã thêm nhãn Thời gian & cân bằng icon Lịch */}
            <CustomDropdown
              label="Thời gian"
              value={filters?.dateRangePreset || "30d"}
              options={timeOptions}
              onChange={(val) => onChange({ dateRangePreset: val as any })}
              isOpen={openDropdown === "time"}
              onToggle={() => setOpenDropdown((prev) => (prev === "time" ? null : "time"))}
              onClose={() => setOpenDropdown(null)}
              icon={
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              }
            />

            {/* 2. Hội nhóm Facebook */}
            <CustomDropdown
              label="Hội nhóm Facebook"
              value={selectedGroupIds[0] ?? 0}
              options={groupOptions}
              onChange={(val) => {
                const num = Number(val);
                onChange({ groupIds: num > 0 ? [num] : [] });
              }}
              isOpen={openDropdown === "group"}
              onToggle={() => setOpenDropdown((prev) => (prev === "group" ? null : "group"))}
              onClose={() => setOpenDropdown(null)}
            />

            {/* 3. Sản phẩm */}
            <CustomDropdown
              label="Sản phẩm"
              value={filters?.productName || ""}
              options={productOptions}
              onChange={(val) => handleProductChange(String(val))}
              isOpen={openDropdown === "product"}
              onToggle={() => setOpenDropdown((prev) => (prev === "product" ? null : "product"))}
              onClose={() => setOpenDropdown(null)}
            />

            {/* 4. Biến thể nội dung */}
            <CustomDropdown
              label="Biến thể nội dung"
              value={filters.contentVariantId || 0}
              options={variantOptions}
              onChange={(val) => handleVariantChange(Number(val))}
              isOpen={openDropdown === "variant"}
              onToggle={() => setOpenDropdown((prev) => (prev === "variant" ? null : "variant"))}
              onClose={() => setOpenDropdown(null)}
              alignRight
            />
          </div>
        )}

        {/* Nút Thu gọn / Mở rộng bộ lọc cân bằng theo đáy hàng */}
        <div className="shrink-0 ml-auto self-end pb-1">
          <button
            type="button"
            onClick={() => {
              setIsCollapsed((prev) => !prev);
              setOpenDropdown(null);
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dim)] hover:text-[var(--ink)] transition cursor-pointer px-2 py-1.5 rounded-lg hover:bg-[var(--surface-alt)]"
          >
            <span>{isCollapsed ? "Mở rộng bộ lọc" : "Thu gọn bộ lọc"}</span>
            <svg
              className={`h-3 w-3 text-[var(--dim)] transition-transform ${isCollapsed ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Date Pickers khi chọn Custom */}
      {isCustom && !isCollapsed && (
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border)] text-xs">
          <span className="font-medium text-[var(--dim)]">Khoảng ngày tùy chọn:</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--dim)]">Từ:</span>
            <input
              type="date"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition"
              value={filters.startDate || ""}
              onChange={(e) => onChange({ startDate: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--dim)]">Đến:</span>
            <input
              type="date"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition"
              value={filters.endDate || ""}
              onChange={(e) => onChange({ endDate: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
});

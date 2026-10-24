import type { ChangeEvent } from "react";
import { CloseIcon, SearchIcon } from "./Icons";

export interface SearchInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}

/**
 * Component thanh tìm kiếm dùng chung cho toàn bộ ứng dụng:
 * - Tích hợp icon kính lúp
 * - Nút xóa nhanh (✕) khi có từ khóa
 * - Hỗ trợ accessibility (label ẩn cho screen reader, aria-label)
 * - Tự động đồng bộ kiểu dáng chung (theme tokens)
 * - Tùy chọn compact cho thanh công cụ nhỏ gọn
 */
export function SearchInput({
  id,
  value,
  onChange,
  placeholder = "Tìm kiếm…",
  ariaLabel = "Tìm kiếm",
  className = "",
  compact = false,
  disabled = false,
  autoFocus = false,
}: SearchInputProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      {id && (
        <label htmlFor={id} className="sr-only">
          {ariaLabel}
        </label>
      )}
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 flex items-center text-[var(--dim)] ${
          compact ? "pl-2.5 [&>svg]:h-3.5 [&>svg]:w-3.5" : "pl-3"
        }`}
      >
        <SearchIcon />
      </div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        autoFocus={autoFocus}
        className={`w-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)] disabled:opacity-50 ${
          compact
            ? "rounded-md py-1 pl-7 pr-6 text-xs"
            : "rounded-[var(--radius)] py-2 pl-9 pr-8 text-sm"
        }`}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={`absolute inset-y-0 right-0 flex items-center text-[var(--dim)] hover:text-[var(--text)] ${
            compact ? "pr-2 [&>svg]:h-3 [&>svg]:w-3" : "pr-2.5"
          }`}
          aria-label="Xóa nội dung tìm kiếm"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

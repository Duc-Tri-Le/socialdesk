import type { ReactNode } from "react";

export type BadgeVariant =
  | "ok"
  | "danger"
  | "warn"
  | "accent"
  | "dim"
  | "info"
  | "default";

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  ok: "text-[var(--ok)]",
  danger: "text-[var(--danger)]",
  warn: "text-[var(--warn)]",
  accent: "text-[var(--accent-ink)]",
  dim: "text-[var(--dim)]",
  info: "text-[var(--info)]",
  default: "text-[var(--text)]",
};

/**
 * Component hiển thị nhãn/badge trạng thái chuẩn dùng chung cho toàn bộ giao diện:
 * - Nền nổi nhẹ `bg-[var(--surface-alt)]`
 * - Màu chữ ngữ nghĩa tương ứng: ok, danger, warn, accent, dim, info
 */
export function Badge({
  children,
  variant = "default",
  size = "md",
  className = "",
}: BadgeProps) {
  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs";
  const colorClass = VARIANT_CLASSES[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[var(--surface-alt)] font-semibold whitespace-nowrap ${sizeClass} ${colorClass} ${className}`}
    >
      {children}
    </span>
  );
}

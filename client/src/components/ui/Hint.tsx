import type { ReactNode } from "react";

// Dấu chấm than (!) đặt cạnh tên ô nhập — đoạn chú thích của ô chỉ
// hiện khi di chuột vào dấu này (hoặc giữ focus khi chạm/gõ phím),
// không còn in thường trực dưới ô nhập nữa.
export function Hint({
  text,
  label,
  align = "left",
}: {
  text: ReactNode;
  label: string;
  align?: "left" | "right";
}) {
  return (
    <span className="group/hint relative inline-flex shrink-0">
      <span
        tabIndex={0}
        role="img"
        aria-label={label}
        className="flex h-4 w-4 cursor-help select-none items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold leading-none text-white outline-none"
      >
        !
      </span>
      <span
        className={`pointer-events-none absolute top-full z-30 mt-1.5 hidden w-64 max-w-[72vw] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-[var(--text)] shadow-lg group-hover/hint:block group-focus-within/hint:block ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

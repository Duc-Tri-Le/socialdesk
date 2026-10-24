import {
  useState,
  useId,
  type ReactNode,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import { ChevronDownIcon, ChevronUpIcon } from "./Icons";

export interface CollapsibleCardProps {
  /** Tiêu đề chính của khối (text hoặc JSX) */
  title: ReactNode;
  /** Mô tả phụ hoặc hướng dẫn ngắn dưới tiêu đề */
  subtitle?: ReactNode;
  /** Huy hiệu / nhãn trạng thái cạnh tiêu đề */
  badge?: ReactNode;
  /** Các nút hành động phụ trên thanh tiêu đề (không kích hoạt đóng/mở) */
  headerActions?: ReactNode;
  /** Trạng thái mở mặc định (khi không dùng controlled state) */
  defaultOpen?: boolean;
  /** Trạng thái mở có kiểm soát từ component cha */
  isOpen?: boolean;
  /** Callback khi người dùng bấm đóng hoặc mở */
  onToggle?: (open: boolean) => void;
  /** Nội dung chi tiết / form bên trong khối */
  children: ReactNode;
  /** Class CSS tùy biến cho container ngoài */
  className?: string;
  /** Class CSS tùy biến cho phần header */
  headerClassName?: string;
  /** Class CSS tùy biến cho phần body chứa nội dung */
  bodyClassName?: string;
  /** Nhãn nút khi đang mở (mặc định: "Thu gọn") */
  actionTextOpen?: string;
  /** Nhãn nút khi đang đóng (mặc định: "Mở rộng") */
  actionTextClosed?: string;
  /** Có hiển thị chữ nhãn cạnh icon mũi tên hay chỉ hiển thị mũi tên */
  showActionText?: boolean;
  /** ID html phục vụ accessibility (tự sinh nếu không truyền) */
  id?: string;
  /** Thẻ HTML cho container bao ngoài */
  as?: "section" | "div";
  /** Thẻ heading cho tiêu đề */
  headerTag?: "h2" | "h3" | "h4" | "div";
}

/**
 * Component khối giao diện cho phép thu gọn / mở rộng chi tiết dùng chung:
 * - Bảo lưu toàn bộ trạng thái nhập liệu bên trong khi thu gọn (dùng hidden thay vì unmount)
 * - Hỗ trợ cả controlled (isOpen + onToggle) và uncontrolled (defaultOpen)
 * - Tương tác chuẩn accessibility (aria-expanded, aria-controls, phím Enter/Space)
 * - Thiết kế sang trọng, đồng bộ theme và tokens giao diện
 */
export function CollapsibleCard({
  title,
  subtitle,
  badge,
  headerActions,
  defaultOpen = true,
  isOpen: controlledIsOpen,
  onToggle,
  children,
  className = "",
  headerClassName = "",
  bodyClassName = "",
  actionTextOpen = "Thu gọn",
  actionTextClosed = "Mở rộng",
  showActionText = true,
  id: customId,
  as: Component = "section",
  headerTag: TitleTag = "h2",
}: CollapsibleCardProps) {
  const autoId = useId();
  const baseId = customId || autoId.replace(/:/g, "_");
  const contentId = `${baseId}-content`;
  const headerId = `${baseId}-header`;

  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalOpen;

  const handleToggle = () => {
    const nextState = !isOpen;
    if (!isControlled) {
      setInternalOpen(nextState);
    }
    onToggle?.(nextState);
  };

  const handleHeaderClick = (e: MouseEvent<HTMLDivElement>) => {
    // Không toggle nếu click vào các nút bấm, input, select, link trong header
    const target = e.target as HTMLElement | null;
    if (
      target?.closest("button") ||
      target?.closest("a") ||
      target?.closest("input") ||
      target?.closest("select") ||
      target?.closest("textarea")
    ) {
      return;
    }
    handleToggle();
  };

  const handleHeaderKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      // Chỉ kích hoạt nếu focus trực tiếp ở header
      if (e.target === e.currentTarget) {
        e.preventDefault();
        handleToggle();
      }
    }
  };

  const actionText = isOpen ? actionTextOpen : actionTextClosed;

  return (
    <Component
      id={baseId}
      aria-labelledby={headerId}
      className={`overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] transition-shadow duration-150 ${className}`}
    >
      {/* Thanh tiêu đề có thể click để đóng/mở */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={handleHeaderClick}
        onKeyDown={handleHeaderKeyDown}
        className={`group flex cursor-pointer select-none flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-alt)] ${
          isOpen ? "border-b border-[var(--border)]" : ""
        } ${headerClassName}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <TitleTag
                id={headerId}
                className="text-base font-bold text-[var(--text)] group-hover:text-[var(--accent-ink)] transition-colors"
              >
                {title}
              </TitleTag>
              {badge}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-xs text-[var(--dim)]">{subtitle}</div>
            )}
          </div>
        </div>

        {/* Nút hành động phụ & nút toggle thu gọn / mở rộng */}
        <div className="flex items-center gap-2 shrink-0">
          {headerActions}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            aria-expanded={isOpen}
            aria-controls={contentId}
            aria-label={`${actionText}: ${typeof title === "string" ? title : ""}`}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text)] shadow-sm transition-all hover:border-[var(--text)] hover:bg-[var(--surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {showActionText && <span>{actionText}</span>}
            {isOpen ? (
              <ChevronUpIcon className="h-3.5 w-3.5 shrink-0 text-[var(--dim)] transition-transform" />
            ) : (
              <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-[var(--dim)] transition-transform" />
            )}
          </button>
        </div>
      </div>

      {/* Phần nội dung có thể thu gọn: giữ nguyên DOM bằng thuộc tính hidden */}
      <div
        id={contentId}
        role="region"
        aria-labelledby={headerId}
        hidden={!isOpen}
        className={bodyClassName}
      >
        {children}
      </div>
    </Component>
  );
}

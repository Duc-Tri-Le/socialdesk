import type { ReactNode } from "react";
import type { Product } from "../../types";
import { driveStatusLabel } from "../../utils/format";
import { btnGhost, inputCls, labelCls } from "../../utils/styles";
import { DriveImageStrip } from "../ui/DriveImageStrip";
import { ProductThumb } from "../ui/ProductThumb";

export const PRODUCT_PAGE_SIZE = 10;
export { useProductFilterPagination } from "./useProductFilterPagination";

export type ProductSort =
  | "default"
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc"
  | "stock_desc"
  | "stock_asc";

export const PRODUCT_SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "default", label: "Mặc định (theo STT trong Sheet)" },
  { value: "name_asc", label: "Tên A–Z" },
  { value: "name_desc", label: "Tên Z–A" },
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "price_desc", label: "Giá cao → thấp" },
  { value: "stock_desc", label: "Tồn kho nhiều → ít" },
  { value: "stock_asc", label: "Tồn kho ít → nhiều" },
];

export function productSortLabel(sort: ProductSort): string {
  return (
    PRODUCT_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort
  );
}

export function parsePriceValue(price: string): number | null {
  const digits = (price ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export function filterProductsBySearch(
  list: Product[],
  needle: string,
): Product[] {
  if (!needle) return list;
  return list.filter((p) =>
    [p.name, p.maker, p.color, p.colors.join(" "), p.sku, p.stt, p.scale]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function sortProducts(list: Product[], sort: ProductSort): Product[] {
  if (sort === "default") return list;
  const arr = [...list];
  if (sort === "name_asc")
    return arr.sort((a, b) =>
      a.name.localeCompare(b.name, "vi", { sensitivity: "base" }),
    );
  if (sort === "name_desc")
    return arr.sort((a, b) =>
      b.name.localeCompare(a.name, "vi", { sensitivity: "base" }),
    );
  if (sort === "price_asc" || sort === "price_desc") {
    const dir = sort === "price_asc" ? 1 : -1;
    return arr.sort((a, b) => {
      const av = parsePriceValue(a.price);
      const bv = parsePriceValue(b.price);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }
  const dir = sort === "stock_desc" ? -1 : 1;
  return arr.sort((a, b) => {
    const av =
      typeof a.stock === "number" && Number.isFinite(a.stock)
        ? a.stock
        : null;
    const bv =
      typeof b.stock === "number" && Number.isFinite(b.stock)
        ? b.stock
        : null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * dir;
  });
}

export function MetaIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-[var(--text)]"
    >
      {children}
    </svg>
  );
}

export const CarIcon = () => (
  <MetaIcon>
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 3A3.8 3.8 0 0 0 2 12.9V16c0 .6.4 1 1 1h2" />
    <circle cx="7" cy="17" r="2" />
    <path d="M9 17h6" />
    <circle cx="17" cy="17" r="2" />
  </MetaIcon>
);

export const ScaleIcon = () => (
  <MetaIcon>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </MetaIcon>
);

export const RulerIcon = () => (
  <MetaIcon>
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
    <path d="m14.5 12.5 2-2" />
    <path d="m11.5 9.5 2-2" />
    <path d="m8.5 6.5 2-2" />
    <path d="m17.5 15.5 2-2" />
  </MetaIcon>
);

export const ColorIcon = () => (
  <MetaIcon>
    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
  </MetaIcon>
);

export const PriceTagIcon = () => (
  <MetaIcon>
    <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
    <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
  </MetaIcon>
);

export const StockIcon = () => (
  <MetaIcon>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </MetaIcon>
);

export const TruckIcon = () => (
  <MetaIcon>
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="17" cy="18" r="2" />
    <circle cx="7" cy="18" r="2" />
  </MetaIcon>
);

export function ProductMetaItem({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span className="text-[var(--dim)]">{label}:</span>
      <span
        className={`font-semibold text-[var(--text)]${mono ? " font-mono" : ""}`}
      >
        {value}
      </span>
    </span>
  );
}

export function ProductListCard({
  product: p,
  selected = false,
  children,
}: {
  product: Product;
  selected?: boolean;
  children?: ReactNode;
}) {
  return (
    <li
      className={`rounded-[var(--radius)] border bg-[var(--surface)] p-[15px] ${
        selected
          ? "border-2 border-[var(--accent)]"
          : "border-[var(--border)]"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <ProductThumb product={p} />
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <p className="min-w-0 font-semibold">
            {(p.sku || p.stt) && (
              <span className="mr-1.5 rounded bg-[var(--surface-alt)] px-1.5 py-0.5 font-mono text-xs font-semibold">
                {p.sku || `STT ${p.stt}`}
              </span>
            )}
            {p.name}
          </p>
          {p.source === "sheet" ? (
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--info)]">
              Từ Google Sheet
            </span>
          ) : (
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--dim)]">
              Nhập tay
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 text-xs leading-relaxed">
        {p.maker ? (
          <ProductMetaItem icon={<CarIcon />} label="Hãng xe" value={p.maker} />
        ) : null}
        <ProductMetaItem
          icon={<ScaleIcon />}
          label="Tỉ lệ"
          value={p.scale || "Chưa rõ"}
        />
        <ProductMetaItem
          icon={<RulerIcon />}
          label="Kích thước"
          value={p.size || "Chưa rõ"}
        />
        <ProductMetaItem
          icon={<ColorIcon />}
          label="Màu sắc"
          value={
            p.colors.length > 0
              ? p.colors.join(", ")
              : p.color || "Chưa rõ"
          }
        />
        <ProductMetaItem
          icon={<PriceTagIcon />}
          label="Giá bán"
          value={p.price || "Chưa có giá"}
          mono={Boolean(p.price)}
        />
        <ProductMetaItem
          icon={<StockIcon />}
          label="Tồn kho"
          value={String(p.stock)}
          mono
        />
        <ProductMetaItem
          icon={<TruckIcon />}
          label="Vận chuyển"
          value={p.ship || "COD"}
        />
      </div>
      <p className="mt-1 flex w-full flex-wrap gap-1.5 text-xs">
        {p.has_real_image ? (
          <a
            href={p.image_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Mở thư mục Drive của ${p.name} (đã có ${p.drive_images.length} ảnh thật từ Drive)`}
            className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]"
          >
            Có {p.drive_images.length} ảnh thật từ Drive (bản JPEG)
          </a>
        ) : (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--danger)]">
            {driveStatusLabel(p)}
          </span>
        )}
        {p.video_url ? (
          <a
            href={p.video_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Mở video của ${p.name}`}
            className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]"
          >
            Có video
          </a>
        ) : (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
            Chưa có video
          </span>
        )}
      </p>
      <DriveImageStrip images={p.drive_images} label={p.name} max={7} />
      {children}
    </li>
  );
}

export function ProductListControls({
  searchId,
  sortId,
  searchAriaLabel,
  sortAriaLabel,
  search,
  onSearchChange,
  sort,
  onSortChange,
  total,
  rangeStart,
  rangeEnd,
  page,
  totalPages,
  needleText,
  allTotal,
}: {
  searchId: string;
  sortId: string;
  searchAriaLabel: string;
  sortAriaLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  sort: ProductSort;
  onSortChange: (value: ProductSort) => void;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  page: number;
  totalPages: number;
  needleText: string;
  allTotal?: number;
}) {
  const needle = needleText.trim();
  return (
    <>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor={searchId}>
            Tìm sản phẩm trong danh sách
          </label>
          <input
            id={searchId}
            aria-label={searchAriaLabel}
            className={inputCls}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm theo tên xe, hãng xe, màu, mã SKU…"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={sortId}>
            Sắp xếp danh sách sản phẩm
          </label>
          <select
            id={sortId}
            aria-label={sortAriaLabel}
            className={inputCls}
            value={sort}
            onChange={(e) => onSortChange(e.target.value as ProductSort)}
          >
            {PRODUCT_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {total > 0 && (
        <p className="mt-2 text-sm text-[var(--dim)]" role="status">
          Đang xem{" "}
          <strong className="font-mono">
            {rangeStart}–{rangeEnd} / {total}
          </strong>{" "}
          sản phẩm · Trang {page}/{totalPages} · {PRODUCT_PAGE_SIZE} sản
          phẩm mỗi trang
          {needle
            ? ` · đang lọc theo “${needle}”${
                allTotal !== undefined ? ` (tổng ${allTotal} sản phẩm)` : ""
              }`
            : ""}
          {sort !== "default" ? ` · sắp xếp: ${productSortLabel(sort)}` : ""}
        </p>
      )}
    </>
  );
}

export function ProductListPagination({
  navLabel,
  prevLabel,
  nextLabel,
  pageLabel,
  pageNumbers,
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  onPage,
}: {
  navLabel: string;
  prevLabel: string;
  nextLabel: string;
  pageLabel: (n: number) => string;
  pageNumbers: number[];
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPage: (n: number) => void;
}) {
  if (total <= PRODUCT_PAGE_SIZE) return null;
  return (
    <nav
      aria-label={navLabel}
      className="mt-4 flex flex-wrap items-center gap-2"
    >
      <button
        type="button"
        className={btnGhost}
        disabled={page <= 1}
        onClick={() => onPage(Math.max(1, page - 1))}
        aria-label={prevLabel}
      >
        ← Trang trước
      </button>
      {pageNumbers.map((n, idx) => {
        const prev = pageNumbers[idx - 1];
        const gap = prev !== undefined && n - prev > 1;
        return (
          <span key={n} className="flex items-center gap-2">
            {gap && (
              <span aria-hidden className="text-sm text-[var(--dim)]">
                …
              </span>
            )}
            <button
              type="button"
              onClick={() => onPage(n)}
              aria-label={pageLabel(n)}
              aria-current={n === page ? "page" : undefined}
              className={`min-w-10 rounded-[var(--radius)] px-3 py-2 text-sm font-semibold ${
                n === page
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              }`}
            >
              {n}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        className={btnGhost}
        disabled={page >= totalPages}
        onClick={() => onPage(Math.min(totalPages, page + 1))}
        aria-label={nextLabel}
      >
        Trang sau →
      </button>
      <span className="text-sm text-[var(--dim)]" role="status">
        {rangeStart}–{rangeEnd} / {total} sản phẩm
      </span>
    </nav>
  );
}

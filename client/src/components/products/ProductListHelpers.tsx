import type { ReactNode } from "react";
import type { Product } from "../../types";
import { driveStatusLabel } from "../../utils/format";
import { fuzzyMatchVi } from "../../utils/search";
import { inputCls, labelCls } from "../../utils/styles";
import { Badge } from "../ui/Badge";
import { DriveImageStrip } from "../ui/DriveImageStrip";
import { Pagination } from "../ui/Pagination";
import { ProductThumb } from "../ui/ProductThumb";
import { SearchInput } from "../ui/SearchInput";
import {
  CarIcon,
  ScaleIcon,
  RulerIcon,
  ColorIcon,
  PriceTagIcon,
  StockIcon,
  TruckIcon,
} from "../ui/Icons";

export {
  MetaIcon,
  CarIcon,
  ScaleIcon,
  RulerIcon,
  ColorIcon,
  PriceTagIcon,
  StockIcon,
  TruckIcon,
} from "../ui/Icons";

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
    fuzzyMatchVi(
      [p.name, p.maker, p.color, p.colors.join(" "), p.sku, p.stt, p.scale].join(" "),
      needle,
    ),
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
          >
            <Badge variant="ok">
              Có {p.drive_images.length} ảnh thật từ Drive (bản JPEG)
            </Badge>
          </a>
        ) : (
          <Badge variant="danger">{driveStatusLabel(p)}</Badge>
        )}
        {p.video_url ? (
          <a
            href={p.video_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Mở video của ${p.name}`}
          >
            <Badge variant="ok">Có video</Badge>
          </a>
        ) : (
          <Badge variant="dim">Chưa có video</Badge>
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
          <SearchInput
            id={searchId}
            ariaLabel={searchAriaLabel}
            value={search}
            onChange={onSearchChange}
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
  prevLabel = "← Trang trước",
  nextLabel = "Trang sau →",
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
    <Pagination
      page={page}
      totalPages={totalPages}
      onPageChange={onPage}
      totalItems={total}
      pageSize={PRODUCT_PAGE_SIZE}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      itemLabel="sản phẩm"
      navLabel={navLabel}
      prevLabel={prevLabel}
      nextLabel={nextLabel}
    />
  );
}

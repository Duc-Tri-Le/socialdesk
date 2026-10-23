import { useState, useEffect, useMemo } from "react";
import type { Product } from "../../types";
import {
  PRODUCT_PAGE_SIZE,
  type ProductSort,
  filterProductsBySearch,
  sortProducts,
} from "./ProductListHelpers";

export function useProductFilterPagination(
  products: Product[],
  pageSize: number = PRODUCT_PAGE_SIZE,
) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("default");
  const [page, setPage] = useState(1);

  const searchNeedle = search.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    return sortProducts(
      filterProductsBySearch(products, searchNeedle),
      sort,
    );
  }, [products, searchNeedle, sort]);

  const total = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, safePage * pageSize);

  const pagedProducts = useMemo(() => {
    return filteredProducts.slice(
      (safePage - 1) * pageSize,
      safePage * pageSize,
    );
  }, [filteredProducts, safePage, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const wanted = new Set<number>([
      1,
      totalPages,
      safePage - 1,
      safePage,
      safePage + 1,
    ]);
    return [...wanted]
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
  }, [totalPages, safePage]);

  const handleSetSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  return {
    search,
    setSearch: handleSetSearch,
    sort,
    setSort,
    page: safePage,
    setPage,
    total,
    totalPages,
    rangeStart,
    rangeEnd,
    pagedProducts,
    pageNumbers,
  };
}

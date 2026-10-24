import { useState, useMemo } from "react";
import type { Product } from "../../types";
import {
  PRODUCT_PAGE_SIZE,
  type ProductSort,
  filterProductsBySearch,
  sortProducts,
} from "./ProductListHelpers";
import { usePagination } from "../ui/Pagination";

/**
 * Hook kết hợp lọc sản phẩm theo từ khóa / sắp xếp và phân trang thông qua usePagination dùng chung.
 */
export function useProductFilterPagination(
  products: Product[],
  pageSize: number = PRODUCT_PAGE_SIZE,
) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("default");

  const searchNeedle = search.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    return sortProducts(
      filterProductsBySearch(products, searchNeedle),
      sort,
    );
  }, [products, searchNeedle, sort]);

  const pagination = usePagination(filteredProducts, { pageSize });

  const handleSetSearch = (val: string) => {
    setSearch(val);
    pagination.resetPage();
  };

  return {
    search,
    setSearch: handleSetSearch,
    sort,
    setSort,
    page: pagination.page,
    setPage: pagination.setPage,
    total: pagination.totalItems,
    totalPages: pagination.totalPages,
    rangeStart: pagination.rangeStart,
    rangeEnd: pagination.rangeEnd,
    pagedProducts: pagination.pagedItems,
    paginationProps: pagination.paginationProps,
    pageNumbers: Array.from({ length: pagination.totalPages }, (_, i) => i + 1),
  };
}

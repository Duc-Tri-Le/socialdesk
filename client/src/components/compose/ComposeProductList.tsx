import type { Product } from "../../types";
import { btnGhost } from "../../utils/styles";
import {
  useProductFilterPagination,
  ProductListCard,
  ProductListControls,
  ProductListPagination,
} from "../products/ProductListHelpers";

export interface ComposeProductListProps {
  allProducts: Product[];
  selectedProduct: Product | null;
  onUseProduct: (p: Product, chosenColor?: string) => void;
  onGoProducts: () => void;
}

export function ComposeProductList({
  allProducts,
  selectedProduct,
  onUseProduct,
  onGoProducts,
}: ComposeProductListProps) {
  const {
    search: listSearch,
    setSearch: setListSearch,
    sort: listSort,
    setSort: setListSort,
    page: safeListPage,
    setPage: setListPage,
    total: composeTotal,
    totalPages: composeTotalPages,
    rangeStart: composeRangeStart,
    rangeEnd: composeRangeEnd,
    pagedProducts: pagedComposeProducts,
    pageNumbers: composePageNumbers,
  } = useProductFilterPagination(allProducts);

  return (
    <section aria-label="Chọn sản phẩm để soạn bài" className="min-w-0">
      <h2 className="text-lg font-bold">Chọn từ danh sách sản phẩm</h2>

      <ProductListControls
        searchId="compose-product-search"
        sortId="compose-product-sort"
        searchAriaLabel="Tìm sản phẩm trong danh sách soạn bài"
        sortAriaLabel="Sắp xếp danh sách sản phẩm trong soạn bài"
        search={listSearch}
        onSearchChange={(value) => {
          setListSearch(value);
          setListPage(1);
        }}
        sort={listSort}
        onSortChange={(value) => {
          setListSort(value);
          setListPage(1);
        }}
        total={composeTotal}
        rangeStart={composeRangeStart}
        rangeEnd={composeRangeEnd}
        page={safeListPage}
        totalPages={composeTotalPages}
        needleText={listSearch}
        allTotal={allProducts.length}
      />

      <ul className="mt-3 space-y-3">
        {pagedComposeProducts.map((p: Product) => (
          <ProductListCard
            key={p.id}
            product={p}
            selected={selectedProduct?.id === p.id}
          >
            <div className="mt-3">
              <button
                type="button"
                className={btnGhost}
                onClick={() => onUseProduct(p)}
              >
                Đổ vào form soạn bài
              </button>

              {p.colors.length > 1 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-[var(--dim)]">
                    Đổ vào form theo màu:
                  </span>
                  {p.colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold"
                      aria-label={`Đổ ${p.name} màu ${c} vào form soạn bài`}
                      onClick={() => onUseProduct(p, c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ProductListCard>
        ))}
      </ul>

      {allProducts.length === 0 && (
        <p className="mt-2 text-sm text-[var(--dim)]">
          Chưa có sản phẩm nào.{" "}
          <button
            type="button"
            className="underline"
            onClick={onGoProducts}
          >
            Sang mục Sản phẩm để đồng bộ từ Google Sheet
          </button>
        </p>
      )}

      {allProducts.length > 0 && composeTotal === 0 && (
        <p className="mt-2 text-sm text-[var(--dim)]">
          Không có sản phẩm nào khớp với “{listSearch.trim()}”.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setListSearch("");
              setListPage(1);
            }}
          >
            Xóa từ khóa tìm
          </button>
        </p>
      )}

      <ProductListPagination
        navLabel="Phân trang danh sách sản phẩm để soạn bài"
        prevLabel="Trang trước"
        nextLabel="Trang sau"
        pageLabel={(n) => `Đi tới trang ${n} của danh sách soạn bài`}
        pageNumbers={composePageNumbers}
        page={safeListPage}
        totalPages={composeTotalPages}
        rangeStart={composeRangeStart}
        rangeEnd={composeRangeEnd}
        total={composeTotal}
        onPage={setListPage}
      />
    </section>
  );
}

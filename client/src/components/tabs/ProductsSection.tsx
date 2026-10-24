import { useState, useRef, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Product, SheetConfig } from "../../types";
import { btnGhost, btnDanger } from "../../utils/styles";
import {
  useProductFilterPagination,
  ProductListCard,
  ProductListControls,
  ProductListPagination,
} from "../products/ProductListHelpers";
import { SheetSourceManager } from "../products/SheetSourceManager";
import { ProductFormCard, type ProductFormData } from "../products/ProductFormCard";

const initialProductForm: ProductFormData = {
  id: 0,
  stt: "",
  name: "",
  scale: "",
  maker: "",
  size: "",
  color: "",
  price: "",
  stock: "1",
  ship: "",
  image_url: "",
  video_url: "",
};

export function ProductsSection() {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.listProducts({}),
  });
  const allProducts: Product[] = products.data?.products ?? [];

  const {
    search: productSearch,
    setSearch: setProductSearch,
    sort: productSort,
    setSort: setProductSort,
    page: safeProductPage,
    setPage: setProductPage,
    total: productTotal,
    totalPages: productTotalPages,
    rangeStart: productRangeStart,
    rangeEnd: productRangeEnd,
    pagedProducts,
    pageNumbers: productPageNumbers,
  } = useProductFilterPagination(allProducts);

  const sheetProductsAll = allProducts.filter((p) => p.source === "sheet");
  const realImageCounts =
    sheetProductsAll.length > 0
      ? {
          with: sheetProductsAll.filter((p) => p.has_real_image).length,
          without: sheetProductsAll.filter((p) => !p.has_real_image).length,
        }
      : undefined;

  const sheet = useQuery({
    queryKey: ["sheet"],
    queryFn: () => api.getSheetConfig({}),
  });

  const [sheetMsg, setSheetMsg] = useState("");
  const [productForm, setProductForm] = useState<ProductFormData>(initialProductForm);
  const [productMsg, setProductMsg] = useState("");
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [driveMsg, setDriveMsg] = useState<Record<number, string>>({});
  const productFormRef = useRef<HTMLFormElement>(null);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["sheet"] });
  };

  const saveSheet = useMutation({
    mutationFn: (data: { name: string; spreadsheet: string; sheet_name: string; range: string }) =>
      api.saveSheetConfig(data),
    onSuccess: (res: { ok: boolean; message: string }) => {
      setSheetMsg(res.message);
      refreshAll();
    },
  });

  const sync = useMutation({
    mutationFn: (sourceId: number) => api.syncSheetNow({ source_id: sourceId }),
    onSuccess: (res: { message: string }) => {
      setSheetMsg(res.message);
      setProductPage(1);
      refreshAll();
    },
    onError: (err) => {
      setSheetMsg(`Đồng bộ thất bại: ${err instanceof Error ? err.message : String(err)}`);
      refreshAll();
    },
  });

  const setActiveSource = useMutation({
    mutationFn: (id: number) => api.setActiveSheetSource({ id }),
    onSuccess: (res: { message: string }) => {
      setSheetMsg(res.message);
      refreshAll();
    },
  });

  const deleteSource = useMutation({
    mutationFn: (id: number) => api.deleteSheetSource({ id }),
    onSuccess: (res: { message: string }) => {
      setSheetMsg(res.message);
      refreshAll();
    },
  });

  const saveProduct = useMutation({
    mutationFn: () =>
      api.saveProduct({
        id: productForm.id || undefined,
        stt: productForm.stt,
        name: productForm.name,
        scale: productForm.scale,
        maker: productForm.maker,
        size: productForm.size,
        color: productForm.color,
        price: productForm.price,
        stock: Number(productForm.stock || 1),
        ship: productForm.ship,
        image_url: productForm.image_url,
        video_url: productForm.video_url,
      }),
    onSuccess: () => {
      refreshAll();
      setProductMsg("Đã lưu sản phẩm.");
      setProductForm(initialProductForm);
      setIsProductFormOpen(false);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: (id: number) => api.deleteProduct({ id }),
    onSuccess: refreshAll,
  });

  const refreshImages = useMutation({
    mutationFn: (id: number) => api.refreshProductImages({ id }),
    onSuccess: (res, id) => {
      setDriveMsg((m) => ({ ...m, [id]: res.message }));
      refreshAll();
    },
    onError: (err, id) => {
      setDriveMsg((m) => ({
        ...m,
        [id]: `Quét ảnh Drive thất bại: ${err instanceof Error ? err.message : String(err)}`,
      }));
    },
  });

  const submitProduct = (e: FormEvent) => {
    e.preventDefault();
    if (productForm.name.trim()) saveProduct.mutate();
  };

  const cfg: SheetConfig | undefined = sheet.data;
  const manualCount = allProducts.filter((p) => p.source !== "sheet").length;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-5">
      <div className="min-w-0 space-y-4 lg:col-span-2 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1">
        <SheetSourceManager
          cfg={cfg}
          allProductsCount={allProducts.length}
          realImageCounts={realImageCounts}
          sheetMsg={sheetMsg}
          onSync={(id) => sync.mutate(id)}
          isSyncPending={sync.isPending}
          onSetActive={(id) => setActiveSource.mutate(id)}
          isActivePending={setActiveSource.isPending}
          onDelete={(id) => deleteSource.mutate(id)}
          isDeletePending={deleteSource.isPending}
          onSaveSheet={(data) => saveSheet.mutate(data)}
          isSavePending={saveSheet.isPending}
        />

        <ProductFormCard
          form={productForm}
          setForm={setProductForm}
          isOpen={isProductFormOpen}
          setIsOpen={setIsProductFormOpen}
          onSubmit={submitProduct}
          isPending={saveProduct.isPending}
          productMsg={productMsg}
          onCancel={() => {
            setProductMsg("");
            setIsProductFormOpen(false);
            setProductForm(initialProductForm);
          }}
          formRef={productFormRef}
        />
      </div>

      <section aria-label="Danh sách sản phẩm" className="min-w-0 lg:col-span-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            Sản phẩm đang bán ({productTotal})
          </h2>
          {allProducts.length > 0 && (
            <p className="text-xs text-[var(--dim)]" role="status">
              <span className="font-mono font-semibold">
                {sheetProductsAll.length}
              </span>{" "}
              từ Sheet ·{" "}
              <span className="font-mono font-semibold">{manualCount}</span>{" "}
              nhập tay
            </p>
          )}
        </header>

        <ProductListControls
          searchId="products-search"
          sortId="products-sort"
          searchAriaLabel="Tìm sản phẩm trong mục Sản phẩm"
          sortAriaLabel="Sắp xếp danh sách sản phẩm"
          search={productSearch}
          onSearchChange={(value) => {
            setProductSearch(value);
            setProductPage(1);
          }}
          sort={productSort}
          onSortChange={(value) => {
            setProductSort(value);
            setProductPage(1);
          }}
          total={productTotal}
          rangeStart={productRangeStart}
          rangeEnd={productRangeEnd}
          page={safeProductPage}
          totalPages={productTotalPages}
          needleText={productSearch}
          allTotal={allProducts.length}
        />

        <ul className="mt-3 space-y-3">
          {pagedProducts.map((p: Product) => (
            <ProductListCard key={p.id} product={p}>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={btnGhost}
                  onClick={() => {
                    setIsProductFormOpen(true);
                    setProductForm({
                      id: p.id,
                      stt: p.stt,
                      name: p.name,
                      scale: p.scale,
                      maker: p.maker,
                      size: p.size,
                      color: p.color,
                      price: p.price,
                      stock: String(p.stock),
                      ship: p.ship,
                      image_url: p.image_url,
                      video_url: p.video_url,
                    });
                    requestAnimationFrame(() =>
                      productFormRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                      }),
                    );
                  }}
                >
                  Sửa
                </button>
                <button
                  className={btnGhost}
                  disabled={refreshImages.isPending}
                  onClick={() => refreshImages.mutate(p.id)}
                  aria-label={`Quét lại ảnh thật từ Drive cho ${p.name}`}
                >
                  {refreshImages.isPending ? "Đang quét Drive…" : "Quét lại ảnh Drive"}
                </button>
                <button
                  className={btnDanger}
                  onClick={() => deleteProduct.mutate(p.id)}
                  aria-label={`Xóa sản phẩm ${p.name}`}
                >
                  Xóa
                </button>
              </div>
              {driveMsg[p.id] && (
                <p className="mt-2 text-sm font-medium" role="status">
                  {driveMsg[p.id]}
                </p>
              )}
            </ProductListCard>
          ))}
        </ul>

        {products.data && products.data.products.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa có sản phẩm nào — đồng bộ từ một nguồn trong mục Nguồn Sản Phẩm hoặc thêm thủ công ở cột bên trái.
          </p>
        )}

        {products.data && products.data.products.length > 0 && productTotal === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Không có sản phẩm nào khớp với “{productSearch.trim()}”.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setProductSearch("");
                setProductPage(1);
              }}
            >
              Xóa từ khóa tìm
            </button>
          </p>
        )}

        <ProductListPagination
          navLabel="Phân trang danh sách sản phẩm"
          prevLabel="Trang trước"
          nextLabel="Trang sau"
          pageLabel={(n) => `Đi tới trang ${n}`}
          pageNumbers={productPageNumbers}
          page={safeProductPage}
          totalPages={productTotalPages}
          rangeStart={productRangeStart}
          rangeEnd={productRangeEnd}
          total={productTotal}
          onPage={setProductPage}
        />
      </section>
    </div>
  );
}

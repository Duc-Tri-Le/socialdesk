import { useState, useRef, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Product, SheetConfig, SheetSource } from "../../types";
import { btnPrimary, btnGhost, btnDanger, inputCls, labelCls } from "../../utils/styles";
import { fmtDate, shortenSyncMessage } from "../../utils/format";
import { Hint, SheetImagePreview, CollapsibleCard, Badge } from "../ui";
import {
  useProductFilterPagination,
  ProductListCard,
  ProductListControls,
  ProductListPagination,
} from "../products/ProductListHelpers";

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
  // Số có/chưa có ảnh THẬT (đã lấy được file từ Drive) của các sản
  // phẩm nguồn Sheet — dùng cho dòng tóm tắt đồng bộ rút gọn.
  const sheetProductsAll = allProducts.filter((p) => p.source === "sheet");
  const realImageCounts =
    sheetProductsAll.length > 0
      ? {
          with: sheetProductsAll.filter((p) => p.has_real_image).length,
          without: sheetProductsAll.filter((p) => !p.has_real_image)
            .length,
        }
      : undefined;
  const sheet = useQuery({
    queryKey: ["sheet"],
    queryFn: () => api.getSheetConfig({}),
  });
  const [sheetForm, setSheetForm] = useState({
    name: "",
    spreadsheet: "",
    sheet_name: "",
    range: "",
  });
  const [sheetMsg, setSheetMsg] = useState("");
  const [productForm, setProductForm] = useState({
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
  });
  const [productMsg, setProductMsg] = useState("");
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const isEditing = productForm.id > 0;
  const showProductForm = isEditing || isProductFormOpen;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["sheet"] });
  };
  const saveSheet = useMutation({
    mutationFn: () => api.saveSheetConfig({ ...sheetForm }),
    onSuccess: (res: { ok: boolean; message: string }) => {
      setSheetMsg(res.message);
      if (res.ok)
        setSheetForm({ name: "", spreadsheet: "", sheet_name: "", range: "" });
      refreshAll();
    },
  });
  const sync = useMutation({
    mutationFn: (sourceId: number) =>
      api.syncSheetNow({ source_id: sourceId }),
    onSuccess: (res: { message: string }) => {
      setSheetMsg(res.message);
      setProductPage(1);
      refreshAll();
    },
    onError: (err) => {
      setSheetMsg(
        `Đồng bộ thất bại: ${err instanceof Error ? err.message : String(err)}`,
      );
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
      setProductForm({
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
      });
      setIsProductFormOpen(false);
    },
  });
  const deleteProduct = useMutation({
    mutationFn: (id: number) => api.deleteProduct({ id }),
    onSuccess: refreshAll,
  });
  const [driveMsg, setDriveMsg] = useState<Record<number, string>>({});
  const productFormRef = useRef<HTMLFormElement>(null);
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

  const submitSheet = (e: FormEvent) => {
    e.preventDefault();
    if (sheetForm.spreadsheet.trim()) saveSheet.mutate();
  };
  const submitProduct = (e: FormEvent) => {
    e.preventDefault();
    if (productForm.name.trim()) saveProduct.mutate();
  };

  const cfg: SheetConfig | undefined = sheet.data;

  const activeSource = cfg?.sources.find((s) => s.is_active);
  const manualCount = allProducts.filter((p) => p.source !== "sheet").length;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-5">
      <div className="min-w-0 space-y-4 lg:col-span-2 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1">
      <section
        aria-label="Nguồn Sản Phẩm"
        className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-lg font-bold">Nguồn Sản Phẩm</h2>
          <span className="rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-xs font-semibold">
            <span className="font-mono">{allProducts.length}</span> sản phẩm
          </span>
        </header>
        <div aria-label="Danh sách nguồn Sheet đã lưu" className="p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Nguồn Sheet đã lưu
            </h3>
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-mono text-xs font-semibold">
              {cfg?.sources.length ?? 0}
            </span>
          </div>
          {activeSource && (
            <p className="mt-1.5 text-xs text-[var(--dim)]" role="status">
              Đang lấy từ:{" "}
              <span className="font-semibold text-[var(--text)]">
                {activeSource.name}
              </span>
            </p>
          )}
          {cfg && cfg.sources.length === 0 && (
            <p className="mt-2 rounded-[var(--radius)] bg-[var(--surface-alt)] px-3 py-2.5 text-sm text-[var(--dim)]">
              Chưa có nguồn nào — thêm nguồn ở phần “Thêm nguồn Sheet” bên
              dưới.
            </p>
          )}
          <ul className="mt-2 space-y-3">
            {(cfg?.sources ?? []).map((src: SheetSource) => (
              <li
                key={src.id}
                className={`rounded-[var(--radius)] border bg-[var(--bg)] p-3 ${
                  src.is_active
                    ? "border-2 border-[var(--accent)]"
                    : "border-[var(--border)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{src.name}</p>
                  {src.is_active && (
                    <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">
                      Nguồn đang chọn
                    </span>
                  )}
                  <span className="text-xs text-[var(--dim)]">
                    <span className="font-mono">{src.product_count}</span> sản
                    phẩm từ nguồn này
                  </span>
                </div>
                {src.title && src.title !== src.name && (
                  <p className="mt-0.5 text-xs text-[var(--dim)]">
                    Tên file trên Google: “{src.title}”
                  </p>
                )}
                <p className="mt-0.5 truncate text-xs text-[var(--dim)]">
                  Link:{" "}
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Mở file Sheet của nguồn ${src.name}`}
                    className="font-mono text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                  >
                    {src.url}
                  </a>
                </p>
                <p className="mt-0.5 text-xs text-[var(--dim)]">
                  {src.sheet_name
                    ? `Tab: ${src.sheet_name}`
                    : "Tab: tab đầu tiên"}
                  {src.last_sync_at
                    ? ` · Đồng bộ ${fmtDate(src.last_sync_at)} — ${shortenSyncMessage(src.last_sync_message, realImageCounts)}`
                    : " · Chưa đồng bộ lần nào"}
                  {src.last_sync_status === "syncing"
                    ? " · Đang đồng bộ…"
                    : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={sync.isPending}
                    onClick={() => sync.mutate(src.id)}
                    aria-label={`Đồng bộ ngay từ nguồn Sheet ${src.name}`}
                  >
                    {sync.isPending ? "Đang đồng bộ…" : "Đồng bộ nguồn này"}
                  </button>
                  {!src.is_active && (
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={setActiveSource.isPending}
                      onClick={() => setActiveSource.mutate(src.id)}
                      aria-label={`Chọn nguồn Sheet ${src.name} làm nguồn chính`}
                    >
                      Chọn làm nguồn chính
                    </button>
                  )}
                  <button
                    type="button"
                    className={btnDanger}
                    disabled={deleteSource.isPending}
                    onClick={() => deleteSource.mutate(src.id)}
                    aria-label={`Xóa nguồn Sheet ${src.name} khỏi danh sách đã lưu`}
                  >
                    Xóa nguồn
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {sheetMsg && (
            <p className="mt-2 text-sm font-medium" role="status">
              {sheetMsg}
            </p>
          )}
        </div>

        <CollapsibleCard
          title="Thêm nguồn Sheet"
          defaultOpen={!cfg?.sources.length}
          headerTag="h3"
          className="border-t border-[var(--border)] rounded-none border-x-0 border-b-0"
        >
          <form
            onSubmit={submitSheet}
            aria-label="Thêm nguồn Sheet"
            className="space-y-3 p-4"
          >
            <div>
              <label className={labelCls} htmlFor="sh-name">Tên nguồn Sheet *</label>
              <input
                id="sh-name"
                aria-label="Tên nguồn Sheet"
                className={inputCls}
                value={sheetForm.name}
                onChange={(e) =>
                  setSheetForm({ ...sheetForm, name: e.target.value })
                }
                placeholder="Đặt tên cho nguồn Sheet"
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="sh-link">Link hoặc ID file Google Sheet *</label>
              <input
                id="sh-link"
                aria-label="Link hoặc ID file Google Sheet"
                className={inputCls}
                value={sheetForm.spreadsheet}
                onChange={(e) =>
                  setSheetForm({ ...sheetForm, spreadsheet: e.target.value })
                }
                placeholder="https://docs.google.com/spreadsheets/d/…"
                required
              />
            </div>
            <div className="grid gap-3">
              <div>
                <label className={labelCls} htmlFor="sh-tab">Tên tab trong Sheet</label>
                <input
                  id="sh-tab"
                  aria-label="Tên tab trong Sheet"
                  className={inputCls}
                  value={sheetForm.sheet_name}
                  onChange={(e) =>
                    setSheetForm({ ...sheetForm, sheet_name: e.target.value })
                  }
                  placeholder="Để trống = tab đầu tiên"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="sh-range">Phạm vi ô (không bắt buộc)</label>
                <input
                  id="sh-range"
                  aria-label="Phạm vi ô"
                  className={inputCls}
                  value={sheetForm.range}
                  onChange={(e) =>
                    setSheetForm({ ...sheetForm, range: e.target.value })
                  }
                  placeholder="Để trống = lấy toàn bộ dữ liệu"
                />
              </div>
            </div>
            <button
              type="submit"
              className={`${btnPrimary} w-full sm:w-auto`}
              disabled={saveSheet.isPending}
            >
              {saveSheet.isPending ? "Đang lưu…" : "Lưu nguồn Sheet"}
            </button>
          </form>
        </CollapsibleCard>
      </section>

      <CollapsibleCard
        as="section"
        title={
          productForm.id
            ? `Đang sửa sản phẩm #${productForm.id}`
            : "Thêm sản phẩm thủ công"
        }
        badge={
          productForm.id > 0 ? (
            <Badge variant="accent">Đang sửa</Badge>
          ) : undefined
        }
        isOpen={showProductForm}
        onToggle={setIsProductFormOpen}
        className={
          productForm.id
            ? "border-2 border-[var(--accent)]"
            : "border-[var(--border)]"
        }
      >
        <form
          ref={productFormRef}
          onSubmit={submitProduct}
          className="scroll-mt-24"
        >
          <div className="space-y-4 p-4">
            <div role="group" aria-label="Thông tin xe" className="space-y-3">
              <p className="text-xs font-bold text-[var(--dim)]">
                Thông tin xe
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls} htmlFor="pf-name">Tên sản phẩm *</label>
                  <input id="pf-name" aria-label="Tên sản phẩm" className={inputCls} value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required />
                </div>
                <div className="col-span-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="pf-maker">Hãng xe</label>
                    <Hint
                      label="Chú thích ô Hãng xe (thêm sản phẩm thủ công)"
                      text="Hãng xe sẽ được nhắc trong bài viết; tên sản phẩm luôn giữ nguyên văn như đã nhập."
                    />
                  </div>
                  <input id="pf-maker" aria-label="Hãng xe" className={inputCls} value={productForm.maker} onChange={(e) => setProductForm({ ...productForm, maker: e.target.value })} placeholder="Nhập hãng xe như trong Sheet" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-stt">Mã STT (quản lý từng xe)</label>
                  <input id="pf-stt" aria-label="Mã STT" className={inputCls} value={productForm.stt} onChange={(e) => setProductForm({ ...productForm, stt: e.target.value })} placeholder="Nhập mã STT như trong Sheet" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-scale">Tỉ lệ / kích cỡ</label>
                  <input id="pf-scale" aria-label="Tỉ lệ" className={inputCls} value={productForm.scale} onChange={(e) => setProductForm({ ...productForm, scale: e.target.value })} placeholder="Nhập tỉ lệ như trong Sheet" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-size">Kích thước (Dài x Rộng x Cao)</label>
                  <input id="pf-size" aria-label="Kích thước" className={inputCls} value={productForm.size} onChange={(e) => setProductForm({ ...productForm, size: e.target.value })} placeholder="Nhập như trong Sheet, ví dụ dạng Dài x Rộng x Cao" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-color">Màu</label>
                  <input id="pf-color" aria-label="Màu" className={inputCls} value={productForm.color} onChange={(e) => setProductForm({ ...productForm, color: e.target.value })} />
                </div>
              </div>
            </div>
            <div
              role="group"
              aria-label="Giá, tồn kho và vận chuyển"
              className="space-y-3 border-t border-[var(--border)] pt-4"
            >
              <p className="text-xs font-bold text-[var(--dim)]">
                Giá, tồn kho &amp; vận chuyển
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="pf-price">Giá</label>
                  <input id="pf-price" aria-label="Giá" className={inputCls} value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} placeholder="Nhập giá như trong Sheet" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-stock">Tồn kho</label>
                  <input id="pf-stock" aria-label="Tồn kho" type="number" min={0} className={inputCls} value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="pf-ship">Vận chuyển</label>
                    <Hint
                      label="Chú thích ô Vận chuyển (thêm sản phẩm thủ công)"
                      text="Sheet không có cột vận chuyển — mọi sản phẩm mặc định COD; chỉ điền khi xe này giao khác."
                    />
                  </div>
                  <input id="pf-ship" aria-label="Vận chuyển" className={inputCls} value={productForm.ship} onChange={(e) => setProductForm({ ...productForm, ship: e.target.value })} placeholder="Để trống = mặc định COD" />
                </div>
              </div>
            </div>
            <div
              role="group"
              aria-label="Ảnh và video"
              className="space-y-3 border-t border-[var(--border)] pt-4"
            >
              <p className="text-xs font-bold text-[var(--dim)]">
                Ảnh &amp; video
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls} htmlFor="pf-img">Link ảnh sản phẩm — thư mục Google Drive</label>
                  <input id="pf-img" aria-label="Link ảnh sản phẩm" className={inputCls} value={productForm.image_url} onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })} placeholder="https://… (link thư mục Drive như trong Sheet)" />
                  {productForm.image_url.trim() && (
                    <div className="mt-2">
                      <SheetImagePreview url={productForm.image_url} label={productForm.name || "sản phẩm"} />
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className={labelCls} htmlFor="pf-vid">Link video sản phẩm</label>
                  <input id="pf-vid" aria-label="Link video sản phẩm" className={inputCls} value={productForm.video_url} onChange={(e) => setProductForm({ ...productForm, video_url: e.target.value })} placeholder="https://… (để trống nếu chưa quay video)" />
                </div>
              </div>
            </div>
          </div>
          <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-4 py-3">
            <button type="submit" className={`${btnPrimary} flex-1 sm:flex-none`} disabled={saveProduct.isPending}>
              {saveProduct.isPending
                ? "Đang lưu…"
                : productForm.id
                  ? "Lưu thay đổi"
                  : "Thêm sản phẩm"}
            </button>
            {productForm.id > 0 && (
              <button
                type="button"
                className={btnGhost}
                aria-label="Hủy sửa, quay về thêm sản phẩm thủ công"
                onClick={() => {
                  setProductMsg("");
                  setIsProductFormOpen(false);
                  setProductForm({
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
                  });
                }}
              >
                Hủy sửa
              </button>
            )}
            {productMsg && (
              <p className="text-sm font-medium text-[var(--ok)]" role="status">
                {productMsg}
              </p>
            )}
          </footer>
        </form>
      </CollapsibleCard>
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
            Chưa có sản phẩm nào — đồng bộ từ một nguồn trong mục Nguồn
            Sản Phẩm hoặc thêm thủ công ở cột bên trái.
          </p>
        )}
        {products.data &&
          products.data.products.length > 0 &&
          productTotal === 0 && (
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

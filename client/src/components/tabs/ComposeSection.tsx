import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import type { Product } from "../../types";
import { btnPrimary, btnGhost, inputCls, labelCls } from "../../utils/styles";
import { driveStatusLabel } from "../../utils/format";
import { Hint, SheetImagePreview, CollapsibleCard, Badge } from "../ui";
import { ComposeMediaPicker } from "../compose/ComposeMediaPicker";
import { ComposeProductList } from "../compose/ComposeProductList";
import { useComposeForm } from "../compose/useComposeForm";

export function ComposeSection({
  onGoQueue,
  onGoProducts,
}: {
  onGoQueue: () => void;
  onGoProducts: () => void;
}) {
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.listProducts({}),
  });
  const allComposeProducts: Product[] = products.data?.products ?? [];

  const {
    form,
    setForm,
    selectedProduct,
    isComposeFormOpen,
    setIsComposeFormOpen,
    composeMsg,
    successMsg,
    queuedMsg,
    images,
    imagesCustomized,
    uploadBusy,
    imageMsg,
    submitDraft,
    useProduct,
    removeImage,
    addDriveImage,
    onUploadFiles,
    availableDriveImages,
  } = useComposeForm();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-label="Soạn bản nháp bài đăng" className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1">
        <CollapsibleCard
          title={
            selectedProduct
              ? `Soạn bài: ${form.product_name || selectedProduct.name}`
              : "Soạn bản nháp bài đăng"
          }
          subtitle={
            selectedProduct
              ? `Mã: ${form.stt || "—"} · Giá: ${form.price || "—"} · Kho: ${form.stock || "1"}`
              : "Chọn sản phẩm ở danh sách bên cạnh hoặc nhập thông tin trực tiếp"
          }
          badge={
            selectedProduct ? (
              <Badge variant="accent">Đã chọn sản phẩm</Badge>
            ) : undefined
          }
          isOpen={isComposeFormOpen}
          onToggle={setIsComposeFormOpen}
        >
          {successMsg && (
            <div
              className="m-4 mb-0 rounded-[var(--radius)] border-2 border-[var(--ok)] bg-[var(--surface-alt)] p-3"
              role="status"
            >
              <p className="text-sm font-semibold text-[var(--ok)]">
                ✓ {successMsg}
              </p>
              <button
                type="button"
                className={`${btnGhost} mt-2`}
                onClick={onGoQueue}
              >
                Xem Hàng đợi duyệt
              </button>
            </div>
          )}
          {queuedMsg && (
            <div
              className="m-4 mb-0 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface-alt)] p-3"
              role="status"
            >
              <p className="text-sm font-semibold">{queuedMsg}</p>
            </div>
          )}
          {composeMsg && (
            <p className="mx-4 mt-3 text-sm font-medium" role="status">
              {composeMsg}
            </p>
          )}

          <form onSubmit={submitDraft} className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="df-stt">Mã STT</label>
                <input id="df-stt" aria-label="Mã STT" className={inputCls} value={form.stt} onChange={(e) => setForm({ ...form, stt: e.target.value })} placeholder="Như trong Sheet" />
              </div>
              <div>
                <label className={labelCls} htmlFor="df-img-state">Media đi kèm</label>
                <p id="df-img-state" className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-xs leading-5">
                  Ảnh:{" "}
                  {images.length > 0
                    ? `đang gắn ${images.length} ảnh vào bài${imagesCustomized ? " (bạn đã tự thêm/xóa — tập này được chốt khi xuất gói)" : " (đã lưu từ lần đồng bộ — tập này được chốt khi xuất gói)"}`
                    : selectedProduct
                      ? driveStatusLabel(selectedProduct)
                      : form.image_url
                        ? "chưa gắn ảnh nào — thêm ảnh ở mục Ảnh của bài bên dưới"
                        : "chưa có ảnh"}{" "}
                  · Video:{" "}
                  {form.video_url ? "đã có video" : "chưa có video"}
                  {form.sku ? ` · SKU: ${form.sku}` : ""}
                </p>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="df-name">Tên sản phẩm *</label>
                <Hint
                  label="Chú thích ô Tên sản phẩm"
                  text={
                    <>
                      Tên sản phẩm được <strong>giữ nguyên văn</strong> trong
                      bài viết — nhập đúng như tên trong Sheet.
                    </>
                  }
                />
              </div>
              <input id="df-name" aria-label="Tên sản phẩm" className={inputCls} value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required placeholder="Nhập tên sản phẩm" />
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="df-maker">Hãng xe</label>
                <Hint
                  label="Chú thích ô Hãng xe"
                  text="Có hãng xe thì bài viết sẽ nhắc hãng (khối thông tin và nội dung) — dùng đúng nguyên văn giá trị này."
                />
              </div>
              <input id="df-maker" aria-label="Hãng xe" className={inputCls} value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })} placeholder="Nhập hãng xe như trong Sheet" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls} htmlFor="df-img">Link ảnh trong Sheet — thư mục Drive</label>
                <input id="df-img" aria-label="Link ảnh trong Sheet" className={inputCls} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" />
                {form.image_url.trim() && (
                  <div className="mt-2">
                    <SheetImagePreview url={form.image_url} label={form.product_name || "sản phẩm"} />
                  </div>
                )}

                <ComposeMediaPicker
                  images={images}
                  imagesCustomized={imagesCustomized}
                  availableDriveImages={availableDriveImages}
                  uploadBusy={uploadBusy}
                  imageMsg={imageMsg}
                  onRemoveImage={removeImage}
                  onAddDriveImage={addDriveImage}
                  onUploadFiles={onUploadFiles}
                />
              </div>

              <div className="col-span-2">
                <label className={labelCls} htmlFor="df-vid">Link video</label>
                <input id="df-vid" aria-label="Link video" className={inputCls} value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://… (để trống nếu chưa có)" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="df-scale">Tỉ lệ</label>
                <input id="df-scale" aria-label="Tỉ lệ" className={inputCls} value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="df-color">Màu</label>
                <input id="df-color" aria-label="Màu" className={inputCls} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Nhập màu xe" />
              </div>
              <div>
                <label className={labelCls} htmlFor="df-price">Giá bán</label>
                <input id="df-price" aria-label="Giá bán" className={inputCls} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Nhập giá bán" />
              </div>
              <div>
                <label className={labelCls} htmlFor="df-stock">Tồn kho (chiếc)</label>
                <input id="df-stock" aria-label="Tồn kho (chiếc)" className={inputCls} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="df-ship">Vận chuyển</label>
                <input id="df-ship" aria-label="Vận chuyển" className={inputCls} value={form.ship} onChange={(e) => setForm({ ...form, ship: e.target.value })} placeholder="Để trống = mặc định COD" />
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="df-selling">Chi tiết tự ghi — tùy chọn ghi đè (để trống AI tự viết)</label>
              <textarea id="df-selling" aria-label="Chi tiết tự ghi, tùy chọn ghi đè, để trống AI tự viết" rows={4} className={inputCls} value={form.selling_point} onChange={(e) => setForm({ ...form, selling_point: e.target.value })} placeholder="Để trống: AI tự viết toàn bộ dòng chi tiết. Chỉ điền khi bạn muốn tự ghi đè." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="df-size">Kích thước — không bắt buộc</label>
                <input id="df-size" aria-label="Kích thước" className={inputCls} value={form.size_cm} onChange={(e) => setForm({ ...form, size_cm: e.target.value })} placeholder="Để trống nếu chưa đo" />
              </div>
            </div>

            <button type="submit" className={btnPrimary}>
              Viết bài &amp; đưa vào hàng đợi soạn bài
            </button>
          </form>
        </CollapsibleCard>
      </section>

      <ComposeProductList
        allProducts={allComposeProducts}
        selectedProduct={selectedProduct}
        onUseProduct={useProduct}
        onGoProducts={onGoProducts}
      />
    </div>
  );
}

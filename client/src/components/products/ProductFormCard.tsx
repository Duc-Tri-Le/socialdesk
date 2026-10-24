import { type FormEvent, type RefObject } from "react";
import { btnPrimary, btnGhost, inputCls, labelCls } from "../../utils/styles";
import { Hint, SheetImagePreview, CollapsibleCard, Badge } from "../ui";

export interface ProductFormData {
  id: number;
  stt: string;
  name: string;
  scale: string;
  maker: string;
  size: string;
  color: string;
  price: string;
  stock: string;
  ship: string;
  image_url: string;
  video_url: string;
}

export interface ProductFormCardProps {
  form: ProductFormData;
  setForm: (update: (prev: ProductFormData) => ProductFormData) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSubmit: (e: FormEvent) => void;
  isPending: boolean;
  productMsg: string;
  onCancel: () => void;
  formRef: RefObject<HTMLFormElement | null>;
}

export function ProductFormCard({
  form,
  setForm,
  isOpen,
  setIsOpen,
  onSubmit,
  isPending,
  productMsg,
  onCancel,
  formRef,
}: ProductFormCardProps) {
  const isEditing = form.id > 0;
  const showProductForm = isEditing || isOpen;

  return (
    <CollapsibleCard
      as="section"
      title={isEditing ? `Đang sửa sản phẩm #${form.id}` : "Thêm sản phẩm thủ công"}
      badge={isEditing ? <Badge variant="accent">Đang sửa</Badge> : undefined}
      isOpen={showProductForm}
      onToggle={setIsOpen}
      className={isEditing ? "border-2 border-[var(--accent)]" : "border-[var(--border)]"}
    >
      <form ref={formRef} onSubmit={onSubmit} className="scroll-mt-24">
        <div className="space-y-4 p-4">
          <div role="group" aria-label="Thông tin xe" className="space-y-3">
            <p className="text-xs font-bold text-[var(--dim)]">Thông tin xe</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls} htmlFor="pf-name">Tên sản phẩm *</label>
                <input
                  id="pf-name"
                  aria-label="Tên sản phẩm"
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div className="col-span-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="pf-maker">
                    Hãng xe
                  </label>
                  <Hint
                    label="Chú thích ô Hãng xe (thêm sản phẩm thủ công)"
                    text="Hãng xe sẽ được nhắc trong bài viết; tên sản phẩm luôn giữ nguyên văn như đã nhập."
                  />
                </div>
                <input
                  id="pf-maker"
                  aria-label="Hãng xe"
                  className={inputCls}
                  value={form.maker}
                  onChange={(e) => setForm((prev) => ({ ...prev, maker: e.target.value }))}
                  placeholder="Nhập hãng xe như trong Sheet"
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="pf-stt">Mã STT (quản lý từng xe)</label>
                <input
                  id="pf-stt"
                  aria-label="Mã STT"
                  className={inputCls}
                  value={form.stt}
                  onChange={(e) => setForm((prev) => ({ ...prev, stt: e.target.value }))}
                  placeholder="Nhập mã STT như trong Sheet"
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="pf-scale">Tỉ lệ / kích cỡ</label>
                <input
                  id="pf-scale"
                  aria-label="Tỉ lệ"
                  className={inputCls}
                  value={form.scale}
                  onChange={(e) => setForm((prev) => ({ ...prev, scale: e.target.value }))}
                  placeholder="Nhập tỉ lệ như trong Sheet"
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="pf-size">Kích thước (Dài x Rộng x Cao)</label>
                <input
                  id="pf-size"
                  aria-label="Kích thước"
                  className={inputCls}
                  value={form.size}
                  onChange={(e) => setForm((prev) => ({ ...prev, size: e.target.value }))}
                  placeholder="Nhập như trong Sheet, ví dụ dạng Dài x Rộng x Cao"
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="pf-color">Màu</label>
                <input
                  id="pf-color"
                  aria-label="Màu"
                  className={inputCls}
                  value={form.color}
                  onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div
            role="group"
            aria-label="Giá, tồn kho và vận chuyển"
            className="space-y-3 border-t border-[var(--border)] pt-4"
          >
            <p className="text-xs font-bold text-[var(--dim)]">Giá, tồn kho &amp; vận chuyển</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="pf-price">Giá</label>
                <input
                  id="pf-price"
                  aria-label="Giá"
                  className={inputCls}
                  value={form.price}
                  onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                  placeholder="Nhập giá như trong Sheet"
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="pf-stock">Tồn kho</label>
                <input
                  id="pf-stock"
                  aria-label="Tồn kho"
                  type="number"
                  min={0}
                  className={inputCls}
                  value={form.stock}
                  onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
                />
              </div>

              <div className="col-span-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="pf-ship">
                    Vận chuyển
                  </label>
                  <Hint
                    label="Chú thích ô Vận chuyển (thêm sản phẩm thủ công)"
                    text="Sheet không có cột vận chuyển — mọi sản phẩm mặc định COD; chỉ điền khi xe này giao khác."
                  />
                </div>
                <input
                  id="pf-ship"
                  aria-label="Vận chuyển"
                  className={inputCls}
                  value={form.ship}
                  onChange={(e) => setForm((prev) => ({ ...prev, ship: e.target.value }))}
                  placeholder="Để trống = mặc định COD"
                />
              </div>
            </div>
          </div>

          <div
            role="group"
            aria-label="Ảnh và video"
            className="space-y-3 border-t border-[var(--border)] pt-4"
          >
            <p className="text-xs font-bold text-[var(--dim)]">Ảnh &amp; video</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls} htmlFor="pf-img">
                  Link ảnh sản phẩm — thư mục Google Drive
                </label>
                <input
                  id="pf-img"
                  aria-label="Link ảnh sản phẩm"
                  className={inputCls}
                  value={form.image_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))}
                  placeholder="https://… (link thư mục Drive như trong Sheet)"
                />
                {form.image_url.trim() && (
                  <div className="mt-2">
                    <SheetImagePreview url={form.image_url} label={form.name || "sản phẩm"} />
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <label className={labelCls} htmlFor="pf-vid">Link video sản phẩm</label>
                <input
                  id="pf-vid"
                  aria-label="Link video sản phẩm"
                  className={inputCls}
                  value={form.video_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, video_url: e.target.value }))}
                  placeholder="https://… (để trống nếu chưa quay video)"
                />
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="submit"
            className={`${btnPrimary} flex-1 sm:flex-none`}
            disabled={isPending}
          >
            {isPending ? "Đang lưu…" : isEditing ? "Lưu thay đổi" : "Thêm sản phẩm"}
          </button>

          {isEditing && (
            <button
              type="button"
              className={btnGhost}
              aria-label="Hủy sửa, quay về thêm sản phẩm thủ công"
              onClick={onCancel}
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
  );
}

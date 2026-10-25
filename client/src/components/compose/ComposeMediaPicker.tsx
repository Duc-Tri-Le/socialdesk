import type { Product } from "../../types";
import { btnPrimary } from "../../utils/styles";
import { Hint } from "../ui";

export type ComposeImage = Product["drive_images"][number];

export interface ComposeMediaPickerProps {
  images: ComposeImage[];
  imagesCustomized: boolean;
  availableDriveImages: ComposeImage[];
  uploadBusy: boolean;
  imageMsg: string;
  onRemoveImage: (im: ComposeImage) => void;
  onAddDriveImage: (im: ComposeImage) => void;
  onUploadFiles: (files: FileList | null) => void;
}

export function ComposeMediaPicker({
  images,
  imagesCustomized,
  availableDriveImages,
  uploadBusy,
  imageMsg,
  onRemoveImage,
  onAddDriveImage,
  onUploadFiles,
}: ComposeMediaPickerProps) {
  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <span>Ảnh của bài ({images.length})</span>
        <Hint
          label="Chú thích mục Ảnh của bài"
          align="right"
          text="Chưa có ảnh nào đang gắn vào bài khi danh sách này trống — chọn sản phẩm có ảnh Drive ở danh sách bên cạnh, thêm lại ảnh Drive, hoặc tải ảnh từ thiết bị lên. Tối đa 25MB mỗi ảnh. Xóa ảnh chỉ bỏ khỏi bài — không xóa file gốc trên Drive."
        />
      </p>

      {images.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {images.map((im) => (
            <li key={im.id} className="relative w-20">
              <div className="h-16 w-20 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
                <img
                  src={im.jpeg_url}
                  alt={`Ảnh ${im.name}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (im.id && !target.src.includes("google.com")) {
                      target.src = `https://drive.google.com/thumbnail?id=${im.id}&sz=w800`;
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => onRemoveImage(im)}
                aria-label={`Xóa ảnh ${im.name} khỏi bài`}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--danger)] text-sm font-bold leading-none text-white"
              >
                ×
              </button>
              <p className="mt-0.5 truncate text-[10px] text-[var(--dim)]" title={im.name}>
                {im.name}
              </p>
              <p className="text-[10px] font-medium text-[var(--dim)]">
                {im.id.startsWith("upload-")
                  ? "Ảnh tải lên từ thiết bị"
                  : im.is_heic
                    ? "Gốc HEIC → đăng bản JPEG"
                    : "Ảnh từ Drive"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {imagesCustomized && (
        <p className="mt-1 text-xs font-medium text-[var(--ok)]">
          Bạn đã tự chỉnh tập ảnh — bản nháp và gói đăng sẽ dùng đúng tập này, không quét lại Drive để gắn lại ảnh đã xóa.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className={btnPrimary}>
          {uploadBusy ? "Đang tải ảnh lên…" : "Thêm ảnh từ thiết bị"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            aria-label="Thêm ảnh từ thiết bị"
            disabled={uploadBusy}
            onChange={(e) => {
              void onUploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {availableDriveImages.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold">
            Thêm ảnh từ thư mục Drive của sản phẩm này ({availableDriveImages.length} ảnh chưa gắn):
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {availableDriveImages.map((im) => (
              <li key={im.id} className="w-20">
                <div className="h-16 w-20 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
                  <img
                    src={im.jpeg_url}
                    alt={`Ảnh ${im.name}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (im.id && !target.src.includes("google.com")) {
                        target.src = `https://drive.google.com/thumbnail?id=${im.id}&sz=w800`;
                      }
                    }}
                  />
                </div>
                <p className="mt-0.5 truncate text-[10px] text-[var(--dim)]" title={im.name}>
                  {im.name}
                </p>
                <button
                  type="button"
                  className="mt-0.5 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold"
                  onClick={() => onAddDriveImage(im)}
                  aria-label={`Thêm ảnh ${im.name} từ Drive vào bài`}
                >
                  + Thêm vào bài
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {imageMsg && (
        <p className="mt-2 text-xs font-medium" role="status">
          {imageMsg}
        </p>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { Product } from "../../types";
import { displayImageSrc, driveStatusLabel, isDriveFolderLink } from "../../utils/format";

// Khung ảnh sản phẩm luôn chiếm một ô cố định: có ảnh thật từ Drive
// thì hiện ảnh JPEG đầu tiên, chưa có ảnh thì hiện trạng thái rõ ràng.
export function ProductThumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const firstDrive = product.drive_images[0];
  const src = fallbackSrc || (product.has_real_image && firstDrive ? firstDrive.jpeg_url : displayImageSrc(product.image_url));

  useEffect(() => {
    setFailed(false);
    setFallbackSrc(null);
  }, [product.image_url, firstDrive?.jpeg_url]);

  if (isDriveFolderLink(product.image_url) && !product.has_real_image) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-alt)] px-1 text-center text-[10px] font-medium leading-tight text-[var(--dim)]"
        role="img"
        aria-label={driveStatusLabel(product)}
      >
        {product.drive_status === "empty"
          ? "Thư mục Drive rỗng"
          : "Chưa có ảnh thật"}
      </div>
    );
  }
  if (!src) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-alt)] px-1 text-center text-[10px] font-medium leading-tight text-[var(--dim)]"
        role="img"
        aria-label={`Chưa có ảnh cho ${product.name}`}
      >
        Chưa có ảnh
      </div>
    );
  }
  if (failed) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--surface-alt)] px-1 text-center text-[10px] font-medium leading-tight text-[var(--danger)]"
        role="img"
        aria-label={`Ảnh của ${product.name} không tải được`}
      >
        Ảnh lỗi — kiểm tra quyền chia sẻ link
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={`Ảnh sản phẩm ${product.name}`}
      className="h-14 w-14 shrink-0 rounded-[var(--radius)] object-cover"
      loading="lazy"
      onError={() => {
        if (!fallbackSrc && firstDrive?.id) {
          setFallbackSrc(`https://drive.google.com/thumbnail?id=${firstDrive.id}&sz=w800`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

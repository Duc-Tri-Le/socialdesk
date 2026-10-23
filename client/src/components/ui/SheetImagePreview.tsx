import { useEffect, useState } from "react";
import { displayImageSrc, isDriveFolderLink } from "../../utils/format";

// Xem trước trực tiếp một link ảnh (dùng trong form): hiện ảnh thật nếu tải
// được, hiện cảnh báo nếu link không tải được để biết ngay link sai ở đâu.
export function SheetImagePreview({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const src = displayImageSrc(url);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (isDriveFolderLink(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Mở thư mục ảnh của ${label} trên Google Drive`}
        className="inline-block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-xs font-semibold text-[var(--ok)]"
      >
        Link thư mục ảnh trên Google Drive — app lấy ảnh thật trong thư mục này khi đồng bộ Sheet · bấm để mở thư mục ↗
      </a>
    );
  }
  if (!src) return null;
  if (failed) {
    return (
      <p className="text-xs font-medium text-[var(--danger)]" role="status">
        Không tải được ảnh từ link này — nếu là link Google Drive, hãy bật
        chia sẻ “Bất kỳ ai có đường link” cho file ảnh rồi thử lại.
      </p>
    );
  }
  return (
    <img
      src={src}
      alt={`Xem trước ảnh của ${label}`}
      className="h-24 w-24 rounded-[var(--radius)] border border-[var(--border)] object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

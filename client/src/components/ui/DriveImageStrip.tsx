// Dải ảnh thật từ Drive của một sản phẩm/bản nháp: hiện từng file
// ảnh (bản JPEG do Drive kết xuất) kèm tên file và ghi rõ định dạng
// gốc — file gốc HEIC thì ghi rõ bản đăng là JPEG, không đăng HEIC.
// Khi truyền `max` (dải ảnh TRONG DANH SÁCH sản phẩm ở mục Sản phẩm
// và mục Soạn bài), chỉ hiện tối đa `max` ảnh thu nhỏ; còn nhiều hơn
// thì ô tiếp theo hiện dấu "…" báo còn nữa. Không truyền `max` thì
// hiện toàn bộ (ví dụ lưới ảnh của bản nháp ở Hàng đợi duyệt).
export function DriveImageStrip({
  images,
  label,
  max,
}: {
  images: { id: string; name: string; jpeg_url: string; view_url: string; is_heic: boolean; mime: string }[];
  label: string;
  max?: number;
}) {
  if (images.length === 0) return null;
  const shown = max !== undefined ? images.slice(0, max) : images;
  const hiddenCount = images.length - shown.length;
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-[var(--ok)]">
        Đã gắn {images.length} ảnh vào bài (bản dùng để đăng):
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {shown.map((im) => (
          <li key={im.id} className="w-20">
            <a
              href={im.view_url || im.jpeg_url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Mở ảnh ${im.name} của ${label} trên Drive`}
            >
              <img
                src={im.jpeg_url}
                alt={`Ảnh thật ${im.name} của ${label}`}
                className="h-16 w-20 rounded-[var(--radius)] border border-[var(--border)] object-cover"
                loading="lazy"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (im.id && !target.src.includes("google.com")) {
                    target.src = `https://drive.google.com/thumbnail?id=${im.id}&sz=w800`;
                  }
                }}
              />
            </a>
            <p className="mt-0.5 truncate text-[10px] text-[var(--dim)]" title={im.name}>
              {im.name}
            </p>
            <p className="text-[10px] font-medium text-[var(--dim)]">
              {im.id.startsWith("upload-")
                ? "Ảnh tải lên từ thiết bị"
                : im.is_heic
                  ? "Gốc HEIC → đăng bản JPEG"
                  : `Gốc ${im.mime.replace("image/", "").toUpperCase()}`}
            </p>
          </li>
        ))}
        {hiddenCount > 0 && (
          <li className="w-20">
            <div
              className="flex h-16 w-20 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] text-xl font-bold tracking-widest text-[var(--dim)]"
              role="img"
              aria-label={`Còn ${hiddenCount} ảnh nữa của ${label} chưa hiện trong danh sách`}
            >
              …
            </div>
            <p className="mt-0.5 text-[10px] font-medium text-[var(--dim)]">
              Còn {hiddenCount} ảnh nữa
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}

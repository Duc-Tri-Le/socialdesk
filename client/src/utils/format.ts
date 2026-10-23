export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

// Rút gọn thông điệp đồng bộ Sheet khi hiển thị: chỉ giữ Nhập / Mới /
// Cập nhật / Có ảnh / Chưa có ảnh. Số ảnh KHÔNG lấy theo link trong
// thông điệp đã lưu (có link ≠ có ảnh thật) mà tính trực tiếp từ ảnh
// thật đã lấy được từ Drive của từng sản phẩm (real). Thông điệp mới
// từ máy chủ đã chứa sẵn số ảnh thật thì giữ nguyên.
export function shortenSyncMessage(
  raw: string,
  real?: { with: number; without: number },
): string {
  const msg = raw.trim();
  if (!msg) return msg;
  if (msg.includes("Có ảnh:")) return msg;
  const total =
    msg.match(/Đã nhập (\d+)/)?.[1] ?? msg.match(/Nhập (\d+)/)?.[1];
  if (!total) return msg;
  const inserted =
    msg.match(/thêm mới (\d+)/)?.[1] ?? msg.match(/Mới (\d+)/)?.[1] ?? "0";
  const updated =
    msg.match(/cập nhật (\d+)/)?.[1] ?? msg.match(/Cập nhật (\d+)/)?.[1] ?? "0";
  let out = `Nhập ${total} · Mới ${inserted} · Cập nhật ${updated}`;
  if (real) out += ` · Có ảnh: ${real.with} · Chưa có ảnh: ${real.without}`;
  return out;
}

export function fmtMembers(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  if (n >= 1000)
    return `${(n / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}k`;
  return String(n);
}

export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// Link ảnh trong Sheet BUSINESS là link THƯ MỤC Google Drive
// (…/drive/folders/…) — thư mục không phải file ảnh, không hiển thị
// được bằng thẻ ảnh; giao diện hiện link mở thư mục thay thế.
export function isDriveFolderLink(raw: string): boolean {
  return /drive\.google\.com\/drive\/folders\//i.test(raw.trim());
}

// Link Google Drive dạng trang xem (…/file/d/<ID>/view) trả về trang HTML
// chứ không phải file ảnh nên thẻ ảnh không hiển thị được; dạng thumbnail
// mới tải được ảnh về trình duyệt (file vẫn cần bật chia sẻ công khai).
export function displayImageSrc(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (isDriveFolderLink(s)) return "";
  const fileMatch = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (fileMatch?.[1])
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1200`;
  const idMatch = s.match(
    /drive\.google\.com\/(?:open|uc|thumbnail)\?[^#]*\bid=([a-zA-Z0-9_-]{10,})/,
  );
  if (idMatch?.[1])
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1200`;
  return s;
}

// Trạng thái ảnh THẬT của sản phẩm theo kết quả liệt kê thư mục
// Drive: chỉ "ok" (≥1 file ảnh thật) mới tính là có ảnh. Các trạng
// thái còn lại đều là "Chưa có ảnh" kèm lý do cụ thể.
export function driveStatusLabel(p: {
  drive_status: string;
  drive_error: string;
  drive_images: { length: number };
}): string {
  if (p.drive_status === "ok")
    return `Có ${p.drive_images.length} ảnh thật từ Drive`;
  if (p.drive_status === "empty")
    return "Chưa có ảnh — thư mục Drive đang rỗng";
  if (p.drive_status === "error")
    return `Chưa có ảnh — ${p.drive_error || "không đọc được thư mục Drive"}`;
  if (p.drive_status === "no_link")
    return `Chưa có ảnh — ${p.drive_error || "chưa có link thư mục Drive trong Sheet"}`;
  return "Chưa kiểm tra ảnh Drive — bấm Quét lại ảnh Drive";
}

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} giây`;
  return `${Math.floor(s / 60)} phút ${s % 60} giây`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

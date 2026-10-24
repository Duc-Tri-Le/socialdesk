/**
 * Tiện ích chuẩn hoá và tìm kiếm tiếng Việt dùng chung cho toàn bộ ứng dụng.
 */

/**
 * Chuẩn hoá chuỗi: chuyển thành chữ thường, loại bỏ dấu tiếng Việt và chuẩn hoá khoảng trắng.
 * Hỗ trợ tìm kiếm không phân biệt chữ hoa/thường và có dấu/không dấu.
 */
export function normalizeVi(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .trim();
}

/**
 * Kiểm tra xem chuỗi nguồn (haystack) có khớp với từ khoá tìm kiếm (needle) hay không.
 * Khớp cả trường hợp gõ có dấu chuẩn xác lẫn gõ không dấu.
 */
export function fuzzyMatchVi(haystack: string, needle: string): boolean {
  if (!needle || !needle.trim()) return true;
  if (!haystack) return false;

  const rawNeedle = needle.trim().toLowerCase();
  const rawHaystack = haystack.toLowerCase();

  // Khớp chính xác không phân biệt hoa thường
  if (rawHaystack.includes(rawNeedle)) return true;

  // Khớp không dấu tiếng Việt
  const normNeedle = normalizeVi(rawNeedle);
  const normHaystack = normalizeVi(rawHaystack);
  return normHaystack.includes(normNeedle);
}

/**
 * Lọc danh sách bất kỳ theo từ khoá tìm kiếm, sử dụng hàm trích xuất text từ item.
 */
export function filterBySearch<T>(
  list: T[],
  needle: string,
  extractText: (item: T) => string,
): T[] {
  if (!needle || !needle.trim()) return list;
  return list.filter((item) => fuzzyMatchVi(extractText(item), needle));
}

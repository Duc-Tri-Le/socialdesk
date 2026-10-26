import type { Draft } from "../../types";
import { fuzzyMatchVi } from "../../utils/search";

export function formatScheduledTime(iso: string): string {
  try {
    const dt = new Date(iso);
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(dt);
  } catch {
    return iso;
  }
}

export function getTimeUntil(iso: string): string {
  try {
    const dt = new Date(iso);
    const diffMs = dt.getTime() - Date.now();
    if (diffMs <= 0) return "đang xử lý hoặc đã tới giờ";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `còn ${days} ngày nữa`;
    }
    if (hours > 0) return `còn ${hours}h ${mins}p nữa`;
    return `còn ${mins} phút nữa`;
  } catch {
    return "";
  }
}

export function matchesDraftSearch(d: Draft, query: string): boolean {
  if (!query.trim()) return true;

  const targetNames = (d.publish_records ?? [])
    .map((r) => `${r.target_name} ${r.target_kind}`)
    .join(" ");

  const combined = [
    d.product_name,
    d.caption,
    d.code,
    d.sku,
    d.stt,
    d.maker,
    d.color,
    d.scale,
    d.price,
    d.selling_point,
    targetNames,
  ]
    .filter(Boolean)
    .join(" ");

  return fuzzyMatchVi(combined, query);
}

export function getKindLabel(kind: string): string {
  switch (kind) {
    case "page":
      return "Fanpage";
    case "instagram":
      return "Instagram";
    case "group":
      return "Nhóm";
    default:
      return "Tài khoản";
  }
}

export function getPublishStatusBadge(status: string): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case "published":
      return {
        label: "✓ Đã đăng",
        badgeClass: "bg-[var(--surface-alt)] text-[var(--ok)]",
      };
    case "failed":
      return {
        label: "✗ Đăng lỗi",
        badgeClass: "bg-[var(--surface-alt)] text-[var(--danger)]",
      };
    case "uncertain":
      return {
        label: "⚠ Chưa xác định — kiểm tra Instagram",
        badgeClass: "bg-[var(--surface-alt)] text-[var(--warn)]",
      };
    case "needs_login":
      return {
        label: "🔑 Chờ bạn đăng nhập Facebook",
        badgeClass: "bg-[var(--surface-alt)] text-[var(--warn)]",
      };
    case "queued":
      return {
        label: "⏳ Đang xử lý đăng",
        badgeClass: "bg-[var(--surface-alt)] text-[var(--dim)]",
      };
    case "skipped":
      return {
        label: "↷ Bỏ qua — đã đăng",
        badgeClass: "bg-[var(--surface-alt)] text-[var(--dim)]",
      };
    default:
      return {
        label: "— Chưa đăng trực tiếp được",
        badgeClass: "bg-[var(--surface-alt)] text-[var(--dim)]",
      };
  }
}

// Lịch sử đăng Bài chỉ hiện thông tin MỚI NHẤT theo từng đích:
// Mỗi đích chỉ hiện một bản ghi — bản ghi đã đăng thành công nếu có,
// không thì bản ghi mới nhất của đích đó.
export function getLatestPublishRecords(
  records: Draft["publish_records"],
): Draft["publish_records"] {
  const statusRank = (s: string) =>
    s === "published" ? 0 : s === "queued" ? 1 : s === "uncertain" ? 2 : 3;

  const latestByTarget = new Map<string, Draft["publish_records"][number]>();
  for (const r of records) {
    const key = `${r.target_kind}:${r.target_name}`;
    const cur = latestByTarget.get(key);
    if (!cur || statusRank(r.status) < statusRank(cur.status)) {
      latestByTarget.set(key, r);
    }
  }

  return [...latestByTarget.values()].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export interface PostLinkInfo {
  url: string;
  label: string;
  isDirectPost: boolean;
  hint?: string;
  searchUrl?: string;
  groupUrl?: string;
}

/**
 * Phân tích và tạo nhãn rõ ràng cho liên kết kết quả đăng bài.
 * Phân biệt giữa:
 * 1. Link bài viết trực tiếp (có ID bài viết: /posts/..., /permalink/..., story_fbid=...) -> "Xem bài đã đăng"
 * 2. Link bài đang chờ duyệt trong nhóm -> "Xem bài chờ duyệt trong nhóm"
 * 3. Link trang nhóm chung (chưa có ID bài riêng) -> Tự động chuyển hướng tìm kiếm theo tên sản phẩm (/search/?q=...) để thấy ngay bài viết, kèm "Mở trang nhóm".
 * 4. Link Fanpage chung -> "Mở Fanpage".
 */
export function getPostLinkInfo(
  record: {
    target_kind: string;
    target_name: string;
    post_url?: string;
    message?: string;
  },
  productName?: string,
): PostLinkInfo | null {
  const rawUrl = (record.post_url || "").trim();
  if (!rawUrl) return null;

  const msg = (record.message || "").toLowerCase();
  const isPending = msg.includes("chờ") || msg.includes("pending");

  // Kiểm tra link bài viết cụ thể
  const isGroupPost = /\/groups\/[^/]+\/(posts|permalink)\/\d+/i.test(rawUrl);
  const isPagePost =
    /\/(posts|photos)\/\d+/i.test(rawUrl) ||
    /permalink\.php\?.*story_fbid=/i.test(rawUrl);
  const isInstagramPost = /instagram\.com\/(p|reel)\/[^/?#]+/i.test(rawUrl);

  const isDirectPost = isGroupPost || isPagePost || isInstagramPost;

  if (isDirectPost) {
    return {
      url: rawUrl,
      label: "Xem bài đã đăng",
      isDirectPost: true,
    };
  }

  // Nếu là bài đăng trong Nhóm nhưng chỉ có link nhóm chung:
  if (record.target_kind === "group" || /\/groups\/[^/?#]+/i.test(rawUrl)) {
    const groupMatch = rawUrl.match(/groups\/([^/?#]+)/i);
    const groupId = groupMatch ? groupMatch[1] : "";
    const cleanProductName = (productName || "").trim();

    if (isPending && groupId) {
      return {
        url: `https://www.facebook.com/groups/${groupId}/pending_posts`,
        label: "Xem bài đang chờ duyệt trong nhóm",
        isDirectPost: false,
        hint: "Bài viết đang chờ Quản trị viên nhóm duyệt",
      };
    }

    // Nếu có tên sản phẩm (ví dụ "BMW X5"), tạo search link trong nhóm để mở thẳng ra bài viết
    const searchUrl =
      groupId && cleanProductName
        ? `https://www.facebook.com/groups/${groupId}/search/?q=${encodeURIComponent(cleanProductName)}`
        : undefined;

    return {
      url: searchUrl || rawUrl,
      label: searchUrl ? "Xem bài trong nhóm" : "Mở trang nhóm",
      isDirectPost: false,
      searchUrl,
      groupUrl: rawUrl,
      hint: searchUrl
        ? "Mở bộ lọc tìm kiếm bài viết này trong nhóm"
        : "Facebook hiển thị bài trên dòng thời gian nhóm",
    };
  }

  // Nếu là bài đăng trên Fanpage nhưng chỉ có link Fanpage:
  if (record.target_kind === "page") {
    return {
      url: rawUrl,
      label: "Mở Fanpage",
      isDirectPost: false,
      hint: "Xem bài viết trên dòng thời gian của Fanpage",
    };
  }

  return {
    url: rawUrl,
    label: "Mở liên kết",
    isDirectPost: false,
  };
}

import type { Draft } from "../../types";

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

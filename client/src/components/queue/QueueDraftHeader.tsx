import type { Draft } from "../../types";
import { fmtDate } from "../../utils/format";
import { Badge } from "../ui";

export interface QueueDraftHeaderProps {
  draft: Draft;
  isDraft: boolean;
  summaryParts: string[];
  hasNeedsLogin: boolean;
  hasFailed: boolean;
  hasQueued: boolean;
}

export function QueueDraftHeader({
  draft: d,
  isDraft,
  summaryParts,
  hasNeedsLogin,
  hasFailed,
  hasQueued,
}: QueueDraftHeaderProps) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{d.product_name}</p>
        <p className="font-mono text-xs text-[var(--dim)]">
          {d.code} · {fmtDate(d.created_at)}
        </p>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        {isDraft ? (
          <Badge variant="accent">⏳ Chờ duyệt</Badge>
        ) : (
          <Badge variant="ok">✓ Đã duyệt</Badge>
        )}
        {summaryParts.length > 0 && (
          <span className="font-medium text-[var(--dim)]">
            {summaryParts.join(" · ")}
          </span>
        )}
        {isDraft && d.placeholders.length > 0 && (
          <Badge variant="danger">⚠ Còn mục chưa điền</Badge>
        )}
        {!isDraft && hasNeedsLogin && (
          <Badge variant="warn">🔑 Chờ đăng nhập</Badge>
        )}
        {!isDraft && !hasNeedsLogin && hasFailed && (
          <Badge variant="danger">⚠ Đăng lỗi</Badge>
        )}
        {!isDraft && hasQueued && (
          <Badge variant="accent">⏳ Đang đăng…</Badge>
        )}
      </p>
    </div>
  );
}

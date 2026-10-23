import { useState } from "react";
import type { Draft } from "../../types";
import { fmtDate } from "../../utils/format";
import { btnDanger, btnGhost } from "../../utils/styles";
import { DriveImageStrip } from "../ui/DriveImageStrip";
import { getKindLabel } from "./queueHelpers";

export interface QueueHistoryCardProps {
  draft: Draft;
  onDelete: (id: number) => void;
  isDeletePending: boolean;
}

export function QueueHistoryCard({
  draft: d,
  onDelete,
  isDeletePending,
}: QueueHistoryCardProps) {
  const [open, setOpen] = useState(false);

  // Mỗi đích chỉ hiện bản ghi ĐÃ ĐĂNG mới nhất của đích đó
  const publishedByTarget = new Map<string, Draft["publish_records"][number]>();
  for (const r of d.publish_records) {
    if (r.status !== "published") continue;
    const key = `${r.target_kind}:${r.target_name}`;
    if (!publishedByTarget.has(key)) publishedByTarget.set(key, r);
  }

  const publishedRecords = [...publishedByTarget.values()].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const latestPublished = publishedRecords[0];

  const targetSummary = publishedRecords
    .map((r) => `${getKindLabel(r.target_kind)} ${r.target_name}`)
    .join(" · ");

  return (
    <li className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{d.product_name}</p>
        <p className="font-mono text-xs text-[var(--dim)]">
          {d.code}
          {latestPublished
            ? ` · Đăng gần nhất ${fmtDate(latestPublished.created_at)}`
            : ""}
        </p>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
          ✓ Đã đăng
        </span>
        {targetSummary && (
          <span className="font-medium text-[var(--dim)]">{targetSummary}</span>
        )}
      </p>

      {open && (
        <div className="mt-3">
          <p className="text-xs text-[var(--dim)]">
            {d.sku ? `SKU ${d.sku} · ` : d.stt ? `STT ${d.stt} · ` : ""}
            {d.maker ? `Hãng xe ${d.maker} · ` : ""}
            {d.color || "chưa rõ màu"} · {d.price || "chưa có giá"} · tồn{" "}
            {d.stock}
            {d.size_cm ? ` · Kích thước: ${d.size_cm}` : ""}
            {` · Soạn ${fmtDate(d.created_at)}`}
          </p>

          <DriveImageStrip images={d.drive_images} label={d.product_name} />

          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 font-mono text-xs leading-5">
            {d.caption}
          </pre>

          <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <p className="text-xs font-bold">Đích đã đăng</p>
            <ul className="mt-1.5 space-y-1.5">
              {publishedRecords.map((r) => (
                <li key={r.id} className="text-xs leading-5">
                  <span className="mr-1.5 rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
                    ✓ Đã đăng
                  </span>
                  <span className="font-semibold">
                    {getKindLabel(r.target_kind)} {r.target_name}
                  </span>{" "}
                  <span className="text-[var(--dim)]">
                    · {fmtDate(r.created_at)}
                  </span>
                  {r.message && (
                    <span className="block text-[var(--dim)]">{r.message}</span>
                  )}
                  {r.post_url && (
                    <a
                      href={r.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline"
                      aria-label={`Xem bài đã đăng của ${d.product_name} trên ${r.target_name}`}
                    >
                      Xem bài đã đăng
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnGhost}
          aria-expanded={open}
          aria-label={`${open ? "Thu gọn" : "Xem chi tiết"} bài đã đăng ${d.product_name}`}
          onClick={() => setOpen(!open)}
        >
          {open ? "Thu gọn ▲" : "Xem chi tiết ▼"}
        </button>
        <button
          type="button"
          className={btnDanger}
          disabled={isDeletePending}
          onClick={() => onDelete(d.id)}
          aria-label={`Xóa bài đã đăng ${d.product_name}`}
        >
          Xóa
        </button>
      </div>
    </li>
  );
}

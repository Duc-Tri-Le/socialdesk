import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Draft } from "../../types";
import { fmtDate } from "../../utils/format";
import { btnDanger, btnGhost, btnPrimary, inputCls } from "../../utils/styles";
import { Badge, DriveImageStrip, FeedbackBanner } from "../ui";
import { getKindLabel, getPostLinkInfo } from "./queueHelpers";

export interface QueueHistoryCardProps {
  draft: Draft;
  feedback?: { ok: boolean; text: string };
  onDelete: (id: number) => void;
  isDeletePending: boolean;
}

export function QueueHistoryCard({
  draft: d,
  feedback,
  onDelete,
  isDeletePending,
}: QueueHistoryCardProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editUrlDraft, setEditUrlDraft] = useState("");

  const saveUrlMutation = useMutation({
    mutationFn: (args: { id: number; post_url: string }) =>
      api.setPublishRecordPostUrl(args),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setEditingRecordId(null);
    },
  });

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
        <Badge variant="ok">✓ Đã đăng</Badge>
        {targetSummary && (
          <span className="font-medium text-[var(--dim)]">{targetSummary}</span>
        )}
      </p>

      <FeedbackBanner feedback={feedback} />

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
                  <Badge variant="ok" className="mr-1.5">
                    ✓ Đã đăng
                  </Badge>
                  <span className="font-semibold">
                    {getKindLabel(r.target_kind)} {r.target_name}
                  </span>{" "}
                  <span className="text-[var(--dim)]">
                    · {fmtDate(r.created_at)}
                  </span>
                  {r.message && (
                    <span className="block text-[var(--dim)]">{r.message}</span>
                  )}
                  {(() => {
                    const linkInfo = getPostLinkInfo(r, d.product_name);
                    const isEditing = editingRecordId === r.id;

                    return (
                      <div className="mt-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {linkInfo && (
                            <a
                              href={linkInfo.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold underline text-[var(--accent-ink)] hover:text-[var(--text)] transition-colors"
                              aria-label={`${linkInfo.label} của ${d.product_name} trên ${r.target_name}`}
                            >
                              {linkInfo.label}
                            </a>
                          )}

                          {linkInfo?.searchUrl && linkInfo?.groupUrl && (
                            <a
                              href={linkInfo.groupUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-[var(--dim)] hover:text-[var(--text)] underline"
                              title="Mở toàn bộ trang nhóm Facebook"
                            >
                              Mở trang nhóm
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (isEditing) {
                                setEditingRecordId(null);
                              } else {
                                setEditingRecordId(r.id);
                                setEditUrlDraft(r.post_url || "");
                              }
                            }}
                            className="text-[11px] text-[var(--dim)] hover:text-[var(--text)] underline transition-colors"
                            title="Chỉnh sửa hoặc dán link bài viết trực tiếp"
                          >
                            {isEditing ? "Đóng sửa" : r.post_url ? "Sửa link bài" : "+ Gán link bài"}
                          </button>

                          {linkInfo?.hint && (
                            <span className="text-[11px] text-[var(--dim)]">
                              · {linkInfo.hint}
                            </span>
                          )}
                        </div>

                        {isEditing && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded bg-[var(--surface-alt)] p-2">
                            <input
                              className={`${inputCls} min-w-0 flex-1 text-xs py-1`}
                              value={editUrlDraft}
                              onChange={(e) => setEditUrlDraft(e.target.value)}
                              placeholder="Dán link bài viết trực tiếp (https://facebook.com/groups/.../posts/...)"
                            />
                            <button
                              type="button"
                              className={`${btnPrimary} py-1 text-xs`}
                              disabled={saveUrlMutation.isPending}
                              onClick={() => {
                                saveUrlMutation.mutate({
                                  id: r.id,
                                  post_url: editUrlDraft.trim(),
                                });
                              }}
                            >
                              {saveUrlMutation.isPending ? "Đang lưu…" : "Lưu link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRecordId(null)}
                              className="text-xs text-[var(--dim)] hover:text-[var(--text)] px-2"
                            >
                              Hủy
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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

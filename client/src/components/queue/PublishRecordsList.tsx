import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Draft, PublishRecord } from "../../types";
import { fmtDate } from "../../utils/format";
import { btnPrimary, inputCls } from "../../utils/styles";
import {
  getKindLabel,
  getPublishStatusBadge,
  getPostLinkInfo,
} from "./queueHelpers";

export interface PublishRecordsListProps {
  draft: Draft;
  records: PublishRecord[];
}

export function PublishRecordsList({
  draft: d,
  records,
}: PublishRecordsListProps) {
  const queryClient = useQueryClient();
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editUrlDraft, setEditUrlDraft] = useState("");

  const saveUrlMutation = useMutation({
    mutationFn: (args: { id: number; post_url: string }) =>
      api.setPublishRecordPostUrl(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      setEditingRecordId(null);
    },
  });

  if (records.length === 0) return null;

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
      <p className="text-xs font-bold">Lịch sử đăng Bài</p>
      <ul className="mt-1.5 space-y-1.5">
        {records.map((r) => {
          const badge = getPublishStatusBadge(r.status);
          const linkInfo = getPostLinkInfo(r, d.product_name);
          const isEditingRec = editingRecordId === r.id;

          return (
            <li key={r.id} className="text-xs leading-5">
              <span
                className={`mr-1.5 rounded-full px-2 py-0.5 font-semibold ${badge.badgeClass}`}
              >
                {badge.label}
              </span>
              <span className="font-semibold">
                {getKindLabel(r.target_kind)} {r.target_name}
              </span>{" "}
              <span className="text-[var(--dim)]">· {fmtDate(r.created_at)}</span>
              {r.message && (
                <span className="block text-[var(--dim)]">{r.message}</span>
              )}

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
                      if (isEditingRec) {
                        setEditingRecordId(null);
                      } else {
                        setEditingRecordId(r.id);
                        setEditUrlDraft(r.post_url || "");
                      }
                    }}
                    className="text-[11px] text-[var(--dim)] hover:text-[var(--text)] underline transition-colors"
                    title="Chỉnh sửa hoặc dán link bài viết trực tiếp"
                  >
                    {isEditingRec
                      ? "Đóng sửa"
                      : r.post_url
                        ? "Sửa link bài"
                        : "+ Gán link bài"}
                  </button>

                  {linkInfo?.hint && (
                    <span className="text-[11px] text-[var(--dim)]">
                      · {linkInfo.hint}
                    </span>
                  )}
                </div>

                {isEditingRec && (
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}

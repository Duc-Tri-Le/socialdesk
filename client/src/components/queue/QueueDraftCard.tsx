import { useState, useEffect } from "react";
import type { Account, Draft, Group, Page } from "../../types";
import { fmtDate } from "../../utils/format";
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  inputCls,
  labelCls,
} from "../../utils/styles";
import { DriveImageStrip } from "../ui/DriveImageStrip";
import { useComposeJobs } from "../../context/ComposeJobsContext";
import { TargetPicker } from "./TargetPicker";
import { PublishConfirmDialog } from "./PublishConfirmDialog";
import { getKindLabel, getLatestPublishRecords, getPublishStatusBadge } from "./queueHelpers";

export interface QueueDraftCardProps {
  draft: Draft;
  feedback?: { ok: boolean; text: string };
  joinedGroups: Group[];
  allPages: Page[];
  igAccounts: Account[];
  mainAccounts: Account[];
  selectedMainCount: number;
  onToggleMainAccount: (id: number, selected: boolean) => void;
  isMainAccountPending: boolean;
  onGoGroups: () => void;
  onGoMedia: () => void;
  onApprove: (id: number) => void;
  isApprovePending: boolean;
  onUpdateCaption: (args: { id: number; caption: string }) => void;
  isUpdatePending: boolean;
  onPack: (args: {
    id: number;
    group_ids: number[];
    page_ids: number[];
    instagram_account_ids: number[];
  }) => void;
  isPackPending: boolean;
  onPublish: (args: {
    id: number;
    group_ids: number[];
    page_ids: number[];
    instagram_account_ids: number[];
  }) => void;
  isPublishPending: boolean;
  onDelete: (id: number) => void;
  onRewrite: (d: Draft) => void;
  onSaveTargets: (args: {
    id: number;
    group_ids: number[];
    page_ids: number[];
    instagram_account_ids: number[];
  }) => void;
}

export function QueueDraftCard({
  draft: d,
  feedback,
  joinedGroups,
  allPages,
  igAccounts,
  mainAccounts,
  selectedMainCount,
  onToggleMainAccount,
  isMainAccountPending,
  onGoGroups,
  onGoMedia,
  onApprove,
  isApprovePending,
  onUpdateCaption,
  isUpdatePending,
  onPack,
  isPackPending,
  onPublish,
  isPublishPending,
  onDelete,
  onRewrite,
  onSaveTargets,
}: QueueDraftCardProps) {
  const composeJobs = useComposeJobs();

  const [isEditing, setIsEditing] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(d.caption);
  const [packOpen, setPackOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  // Khởi tạo đích đăng từ bản đã lưu hoặc từ cấu hình mặc định
  const savedTargets = d.pack_targets;
  const [selectedGroups, setSelectedGroups] = useState<number[]>(() =>
    savedTargets.saved
      ? savedTargets.group_ids
      : joinedGroups.filter((g) => g.is_target).map((g) => g.id),
  );
  const [selectedPages, setSelectedPages] = useState<number[]>(() =>
    savedTargets.saved
      ? savedTargets.page_ids
      : allPages.filter((p) => p.selected).map((p) => p.id),
  );
  const [selectedIg, setSelectedIg] = useState<number[]>(() =>
    savedTargets.saved
      ? savedTargets.instagram_account_ids
      : igAccounts.filter((a) => a.selected).map((a) => a.id),
  );

  // Cập nhật lại khi d.pack_targets từ server thay đổi
  useEffect(() => {
    if (savedTargets.saved) {
      setSelectedGroups(savedTargets.group_ids);
      setSelectedPages(savedTargets.page_ids);
      setSelectedIg(savedTargets.instagram_account_ids);
    }
  }, [savedTargets]);

  const applyTargets = (groups: number[], pages: number[], igs: number[]) => {
    setSelectedGroups(groups);
    setSelectedPages(pages);
    setSelectedIg(igs);
    onSaveTargets({
      id: d.id,
      group_ids: groups,
      page_ids: pages,
      instagram_account_ids: igs,
    });
  };

  const handleCopyPack = async () => {
    try {
      await navigator.clipboard.writeText(d.pack_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const rwJob = composeJobs.jobs.find(
    (j) =>
      j.kind === "rewrite" &&
      j.draftId === d.id &&
      (j.status === "waiting" || j.status === "running"),
  );

  const latestPublishRecords = getLatestPublishRecords(d.publish_records);

  return (
    <li className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{d.product_name}</p>
        <p className="font-mono text-xs text-[var(--dim)]">
          {d.code} · {fmtDate(d.created_at)}
        </p>
      </div>

      {/* Thông số sản phẩm */}
      <p className="mt-0.5 text-xs text-[var(--dim)]">
        {d.sku ? `SKU ${d.sku} · ` : d.stt ? `STT ${d.stt} · ` : ""}
        {d.maker ? `Hãng xe ${d.maker} · ` : ""}
        {d.color || "chưa rõ màu"} · {d.price || "chưa có giá"} · tồn {d.stock}
        {d.selling_point ? ` · Chi tiết tự ghi đè: ${d.selling_point}` : " · Chi tiết: AI tự soạn"}
        {d.size_cm ? ` · Kích thước: ${d.size_cm}` : ""}
      </p>

      {/* Tags media */}
      <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
        {d.has_real_image ? (
          <a
            href={d.image_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Thư mục Drive của ${d.product_name} — đã gắn ${d.drive_images.length} ảnh vào bài`}
            className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]"
          >
            Có {d.drive_images.length} ảnh đã gắn vào bài
          </a>
        ) : (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
            {d.drive_status === "empty"
              ? d.drive_error
                ? `Chưa có ảnh — ${d.drive_error}`
                : "Chưa có ảnh — thư mục Drive đang rỗng"
              : d.drive_status === "error"
                ? `Chưa có ảnh — ${d.drive_error || "không đọc được thư mục Drive"}`
                : d.drive_status === "no_link"
                  ? `Chưa có ảnh — ${d.drive_error || "chưa có link thư mục Drive"}`
                  : "Chưa có ảnh thật từ Drive"}
          </span>
        )}

        {d.video_url ? (
          <a
            href={d.video_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Video của ${d.product_name}`}
            className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]"
          >
            Có video đã gắn vào bài
          </a>
        ) : (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
            Chưa có video
          </span>
        )}

        {d.caption_source === "ai" && (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
            Bài do AI viết
          </span>
        )}
        {d.caption_source === "template" && (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--danger)]">
            Bài theo mẫu dự phòng — AI chưa viết được
          </span>
        )}
        {d.caption_source === "manual" && (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
            Nội dung bạn đã sửa tay
          </span>
        )}
      </p>

      {/* Dải ảnh Drive */}
      <DriveImageStrip images={d.drive_images} label={d.product_name} />

      {d.placeholders.length > 0 && (
        <p className="mt-2 text-xs font-medium text-[var(--danger)]">
          Chưa điền: {d.placeholders.join("  ")}
        </p>
      )}

      {/* Soạn/xem Caption */}
      {isEditing ? (
        <div className="mt-3 space-y-3">
          <div>
            <label className={labelCls} htmlFor={`cap-${d.id}`}>
              Bài đăng (nhóm + fanpage + Instagram)
            </label>
            <textarea
              id={`cap-${d.id}`}
              rows={12}
              className={`${inputCls} font-mono text-xs leading-5`}
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              className={btnPrimary}
              disabled={isUpdatePending}
              onClick={() => {
                onUpdateCaption({ id: d.id, caption: captionDraft });
                setIsEditing(false);
              }}
            >
              Lưu nội dung
            </button>
            <button
              className={btnGhost}
              onClick={() => {
                setCaptionDraft(d.caption);
                setIsEditing(false);
              }}
            >
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 font-mono text-xs leading-5">
          {d.caption}
        </pre>
      )}

      {/* Gói đăng (khi có) */}
      {d.pack_text && (
        <div className="mt-3">
          <button
            type="button"
            className={`${btnGhost} flex w-full items-center justify-between gap-2 text-left`}
            aria-expanded={packOpen}
            aria-label={`Gói đăng ${d.code}`}
            onClick={() => setPackOpen(!packOpen)}
          >
            <span className="text-xs font-semibold text-[var(--ok)]">
              Gói đăng{d.packed_at ? ` · ${fmtDate(d.packed_at)}` : ""}
            </span>
            <span className="text-xs font-medium text-[var(--dim)]">
              {packOpen ? "Ẩn ▲" : "Xem ▼"}
            </span>
          </button>
          {packOpen && (
            <div className="mt-2">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--ok)] p-3 font-mono text-xs leading-5">
                {d.pack_text}
              </pre>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  className={btnGhost}
                  onClick={handleCopyPack}
                  aria-label={`Chép gói đăng ${d.code}`}
                >
                  {copied ? "Đã chép ✓" : "Chép gói đăng"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lịch sử đăng bài */}
      {latestPublishRecords.length > 0 && (
        <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
          <p className="text-xs font-bold">Lịch sử đăng Bài</p>
          <ul className="mt-1.5 space-y-1.5">
            {latestPublishRecords.map((r) => {
              const badge = getPublishStatusBadge(r.status);
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
              );
            })}
          </ul>
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <p
          className={`mt-2 text-xs font-medium ${
            feedback.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"
          }`}
        >
          {feedback.text}
        </p>
      )}

      {/* Action controls */}
      <div className="mt-3 flex flex-wrap gap-2">
        {d.status === "draft" && !isEditing && (
          <>
            <button
              className={btnGhost}
              disabled={!!rwJob}
              onClick={() => onRewrite(d)}
            >
              {rwJob
                ? rwJob.status === "running"
                  ? "Đang viết lại…"
                  : "Đang chờ viết lại…"
                : "Viết lại chuyên nghiệp"}
            </button>
            <button
              className={btnGhost}
              onClick={() => setIsEditing(true)}
            >
              Sửa nội dung
            </button>
          </>
        )}

        {/* Bộ chọn đích đăng */}
        <div className="w-full space-y-2">
          <TargetPicker
            draft={d}
            isOpen={pickerOpen}
            onToggleOpen={() => setPickerOpen(!pickerOpen)}
            onClose={() => setPickerOpen(false)}
            selectedGroupIds={selectedGroups}
            selectedPageIds={selectedPages}
            selectedIgIds={selectedIg}
            onApplyTargets={applyTargets}
            joinedGroups={joinedGroups}
            allPages={allPages}
            igAccounts={igAccounts}
            mainAccounts={mainAccounts}
            selectedMainCount={selectedMainCount}
            onToggleMainAccount={onToggleMainAccount}
            isMainAccountPending={isMainAccountPending}
            onGoGroups={onGoGroups}
          />

          {/* Dòng nút bấm hành động */}
          <div className="flex flex-wrap gap-2 pt-1">
            {d.status === "draft" ? (
              <button
                className={`${btnPrimary} whitespace-nowrap`}
                disabled={isApprovePending}
                onClick={() => onApprove(d.id)}
                aria-label={`Duyệt bài viết ${d.product_name}`}
              >
                {isApprovePending ? "Đang duyệt…" : "Duyệt bài viết"}
              </button>
            ) : (
              <>
                <button
                  className={`${btnPrimary} whitespace-nowrap`}
                  disabled={isPublishPending}
                  aria-expanded={publishConfirm}
                  aria-label={`Đăng Bài ${d.product_name} lên các đích đã chọn`}
                  onClick={() => setPublishConfirm(!publishConfirm)}
                >
                  Đăng Bài
                </button>
                <button
                  className={`${btnGhost} whitespace-nowrap`}
                  disabled={isPackPending}
                  aria-label={`Cập nhật gói đăng cho ${d.product_name} theo các đích đã chọn`}
                  onClick={() =>
                    onPack({
                      id: d.id,
                      group_ids: selectedGroups,
                      page_ids: selectedPages,
                      instagram_account_ids: selectedIg,
                    })
                  }
                >
                  Cập nhật gói đăng
                </button>
                <button
                  className={`${btnGhost} whitespace-nowrap`}
                  onClick={onGoMedia}
                >
                  Kiểm tra ảnh/video
                </button>
                <button
                  className={`${btnDanger} whitespace-nowrap`}
                  onClick={() => onDelete(d.id)}
                  aria-label={`Xóa bản nháp ${d.code}`}
                >
                  Xóa
                </button>
              </>
            )}
          </div>
        </div>

        {/* Khối xác nhận Đăng bài */}
        {publishConfirm && (
          <PublishConfirmDialog
            draft={d}
            selectedPageIds={selectedPages}
            selectedIgIds={selectedIg}
            selectedGroupIds={selectedGroups}
            allPages={allPages}
            igAccounts={igAccounts}
            joinedGroups={joinedGroups}
            isPublishPending={isPublishPending}
            onConfirmPublish={() => {
              onPublish({
                id: d.id,
                group_ids: selectedGroups,
                page_ids: selectedPages,
                instagram_account_ids: selectedIg,
              });
              setPublishConfirm(false);
            }}
            onCancel={() => setPublishConfirm(false)}
          />
        )}

        {d.status === "draft" && (
          <button
            className={btnDanger}
            onClick={() => onDelete(d.id)}
            aria-label={`Xóa bản nháp ${d.code}`}
          >
            Xóa
          </button>
        )}
      </div>
    </li>
  );
}

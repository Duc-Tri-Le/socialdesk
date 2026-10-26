import { useState, useEffect } from "react";
import type { Account, Draft, Group, Page } from "../../types";
import {
  btnGhost,
  btnPrimary,
  inputCls,
  labelCls,
} from "../../utils/styles";
import { Badge, DriveImageStrip, FeedbackBanner } from "../ui";
import { useComposeJobs } from "../../context/ComposeJobsContext";
import { TargetPicker } from "./TargetPicker";
import { PublishConfirmDialog } from "./PublishConfirmDialog";
import { PublishRecordsList } from "./PublishRecordsList";
import { QueueDraftActions } from "./QueueDraftActions";
import { QueueDraftHeader } from "./QueueDraftHeader";
import { DraftPackViewer } from "./DraftPackViewer";
import { SchedulePublishDialog } from "./SchedulePublishDialog";
import { getLatestPublishRecords } from "./queueHelpers";

function formatScheduledTime(iso: string): string {
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

function getTimeUntil(iso: string): string {
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
  onSchedule?: (args: {
    id: number;
    scheduled_at: string;
    group_ids?: number[];
    page_ids?: number[];
    instagram_account_ids?: number[];
  }) => void;
  isSchedulePending?: boolean;
  onCancelSchedule?: (id: number) => void;
  isCancelSchedulePending?: boolean;
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
  onSchedule,
  isSchedulePending,
  onCancelSchedule,
  isCancelSchedulePending,
  onDelete,
  onRewrite,
  onSaveTargets,
}: QueueDraftCardProps) {
  const composeJobs = useComposeJobs();

  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(d.caption);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Khởi tạo đích đăng từ bản đã lưu hoặc từ cấu hình mặc định (loại bỏ ID cũ không còn hợp lệ)
  const savedTargets = d.pack_targets;
  const filterValidTargets = (targets: {
    group_ids: number[];
    page_ids: number[];
    instagram_account_ids: number[];
  }) => ({
    groups: targets.group_ids.filter((id) =>
      joinedGroups.some((g) => g.id === id),
    ),
    pages: targets.page_ids.filter((id) => allPages.some((p) => p.id === id)),
    igs: targets.instagram_account_ids.filter((id) =>
      igAccounts.some((a) => a.id === id),
    ),
  });

  const [selectedGroups, setSelectedGroups] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).groups;
    }
    return joinedGroups.filter((g) => g.is_target).map((g) => g.id);
  });
  const [selectedPages, setSelectedPages] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).pages;
    }
    return allPages.filter((p) => p.selected).map((p) => p.id);
  });
  const [selectedIg, setSelectedIg] = useState<number[]>(() => {
    if (savedTargets.saved) {
      return filterValidTargets(savedTargets).igs;
    }
    return igAccounts.filter((a) => a.selected).map((a) => a.id);
  });

  // Cập nhật lại khi d.pack_targets từ server thay đổi
  const savedTargetsKey = `${savedTargets.saved}:${savedTargets.group_ids.join(",")}:${savedTargets.page_ids.join(",")}:${savedTargets.instagram_account_ids.join(",")}`;
  useEffect(() => {
    if (savedTargets.saved) {
      const valid = filterValidTargets(savedTargets);
      setSelectedGroups(valid.groups);
      setSelectedPages(valid.pages);
      setSelectedIg(valid.igs);
    }
  }, [savedTargetsKey, joinedGroups.length, allPages.length, igAccounts.length]);

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

  const rwJob = composeJobs.jobs.find(
    (j) =>
      j.kind === "rewrite" &&
      j.draftId === d.id &&
      (j.status === "waiting" || j.status === "running"),
  );

  const latestPublishRecords = getLatestPublishRecords(d.publish_records);

  const isDraft = d.status === "draft";

  // Tóm tắt các đích đăng đã chọn cho bài đã duyệt
  const targetCount =
    selectedPages.length + selectedIg.length + selectedGroups.length;
  const pickedTargetNames = [
    ...allPages.filter((p) => selectedPages.includes(p.id)).map((p) => p.name),
    ...igAccounts.filter((a) => selectedIg.includes(a.id)).map((a) => `@${a.handle || a.name}`),
    ...joinedGroups.filter((g) => selectedGroups.includes(g.id)).map((g) => g.name),
  ];
  const targetSummaryText =
    targetCount === 0
      ? "Chưa chọn đích"
      : `${targetCount} đích (${pickedTargetNames.slice(0, 2).join(", ")}${
          targetCount > 2 ? ` +${targetCount - 2}` : ""
        })`;

  const summaryParts = isDraft
    ? [
        d.sku ? `SKU ${d.sku}` : d.stt ? `STT ${d.stt}` : "",
        d.color || "chưa rõ màu",
        d.price || "chưa có giá",
        d.drive_images.length > 0
          ? `${d.drive_images.length} ảnh`
          : d.drive_status === "empty"
            ? "chưa có ảnh"
            : "",
        d.video_url ? "có video" : "",
      ].filter(Boolean)
    : [
        targetSummaryText,
        d.color || "chưa rõ màu",
        d.price || "chưa có giá",
        d.drive_images.length > 0 ? `${d.drive_images.length} ảnh` : "",
      ].filter(Boolean);

  const hasNeedsLogin = latestPublishRecords.some((r) => r.status === "needs_login");
  const hasFailed = latestPublishRecords.some((r) => r.status === "failed");
  const hasQueued = latestPublishRecords.some((r) => r.status === "queued");

  return (
    <li className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      {/* Header & Status Badges */}
      <QueueDraftHeader
        draft={d}
        isDraft={isDraft}
        summaryParts={summaryParts}
        hasNeedsLogin={hasNeedsLogin}
        hasFailed={hasFailed}
        hasQueued={hasQueued}
      />

      {/* Feedback banner */}
      <FeedbackBanner feedback={feedback} />

      {/* Banner thông báo đã lên lịch đăng tự động */}
      {d.scheduled_at && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 px-3.5 py-2.5 text-xs text-indigo-950 dark:text-indigo-100">
          <div className="flex items-center gap-2">
            <div>
              <span className="font-bold text-indigo-900 dark:text-indigo-200">
                Đã hẹn giờ đăng tự động:
              </span>{" "}
              <strong className="underline decoration-indigo-400 font-semibold">
                {formatScheduledTime(d.scheduled_at)}
              </strong>{" "}
              <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">
                ({getTimeUntil(d.scheduled_at)})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setPublishConfirm(false);
                setScheduleOpen(true);
              }}
              className="rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-indigo-900/60 hover:bg-indigo-50 dark:hover:bg-indigo-900 px-2.5 py-1 text-xs font-semibold text-indigo-800 dark:text-indigo-100 transition cursor-pointer shadow-xs"
            >
              Đổi giờ
            </button>
            {onCancelSchedule && (
              <button
                type="button"
                disabled={isCancelSchedulePending}
                onClick={() => onCancelSchedule(d.id)}
                className="rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-rose-950/50 hover:bg-rose-50 dark:hover:bg-rose-900/50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300 transition cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isCancelSchedulePending ? "Đang hủy…" : "Hủy lịch"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chi tiết khi mở rộng (Xem chi tiết) */}
      {open && (
        <div className="mt-3">
          {/* Thông số sản phẩm */}
          <p className="text-xs text-[var(--dim)]">
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
              >
                <Badge variant="ok">
                  Có {d.drive_images.length} ảnh đã gắn vào bài
                </Badge>
              </a>
            ) : (
              <Badge variant="dim">
                {d.drive_status === "empty"
                  ? d.drive_error
                    ? `Chưa có ảnh — ${d.drive_error}`
                    : "Chưa có ảnh — thư mục Drive đang rỗng"
                  : d.drive_status === "error"
                    ? `Chưa có ảnh — ${d.drive_error || "không đọc được thư mục Drive"}`
                    : d.drive_status === "no_link"
                      ? `Chưa có ảnh — ${d.drive_error || "chưa có link thư mục Drive"}`
                      : "Chưa có ảnh thật từ Drive"}
              </Badge>
            )}

            {d.video_url ? (
              <a
                href={d.video_url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Video của ${d.product_name}`}
              >
                <Badge variant="ok">Có video đã gắn vào bài</Badge>
              </a>
            ) : (
              <Badge variant="dim">Chưa có video</Badge>
            )}

            {d.caption_source === "ai" && (
              <Badge variant="ok">Bài do AI viết</Badge>
            )}
            {d.caption_source === "template" && (
              <Badge variant="danger">
                Bài theo mẫu dự phòng — AI chưa viết được
              </Badge>
            )}
            {d.caption_source === "manual" && (
              <Badge variant="dim">Nội dung bạn đã sửa tay</Badge>
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

          {/* Gói đăng */}
          {!isDraft && (
            <DraftPackViewer
              draft={d}
              onPack={() =>
                onPack({
                  id: d.id,
                  group_ids: selectedGroups,
                  page_ids: selectedPages,
                  instagram_account_ids: selectedIg,
                })
              }
              isPackPending={isPackPending}
            />
          )}

          {/* Lịch sử đăng bài (lần thử trước) */}
          <PublishRecordsList draft={d} records={latestPublishRecords} />

          {/* Bộ chọn đích đăng */}
          <div className="mt-3">
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
          </div>
        </div>
      )}

      {/* Thông báo thao tác ngay trên thanh điều khiển khi mở rộng */}
      {open && feedback && (
        <div className="mt-3">
          <FeedbackBanner feedback={feedback} />
        </div>
      )}

      {/* Action controls */}
      <QueueDraftActions
        draft={d}
        isDraft={isDraft}
        isApprovePending={isApprovePending}
        onApprove={onApprove}
        publishConfirm={publishConfirm}
        onTogglePublishConfirm={() => {
          setScheduleOpen(false);
          setPublishConfirm(!publishConfirm);
        }}
        isPublishPending={isPublishPending}
        scheduleOpen={scheduleOpen}
        onToggleSchedule={() => {
          setPublishConfirm(false);
          setScheduleOpen(!scheduleOpen);
        }}
        open={open}
        onToggleOpen={() => {
          if (open && isEditing) setIsEditing(false);
          setOpen(!open);
        }}
        isEditing={isEditing}
        onStartEditing={() => setIsEditing(true)}
        rwJob={rwJob}
        onRewrite={onRewrite}
        isPackPending={isPackPending}
        onPack={() =>
          onPack({
            id: d.id,
            group_ids: selectedGroups,
            page_ids: selectedPages,
            instagram_account_ids: selectedIg,
          })
        }
        onGoMedia={onGoMedia}
        onDelete={onDelete}
      />

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

      {/* Khối Lên lịch đăng bài */}
      {scheduleOpen && onSchedule && (
        <SchedulePublishDialog
          draft={d}
          selectedPageIds={selectedPages}
          selectedIgIds={selectedIg}
          selectedGroupIds={selectedGroups}
          allPages={allPages}
          igAccounts={igAccounts}
          joinedGroups={joinedGroups}
          isSchedulePending={!!isSchedulePending}
          onConfirmSchedule={(scheduledAt) => {
            onSchedule({
              id: d.id,
              scheduled_at: scheduledAt,
              group_ids: selectedGroups,
              page_ids: selectedPages,
              instagram_account_ids: selectedIg,
            });
            setScheduleOpen(false);
          }}
          onCancel={() => setScheduleOpen(false)}
        />
      )}
    </li>
  );
}

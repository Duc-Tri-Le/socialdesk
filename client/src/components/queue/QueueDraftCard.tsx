import { useState } from "react";
import type { Account, Draft, Group, Page } from "../../types";
import { FeedbackBanner } from "../ui";
import { useComposeJobs } from "../../context/ComposeJobsContext";
import { TargetPicker } from "./TargetPicker";
import { PublishConfirmDialog } from "./PublishConfirmDialog";
import { PublishRecordsList } from "./PublishRecordsList";
import { QueueDraftActions } from "./QueueDraftActions";
import { QueueDraftHeader } from "./QueueDraftHeader";
import { DraftPackViewer } from "./DraftPackViewer";
import { SchedulePublishDialog } from "./SchedulePublishDialog";
import { ScheduledDraftBanner } from "./ScheduledDraftBanner";
import { QueueDraftDetails } from "./QueueDraftDetails";
import { QueueCaptionEditor } from "./QueueCaptionEditor";
import { useDraftTargets } from "./useDraftTargets";
import { getLatestPublishRecords } from "./queueHelpers";

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Quản lý đích đăng an toàn, chống kẹt ID không hợp lệ
  const {
    selectedGroups,
    selectedPages,
    selectedIg,
    targetSummaryText,
    applyTargets,
  } = useDraftTargets({
    draft: d,
    joinedGroups,
    allPages,
    igAccounts,
    onSaveTargets,
  });

  const rwJob = composeJobs.jobs.find(
    (j) =>
      j.kind === "rewrite" &&
      j.draftId === d.id &&
      (j.status === "waiting" || j.status === "running"),
  );

  const latestPublishRecords = getLatestPublishRecords(d.publish_records);
  const isDraft = d.status === "draft";

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

      {/* Banner thông báo đã hẹn giờ đăng bài (không dùng icon, tương phản cao) */}
      {d.scheduled_at && (
        <ScheduledDraftBanner
          scheduledAt={d.scheduled_at}
          onOpenSchedule={() => {
            setPublishConfirm(false);
            setScheduleOpen(true);
          }}
          onCancelSchedule={onCancelSchedule ? () => onCancelSchedule(d.id) : undefined}
          isCancelPending={isCancelSchedulePending}
        />
      )}

      {/* Chi tiết khi mở rộng */}
      {open && (
        <div className="mt-3">
          {/* Thông số kỹ thuật & Huy hiệu media */}
          <QueueDraftDetails draft={d} />

          {/* Soạn thảo hoặc xem trước Caption */}
          <QueueCaptionEditor
            draftId={d.id}
            initialCaption={d.caption}
            isEditing={isEditing}
            isUpdatePending={isUpdatePending}
            onSave={(args) => {
              onUpdateCaption(args);
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />

          {/* Khung xem và cập nhật gói đăng */}
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

          {/* Lịch sử kết quả đăng bài */}
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

      {/* Phản hồi nhanh tại thanh điều khiển khi mở rộng */}
      {open && feedback && (
        <div className="mt-3">
          <FeedbackBanner feedback={feedback} />
        </div>
      )}

      {/* Thanh hành động chính */}
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

      {/* Dialog xác nhận Đăng bài ngay */}
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

      {/* Dialog Lên lịch đăng bài tự động */}
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

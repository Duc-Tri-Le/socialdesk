import { useState } from "react";
import { btnGhost, btnPrimary, inputCls, labelCls } from "../../utils/styles";

export interface QueueCaptionEditorProps {
  draftId: number;
  initialCaption: string;
  isEditing: boolean;
  isUpdatePending: boolean;
  onSave: (args: { id: number; caption: string }) => void;
  onCancel: () => void;
}

export function QueueCaptionEditor({
  draftId,
  initialCaption,
  isEditing,
  isUpdatePending,
  onSave,
  onCancel,
}: QueueCaptionEditorProps) {
  const [captionDraft, setCaptionDraft] = useState(initialCaption);

  if (isEditing) {
    return (
      <div className="mt-3 space-y-3">
        <div>
          <label className={labelCls} htmlFor={`cap-${draftId}`}>
            Bài đăng (nhóm + fanpage + Instagram)
          </label>
          <textarea
            id={`cap-${draftId}`}
            rows={12}
            className={`${inputCls} font-mono text-xs leading-5`}
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={isUpdatePending}
            onClick={() => onSave({ id: draftId, caption: captionDraft })}
          >
            Lưu nội dung
          </button>
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              setCaptionDraft(initialCaption);
              onCancel();
            }}
          >
            Hủy
          </button>
        </div>
      </div>
    );
  }

  return (
    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 font-mono text-xs leading-5 text-[var(--text)]">
      {initialCaption}
    </pre>
  );
}

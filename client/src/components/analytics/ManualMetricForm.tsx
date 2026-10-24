import { memo, type FormEvent } from "react";
import type { ChannelOption, ManualMetricFormData } from "./analyticsTypes";
import type { Draft } from "../../types";
import { CollapsibleCard } from "../ui";
import { btnPrimary, inputCls, labelCls } from "../../utils/styles";

interface ManualMetricFormProps {
  form: ManualMetricFormData;
  setForm: (val: ManualMetricFormData | ((prev: ManualMetricFormData) => ManualMetricFormData)) => void;
  channelOptions: ChannelOption[];
  packedDrafts: Draft[];
  onSubmit: (e: FormEvent) => void;
  isSubmitting: boolean;
}

export const ManualMetricForm = memo(function ManualMetricForm({
  form,
  setForm,
  channelOptions,
  packedDrafts,
  onSubmit,
  isSubmitting,
}: ManualMetricFormProps) {
  return (
    <CollapsibleCard
      as="section"
      title="Ghi chỉ số bài đã đăng (Thủ công hoặc tùy chỉnh)"
      subtitle="Nhập số liệu tiếp cận, like, inbox, đơn để tối ưu khung giờ cho từng kênh"
      defaultOpen={false}
    >
      <form onSubmit={onSubmit} className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="mt-type">
              Loại kênh *
            </label>
            <select
              id="mt-type"
              aria-label="Loại kênh"
              className={inputCls}
              value={form.channel_type}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  channel_type: e.target.value as "group" | "page" | "instagram",
                  channel_key: "",
                }))
              }
            >
              <option value="group">Hội nhóm</option>
              <option value="page">Fanpage</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="mt-channel">
              Kênh đã đăng *
            </label>
            <select
              id="mt-channel"
              aria-label="Kênh đã đăng"
              className={inputCls}
              value={form.channel_key}
              onChange={(e) => setForm((prev) => ({ ...prev, channel_key: e.target.value }))}
              required
            >
              <option value="">— Chọn kênh —</option>
              {channelOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            {channelOptions.length === 0 && (
              <p className="mt-1 text-xs text-[var(--danger)]">
                {form.channel_type === "group"
                  ? "Chưa có nhóm nào trong danh sách — thêm ở mục Hội nhóm."
                  : form.channel_type === "page"
                    ? "Chưa có Page nào — thêm Page ở mục Tài khoản."
                    : "Chưa có tài khoản Instagram nào đã liên kết — liên kết ở mục Tài khoản."}
              </p>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="mt-media">
              Dạng media đã đăng
            </label>
            <select
              id="mt-media"
              aria-label="Dạng media đã đăng"
              className={inputCls}
              value={form.media_kind}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  media_kind: e.target.value as "image" | "video",
                }))
              }
            >
              <option value="image">Ảnh</option>
              <option value="video">Video</option>
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="mt-draft">
              Bài đăng (gói đã xuất)
            </label>
            <select
              id="mt-draft"
              aria-label="Bài đăng"
              className={inputCls}
              value={form.draft_key}
              onChange={(e) => setForm((prev) => ({ ...prev, draft_key: e.target.value }))}
            >
              <option value="">— Không gắn bài cụ thể —</option>
              {packedDrafts.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.stt ? `STT ${d.stt} · ` : ""}
                  {d.product_name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="mt-when">
              Thời gian đã đăng (giờ VN) *
            </label>
            <input
              id="mt-when"
              aria-label="Thời gian đã đăng"
              type="datetime-local"
              className={inputCls}
              value={form.posted_at}
              onChange={(e) => setForm((prev) => ({ ...prev, posted_at: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="mt-url">
              Đường link bài viết Facebook
            </label>
            <input
              id="mt-url"
              aria-label="Đường link bài viết"
              type="text"
              placeholder="https://facebook.com/..."
              className={inputCls}
              value={form.post_url}
              onChange={(e) => setForm((prev) => ({ ...prev, post_url: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["reach", "Lượt tiếp cận"],
              ["likes", "Like"],
              ["comments", "Bình luận"],
              ["shares", "Chia sẻ"],
              ["clicks", "Click / xem ảnh"],
              ["inquiries", "Inbox hỏi mua (×8)"],
              ["orders", "Đơn đã chốt (×20)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className={labelCls} htmlFor={`mt-${key}`}>
                {label}
              </label>
              <input
                id={`mt-${key}`}
                aria-label={label}
                type="number"
                min={0}
                className={inputCls}
                value={form[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className={labelCls} htmlFor="mt-notes">
              Ghi chú
            </label>
            <input
              id="mt-notes"
              aria-label="Ghi chú chỉ số"
              className={inputCls}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Nhập ghi chú chiến dịch"
            />
          </div>
        </div>

        <p className="text-xs text-[var(--dim)]">
          Dạng media ghi theo đúng bài đã đăng thực tế (ảnh hoặc video). Khung giờ được tự xếp
          theo giờ đăng (giờ VN) để tối ưu lần đăng sau.
        </p>

        <button type="submit" className={btnPrimary} disabled={isSubmitting}>
          {isSubmitting ? "Đang ghi nhận…" : "Ghi chỉ số & cập nhật tối ưu"}
        </button>
      </form>
    </CollapsibleCard>
  );
});

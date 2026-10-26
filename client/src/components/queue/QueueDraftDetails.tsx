import type { Draft } from "../../types";
import { Badge, DriveImageStrip } from "../ui";

export interface QueueDraftDetailsProps {
  draft: Draft;
}

export function QueueDraftDetails({ draft: d }: QueueDraftDetailsProps) {
  return (
    <>
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

      {/* Cảnh báo mục chưa điền */}
      {d.placeholders.length > 0 && (
        <p className="mt-2 text-xs font-medium text-[var(--danger)]">
          Chưa điền: {d.placeholders.join("  ")}
        </p>
      )}
    </>
  );
}

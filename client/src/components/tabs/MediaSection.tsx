import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { MediaItem } from "../../types";
import { fmtBytes, fileToBase64 } from "../../utils/format";

export function MediaSection() {
  const queryClient = useQueryClient();
  const media = useQuery({ queryKey: ["media"], queryFn: () => api.listMedia({}) });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = useMutation({
    mutationFn: (args: { name: string; mime: string; data_base64: string }) => api.uploadMedia(args),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteMedia({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg("");
    let okCount = 0;
    for (const file of Array.from(files)) {
      try {
        const b64 = await fileToBase64(file);
        const res = await upload.mutateAsync({
          name: file.name,
          mime: file.type || "application/octet-stream",
          data_base64: b64,
        });
        if (res.ok) okCount += 1;
        else setMsg(res.error);
      } catch {
        setMsg(`Không tải lên được file ${file.name}.`);
      }
    }
    setBusy(false);
    if (okCount > 0) setMsg(`Đã thêm ${okCount} file.`);
    queryClient.invalidateQueries({ queryKey: ["media"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  return (
    <div className="space-y-6">
      <section aria-label="Thêm ảnh video">
        <h2 className="text-lg font-bold">Ảnh/video sản phẩm</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Kho media dự phòng khi sản phẩm chưa có link trong Sheet. Quy tắc:{" "}
          <strong>media dùng chung cho mọi đích đăng</strong> — gói đăng liệt
          kê đúng ảnh/video đã gắn vào bài, không tách theo kênh. Ưu tiên vẫn là ảnh/video ngay trong Sheet
          của từng sản phẩm (cột Ảnh / Video, theo mã STT). Tối đa 25MB mỗi
          file.
        </p>
        <label className="mt-3 block">
          <span className="sr-only">Chọn ảnh hoặc video để tải lên</span>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            disabled={busy}
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
            className="block w-full text-sm text-[var(--dim)] file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
        </label>
        {busy && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải lên…</p>}
        {msg && <p className="mt-2 text-sm font-medium" role="status">{msg}</p>}
      </section>

      <section aria-label="Danh sách ảnh video">
        {media.isPending && <p className="text-sm text-[var(--dim)]">Đang tải…</p>}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(media.data?.media ?? []).map((m: MediaItem) => (
            <li key={m.id} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
              {m.mime.startsWith("image/") && m.url ? (
                <img src={m.url} alt={m.name} className="aspect-square w-full object-cover" />
              ) : m.mime.startsWith("video/") && m.url ? (
                <video src={m.url} controls className="aspect-square w-full object-cover" aria-label={m.name} />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-[var(--surface-alt)] text-xs text-[var(--dim)]">
                  Không xem trước được
                </div>
              )}
              <div className="p-2">
                <p className="truncate text-xs font-medium" title={m.name}>{m.name}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-[var(--dim)]">{fmtBytes(m.size)}</span>
                  <button className="text-xs font-semibold text-[var(--danger)]" onClick={() => del.mutate(m.id)} aria-label={`Xóa file ${m.name}`}>
                    Xóa
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {media.data && media.data.media.length === 0 && (
          <p className="text-sm text-[var(--dim)]">Chưa có ảnh/video nào — thêm ảnh sản phẩm thật trước khi duyệt bài.</p>
        )}
      </section>
    </div>
  );
}


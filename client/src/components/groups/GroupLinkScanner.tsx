import type { FormEvent } from "react";
import type { ScannedGroup } from "../../types";
import { btnPrimary, inputCls, labelCls } from "../../utils/styles";
import { fmtMembers } from "../../utils/format";
import { CollapsibleCard } from "../ui";

export interface GroupLinkScannerProps {
  isAdderLinked: boolean;
  pasteText: string;
  onPasteTextChange: (val: string) => void;
  onSubmit: (e: FormEvent) => void;
  isPending: boolean;
  error?: string | null;
  scannedResult?: {
    ok: boolean;
    message: string;
    scanned: ScannedGroup[];
  } | null;
}

export function GroupLinkScanner({
  isAdderLinked,
  pasteText,
  onPasteTextChange,
  onSubmit,
  isPending,
  error,
  scannedResult,
}: GroupLinkScannerProps) {
  return (
    <div className="space-y-4">
      <CollapsibleCard
        as="section"
        title="Thêm nhóm bằng link Facebook"
        subtitle="Dán link nhóm để hệ thống tự động quét chi tiết và thành viên"
        defaultOpen={true}
      >
        <form onSubmit={onSubmit} className="space-y-3 p-4">
          {!isAdderLinked && (
            <div
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] p-3"
              role="status"
            >
              <p className="text-sm font-medium text-[var(--danger)]">
                Chưa có tài khoản Facebook nào được liên kết — hãy
                liên kết tài khoản Facebook ở mục Tài khoản để app
                quét được chi tiết và trạng thái tham gia khi bạn
                dán link nhóm.
              </p>
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="gf-paste">
              Link nhóm Facebook (mỗi link một dòng)
            </label>
            <textarea
              id="gf-paste"
              aria-label="Dán link các nhóm Facebook"
              className={`${inputCls} min-h-24`}
              value={pasteText}
              onChange={(e) => onPasteTextChange(e.target.value)}
              placeholder={"https://www.facebook.com/groups/…\nhttps://www.facebook.com/groups/…"}
            />
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
              Cách lấy link nhóm: mở nhóm trên Facebook → nút Chia sẻ →
              “Sao chép liên kết” (hoặc chuột phải vào tên nhóm → “Sao
              chép liên kết”). Dán cả đoạn văn bản có chứa link nhóm
              cũng được — app tự tách link dạng facebook.com/groups/…
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className={btnPrimary}
              disabled={isPending || !pasteText.trim()}
            >
              {isPending ? "Đang quét từng link nhóm…" : "Lưu & quét nhóm"}
            </button>
            <span className="text-sm text-[var(--dim)]">
              Tối đa 25 link mỗi lần lưu.
            </span>
          </div>
        </form>
      </CollapsibleCard>

      {error && (
        <p className="text-sm font-medium text-[var(--danger)]" role="alert">
          Lưu &amp; quét nhóm thất bại: {error}
        </p>
      )}

      {scannedResult && !scannedResult.ok && (
        <p className="text-sm font-medium text-[var(--danger)]" role="alert">
          {scannedResult.message}
        </p>
      )}

      {scannedResult?.ok && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm font-semibold text-[var(--ok)]" role="status">
            ✓ {scannedResult.message}
          </p>

          {scannedResult.scanned.length > 0 && (
            <ul className="mt-3 space-y-3">
              {scannedResult.scanned.map((g: ScannedGroup) => (
                <li
                  key={g.id}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={g.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                      >
                        {g.name}
                      </a>
                      <p className="text-xs text-[var(--dim)]">
                        <span className="font-mono">{fmtMembers(g.members)}</span> thành viên
                        {!g.detail_ok && " · chưa đọc được chi tiết"}
                      </p>
                      {g.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--dim)]">
                          {g.description}
                        </p>
                      )}
                      {g.note && (
                        <p className="mt-1 text-xs text-[var(--dim)]">{g.note}</p>
                      )}
                    </div>

                    {g.fb_status === "joined" ? (
                      <span className="shrink-0 rounded-full bg-[var(--ok)] px-3 py-1.5 text-xs font-semibold text-white">
                        ✓ Nick Facebook đã tham gia
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)]">
                        Nick Facebook chưa tham gia
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs text-[var(--dim)]">
            Các nhóm trên đã nằm trong <strong>Danh sách nhóm</strong> bên dưới — kiểm tra và đặt đúng trạng thái tham gia của từng Page trên thẻ nhóm trước khi đăng bài.
          </p>
        </div>
      )}
    </div>
  );
}

import { useState, type FormEvent } from "react";
import type { SheetConfig, SheetSource } from "../../types";
import { btnPrimary, btnGhost, btnDanger, inputCls, labelCls } from "../../utils/styles";
import { fmtDate, shortenSyncMessage } from "../../utils/format";
import { CollapsibleCard } from "../ui";

export interface SheetSourceManagerProps {
  cfg: SheetConfig | undefined;
  allProductsCount: number;
  realImageCounts?: { with: number; without: number };
  sheetMsg: string;
  onSync: (sourceId: number) => void;
  isSyncPending: boolean;
  onSetActive: (sourceId: number) => void;
  isActivePending: boolean;
  onDelete: (sourceId: number) => void;
  isDeletePending: boolean;
  onSaveSheet: (data: {
    name: string;
    spreadsheet: string;
    sheet_name: string;
    range: string;
  }) => void;
  isSavePending: boolean;
}

export function SheetSourceManager({
  cfg,
  allProductsCount,
  realImageCounts,
  sheetMsg,
  onSync,
  isSyncPending,
  onSetActive,
  isActivePending,
  onDelete,
  isDeletePending,
  onSaveSheet,
  isSavePending,
}: SheetSourceManagerProps) {
  const [sheetForm, setSheetForm] = useState({
    name: "",
    spreadsheet: "",
    sheet_name: "",
    range: "",
  });

  const activeSource = cfg?.sources.find((s) => s.is_active);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (sheetForm.spreadsheet.trim()) {
      onSaveSheet(sheetForm);
      setSheetForm({ name: "", spreadsheet: "", sheet_name: "", range: "" });
    }
  };

  return (
    <section
      aria-label="Nguồn Sản Phẩm"
      className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-lg font-bold">Nguồn Sản Phẩm</h2>
        <span className="rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-xs font-semibold">
          <span className="font-mono">{allProductsCount}</span> sản phẩm
        </span>
      </header>

      <div aria-label="Danh sách nguồn Sheet đã lưu" className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Nguồn Sheet đã lưu</h3>
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-mono text-xs font-semibold">
            {cfg?.sources.length ?? 0}
          </span>
        </div>

        {activeSource && (
          <p className="mt-1.5 text-xs text-[var(--dim)]" role="status">
            Đang lấy từ:{" "}
            <span className="font-semibold text-[var(--text)]">
              {activeSource.name}
            </span>
          </p>
        )}

        {cfg && cfg.sources.length === 0 && (
          <p className="mt-2 rounded-[var(--radius)] bg-[var(--surface-alt)] px-3 py-2.5 text-sm text-[var(--dim)]">
            Chưa có nguồn nào — thêm nguồn ở phần “Thêm nguồn Sheet” bên dưới.
          </p>
        )}

        <ul className="mt-2 space-y-3">
          {(cfg?.sources ?? []).map((src: SheetSource) => (
            <li
              key={src.id}
              className={`rounded-[var(--radius)] border bg-[var(--bg)] p-3 ${
                src.is_active
                  ? "border-2 border-[var(--accent)]"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{src.name}</p>
                {src.is_active && (
                  <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">
                    Nguồn đang chọn
                  </span>
                )}
                <span className="text-xs text-[var(--dim)]">
                  <span className="font-mono">{src.product_count}</span> sản phẩm từ nguồn này
                </span>
              </div>

              {src.title && src.title !== src.name && (
                <p className="mt-0.5 text-xs text-[var(--dim)]">
                  Tên file trên Google: “{src.title}”
                </p>
              )}

              <p className="mt-0.5 truncate text-xs text-[var(--dim)]">
                Link:{" "}
                <a
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Mở file Sheet của nguồn ${src.name}`}
                  className="font-mono text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                >
                  {src.url}
                </a>
              </p>

              <p className="mt-0.5 text-xs text-[var(--dim)]">
                {src.sheet_name ? `Tab: ${src.sheet_name}` : "Tab: tab đầu tiên"}
                {src.last_sync_at
                  ? ` · Đồng bộ ${fmtDate(src.last_sync_at)} — ${shortenSyncMessage(src.last_sync_message, realImageCounts)}`
                  : " · Chưa đồng bộ lần nào"}
                {src.last_sync_status === "syncing" ? " · Đang đồng bộ…" : ""}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={isSyncPending}
                  onClick={() => onSync(src.id)}
                  aria-label={`Đồng bộ ngay từ nguồn Sheet ${src.name}`}
                >
                  {isSyncPending ? "Đang đồng bộ…" : "Đồng bộ nguồn này"}
                </button>

                {!src.is_active && (
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={isActivePending}
                    onClick={() => onSetActive(src.id)}
                    aria-label={`Chọn nguồn Sheet ${src.name} làm nguồn chính`}
                  >
                    Chọn làm nguồn chính
                  </button>
                )}

                <button
                  type="button"
                  className={btnDanger}
                  disabled={isDeletePending}
                  onClick={() => onDelete(src.id)}
                  aria-label={`Xóa nguồn Sheet ${src.name} khỏi danh sách đã lưu`}
                >
                  Xóa nguồn
                </button>
              </div>
            </li>
          ))}
        </ul>

        {sheetMsg && (
          <p className="mt-2 text-sm font-medium" role="status">
            {sheetMsg}
          </p>
        )}
      </div>

      <CollapsibleCard
        title="Thêm nguồn Sheet"
        defaultOpen={!cfg?.sources.length}
        headerTag="h3"
        className="border-t border-[var(--border)] rounded-none border-x-0 border-b-0"
      >
        <form
          onSubmit={handleSubmit}
          aria-label="Thêm nguồn Sheet"
          className="space-y-3 p-4"
        >
          <div>
            <label className={labelCls} htmlFor="sh-name">Tên nguồn Sheet *</label>
            <input
              id="sh-name"
              aria-label="Tên nguồn Sheet"
              className={inputCls}
              value={sheetForm.name}
              onChange={(e) => setSheetForm({ ...sheetForm, name: e.target.value })}
              placeholder="Đặt tên cho nguồn Sheet"
              required
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="sh-link">Link hoặc ID file Google Sheet *</label>
            <input
              id="sh-link"
              aria-label="Link hoặc ID file Google Sheet"
              className={inputCls}
              value={sheetForm.spreadsheet}
              onChange={(e) => setSheetForm({ ...sheetForm, spreadsheet: e.target.value })}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              required
            />
          </div>

          <div className="grid gap-3">
            <div>
              <label className={labelCls} htmlFor="sh-tab">Tên tab trong Sheet</label>
              <input
                id="sh-tab"
                aria-label="Tên tab trong Sheet"
                className={inputCls}
                value={sheetForm.sheet_name}
                onChange={(e) => setSheetForm({ ...sheetForm, sheet_name: e.target.value })}
                placeholder="Để trống = tab đầu tiên"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="sh-range">Phạm vi ô (không bắt buộc)</label>
              <input
                id="sh-range"
                aria-label="Phạm vi ô"
                className={inputCls}
                value={sheetForm.range}
                onChange={(e) => setSheetForm({ ...sheetForm, range: e.target.value })}
                placeholder="Để trống = lấy toàn bộ dữ liệu"
              />
            </div>
          </div>

          <button
            type="submit"
            className={`${btnPrimary} w-full sm:w-auto`}
            disabled={isSavePending}
          >
            {isSavePending ? "Đang lưu…" : "Lưu nguồn Sheet"}
          </button>
        </form>
      </CollapsibleCard>
    </section>
  );
}

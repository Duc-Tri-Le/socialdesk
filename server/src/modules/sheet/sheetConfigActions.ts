import { defineAction, z } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import {
  getSheetSettings,
  loadSheetSources,
  getActiveSourceId,
  mirrorSourceToSettings,
  setSetting,
  type SheetSourceRow,
} from "../../services/settings";
import { sheetConfigOut, toSheetSourceOut } from "../../types";
import { parseSpreadsheetId } from "../../services/sheet";

export const sheetConfigActions = {
  // Danh sách nguồn Sheet đã lưu: các trường "đang gắn" (spreadsheet_id…)
  // phản ánh nguồn đang chọn (active); mảng sources là toàn bộ danh sách
  // để giao diện liệt kê và đồng bộ từng nguồn.
  getSheetConfig: defineAction({
    request: z.object({}),
    response: sheetConfigOut,
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const sources = await loadSheetSources(db);
      const activeId = await getActiveSourceId(db, sources);
      const sheetProducts = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.source, "sheet"));
      const countFor = (spreadsheetId: string) =>
        sheetProducts.filter((p) =>
          p.externalKey.startsWith(`${spreadsheetId}:`),
        ).length;
      const active = sources.find((s) => s.id === activeId);
      const legacy = active ? null : await getSheetSettings(db);
      return {
        configured: active ? true : (legacy?.configured ?? false),
        spreadsheet_id: active?.spreadsheetId ?? legacy?.spreadsheet_id ?? "",
        sheet_name: active?.sheetName ?? legacy?.sheet_name ?? "",
        range: active?.range ?? legacy?.range ?? "",
        title: active?.title ?? legacy?.title ?? "",
        last_sync_at: active?.lastSyncAt ?? legacy?.last_sync_at ?? "",
        last_sync_status:
          active?.lastSyncStatus ?? legacy?.last_sync_status ?? "",
        last_sync_message:
          active?.lastSyncMessage ?? legacy?.last_sync_message ?? "",
        sheet_product_count: sheetProducts.length,
        active_source_id: activeId,
        sources: sources.map((s) =>
          toSheetSourceOut(s, countFor(s.spreadsheetId), s.id === activeId),
        ),
      };
    },
  }),

  // Lưu một nguồn Sheet mới vào danh sách (hoặc cập nhật nguồn trùng link).
  saveSheetConfig: defineAction({
    request: z.object({
      name: z.string().default(""),
      spreadsheet: z.string().min(1),
      sheet_name: z.string().default(""),
      range: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const id = parseSpreadsheetId(args.spreadsheet);
      if (!id)
        return {
          ok: false,
          message:
            "Không nhận ra ID Google Sheet — dán nguyên link file Sheet (dạng docs.google.com/spreadsheets/d/…) hoặc ID của file.",
        };
      const db = ctx.db<typeof schema>();
      const name = args.name.trim();
      const sheetName = args.sheet_name.trim();
      const range = args.range.trim();
      const sources = await loadSheetSources(db);
      const existing = sources.find((s) => s.spreadsheetId === id);
      let saved: SheetSourceRow;
      if (existing) {
        await db
          .update(schema.sheetSources)
          .set({
            name: name || existing.name,
            sheetName,
            range,
          })
          .where(eq(schema.sheetSources.id, existing.id));
        saved = { ...existing, name: name || existing.name, sheetName, range };
      } else {
        const [row] = await db
          .insert(schema.sheetSources)
          .values({
            name: name || "Nguồn Sheet chưa đặt tên",
            spreadsheetId: id,
            sheetName,
            range,
          })
          .returning();
        if (!row)
          return { ok: false, message: "Không lưu được nguồn Sheet." };
        saved = row;
      }
      await mirrorSourceToSettings(db, saved);
      ctx.invalidateQueries();
      return {
        ok: true,
        message: existing
          ? `Đã cập nhật nguồn Sheet “${saved.name}” trong danh sách đã lưu và đặt làm nguồn đang chọn.`
          : `Đã lưu nguồn Sheet “${saved.name}” vào danh sách và đặt làm nguồn đang chọn. Bấm “Đồng bộ nguồn này” để lấy sản phẩm.`,
      };
    },
  }),

  setActiveSheetSource: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const sources = await loadSheetSources(db);
      const row = sources.find((s) => s.id === args.id);
      if (!row) return { ok: false, message: "Không tìm thấy nguồn Sheet." };
      await mirrorSourceToSettings(db, row);
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã chọn nguồn Sheet “${row.name}” làm nguồn chính.`,
      };
    },
  }),

  deleteSheetSource: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const sources = await loadSheetSources(db);
      const row = sources.find((s) => s.id === args.id);
      if (!row) return { ok: false, message: "Không tìm thấy nguồn Sheet." };
      const wasActive =
        (await getActiveSourceId(db, sources)) === row.id;
      await db
        .delete(schema.sheetSources)
        .where(eq(schema.sheetSources.id, row.id));
      if (wasActive) {
        const rest = sources.filter((s) => s.id !== row.id);
        const next = rest[0];
        if (next) {
          await mirrorSourceToSettings(db, next);
        } else {
          await setSetting(db, "sheet_active_source_id", "");
          await setSetting(db, "sheet_spreadsheet_id", "");
          await setSetting(db, "sheet_name", "");
          await setSetting(db, "sheet_range", "");
          await setSetting(db, "sheet_title", "");
        }
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã xóa nguồn Sheet “${row.name}” khỏi danh sách. Sản phẩm đã đồng bộ từ nguồn này vẫn giữ nguyên.`,
      };
    },
  }),
};

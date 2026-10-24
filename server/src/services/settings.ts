import type { Ctx } from "@hatch/space-sdk";
import { asc, eq, like } from "drizzle-orm";
import * as schema from "../schema";

export const MAX_POSTS_PER_DAY = 3;
export const MIN_INTERVAL_MINUTES = 30;

export type Db = ReturnType<typeof getDb>;
export function getDb(ctx: Ctx) {
  return ctx.db<typeof schema>();
}

export async function getSetting(db: Db, key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key));
  return row?.value ?? "";
}

/**
 * Lấy hàng loạt setting theo tiền tố key (giải quyết N+1 query)
 */
export async function getSettingsByPrefix(
  db: Db,
  prefix: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select()
    .from(schema.appSettings)
    .where(like(schema.appSettings.key, `${prefix}%`));
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.key, r.value);
  }
  return map;
}

export async function setSetting(
  db: Db,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value },
    });
}

export async function deleteSetting(db: Db, key: string): Promise<void> {
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, key));
}

export async function getSheetSettings(db: Db) {
  const [id, name, range, title, lastAt, lastStatus, lastMsg] =
    await Promise.all([
      getSetting(db, "sheet_spreadsheet_id"),
      getSetting(db, "sheet_name"),
      getSetting(db, "sheet_range"),
      getSetting(db, "sheet_title"),
      getSetting(db, "sheet_last_sync_at"),
      getSetting(db, "sheet_last_sync_status"),
      getSetting(db, "sheet_last_sync_message"),
    ]);
  return {
    spreadsheet_id: id,
    sheet_name: name,
    range,
    title,
    last_sync_at: lastAt,
    last_sync_status: lastStatus,
    last_sync_message: lastMsg,
    configured: id.length > 0,
  };
}

export type SheetSourceRow = typeof schema.sheetSources.$inferSelect;

export async function loadSheetSources(db: Db): Promise<SheetSourceRow[]> {
  return db
    .select()
    .from(schema.sheetSources)
    .orderBy(asc(schema.sheetSources.id));
}

// Nguồn Sheet "chính" (đang chọn): nguồn được đánh dấu trong cài đặt,
// chưa có thì lấy nguồn đầu tiên trong danh sách đã lưu. Trả 0 khi chưa
// lưu nguồn nào.
export async function getActiveSourceId(
  db: Db,
  sources: SheetSourceRow[],
): Promise<number> {
  const n = Number(await getSetting(db, "sheet_active_source_id"));
  if (Number.isInteger(n) && sources.some((s) => s.id === n)) return n;
  return sources[0]?.id ?? 0;
}

// Gương một nguồn đã lưu xuống các khóa cài đặt cũ (sheet_*) để Tổng quan
// và các chỗ đọc cài đặt đơn lẻ vẫn thấy đúng nguồn đang chọn.
export async function mirrorSourceToSettings(
  db: Db,
  s: SheetSourceRow,
): Promise<void> {
  await setSetting(db, "sheet_spreadsheet_id", s.spreadsheetId);
  await setSetting(db, "sheet_name", s.sheetName);
  await setSetting(db, "sheet_range", s.range);
  await setSetting(db, "sheet_title", s.title);
  await setSetting(db, "sheet_last_sync_at", s.lastSyncAt);
  await setSetting(db, "sheet_last_sync_status", s.lastSyncStatus);
  await setSetting(db, "sheet_last_sync_message", s.lastSyncMessage);
  await setSetting(db, "sheet_active_source_id", String(s.id));
}

export async function updateSourceSyncState(
  db: Db,
  sourceId: number,
  patch: { status?: string; message?: string; at?: string; title?: string },
): Promise<void> {
  if (sourceId <= 0) return;
  const set: Partial<SheetSourceRow> = {};
  if (patch.status !== undefined) set.lastSyncStatus = patch.status;
  if (patch.message !== undefined) set.lastSyncMessage = patch.message;
  if (patch.at !== undefined) set.lastSyncAt = patch.at;
  if (patch.title !== undefined && patch.title) set.title = patch.title;
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.sheetSources)
    .set(set)
    .where(eq(schema.sheetSources.id, sourceId));
}
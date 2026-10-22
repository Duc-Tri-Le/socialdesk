CREATE TABLE sheet_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL DEFAULT '',
  range TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  last_sync_at TEXT NOT NULL DEFAULT '',
  last_sync_status TEXT NOT NULL DEFAULT '',
  last_sync_message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO sheet_sources (name, spreadsheet_id, sheet_name, range, title, last_sync_at, last_sync_status, last_sync_message, created_at)
SELECT
  CASE WHEN COALESCE((SELECT value FROM app_settings WHERE key = 'sheet_title'), '') = '' THEN 'Nguồn Sheet đã lưu' ELSE (SELECT value FROM app_settings WHERE key = 'sheet_title') END,
  value,
  COALESCE((SELECT value FROM app_settings WHERE key = 'sheet_name'), ''),
  COALESCE((SELECT value FROM app_settings WHERE key = 'sheet_range'), ''),
  COALESCE((SELECT value FROM app_settings WHERE key = 'sheet_title'), ''),
  COALESCE((SELECT value FROM app_settings WHERE key = 'sheet_last_sync_at'), ''),
  COALESCE((SELECT value FROM app_settings WHERE key = 'sheet_last_sync_status'), ''),
  COALESCE((SELECT value FROM app_settings WHERE key = 'sheet_last_sync_message'), ''),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM app_settings
WHERE key = 'sheet_spreadsheet_id' AND value != '';

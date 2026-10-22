CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL DEFAULT 'Facebook',
  name TEXT NOT NULL,
  handle TEXT NOT NULL DEFAULT '',
  linked INTEGER NOT NULL DEFAULT 1,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
ALTER TABLE products ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN external_key TEXT NOT NULL DEFAULT '';

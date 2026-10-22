DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  scale TEXT NOT NULL DEFAULT '1:18',
  maker TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 1,
  ship TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE research_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  ran_at INTEGER NOT NULL,
  marketplace_count INTEGER NOT NULL DEFAULT 0,
  price_count INTEGER NOT NULL DEFAULT 0,
  price_min INTEGER,
  price_median INTEGER,
  price_max INTEGER,
  groups_found INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE fb_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  members INTEGER NOT NULL DEFAULT 0,
  joined INTEGER NOT NULL DEFAULT 0,
  is_target INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  scale TEXT NOT NULL DEFAULT '1:18',
  maker TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  stock TEXT NOT NULL DEFAULT '1',
  ship TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL,
  reels TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  pack_text TEXT NOT NULL DEFAULT '',
  packed_at INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE media_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `post_metric_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`posting_id` integer NOT NULL,
	`captured_at` integer NOT NULL,
	`reactions` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`reach` integer,
	`source` text DEFAULT 'extension_dom' NOT NULL,
	`data_quality` text DEFAULT 'full' NOT NULL,
	`created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_snapshots_posting_id` ON `post_metric_snapshots` (`posting_id`);
CREATE INDEX IF NOT EXISTS `idx_snapshots_captured_at` ON `post_metric_snapshots` (`captured_at`);

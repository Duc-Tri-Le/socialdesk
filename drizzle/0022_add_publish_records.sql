CREATE TABLE `publish_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_id` integer NOT NULL,
	`target_kind` text NOT NULL DEFAULT '',
	`target_name` text NOT NULL DEFAULT '',
	`status` text NOT NULL DEFAULT 'failed',
	`post_url` text NOT NULL DEFAULT '',
	`message` text NOT NULL DEFAULT '',
	`created_at` integer NOT NULL
);

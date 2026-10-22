CREATE TABLE `group_memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`identity_kind` text DEFAULT 'account' NOT NULL,
	`identity_id` integer NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);

ALTER TABLE `products` ADD COLUMN `drive_folder_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `drive_status` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `drive_error` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `drive_checked_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `drive_images` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `drafts` ADD COLUMN `drive_folder_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `drafts` ADD COLUMN `drive_status` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `drafts` ADD COLUMN `drive_error` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `drafts` ADD COLUMN `drive_images` text DEFAULT '[]' NOT NULL;

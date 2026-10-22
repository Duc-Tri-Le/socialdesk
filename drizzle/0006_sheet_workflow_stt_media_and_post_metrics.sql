ALTER TABLE `products` ADD COLUMN `stt` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `image_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD COLUMN `video_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `drafts` ADD COLUMN `stt` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `drafts` ADD COLUMN `image_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `drafts` ADD COLUMN `video_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `post_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_id` integer,
	`product_name` text DEFAULT '' NOT NULL,
	`stt` text DEFAULT '' NOT NULL,
	`channel_type` text DEFAULT 'group' NOT NULL,
	`channel_id` integer DEFAULT 0 NOT NULL,
	`channel_name` text DEFAULT '' NOT NULL,
	`media_kind` text DEFAULT 'image' NOT NULL,
	`posted_at` integer NOT NULL,
	`hour_slot` text DEFAULT '' NOT NULL,
	`reach` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`inquiries` integer DEFAULT 0 NOT NULL,
	`orders` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);

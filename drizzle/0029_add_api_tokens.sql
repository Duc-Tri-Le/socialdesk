ALTER TABLE `fb_pages` ADD COLUMN `access_token` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `fb_pages` ADD COLUMN `fb_page_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `accounts` ADD COLUMN `access_token` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `accounts` ADD COLUMN `ig_business_account_id` text DEFAULT '' NOT NULL;


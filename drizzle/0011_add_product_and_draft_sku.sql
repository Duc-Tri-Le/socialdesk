ALTER TABLE `products` ADD COLUMN `sku` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `drafts` ADD COLUMN `sku` text DEFAULT '' NOT NULL;

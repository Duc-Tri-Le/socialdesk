ALTER TABLE `products` ADD COLUMN `colors` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `products` SET `colors` = json_array(`color`) WHERE `color` <> '';

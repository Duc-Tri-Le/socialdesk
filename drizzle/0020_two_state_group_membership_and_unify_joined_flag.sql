UPDATE `group_memberships` SET `status` = 'not_joined' WHERE `status` = 'unknown';
--> statement-breakpoint
UPDATE `fb_groups` SET `joined` = 1 WHERE `joined` = 0 AND EXISTS (SELECT 1 FROM `group_memberships` AS `m` WHERE `m`.`group_id` = `fb_groups`.`id` AND `m`.`status` = 'joined');

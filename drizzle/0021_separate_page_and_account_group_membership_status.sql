INSERT INTO `group_memberships` (`group_id`, `identity_kind`, `identity_id`, `status`, `updated_at`)
SELECT g.`id`, 'account', (SELECT a.`id` FROM `accounts` a WHERE a.`platform` = 'Facebook' ORDER BY a.`selected` DESC, a.`id` ASC LIMIT 1), 'joined', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `fb_groups` g
WHERE g.`joined` = 1
  AND NOT EXISTS (SELECT 1 FROM `group_memberships` m WHERE m.`group_id` = g.`id` AND m.`status` = 'joined')
  AND EXISTS (SELECT 1 FROM `accounts` a WHERE a.`platform` = 'Facebook');
--> statement-breakpoint
UPDATE `fb_groups` SET `joined` = CASE WHEN EXISTS (
  SELECT 1 FROM `group_memberships` m
  WHERE m.`group_id` = `fb_groups`.`id`
    AND m.`identity_kind` = 'account'
    AND m.`status` = 'joined'
    AND m.`identity_id` = (SELECT a.`id` FROM `accounts` a WHERE a.`platform` = 'Facebook' ORDER BY a.`selected` DESC, a.`id` ASC LIMIT 1)
) THEN 1 ELSE 0 END;

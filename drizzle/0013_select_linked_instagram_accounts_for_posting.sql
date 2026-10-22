UPDATE accounts
SET selected = 1
WHERE platform = 'Instagram' AND linked = 1 AND selected = 0;
--> statement-breakpoint
UPDATE accounts
SET selected = 1
WHERE platform = 'Facebook' AND linked = 1 AND selected = 0
  AND NOT EXISTS (
    SELECT 1 FROM accounts WHERE platform = 'Facebook' AND selected = 1
  )
  AND id = (
    SELECT MIN(id) FROM accounts
    WHERE platform = 'Facebook' AND linked = 1 AND selected = 0
  );

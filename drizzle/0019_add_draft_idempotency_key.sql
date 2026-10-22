ALTER TABLE `drafts` ADD COLUMN `idempotency_key` text DEFAULT '' NOT NULL;

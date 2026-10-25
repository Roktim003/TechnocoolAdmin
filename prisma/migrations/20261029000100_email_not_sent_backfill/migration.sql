-- Module 7 (migrate step): emails logged as SKIPPED (Module 3 name) become NOT_SENT_SMTP_MISSING.
-- A separate migration because a new enum value can't be used in the transaction that adds it.
-- The SKIPPED value itself is removed in a later release (contract step).
UPDATE "EmailLog" SET status = 'NOT_SENT_SMTP_MISSING' WHERE status = 'SKIPPED';

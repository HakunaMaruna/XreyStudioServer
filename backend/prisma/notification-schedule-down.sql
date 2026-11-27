-- Reversible down migration for notification schedule settings (PostgreSQL).
ALTER TABLE "NotificationPolicy" DROP COLUMN IF EXISTS "infoIntervalMinutes";
ALTER TABLE "NotificationPolicy" DROP COLUMN IF EXISTS "errorRepeatMinutes";
ALTER TABLE "NotificationPolicy" DROP COLUMN IF EXISTS "cheburcheckIntervalMinutes";
DELETE FROM "NotificationCredential" WHERE "key" IN ('NODE_DIGEST_INTERVAL_MS');

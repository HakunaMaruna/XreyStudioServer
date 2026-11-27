-- Reversible down migration for resilience additions (PostgreSQL).
ALTER TABLE "HealthCheck" DROP COLUMN IF EXISTS "bytes";
DROP TABLE IF EXISTS "NodeQuarantine";

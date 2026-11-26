-- Reversible down migration for per-inbound routing scope (PostgreSQL).
ALTER TABLE "RoutingProfile" DROP COLUMN IF EXISTS "inboundId";
ALTER TABLE "Rule" DROP COLUMN IF EXISTS "inboundId";

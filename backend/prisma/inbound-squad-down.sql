-- Reversible down migration for live inbound↔squad bindings (PostgreSQL).
DROP TABLE IF EXISTS "InboundSquad";
ALTER TABLE "InboundClient" DROP COLUMN IF EXISTS "sourceSquadId";

-- Reversible down migration for the panel update system (PostgreSQL).
-- Only the agent version tracking columns are added to the database; the rest
-- of the update system is environment-driven and lives in updater/.
ALTER TABLE "Node" DROP COLUMN IF EXISTS "agentUpdatedAt";
ALTER TABLE "Node" DROP COLUMN IF EXISTS "agentVersion";

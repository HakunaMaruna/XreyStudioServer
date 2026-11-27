-- Reversible down migration for jump-node support (PostgreSQL).
ALTER TABLE "Node" DROP COLUMN IF EXISTS "jumpNodeId";

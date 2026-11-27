-- Reversible down migration for per-node agent secrets (PostgreSQL).
ALTER TABLE "Node" DROP COLUMN IF EXISTS "agentSecret";

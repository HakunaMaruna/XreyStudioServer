-- Reversible down migration for client IPv6 exit control (PostgreSQL).
ALTER TABLE "Node" DROP COLUMN IF EXISTS "clientIpv6Enabled";

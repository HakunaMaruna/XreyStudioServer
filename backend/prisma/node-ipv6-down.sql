-- Reversible down migration for node IPv6 entry (PostgreSQL).
ALTER TABLE "Node" DROP COLUMN IF EXISTS "ipv6Addresses";
ALTER TABLE "Node" DROP COLUMN IF EXISTS "ipv6Enabled";
ALTER TABLE "Node" DROP COLUMN IF EXISTS "ipv6Address";
ALTER TABLE "Node" DROP COLUMN IF EXISTS "ipv6VerifiedAt";
ALTER TABLE "Node" DROP COLUMN IF EXISTS "ipv6LastError";

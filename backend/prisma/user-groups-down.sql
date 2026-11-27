-- Reversible down migration for user permission groups (PostgreSQL).
DROP TABLE IF EXISTS "UserGroupMember";
DROP TABLE IF EXISTS "UserGroup";
ALTER TABLE "User" DROP COLUMN IF EXISTS "groups";

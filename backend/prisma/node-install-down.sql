-- Reversible down migration for wizard installation progress/log (PostgreSQL).
DROP TABLE IF EXISTS "NodeInstallLog";
DROP TABLE IF EXISTS "NodeInstallJob";

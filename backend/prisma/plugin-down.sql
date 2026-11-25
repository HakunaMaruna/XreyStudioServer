-- Reversible down migration for plugin system (PostgreSQL).
DROP TABLE IF EXISTS "PluginLog";
DROP TABLE IF EXISTS "PluginStorage";
DROP TABLE IF EXISTS "PluginCatalogCache";
DROP TABLE IF EXISTS "PluginPolicy";
DROP TABLE IF EXISTS "Plugin";
DROP TABLE IF EXISTS "StoreRevocation";
DROP TABLE IF EXISTS "StoreVersion";
DROP TABLE IF EXISTS "StorePlugin";
ALTER TYPE "PluginStatus" RENAME TO "PluginStatus_old";

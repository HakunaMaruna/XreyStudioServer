-- Reversible down migration for plugin-provided inbound recipes (PostgreSQL).
DROP TABLE IF EXISTS "PluginRecipe";

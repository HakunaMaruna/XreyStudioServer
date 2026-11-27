-- Reversible down migration for per-user external links (PostgreSQL).
DROP TABLE IF EXISTS "UserExternalLink";

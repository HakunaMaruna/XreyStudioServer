-- Reversible down migration for telemetry (PostgreSQL).
-- The TELEMETRY scope value is kept in ApiTokenScope for compatibility with older tokens;
-- it grants access only to /api/telemetry/ingest and can be revoked at any time.
DROP TABLE IF EXISTS "TelemetryLog";
DROP TABLE IF EXISTS "TelemetrySnapshot";
DROP TABLE IF EXISTS "TelemetryInstallation";
DROP TABLE IF EXISTS "TelemetrySetting";

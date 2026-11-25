CREATE TABLE IF NOT EXISTS plugin_audit_hook_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Sentinel DB init 06 — roles and grants (A01 / A05)
-- Password for sentinel_app is set by 00_app_role.sh from DATABASE_APP_PASSWORD.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_app') THEN
    CREATE ROLE sentinel_app LOGIN PASSWORD 'change-me-app-role';
  END IF;
END
$$;

ALTER ROLE sentinel_app NOSUPERUSER NOCREATEDB NOCREATEROLE LOGIN;

GRANT CONNECT ON DATABASE sentinel TO sentinel_app;
GRANT USAGE ON SCHEMA public TO sentinel_app;

GRANT SELECT, INSERT, UPDATE ON TABLE
  users,
  cameras,
  camera_heartbeats,
  watchlist,
  detection_idempotency,
  detections,
  alerts,
  outbound_allowlist
TO sentinel_app;

REVOKE DELETE ON TABLE
  users,
  cameras,
  camera_heartbeats,
  watchlist,
  detection_idempotency,
  detections,
  alerts
FROM sentinel_app;

-- Append-only at the privilege level, not only in application code (handoff §6).
GRANT SELECT, INSERT ON TABLE audit_log TO sentinel_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM sentinel_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM PUBLIC;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sentinel_app;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Do not FORCE RLS: bootstrap/owner needs break-glass SELECT without a policy.
-- sentinel_app is not owner, so ENABLE RLS still applies to it.

CREATE POLICY audit_log_select ON audit_log
  FOR SELECT TO sentinel_app
  USING (true);

CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT TO sentinel_app
  WITH CHECK (true);

COMMENT ON TABLE audit_log IS
  'Append-only. sentinel_app has SELECT,INSERT only. Triggers reject UPDATE/DELETE/TRUNCATE.';

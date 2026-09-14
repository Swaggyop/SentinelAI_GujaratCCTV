-- Sentinel DB init 05 — tamper-evidence triggers (A04 / A08)

-- Hash-chain audit_log: each insert binds to the previous row's hash_curr.
-- Application SHOULD also store HMAC(alert fields) in alerts.alert_hash using
-- ALERT_HMAC_SECRET; this trigger is the DB-level chain, not a replacement.

CREATE OR REPLACE FUNCTION audit_log_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  prev_hash TEXT;
  material  TEXT;
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'audit_log is append-only (op=%)', TG_OP
      USING ERRCODE = '42501';
  END IF;

  SELECT hash_curr INTO prev_hash
  FROM audit_log
  ORDER BY id DESC
  LIMIT 1;

  NEW.hash_prev := prev_hash;

  material := concat_ws('|',
    coalesce(NEW.actor::text, ''),
    coalesce(NEW.actor_role, ''),
    NEW.action,
    coalesce(NEW.target_table, ''),
    coalesce(NEW.target_id, ''),
    coalesce(NEW.payload::text, '{}'),
    NEW.ts::text,
    coalesce(prev_hash, 'GENESIS')
  );

  NEW.hash_curr := encode(digest(material, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_log_append
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_append_only();

CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_append_only();

CREATE OR REPLACE FUNCTION audit_log_forbid_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (TRUNCATE forbidden)'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_log_forbid_truncate();

-- Cameras: block DELETE even for the app role (deregister via status).
CREATE OR REPLACE FUNCTION cameras_forbid_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'cameras cannot be deleted; set status=deregistered (id=%)', OLD.id
    USING ERRCODE = '2F003';
END;
$$;

CREATE TRIGGER trg_cameras_no_delete
  BEFORE DELETE ON cameras
  FOR EACH ROW
  EXECUTE FUNCTION cameras_forbid_delete();

CREATE OR REPLACE FUNCTION cameras_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cameras_updated_at
  BEFORE UPDATE ON cameras
  FOR EACH ROW
  EXECUTE FUNCTION cameras_touch_updated_at();

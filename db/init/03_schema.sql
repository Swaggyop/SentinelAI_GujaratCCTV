-- Sentinel DB init 03 — tables
-- Contract: cameras are never hard-deleted; detections.camera_id has ON DELETE RESTRICT;
-- audit_log is append-only (enforced in 05 + 06).

-- ---------------------------------------------------------------------------
-- Identity (JWT local accounts)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            user_role NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Model 1 — CCTV registry + GIS
-- ---------------------------------------------------------------------------
CREATE TABLE cameras (
  id              TEXT PRIMARY KEY,
  department      TEXT NOT NULL,
  location        GEOGRAPHY(Point, 4326) NOT NULL,
  status          camera_status NOT NULL DEFAULT 'offline',
  vendor          TEXT,
  stream_health   TEXT,
  onboarded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cameras_id_format CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$')
);

COMMENT ON TABLE cameras IS
  'Model 1 registry. Deregister by setting status=deregistered. Never DELETE rows that have detections.';

-- Separate from detections so "no plates" != "camera down"
CREATE TABLE camera_heartbeats (
  id              BIGSERIAL PRIMARY KEY,
  camera_id       TEXT NOT NULL REFERENCES cameras (id) ON DELETE RESTRICT,
  reported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL CHECK (status IN ('ok', 'degraded', 'down')),
  detail          TEXT
);

-- ---------------------------------------------------------------------------
-- Watchlist (match-time reads; no long-lived cache in the app)
-- ---------------------------------------------------------------------------
CREATE TABLE watchlist (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_normalized   TEXT NOT NULL,
  plate_raw          TEXT,
  reason             TEXT NOT NULL,
  added_by           UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  added_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at     TIMESTAMPTZ,
  deactivated_by     UUID REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT watchlist_plate_normalized_format
    CHECK (plate_normalized ~ '^[A-Z0-9]{4,12}$')
);

-- One active row per plate; historical inactive rows kept for forensics.
CREATE UNIQUE INDEX watchlist_one_active_plate
  ON watchlist (plate_normalized)
  WHERE active;

-- ---------------------------------------------------------------------------
-- Ingest idempotency (ANPR retries). Not a hypertable — uniqueness is global.
-- ---------------------------------------------------------------------------
CREATE TABLE detection_idempotency (
  idempotency_key    TEXT PRIMARY KEY,
  detection_id       UUID NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT detection_idempotency_key_len CHECK (char_length(idempotency_key) BETWEEN 8 AND 128)
);

-- ---------------------------------------------------------------------------
-- Detections (every plate seen — forensic trail)
-- PK includes timestamp_received so this table can become a Timescale hypertable.
-- ---------------------------------------------------------------------------
CREATE TABLE detections (
  id                   UUID NOT NULL DEFAULT gen_random_uuid(),
  camera_id            TEXT NOT NULL REFERENCES cameras (id) ON DELETE RESTRICT,
  timestamp_camera     TIMESTAMPTZ NOT NULL,
  timestamp_received   TIMESTAMPTZ NOT NULL DEFAULT now(),
  plate_raw            TEXT NOT NULL,
  plate_normalized     TEXT NOT NULL,
  confidence           confidence_score NOT NULL,
  frame_ref            TEXT,
  matched              BOOLEAN NOT NULL DEFAULT FALSE,
  match_kind           match_kind NOT NULL DEFAULT 'none',
  PRIMARY KEY (id, timestamp_received),
  CONSTRAINT detections_clock_skew_logged CHECK (timestamp_camera IS NOT NULL)
);

COMMENT ON COLUMN detections.timestamp_camera IS
  'Camera/edge reported time (ISO 8601 with offset). May drift vs server.';
COMMENT ON COLUMN detections.timestamp_received IS
  'Backend receive time. Search/history default clock.';
COMMENT ON COLUMN detections.frame_ref IS
  'Object-storage key in MinIO bucket sentinel-frames, not a filesystem path.';

-- ---------------------------------------------------------------------------
-- Alerts (watchlist hits only; HMAC stored in alert_hash)
-- ---------------------------------------------------------------------------
CREATE TABLE alerts (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  detection_id    UUID NOT NULL,
  detection_ts    TIMESTAMPTZ NOT NULL,
  plate_matched   TEXT NOT NULL,
  confidence      confidence_score NOT NULL,
  alert_hash      TEXT NOT NULL,
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed        BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by     UUID REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_at     TIMESTAMPTZ,
  PRIMARY KEY (id, signed_at),
  CONSTRAINT alerts_hash_len CHECK (char_length(alert_hash) >= 32),
  CONSTRAINT alerts_detection_fk
    FOREIGN KEY (detection_id, detection_ts)
    REFERENCES detections (id, timestamp_received)
    ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- Append-only audit (hash-chained). Serial id defines chain order.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor         UUID,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  target_table  TEXT,
  target_id     TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  hash_prev     TEXT,
  hash_curr     TEXT NOT NULL,
  CONSTRAINT audit_action_nonempty CHECK (char_length(action) > 0)
);

-- ---------------------------------------------------------------------------
-- A10 SSRF: outbound gov-adapter allow-list (VAHAN/SARTHI/eGujCop/AFIS/NAFIS)
-- ---------------------------------------------------------------------------
CREATE TABLE outbound_allowlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  base_url    TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT outbound_https_only CHECK (base_url ~ '^https://')
);

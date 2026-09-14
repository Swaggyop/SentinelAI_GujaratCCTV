-- Sentinel DB init 04 — indexes + Timescale (hot/warm/cold)

CREATE INDEX idx_cameras_location
  ON cameras USING GIST (location);

CREATE INDEX idx_cameras_status
  ON cameras (status);

CREATE INDEX idx_cameras_department
  ON cameras (department);

CREATE INDEX idx_heartbeats_camera_time
  ON camera_heartbeats (camera_id, reported_at DESC);

CREATE INDEX idx_watchlist_active_plate
  ON watchlist (plate_normalized)
  WHERE active;

-- Search/history: filter constantly on received time and normalized plate (handoff §6)
CREATE INDEX idx_detections_timestamp_received
  ON detections (timestamp_received DESC);

CREATE INDEX idx_detections_plate_normalized
  ON detections (plate_normalized);

CREATE INDEX idx_detections_camera_ts
  ON detections (camera_id, timestamp_received DESC);

CREATE INDEX idx_detections_matched
  ON detections (timestamp_received DESC)
  WHERE matched;

CREATE INDEX idx_alerts_signed_at
  ON alerts (signed_at DESC);

CREATE INDEX idx_alerts_plate
  ON alerts (plate_matched);

CREATE INDEX idx_alerts_unreviewed
  ON alerts (signed_at DESC)
  WHERE NOT reviewed;

CREATE INDEX idx_audit_ts
  ON audit_log (ts DESC);

CREATE INDEX idx_audit_actor
  ON audit_log (actor, ts DESC);

-- Same architecture at 80k cameras: partition when Timescale is present.
-- Demo PostGIS image uses the same tables + btree indexes (not a second schema).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable(
      'detections',
      'timestamp_received',
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
    PERFORM create_hypertable(
      'alerts',
      'signed_at',
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
    EXECUTE $c$
      ALTER TABLE detections SET (
        timescaledb.compress,
        timescaledb.compress_orderby = 'timestamp_received DESC',
        timescaledb.compress_segmentby = 'camera_id'
      )
    $c$;
    PERFORM add_compression_policy('detections', INTERVAL '2 days', if_not_exists => TRUE);
  ELSE
    RAISE NOTICE 'Timescale not installed — daily hypertables skipped (indexes remain).';
  END IF;
END
$$;

-- Do NOT drop detection chunks while alerts still FK-reference them (ON DELETE RESTRICT).
-- Hot = uncompressed recent chunks; warm = compressed; cold frames = MinIO (frame_ref).
-- A future archive job must copy/expire alerts first, then drop detection chunks.
-- See db/ops/retention.md

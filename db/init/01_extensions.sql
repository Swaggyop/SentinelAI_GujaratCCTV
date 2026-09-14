-- Sentinel DB init 01 — extensions
-- Demo image is postgis/postgis (reliable Compose). Timescale is optional:
-- swap the image to timescale/timescaledb-ha:pg16 for the 80k-camera target.
-- Schema (composite PKs on detections/alerts) already matches hypertables.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;  -- levenshtein() for fuzzy plate matching

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS timescaledb;
EXCEPTION
  WHEN undefined_file THEN
    RAISE NOTICE 'timescaledb not in this image — using btree indexes only (demo).';
  WHEN OTHERS THEN
    RAISE NOTICE 'timescaledb skipped: %', SQLERRM;
END
$$;

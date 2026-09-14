-- Sentinel DB init 02 — enums / domains

CREATE TYPE user_role AS ENUM ('admin', 'operator', 'readonly');

CREATE TYPE camera_status AS ENUM ('live', 'offline', 'deregistered');

-- Detections may be unmatched, exact watchlist hit, or fuzzy/low-confidence hit.
CREATE TYPE match_kind AS ENUM ('none', 'exact', 'fuzzy');

-- Confidence is 0.0–1.0 inclusive.
CREATE DOMAIN confidence_score AS REAL
  CHECK (VALUE >= 0 AND VALUE <= 1);

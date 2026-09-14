#!/bin/bash
# Sets sentinel_app password from DATABASE_APP_PASSWORD (compose env).
set -euo pipefail

APP_PASS="${DATABASE_APP_PASSWORD:-change-me-app-role}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_pass="$APP_PASS" <<'EOSQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_app') THEN
    CREATE ROLE sentinel_app LOGIN;
  END IF;
END
$$;
ALTER ROLE sentinel_app LOGIN PASSWORD :'app_pass';
EOSQL

# Database & DevOps (Work Package D + E)

This folder is the **source of truth** for schema, roles, and demo seed. Backend / ANPR / frontend AIs **follow** it; they do not redesign tables.

## What is in here

| Path | Purpose |
|---|---|
| `init/00_app_role.sh` | Creates `sentinel_app` with `DATABASE_APP_PASSWORD` |
| `init/01_extensions.sql` | PostGIS, TimescaleDB, pgcrypto |
| `init/02_types.sql` | Enums / confidence domain |
| `init/03_schema.sql` | Tables + FKs (`ON DELETE RESTRICT` on cameras) |
| `init/04_indexes.sql` | Search indexes + hypertables + compression |
| `init/05_audit_chain.sql` | Hash-chain + append-only + no camera DELETE |
| `init/06_roles_grants.sql` | App role: no UPDATE/DELETE on `audit_log` |
| `init/07_seed.sql` | ~52 Gujarat cameras, 3 demo users, 2 watchlist plates |
| `ops/retention.md` | Hot / warm / cold without breaking FKs |

Compose mounts `db/init` into Postgres `docker-entrypoint-initdb.d` (runs **once** on empty volume).

## Bring the DB up

```bash
cp .env.example .env
docker compose up -d db minio minio-init
```

Wait until `sentinel-db` is healthy, then:

```bash
docker compose exec db psql -U sentinel -d sentinel -c "\dt"
docker compose exec db psql -U sentinel_app -d sentinel -c "SELECT COUNT(*) FROM cameras;"
```

Re-running init scripts does nothing if the volume already exists. To reset demo data:

```bash
docker compose down -v
docker compose up -d db minio minio-init
```

That **wipes** the volume. Never do this against anything but local demo data.

## Connection contract (backend AI)

Use **`DATABASE_URL_APP`** (role `sentinel_app`), not the bootstrap `POSTGRES_USER`.

Demo Compose uses **PostGIS 16**. Timescale hypertables activate if you later swap the image to `timescale/timescaledb-ha:pg16` — table shapes already include the time column in PKs so you are not designing twice.

- Parameterized SQL only (OWASP A03).
- `camera_id` must already exist in `cameras` or the FK fails — do **not** auto-insert cameras from detections.
- Deduplicate detections with `detection_idempotency.idempotency_key` (unique).
- Store **both** `timestamp_camera` and `timestamp_received` (ISO 8601 with offset).
- Search/history: filter `detections.timestamp_received` and `detections.plate_normalized` (indexes exist).
- Deregister cameras with `UPDATE cameras SET status = 'deregistered'` — `DELETE` is blocked by trigger.
- `audit_log`: `INSERT` only. Do not UPDATE/DELETE; the DB will reject it.
- `alerts.alert_hash`: HMAC-SHA256 over `frame_ref|plate_normalized|timestamp_camera|camera_id` using `ALERT_HMAC_SECRET` (app-side). DB additionally hash-chains `audit_log`.
- `frame_ref`: MinIO object key in bucket `sentinel-frames`, not a local path.

### Insert detection (idempotent)

```sql
INSERT INTO detection_idempotency (idempotency_key, detection_id)
VALUES ($1, $2)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING detection_id;
-- if no row returned, this is a retry: skip insert into detections
```

`detections` primary key is `(id, timestamp_received)` because the table is a Timescale hypertable. `alerts` FK is `(detection_id, detection_ts)` → `(detections.id, detections.timestamp_received)`. When inserting an alert, copy `timestamp_received` into `detection_ts`.

## Edge cases (must hold)

1. Unknown `camera_id` → FK rejection; backend maps to 400, never creates a phantom camera.
2. Duplicate ANPR POST → unique `idempotency_key`, not timestamp uniqueness.
3. Clock drift → two timestamps; search uses `timestamp_received` with an optional skew window on `timestamp_camera`.
4. Garbled plates → `plate_raw` + `plate_normalized` + `confidence`; `match_kind` is `fuzzy` when below exact threshold.
5. Camera feed down vs empty road → `camera_heartbeats`, not an empty detection.
6. Camera deregister → status flag; historical detections remain.
7. `audit_log` tamper → UPDATE/DELETE revoked **and** triggers; chain `hash_prev`/`hash_curr`.
8. Detection retention vs alerts → do not drop detection chunks while alerts still reference them (see `ops/retention.md`).
9. Watchlist unique active plate → one active row per `plate_normalized`; deactivate instead of DELETE.
10. Gov adapters → only URLs in `outbound_allowlist` (HTTPS); never a client-supplied URL (A10).

## Production vs demo (same design)

| Piece | Demo (~50 cameras) | ~80k cameras |
|---|---|---|
| Engine | PostGIS 16 in Compose | Same tables; Timescale HA image + hypertables |
| Partitioning | Daily chunks (already on) | Same hypertables |
| Queue | Redis Streams / in-process (backend) | Kafka |
| Objects | MinIO | Ceph or object store |
| Orchestration | Docker Compose | Kubernetes |

Do not invent a second schema for production.

## Security notes for this package

See `docs/security-architecture.md` (OWASP Top 10 mapping). DB-enforced items: A01 (app role grants), A03 (no dynamic SQL here), A04/A08 (audit chain), A05 (no default superuser for the app).

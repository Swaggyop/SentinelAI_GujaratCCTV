# Timescale overlay (80k cameras)

Demo Compose uses `postgis/postgis:16-3.5` so `docker-entrypoint-initdb.d` is reliable on a laptop.

Production (Model 4 suggested stack / K8s) swaps the image to a Timescale+PostGIS HA image. **Do not change table names or columns.** `detections` and `alerts` already use composite primary keys that include the partition column.

Steps when the extension is present (`01_extensions.sql` + `04_indexes.sql` already call `create_hypertable` if Timescale exists):

1. Change `docker-compose.yml` `db.image` (or the Helm chart) to Timescale HA with PostGIS.
2. Recreate **empty** volume or run the hypertable conversion on a maintenance window.
3. Keep compression; do not add detection retention until alerts are archived (`retention.md`).

# Hot / warm / cold retention

Problem statement: some departments keep footage 7 days, others 15+. Sentinel keeps **one** pipeline:

| Tier | What | Where |
|---|---|---|
| Hot | Last ~2 days of detection rows, uncompressed | Timescale chunks |
| Warm | Older detection rows, compressed | Timescale compression policy (2 days) |
| Cold | Frame stills / clips referenced by `detections.frame_ref` | MinIO bucket `sentinel-frames` |

## Do not auto-drop detections

`alerts` references `detections (id, timestamp_received)` with **ON DELETE RESTRICT**. A Timescale retention policy that drops 15-day-old detection chunks will fail (or orphan) if alerts still point at those rows.

Order of operations for a future archive job:

1. Export / object-store the frame (`frame_ref`) if not already in MinIO.
2. Archive or expire `alerts` whose `detection_ts` is past policy.
3. Then drop or detach the detection chunk.

Until that job exists, **compression only** — no `add_retention_policy` on `detections`.

## Search clock

History queries should use `timestamp_received` (indexed). Allow an optional window on `timestamp_camera` for clock skew, but do not partition on camera time.

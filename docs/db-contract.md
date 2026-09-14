# Camera / detection / alert contract (read-only for implementation AIs)

Do not change these shapes without updating `docs/` first.

## Identifiers

- `camera_id`: `CAM-XXX-000` pattern, matches `cameras.id`
- timestamps: ISO 8601 **with timezone** (`2026-09-14T18:51:00+05:30`)
- plates: `plate_raw` as OCR saw it; `plate_normalized` `[A-Z0-9]{4,12}`
- `confidence`: JSON number 0.0–1.0
- `idempotency_key`: ANPR-generated, 8–128 chars, unique per frame+camera+plate

## POST /api/v1/detections body (ANPR → backend)

```json
{
  "idempotency_key": "cam-ahm-001:2026-09-14T18:51:00+05:30:GJ01AB1234",
  "camera_id": "CAM-AHM-001",
  "timestamp": "2026-09-14T18:51:00+05:30",
  "plate_text_raw": "GJ-01-AB-1234",
  "plate_text_normalized": "GJ01AB1234",
  "confidence": 0.91,
  "frame_ref": "frames/CAM-AHM-001/2026-09-14/uuid.jpg"
}
```

Backend maps `timestamp` → `detections.timestamp_camera` and sets `timestamp_received = now()`.

## Tables (Package D)

See `db/README.md`. Hypertables: `detections` on `timestamp_received`, `alerts` on `signed_at`. Composite PKs; alerts FK is `(detection_id, detection_ts)`.

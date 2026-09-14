# Sentinel Platform — Build Handoff Spec
### Confirmed architecture, system/logic flow, and per-role work packages (Backend AI / Frontend AI / ANPR AI / DB / Security), for integration in Antigravity

---

## 0. Confirmation: is the previous design the final one?

**Yes — with one clarification.** Comparing your screenshots against the earlier design:

- **Model 1 (Registry & GIS)** is confirmed **mandatory** in the official model list, and the platform's own note says it explicitly: *"Model 1 should be treated as the common CCTV registry and GIS foundation that may support Models 2, 3, and 4."* That's exactly how the earlier architecture used it — as the spine everything else attaches to, not a standalone module.
- **Model 4 (Central VMS & AI Platform)** is the model you're layering on top, and it's listed as its own reference model (not the hybrid option).
- There's also a separate **"Hybrid / Innovative Architecture"** option in the model list. What we designed — Model 1 + Model 4 combined into one platform ("Sentinel") — technically *is* a hybrid architecture in the sense the organizers mean. If the submission portal asks you to declare a track, you're choosing **"Hybrid / Innovative Architecture," built primarily from Model 1 + Model 4's components.** Say that explicitly in your submission rather than picking "Model 4" alone — it's more accurate and it signals to judges that you understood all five options before combining two of them, which is a stronger positioning than looking like you just picked one preset.

Nothing else in the screenshots changes anything about the architecture already designed. It's confirmed as the base — this document turns it into buildable, hand-off-ready packages.

---

## 1. Master System Flow (unchanged, for reference)

```
CCTV/VMS feeds (~50 demo / 80k target)
   → Ingestion & Normalization (RTSP/ONVIF)
   → [Registry & GIS (Model 1)]  +  [ANPR/AI Engine (Model 4)]
   → Alerting & Event Store
   → Security & Forensics Layer
   → GIS Dashboard & Search UI
```

## 2. Master Logic Flow (unchanged, for reference)

```
Video frame → Detect vehicle & plate (YOLO) → OCR & normalize
   → Match watchlist? ── No → passive log
                       └── Yes → signed alert (hash: frame+plate+timestamp+camera ID)
   → both branches → Event store & GIS (searchable)
```

These two diagrams are the contract every work package below must honor. Give each AI tool **its own package plus this section** — not the whole document — so it has the shared contract without needing the other teams' internal detail.

---

## 3. Work Package A — Backend / Orchestration API (hand to your backend-focused AI)

**Stack:** Node.js + Express, PostgreSQL/PostGIS client, JWT auth.

**Responsibilities:** receives detection events from the ANPR service, queries the watchlist, writes alerts/logs, serves the API the frontend consumes, enforces auth/RBAC.

**Core endpoints to implement:**
| Endpoint | Purpose |
|---|---|
| `POST /api/v1/detections` | ANPR service posts a raw detection (camera ID, timestamp, plate text, confidence, frame reference) |
| `GET /api/v1/alerts?from=&to=&camera_id=&plate=` | Search alerts/history |
| `GET /api/v1/cameras` | Registry: list cameras with GIS metadata |
| `POST /api/v1/watchlist` / `GET /api/v1/watchlist` | Manage watched plates |
| `POST /api/v1/auth/login` | Issue JWT |
| `GET /api/v1/audit-log` | Read-only, admin-role only, append-only audit trail |

**Edge cases to handle explicitly:**
- ANPR service posts a detection for a `camera_id` that isn't in the registry (camera deregistered mid-stream, or never registered) → reject with a clear error, do **not** silently create a phantom camera row.
- Duplicate detection events for the same frame (ANPR service retries on timeout) → dedupe by a request idempotency key, not by assuming timestamps are unique.
- Clock drift between camera/edge nodes and the backend → store both the camera-reported timestamp and the server-received timestamp; alert search should be tolerant of small skew.
- Watchlist updated *while* a video is being processed → matching should always read the watchlist at match-time, not a cached copy from stream start, or you'll miss a plate added minutes ago.
- Partial/garbled plate text from OCR (e.g., 4 of 7 characters confident) → don't hard-reject; pass the confidence score through and let fuzzy-match thresholds decide, but flag low-confidence matches distinctly in the alert so a human reviewer treats them differently from high-confidence hits.
- Backend receiving detection volume that exceeds DB write throughput during the live demo (~50 cameras all firing at once) → batch inserts, and make sure a slow write never blocks the ingestion path (queue it, don't call the DB synchronously in the hot path).

---

## 4. Work Package B — ANPR / AI Inference Service (hand to your AI/ML-focused AI)

**Stack:** Python, YOLO (plate localization), EasyOCR or PaddleOCR, exposed as REST/gRPC.

**Responsibilities:** consume video frames, detect vehicle+plate regions, run OCR, normalize text, return structured detections to the backend (Package A) — this service should **not** touch the watchlist or the database directly; it only detects and reports.

**Contract with backend (Package A):** POST to `/api/v1/detections` with `{camera_id, timestamp, plate_text_raw, plate_text_normalized, confidence, frame_ref}`. Keep this contract identical between the mocked/demo version and any future production version.

**Edge cases to handle explicitly:**
- No plate detected in frame (empty road, occluded vehicle) → return nothing / a no-detection signal, don't send an empty/garbage detection record.
- Multiple vehicles/plates in one frame → emit one detection record per plate, each independently matched — don't merge them.
- OCR character confusion specific to Indian plates (0/O, 1/I, state-code prefix variants, non-standard fonts on older vehicles) → normalize before sending (a defined character-substitution table), and always send both raw and normalized text so the backend's fuzzy match has something to work with even if normalization is imperfect.
- Low-light / night footage or motion blur → detection confidence will legitimately drop; don't threshold this out silently — send it through with an honest low confidence score rather than pretending it wasn't seen (this matters for your "every frame logged" forensic-trail claim).
- Camera feed drops mid-stream → the service should report a stream-health/heartbeat status separately from detections, so "no detections" (nothing to see) is distinguishable from "no feed" (camera down) — this is a real operational distinction judges may ask about.
- Frame rate vs. inference speed mismatch (inference slower than incoming frames) → define an explicit frame-sampling strategy (e.g., process every Nth frame) rather than letting a backlog grow unbounded.

---

## 5. Work Package C — Frontend / GIS Dashboard (hand to your frontend-focused AI)

**Stack:** React + Leaflet (Mapbox GL as a later upgrade), consumes Package A's REST API only — no direct DB or ANPR access.

**Screens needed:**
1. **Live map** — camera markers (from `/api/v1/cameras`), color-coded by status (live/offline), clickable for feed preview.
2. **Alert feed** — real-time (poll or websocket) list of matched alerts, each showing plate, camera, timestamp, confidence, and a link to the signed-alert hash for verification.
3. **Search/history view** — filterable by camera, date range, plate (fuzzy search), for the "searchable event history" requirement.
4. **Route reconstruction view** — given a plate, plot its alert locations on the map in time order to show a vehicle's path across cameras.
5. **Watchlist management** — add/remove plates (admin-role only).

**Edge cases to handle explicitly:**
- Empty states: no alerts yet, no cameras registered, search returns zero results — every list/table needs a designed empty state, not a blank screen.
- Low-confidence alerts should be visually distinguished from high-confidence ones (don't let a shaky OCR read look as authoritative as a clean one).
- Map with dense camera clusters at statewide zoom (relevant even at demo scale if cameras are geographically close) → marker clustering, not 50 overlapping pins.
- Auth token expiry mid-session during a live demo → handle silent refresh or a clear re-login prompt, never a hard crash.
- Route reconstruction where a plate has only one alert (no route to draw) → show it as a single point, not an error.

---

## 6. Work Package D — Database Schema (hand to whichever AI is doing backend/DB, can pair with Package A)

**Implemented in this repo under `db/`.** Core tables (Postgres + PostGIS):
- `cameras` (id, department, location GEOGRAPHY(Point), status, onboarded_at)
- `watchlist` (id, plate_normalized, reason, added_by, added_at)
- `detections` (id, camera_id FK, timestamp_camera, timestamp_received, plate_raw, plate_normalized, confidence, frame_ref, matched BOOLEAN)
- `alerts` (id, detection_id FK, plate_matched, alert_hash, signed_at, reviewed BOOLEAN)
- `audit_log` (id, actor, action, target_table, target_id, timestamp, hash_prev) — append-only, each row hash-chained to the previous for tamper evidence

**Edge cases:**
- Index `detections.timestamp_received` and `detections.plate_normalized` — search/history queries will filter on both constantly.
- `audit_log` must never allow UPDATE or DELETE at the DB permission level (revoke those grants for the app's DB role), not just at the application layer — this is what actually makes "append-only" true.
- Foreign key from `detections.camera_id` should not cascade-delete detections if a camera is deregistered — deregister by status flag, never hard-delete a camera with historical detections attached, or you lose forensic history.

---

## 7. Work Package E — Security Layer & OWASP Top 10 (2021) Mapping

**Implemented in `docs/security-architecture.md`.** Summary:

| OWASP Category | Concrete mitigation in Sentinel |
|---|---|
| **A01 Broken Access Control** | RBAC enforced server-side on every endpoint (admin vs. operator vs. read-only roles), not just hidden in the UI. Watchlist writes and audit-log reads are admin-only, checked in Package A middleware, not trusted from the frontend. |
| **A02 Cryptographic Failures** | TLS everywhere (frontend↔backend, backend↔ANPR service). Alert hashes use a proper HMAC with a server-side secret, not a plain hash of public fields alone. JWT secrets rotated, never hardcoded. |
| **A03 Injection** | Parameterized queries only (no string-built SQL) for every DB call, especially the plate search endpoint since it takes free-text input. |
| **A04 Insecure Design** | The signed-alert/append-only-audit design *is* your A04 answer — call this out explicitly in the pitch: tamper-evidence was designed in, not bolted on. |
| **A05 Security Misconfiguration** | No default credentials on Postgres/admin panels; CORS locked to the known frontend origin, not `*`; verbose stack traces disabled outside dev. |
| **A06 Vulnerable & Outdated Components** | Pin dependency versions for YOLO/OCR libs and Node packages; run `npm audit`/`pip-audit` before submission as evidence you checked. |
| **A07 Identification & Authentication Failures** | JWT with reasonable expiry + refresh, password hashing with bcrypt/argon2 for any local accounts, rate-limit the login endpoint. |
| **A08 Software & Data Integrity Failures** | The hash-chained audit log and per-alert signature are your direct answer here — an alert or log entry can't be silently modified without breaking the chain. |
| **A09 Security Logging & Monitoring Failures** | Every auth event, watchlist change, and alert generation writes to `audit_log`; failed login attempts are logged and rate-limited, not just logged. |
| **A10 Server-Side Request Forgery (SSRF)** | Relevant mainly if you build the VAHAN/SARTHI/etc. integration adapters — those outbound calls should go through an allow-listed set of URLs, never a user- or config-supplied arbitrary endpoint. |

Put this table (or a version of it) directly into your Step 5 submission — "OWASP Top 10 mapping" as a named section is exactly the kind of thing government-hackathon judges reward, since it answers the "cybersecurity controls" line from the Model 4 brief directly.

---

## 8. Environment & Repository Strategy — how Antigravity actually reaches everything

The failure mode to avoid: five AI tools each produce working code in their own isolated chat/sandbox, and none of it can talk to each other because there was never one shared place it all lands. Fix this before you start parallelizing, not after.

**8.1 One monorepo, not five repos.**
This repository.

**8.2 Shared config:** `.env.example` at repo root.

**8.3** Each package gets its own Dockerfile; root `docker-compose.yml` currently owns **db + minio**. Backend/ANPR/frontend services are commented stubs for Antigravity to wire.

**8.4–8.6** Copy package output into the matching folder, keep `docs/` read-only, test each package standalone.

---

## 9. Integration Instructions for Antigravity

Once each package above has been built by its respective AI, Antigravity is the right place to wire them together since it can operate across editor/terminal/browser and verify end to end, not just generate code in isolation. Concretely:

1. **Give Antigravity the shared contracts first** — Section 1 (system/logic flow), the API contract in Package B, and the endpoint table in Package A — before asking it to integrate anything. It should treat these as fixed interfaces, not something to redesign.
2. **Integration order:** DB schema (Package D) → Backend API (Package A) → ANPR service wired to backend (Package B ↔ A) → Frontend wired to backend (Package C ↔ A). Verify each connection independently before adding the next — Antigravity's browser-in-the-loop testing is well suited to actually clicking through the frontend against a live backend rather than trusting that the code merely compiles.
3. **Ask Antigravity to write and run integration tests at each boundary**: does a posted detection actually produce a queryable alert; does a watchlist add actually change match behavior on the next detection; does an expired JWT actually get rejected. These map directly to the edge cases listed above — treat that list as your test checklist, not just documentation.
4. **Environment/config alignment:** make sure all packages agree on the same `camera_id` format, timestamp format (use ISO 8601 with timezone everywhere, since camera timestamp vs. server timestamp handling depends on this), and JWT secret/issuer — mismatches here are the most common reason independently-built pieces fail to integrate.
5. **Final verification pass:** run through the Step 4 live-eval scenario end to end (onboard a feed, track a vehicle, generate an alert, see it on the GIS map, search for it in history) inside Antigravity before the actual judged run, so the first time that full path executes isn't in front of judges.

---

## 10. What to Hand to Each AI (quick reference)

- **Backend AI** → Sections 1, 2, 3, 6 (DB schema it depends on), 7 (security it must enforce)
- **ANPR/AI AI** → Sections 1, 2, 4
- **Frontend AI** → Sections 1, 2, 5, plus Package A's endpoint table (Section 3) as its API contract
- **DB/DevOps AI** → Section 6, 7
- **Antigravity (integration)** → this entire document, since it needs every contract to wire the pieces together and verify them

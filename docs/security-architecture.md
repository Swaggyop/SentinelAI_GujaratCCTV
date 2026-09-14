# Sentinel — Security architecture (OWASP Top 10 2021)

Use this as the Model 4 **security architecture document** and as implementation rules for every package. Controls below are **concrete**, not slogans.

**System:** Hybrid / Innovative Architecture — Model 1 (CCTV registry + GIS) as the mandatory spine, plus Model 4 (central VMS & AI) components. Web-facing GIS dashboard + REST API.

---

## Roles

| Role | Can do | Cannot do |
|---|---|---|
| `admin` | Watchlist write, user/camera onboard, audit-log read, alert review | Bypass JWT; raw SQL |
| `operator` | View cameras/alerts/search/route, post nothing to watchlist | `/api/v1/watchlist` writes, `/api/v1/audit-log` |
| `readonly` | GET cameras, alerts, search | Any POST/PATCH except login |

Enforcement is **server-side middleware** on every route (A01). Hidden UI buttons are not access control.

Backend connects to Postgres as `sentinel_app`, never as the bootstrap superuser.

---

## OWASP Top 10 mapping

| ID | Category | Sentinel control |
|---|---|---|
| **A01** | Broken Access Control | JWT + RBAC on every endpoint. Watchlist writes and audit reads are `admin` only. DB role `sentinel_app` cannot DELETE forensic tables or UPDATE/DELETE `audit_log`. Unknown `camera_id` is rejected (FK), not auto-created. |
| **A02** | Cryptographic Failures | TLS in production for browser↔API and API↔ANPR. `ALERT_HMAC_SECRET` HMAC-SHA256 on alerts (`frame_ref\|plate\|timestamp_camera\|camera_id`), not a public SHA of those fields. `JWT_SECRET` from env, 15m access token. Passwords stored with bcrypt (`pgcrypto` / argon2id in app). Secrets never in git; `.env` gitignored. MinIO bucket is private (`anonymous none`). |
| **A03** | Injection | Parameterized queries only. Plate search is bound parameters + `ILIKE`/`pg_trgm` later — never string-concatenated SQL. ANPR `plate_text` is treated as data, not a query. No shell-out with unsanitized camera URLs. |
| **A04** | Insecure Design | Tamper-evidence is designed in: hash-chained `audit_log`, signed alerts, cameras deregistered not deleted, detections kept as forensic log even when unmatched. Threat model: insider altering alerts, ANPR retry storms, stale watchlist cache. Match-time watchlist read (no stream-start cache). |
| **A05** | Security Misconfiguration | No default DB superuser for the app. CORS allowlist = `FRONTEND_ORIGIN`, not `*`. Stack traces off outside `NODE_ENV=development`. Compose Postgres should bind `127.0.0.1` when demoing on a shared LAN. Timescale telemetry off. MinIO root creds from env. |
| **A06** | Vulnerable and Outdated Components | Pin Docker tags (no `latest` for MinIO). Pin npm/pip versions in those packages. Before submission run `npm audit` and `pip-audit` and attach output under `docs/evidence/`. |
| **A07** | Identification and Authentication Failures | Login rate-limited (e.g. 5 / 15 min / IP). bcrypt/argon2 hashes. JWT expiry + refresh. Demo passwords only in `.env.example`. Lock `is_active=false` users. Log failed logins to `audit_log`. |
| **A08** | Software and Data Integrity Failures | `audit_log` chain: `hash_curr = sha256(row + hash_prev)`. UPDATE/DELETE/TRUNCATE rejected by trigger **and** REVOKE. Alert HMAC verified on read for the GIS “verify hash” link. Do not load ANPR models from unsigned URLs. |
| **A09** | Security Logging and Monitoring Failures | Insert `audit_log` for: login success/fail, watchlist add/deactivate, camera status change, alert create/review. Failed auth is logged **and** rate-limited. Heartbeats distinguish camera-down from no-traffic. |
| **A10** | Server-Side Request Forgery | VAHAN/SARTHI/eGujCop/AFIS/NAFIS adapters call **only** `outbound_allowlist.base_url` (`https://` CHECK). Never take a URL from the client or from unconstrained config paste. RTSP pull URLs come from the registry, not from query params. |

---

## DB-enforced controls (DevOps)

These hold even if the Express app is buggy:

1. `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM sentinel_app`
2. Triggers on `audit_log` raise `42501` on UPDATE/DELETE/TRUNCATE
3. Trigger on `cameras` forbids DELETE
4. `detections.camera_id` → `cameras(id) ON DELETE RESTRICT`
5. `outbound_allowlist.base_url` must match `^https://`
6. App is `NOSUPERUSER`

## Application-enforced controls (Backend AI must implement)

1. RBAC middleware; never trust `role` from the request body
2. Parameterized SQL
3. Login rate limit + audit
4. CORS + helmet (CSP, nosniff, frame deny)
5. HMAC for `alerts.alert_hash`
6. Idempotency keys on `POST /api/v1/detections` (service-to-service auth: separate ANPR token, not a user JWT if possible)
7. Allow-list HTTP client for gov adapters

## Frontend-enforced (defense in depth only)

- Do not store JWT in `localStorage` if it can be avoided (memory or httpOnly cookie via backend). If localStorage is used for the demo, document XSS risk and keep a strict CSP.
- Low-confidence alerts visually distinct (does not replace server `confidence` / `match_kind`)
- Re-login on 401; no crash loop

## ANPR-enforced

- ANPR **must not** open DB connections
- ANPR **must not** receive the watchlist (reduces blast radius if the inference host is compromised)
- Frame posts use `ANPR_SERVICE_URL` / backend URL from env; no user-controlled fetch targets

## Edge cases

| Case | Response |
|---|---|
| JWT expired mid-demo | 401 + refresh or re-login; no 500 |
| Operator calls `POST /watchlist` | 403, audit the attempt |
| SQL meta-characters in plate search | Harmless (bound params) |
| ANPR retries same detection | 200 with existing id (idempotent), no duplicate alert |
| Detection for deregistered camera | Reject (FK / status check) |
| Client sends `base_url` for VAHAN | Ignore; use allowlist row only |
| Someone UPDATEs `audit_log` via app pool | Postgres error; surface as 500 with generic message |
| MinIO object public ACL | Forbidden; `mc anonymous set none` |
| Verbose errors in production | Disabled |

## Demo vs production TLS

Compose demo may use HTTP on localhost. Submission text must say: production terminates TLS at ingress (K8s) for UI, API, and MinIO; internal mTLS or mesh is the 80k-camera target, not a different application design.

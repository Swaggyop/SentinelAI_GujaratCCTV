# Sentinel

Gujarat Home Department hackathon platform: **Hybrid / Innovative Architecture** built from **Model 1** (mandatory CCTV registry + GIS) + **Model 4** (central VMS & AI). Same design for the 50-camera demo and the 80k-camera target — fewer instances, not a second architecture.

## Repo layout

```
sentinel/
├── backend/          ← Package A (not in this pass)
├── anpr-service/     ← Package B
├── frontend/         ← Package C
├── db/               ← Package D (this pass)
├── docs/             ← contracts; implementation AIs treat as read-only
├── docker-compose.yml
└── .env.example
```

## Current status

**DB/DevOps (Sections 6–7) is done.** Schema, app role, audit chain, MinIO, OWASP mapping.

Next packages (other AIs): Backend → ANPR → Frontend → Antigravity integration.

## Quick start (database only)

```bash
cp .env.example .env
docker compose up -d db minio minio-init
```

Details: `db/README.md`. Security: `docs/security-architecture.md`.

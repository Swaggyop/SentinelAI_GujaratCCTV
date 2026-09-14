# What to paste into each AI

Give each tool **its package + Sections 1–2 of the system/logic flow**. Do not give it permission to edit `docs/` or another package’s folder.

| AI | Folders it may write | Must read |
|---|---|---|
| **DB/DevOps (done)** | `db/`, root `docker-compose.yml` (db+minio only), `.env.example`, `docs/security-architecture.md` | Handoff §6–7 |
| **Backend** | `backend/` only | Handoff §1–3, `db/README.md`, `docs/db-contract.md`, `docs/security-architecture.md` |
| **ANPR** | `anpr-service/` only | Handoff §1–2, §4, `docs/db-contract.md` |
| **Frontend** | `frontend/` only | Handoff §1–2, §5, endpoint table |
| **Antigravity** | Whole repo | Entire handoff + this repo |

If a tool wants to change a table or JSON field, stop and change `docs/` yourself first.

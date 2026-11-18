# Architecture Planner (application)

A drag-and-drop canvas for designing AWS / Kubernetes architectures, with user accounts and saved diagrams.

| Part | Stack |
|---|---|
| `frontend/` | React, Vite, React Flow; served by nginx, which proxies `/api` to the backend |
| `backend/` | Node.js, Express, JWT login, bcrypt password hashing, PostgreSQL storage |

## API
| Route | Purpose |
|---|---|
| `GET /healthz`, `GET /readyz` | Liveness / readiness probes |
| `GET /api/info` | Service info |
| `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | Authentication |
| `GET/POST/PUT/DELETE /api/diagrams` | Diagram CRUD (per user) |
| `GET /metrics` | Prometheus metrics (`prom-client`, request duration histogram) |

## Local development (no database needed)
```bash
cd backend  && npm install && npm run dev      # http://localhost:3000
cd frontend && npm install && npm run dev      # http://localhost:5173 (proxies /api to :3000)
```
Without `DATABASE_URL` the backend keeps users and diagrams in memory (lost on restart).

## Environment variables (backend)
| Name | Purpose |
|---|---|
| `JWT_SECRET` | Signs login tokens (required in production) |
| `DATABASE_URL` | PostgreSQL connection string; unset = in-memory mode |
| `PORT` | Default 3000 |
| `TRUST_PROXY` | Number of proxies in front of the backend, default 2 (ALB + nginx) |

Tables `users` and `diagrams` are created automatically on start.

## Deployment
The app is deployed to EKS with the Helm charts in `../charts` (see the root README).

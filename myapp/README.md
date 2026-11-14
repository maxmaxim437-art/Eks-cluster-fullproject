# Architecture Planner

Drag-and-drop AWS / Kubernetes architecture canvas with user accounts.

- `frontend/` React + Vite + React Flow, served by nginx (proxies `/api` to the `backend` Service)
- `backend/`  Node + Express, JWT login, bcrypt password hashing. Storage is in-memory unless `DATABASE_URL` is set
- `k8s/app.yaml` Deployments, Services and an ALB Ingress for EKS

## Local dev (no database needed)
    cd backend  && npm install && npm run dev      # :3000
    cd frontend && npm install && npm run dev      # :5173  (proxies /api to :3000)
Open http://localhost:5173, create an account, build a diagram, Save, Export image.
Without `DATABASE_URL`, accounts and diagrams live in memory and disappear when the backend restarts.

## Environment variables (backend)
| Name | Purpose |
|---|---|
| `JWT_SECRET` | Signs login tokens. Required in production (random per start if unset) |
| `DATABASE_URL` | PostgreSQL connection string. Unset = in-memory mode |
| `PORT` | Default 3000 |
| `TRUST_PROXY` | Number of proxies in front of the backend, default 2 (ALB + nginx) |

## EKS
    kubectl create secret generic arch-auth --from-literal=jwt="$(openssl rand -hex 32)"
    kubectl apply -f k8s/app.yaml

## Adding the database later (Bitnami PostgreSQL)
    helm install postgres oci://registry-1.docker.io/bitnamicharts/postgresql --set auth.database=archdb
    kubectl create secret generic arch-db --from-literal=url='postgresql://postgres:<PASSWORD>@postgres-postgresql:5432/archdb'
Uncomment the `DATABASE_URL` block in `k8s/app.yaml` and re-apply. Tables `users` and `diagrams` are created automatically.

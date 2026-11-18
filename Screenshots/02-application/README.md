# 02 - The application running on EKS

Screenshots were taken through `kubectl port-forward svc/frontend 8888:80`. The browser talks to the frontend (nginx) in EKS; nginx proxies `/api/` to the backend, which stores data in PostgreSQL.

| File | What it shows |
|---|---|
| `login-register.png` | The register / sign-in screen. Registering writes a user to PostgreSQL; tokens are signed with a JWT secret delivered from AWS Secrets Manager. |
| `architecture-editor.png` | The editor after signing in: a VPC with an EC2 instance and an RDS database. Confirms the full chain (frontend, backend, database) works. |

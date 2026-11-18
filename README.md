# EKS Production Stack - Architecture Planner

A production-style Kubernetes platform on **AWS EKS**, built entirely as code and used to run a
three-tier web app (React + Node.js/Express + PostgreSQL).
Everything was deployed, tested and destroyed on a real AWS account (region `eu-central-1`, 18 Nov 2026).
Evidence is in [`Screenshots/`](Screenshots).

## Architecture

```
Internet -> ALB (AWS Load Balancer Controller, Ingress class alb)
              -> frontend (nginx, 2+ pods, HPA)
                   -> /api -> backend (Node/Express, 2+ pods, HPA)
                                 -> PostgreSQL (Bitnami chart, PVC on gp3, dedicated DB node)
Secrets:   AWS Secrets Manager -> External Secrets Operator -> Kubernetes Secrets
Scaling:   HPA / VPA (pods)  +  Karpenter (nodes)
Monitoring: Prometheus + Grafana + Alertmanager rules (kube-prometheus-stack)
Backups:   CronJob -> pg_dump -> S3 (versioned, encrypted, lifecycle 30/60/90 days)
DNS:       ExternalDNS -> Route53 (enabled by setting your domain in environments/default.yaml)
```

- **Cluster:** EKS 1.35, two managed node groups: `app-nodes` (`role=app`) and `db-nodes`
  (`role=db`, tainted `workload=database:NoSchedule`, single AZ for the EBS volume). Karpenter adds
  extra app/db capacity on demand.
- **Auth to AWS:** IRSA (IAM Roles for Service Accounts) - one IAM role per tool, no access keys in pods.
- **Images:** ECR repositories `arch-planner/frontend` and `arch-planner/backend`.

## Repository layout

| Path | Contents |
|---|---|
| `terraform/` | VPC, EKS, node groups, OIDC/IRSA roles, Karpenter (IAM, SQS, EventBridge), ECR, S3 backup bucket, Secrets Manager, Route53 |
| `charts/frontend`, `charts/backend` | Helm charts for the app (Deployment, Service, Ingress, HPA, ServiceMonitor, dashboards) |
| `charts/database` | Wrapper around the Bitnami PostgreSQL chart + backup CronJob + monitoring |
| `charts/platform` | ExternalSecrets, ClusterSecretStore, PrometheusRules (alerts), Karpenter NodePools/EC2NodeClass |
| `helmfile.yaml`, `environments/`, `values/` | One declarative file for all releases, with `default` and `staging` environments |
| `scripts/` | `update-helmfile-env.py`, `push-images.sh`, `pre-destroy.sh` |
| `myapp/` | Application source code (see [`myapp/README.md`](myapp/README.md)) |
| `Screenshots/` | Proof of every test, with an explanation per folder |

## Prerequisites

AWS account (paid plan - the Free plan blocks the required EC2 instance types), AWS CLI, Terraform >= 1.5,
kubectl, Helm 3, Helmfile (+ `helm-diff`), Docker, Python 3.
Credentials must be long-lived (IAM user access key); temporary `aws login` credentials expired in the middle of `terraform apply`.

## Deploy

```bash
# 1. Infrastructure
cd terraform
cp terraform.tfvars.example terraform.tfvars      # edit values
terraform init && terraform apply
cd ..

# 2. kubeconfig
aws eks update-kubeconfig --region eu-central-1 --name <cluster_name>

# 3. gp3 StorageClass (needed before Prometheus and the database)
kubectl apply -f - <<'YAML'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: {name: gp3, annotations: {storageclass.kubernetes.io/is-default-class: "true"}}
provisioner: ebs.csi.aws.com
parameters: {type: gp3, encrypted: "true"}
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
YAML

# 4. Feed Terraform outputs (role ARNs, VPC id, bucket...) into the Helmfile environment
python3 scripts/update-helmfile-env.py

# 5. Build and push images to ECR
./scripts/push-images.sh v1.0.0

# 6. Grafana admin secret (never stored in Git)
kubectl create ns monitoring
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user=admin --from-literal=admin-password='<choose one>'

# 7. Install the releases in dependency order
#    (operators that provide CRDs first, then the charts that use them)
helmfile -l name=kube-prometheus-stack sync --skip-needs
helmfile -l name=external-secrets      sync --skip-needs
helmfile -l name=aws-load-balancer-controller sync --skip-needs
helmfile -l name=vpa                   sync --skip-needs
helmfile -l name=karpenter             sync --skip-needs
helmfile -l name=platform              sync --skip-needs   # ExternalSecrets, alerts, NodePools
helmfile -l name=database              sync --skip-needs
helmfile -l name=backend               sync --skip-needs
helmfile -l name=frontend              sync --skip-needs
```

Get the public address: `kubectl -n production get ingress frontend`.
Without a domain, use `kubectl -n production port-forward svc/frontend 8888:80`.

## Tests performed

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Delete a backend pod | New pod created, no downtime | [04](Screenshots/04-test-pod-failure) |
| 2 | Scale backend to 0 | `BackendDown` fires (after fixing the rule with `absent()`) | [05](Screenshots/05-test-backend-alert) |
| 3 | Load generator | HPA scales backend 2 -> 7, frontend 2 -> 3 | [06](Screenshots/06-test-hpa-load) |
| 4 | Unschedulable pods | Karpenter creates 2 x `c5a.large`, removes them afterwards | [07](Screenshots/07-test-karpenter-scaling) |
| 5 | Database backup | CronJob dumps PostgreSQL and uploads it to S3 via IRSA | [08](Screenshots/08-test-database-backup) |

Infrastructure, application and monitoring screenshots: [01](Screenshots/01-aws-infrastructure),
[02](Screenshots/02-application), [03](Screenshots/03-monitoring).

## Tear down

```bash
./scripts/pre-destroy.sh        # removes Helm releases, Karpenter nodes, PVCs, load balancers
cd terraform && terraform destroy
```

Order matters: the ALB must be gone *before* the Load Balancer Controller is removed, otherwise the ALB's
target group and security groups are left behind and block VPC deletion (they had to be deleted by hand once).
After destroying, check the console for leftover load balancers, EBS volumes, ENIs and security groups.

## Estimated cost (while running)

About **$0.43/hour (~$330/month)**. These are estimates (EC2 prices from public price lists, other items approximate).

| Item | Approx. per month |
|---|---|
| EKS control plane | $73 |
| 2 x t3.large app nodes + 1 x t3.medium db node | ~$190 |
| NAT gateway | ~$35 |
| ALB | ~$20 |
| EBS, S3, Secrets Manager, data transfer | ~$10 |
| Karpenter nodes | only while scaled up |

Destroy the stack when not in use.

## Lessons learned

- The AWS **Free plan blocks most EC2 instance types** -> node groups ended in `CREATE_FAILED`. Upgrade the account, then `terraform apply -replace=<node group>` (Terraform did not detect the failed state by itself).
- **Temporary credentials expire** during a long apply; use an IAM user access key (and delete it afterwards).
- `up == 0` never fires when all pods are gone, because the series disappears. Use `... or absent(...)`. `DatabaseDown` (`pg_up == 0`) has the same limitation.
- Install the **gp3 StorageClass before** Prometheus and the database, so their PVCs bind.
- Destroy order: Ingress -> wait for the ALB to disappear -> then the controller -> then `terraform destroy`.
- On WSL, switching networks can drop connectivity; `wsl --shutdown` fixed it.

## Security notes

- No secrets in Git: DB credentials and the JWT secret live in AWS Secrets Manager and reach the pods through External Secrets; Grafana's password is a manually created Secret.
- `terraform.tfstate`, `terraform.tfvars` and plan files are git-ignored (state and plans contain generated secrets).
- The AWS account ID appears in `environments/default.yaml`; it is not a credential. All resources it refers to were destroyed.
- The backend is not exposed through the ALB (its Ingress is disabled); only the frontend is public.

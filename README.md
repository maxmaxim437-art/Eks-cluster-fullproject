# EKS Production-Style Platform – Architecture Planner

A production-style, three-tier Kubernetes platform running on **Amazon EKS**, built using Infrastructure as Code and deployed on a real AWS account.

The platform runs a web application consisting of:

- **Frontend:** React served through Nginx
- **Backend:** Node.js / Express
- **Database:** PostgreSQL

The infrastructure was deployed, tested, and destroyed on AWS in the `eu-central-1` region 

Screenshots and test evidence are available in the [`Screenshots/`](Screenshots) directory.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Infrastructure Design](#infrastructure-design)
- [Security and IAM](#security-and-iam)
- [Monitoring and Alerting](#monitoring-and-alerting)
- [Database Backups](#database-backups)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Deployment Guide](#deployment-guide)
- [Validation and Testing](#validation-and-testing)
- [Teardown](#teardown)
- [Estimated Costs](#estimated-costs)
- [Lessons Learned](#lessons-learned)
- [Security Considerations](#security-considerations)
- [Known Limitations and Future Improvements](#known-limitations-and-future-improvements)

---

## Architecture Overview

The platform follows a three-tier architecture with automated scaling, monitoring, secrets management, and database backups.

```text
                         INTERNET
                            |
                            v
                  AWS Application Load Balancer
                  (AWS Load Balancer Controller)
                            |
                            v
                    FRONTEND - NGINX
                     React Application
                       2+ Pods
                         HPA
                            |
                       /api routing
                            |
                            v
                    BACKEND - NODE.JS
                     Express API
                       2+ Pods
                         HPA
                            |
                            v
                       POSTGRESQL
                    Bitnami Helm Chart
                         PVC / gp3
                      Dedicated DB Node


   SECRETS MANAGEMENT
   AWS Secrets Manager
            |
            v
   External Secrets Operator
            |
            v
   Kubernetes Secrets


   AUTOSCALING
   HPA / VPA  -->  Pod Scaling and Resource Management
   Karpenter  -->  EC2 Node Provisioning


   MONITORING
   Prometheus --> Grafana
        |
        v
   Alertmanager Rules


   DATABASE BACKUPS
   Kubernetes CronJob
        |
        v
      pg_dump
        |
        v
   Amazon S3


   DNS
   ExternalDNS --> Route53 --> ALB
```

### Request Flow

1. A user accesses the application through its public endpoint.
2. The AWS Application Load Balancer receives incoming HTTP/HTTPS traffic.
3. The ALB forwards requests to the frontend Kubernetes Service.
4. Nginx serves the React application and routes `/api` requests to the backend.
5. The Node.js backend processes API requests and communicates with PostgreSQL.
6. PostgreSQL returns the requested data to the backend.
7. The backend response is returned to the frontend and displayed to the user.

The backend is not exposed directly through a public Ingress. Only the frontend is publicly accessible.

---

## Technology Stack

| Category | Technology | Purpose |
|---|---|---|
| Cloud Provider | AWS | Cloud infrastructure |
| Kubernetes | Amazon EKS 1.35 | Container orchestration |
| Infrastructure as Code | Terraform | Provisioning AWS resources |
| Package Management | Helm 3 | Kubernetes application deployment |
| Release Management | Helmfile | Managing multiple Helm releases |
| Containers | Docker | Building application images |
| Container Registry | Amazon ECR | Storing application images |
| Frontend | React + Nginx | Web interface |
| Backend | Node.js + Express | Application API |
| Database | PostgreSQL | Persistent application data |
| Load Balancing | AWS Load Balancer Controller | ALB provisioning and management |
| Autoscaling | HPA / VPA | Pod scaling and resource management |
| Node Autoscaling | Karpenter | Dynamic EC2 provisioning |
| Secrets | AWS Secrets Manager | Centralized secrets storage |
| Secrets Integration | External Secrets Operator | Synchronizing AWS secrets to Kubernetes |
| Monitoring | Prometheus | Metrics collection |
| Dashboards | Grafana | Metrics visualization |
| Alerting | Alertmanager | Alert management |
| Storage | Amazon EBS gp3 | Persistent Kubernetes volumes |
| Backups | CronJob + pg_dump + S3 | Automated database backups |
| DNS | ExternalDNS + Route53 | Automated DNS record management |

---

## Infrastructure Design

### 1. Amazon EKS

The Kubernetes cluster runs EKS version `1.35` in `eu-central-1`.

The cluster uses two managed node groups:

| Node Group | Label | Responsibility |
|---|---|---|
| `app-nodes` | `role=app` | Frontend and backend workloads |
| `db-nodes` | `role=db` | PostgreSQL workload |

The database node group uses the following taint:

```text
workload=database:NoSchedule
```

This prevents workloads without a matching toleration from being scheduled on database nodes.

The database workload is configured to use a dedicated node group and a single Availability Zone for compatibility with its EBS volume.

### 2. Karpenter

Karpenter provides additional EC2 capacity when existing nodes cannot accommodate pending workloads.

The platform includes:

- Karpenter IAM permissions.
- SQS interruption queue.
- EventBridge integrations.
- NodePools.
- EC2NodeClass resources.

Karpenter provisions additional application and database capacity according to scheduling requirements and the configured NodePools.

It can also consolidate and remove unnecessary nodes when conditions permit.

### 3. Application Load Balancer

The AWS Load Balancer Controller manages AWS Application Load Balancers through Kubernetes Ingress resources.

The frontend Ingress uses:

```yaml
ingressClassName: alb
```

The backend does not have a public Ingress.

### 4. Persistent Storage

The platform uses Amazon EBS gp3 volumes through the EBS CSI Driver.

The `gp3` StorageClass is created before installing Prometheus and PostgreSQL because these components require persistent storage during deployment.

Configuration includes:

- Encrypted EBS volumes.
- `WaitForFirstConsumer` volume binding.
- Volume expansion support.
- Default StorageClass annotation.

The database volume is associated with a single Availability Zone.

---

## Security and IAM

### IRSA – IAM Roles for Service Accounts

The platform uses IAM Roles for Service Accounts (IRSA) to provide AWS permissions to Kubernetes workloads.

Each integration receives an IAM role with permissions appropriate to its responsibility.

Examples:

| Component | AWS Access |
|---|---|
| External Secrets Operator | Read secrets from AWS Secrets Manager |
| Karpenter | Manage EC2 capacity and related resources |
| Backup Job | Upload database backups to S3 |

This avoids embedding long-lived AWS access keys inside application containers.

### Secrets Management

Application secrets are stored in AWS Secrets Manager.

External Secrets Operator retrieves the configured secrets and synchronizes them into Kubernetes Secrets.

The application consumes the resulting Kubernetes Secrets.

The Grafana administrator password is created separately as a Kubernetes Secret and is never stored in Git.

---

## Monitoring and Alerting

Monitoring is implemented using `kube-prometheus-stack`.

The platform includes:

- Prometheus
- Grafana
- Alertmanager
- Prometheus Operator
- PrometheusRules
- ServiceMonitors

Prometheus collects application and Kubernetes metrics.

Grafana provides dashboards for visualizing system health and resource utilization.

Alerting rules monitor critical application and database conditions.

### Custom Availability Alerts

Two important alerts are configured:

- `BackendDown`
- `DatabaseDown`

An important issue was discovered during testing.

The original Backend alert used:

```promql
up{job="backend"} == 0
```

However, when all backend Pods were removed, the corresponding Prometheus target disappeared entirely. As a result, the `up` metric was no longer present.

The alert was updated to:

```promql
(up{job="backend"} == 0)
or
absent(up{job="backend"})
```

This handles both situations:

1. The target exists but Prometheus cannot scrape it.
2. The target disappears completely.

The same missing-series consideration was applied to the database availability alert.

The updated BackendDown rule was tested successfully and transitioned through `PENDING` to `FIRING`.

---

## Database Backups

PostgreSQL backups are automated using a Kubernetes CronJob.

The backup workflow:

1. Kubernetes schedules a backup Job.
2. The Job executes `pg_dump`.
3. The resulting dump is uploaded to Amazon S3.
4. The Job authenticates to AWS using IRSA.

The S3 bucket is configured with:

- Versioning.
- Encryption.
- Lifecycle management.
- Retention transitions and expiration policies configured for 30/60/90-day periods.

The backup workflow was tested by verifying that PostgreSQL dump files were uploaded to S3.

A separate restore test is recommended as an additional production-readiness validation.

---

## DNS Management

ExternalDNS integrates Kubernetes with Amazon Route53.

When a domain is configured in:

```text
environments/default.yaml
```

ExternalDNS can manage the corresponding DNS records based on the configured Kubernetes resources and permissions.

The intended request path becomes:

```text
Domain
  |
  v
Route53
  |
  v
Application Load Balancer
  |
  v
Frontend Service
```

Without a configured domain, the application can still be accessed using the ALB endpoint.

---

## Repository Structure

```text
.
├── terraform/
│   ├── VPC
│   ├── EKS
│   ├── Node Groups
│   ├── IAM / IRSA
│   ├── Karpenter
│   ├── ECR
│   ├── S3
│   ├── Secrets Manager
│   └── Route53
│
├── charts/
│   ├── frontend/
│   ├── backend/
│   ├── database/
│   └── platform/
│
├── environments/
│   ├── default.yaml
│   └── staging.yaml
│
├── values/
│
├── helmfile.yaml
│
├── scripts/
│   ├── update-helmfile-env.py
│   ├── push-images.sh
│   └── pre-destroy.sh
│
├── myapp/
│   ├── frontend/
│   ├── backend/
│   └── README.md
│
└── Screenshots/
    ├── 01-aws-infrastructure/
    ├── 02-application/
    ├── 03-monitoring/
    ├── 04-test-pod-failure/
    ├── 05-test-backend-alert/
    ├── 06-test-hpa-load/
    ├── 07-test-karpenter-scaling/
    └── 08-test-database-backup/
```

### Repository Responsibilities

| Directory | Responsibility |
|---|---|
| `terraform/` | AWS infrastructure provisioning |
| `charts/frontend/` | Frontend Deployment, Service, Ingress and scaling |
| `charts/backend/` | Backend Deployment, Service, scaling and monitoring |
| `charts/database/` | PostgreSQL deployment and backup resources |
| `charts/platform/` | External Secrets, alert rules and Karpenter configuration |
| `environments/` | Environment-specific configuration |
| `values/` | Helm values |
| `scripts/` | Deployment, image publishing and teardown automation |
| `myapp/` | Application source code |
| `Screenshots/` | Deployment and testing evidence |

---

## Prerequisites

The following tools are required:

- AWS account with permissions to create the required resources.
- AWS CLI.
- Terraform >= 1.5.
- kubectl.
- Helm 3.
- Helmfile.
- helm-diff plugin.
- Docker.
- Python 3.

The AWS account must support the EC2 instance types used by the node groups.

**AWS Authentication**

The original deployment used an IAM access key configured through AWS CLI because the temporary credentials obtained through `aws login` expired during a long Terraform operation.

For new deployments, AWS IAM Identity Center with renewable temporary credentials is preferred over long-lived IAM user access keys.

Verify your active identity before deployment:

```bash
aws sts get-caller-identity
```

---

## Deployment Guide

### Step 1 – Provision AWS Infrastructure

Navigate to the Terraform directory:

```bash
cd terraform
```

Create the variables file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit the configuration according to your environment.

Initialize Terraform and deploy:

```bash
terraform init
terraform plan
terraform apply
```

Terraform provisions the AWS infrastructure, including the VPC, EKS cluster, node groups, IAM roles, ECR repositories, S3 backup bucket and supporting resources.

### Step 2 – Configure kubectl

Connect kubectl to the newly created EKS cluster:

```bash
aws eks update-kubeconfig \
  --region eu-central-1 \
  --name <cluster_name>
```

Verify cluster access:

```bash
kubectl get nodes
```

### Step 3 – Create the gp3 StorageClass

The StorageClass must exist before Prometheus and PostgreSQL are installed.

```bash
kubectl apply -f - <<'YAML'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
YAML
```

Verify:

```bash
kubectl get storageclass
```

### Step 4 – Configure Helmfile Environment

Populate the Helmfile environment with Terraform outputs:

```bash
cd ..
python3 scripts/update-helmfile-env.py
```

This script transfers infrastructure outputs, such as IAM role ARNs, VPC ID and S3 bucket information, into the Helmfile environment configuration.

### Step 5 – Build and Push Application Images

Build and publish the application images to Amazon ECR:

```bash
./scripts/push-images.sh v1.0.0
```

The script handles the image build and registry publishing workflow.

### Step 6 – Create Grafana Administrator Secret

Create the monitoring namespace:

```bash
kubectl create namespace monitoring
```

Create the Grafana administrator Secret:

```bash
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='<choose-a-strong-password>'
```

Do not commit this password to Git.

### Step 7 – Install Helm Releases

The releases must be installed in dependency order because some components provide CRDs required by other charts.

Install the releases:

```bash
helmfile -l name=kube-prometheus-stack sync --skip-needs

helmfile -l name=external-secrets sync --skip-needs

helmfile -l name=aws-load-balancer-controller sync --skip-needs

helmfile -l name=vpa sync --skip-needs

helmfile -l name=karpenter sync --skip-needs

helmfile -l name=platform sync --skip-needs

helmfile -l name=database sync --skip-needs

helmfile -l name=backend sync --skip-needs

helmfile -l name=frontend sync --skip-needs
```

The installation order ensures that required operators and their CRDs are available before dependent resources are deployed.

### Step 8 – Verify Deployment

Check the application namespace:

```bash
kubectl get pods -n production
kubectl get services -n production
kubectl get ingress -n production
```

Check monitoring:

```bash
kubectl get pods -n monitoring
```

Check autoscaling:

```bash
kubectl get hpa -A
kubectl get nodes
```

Check Karpenter resources:

```bash
kubectl get nodepools
kubectl get ec2nodeclasses
```

### Step 9 – Access the Application

Retrieve the frontend Ingress:

```bash
kubectl -n production get ingress frontend
```

When a domain is configured, access the application through the configured DNS record.

Without a domain, port-forwarding can be used for local testing:

```bash
kubectl -n production port-forward svc/frontend 8888:80
```

Open:

```text
http://localhost:8888
```

---

## Validation and Testing

The platform was tested using real AWS infrastructure.

The following tests were performed:

| # | Test | Expected / Observed Result | Evidence |
|---|---|---|---|
| 1 | Delete a backend Pod | Kubernetes recreates the Pod; application remains available during the test | [04 – Pod Failure](Screenshots/04-test-pod-failure) |
| 2 | Scale backend to zero | BackendDown alert transitions to FIRING | [05 – Backend Alert](Screenshots/05-test-backend-alert) |
| 3 | Generate application load | Backend HPA scales from 2 to 7 Pods; frontend scales from 2 to 3 | [06 – HPA Load](Screenshots/06-test-hpa-load) |
| 4 | Create unschedulable Pods | Karpenter provisions two `c5a.large` instances and removes them when no longer needed | [07 – Karpenter Scaling](Screenshots/07-test-karpenter-scaling) |
| 5 | Execute database backup | CronJob runs `pg_dump` and uploads the backup to S3 using IRSA | [08 – Database Backup](Screenshots/08-test-database-backup) |

Additional evidence:

- [AWS Infrastructure](Screenshots/01-aws-infrastructure)
- [Application](Screenshots/02-application)
- [Monitoring](Screenshots/03-monitoring)

All test evidence includes screenshots documenting the relevant operations and results.

---

## Teardown

Destroying the environment requires a specific order because Kubernetes controllers can dynamically create AWS resources.

Run the pre-destroy script:

```bash
./scripts/pre-destroy.sh
```

The intended teardown sequence is:

1. Remove application and platform Helm releases.
2. Remove the Ingress resources.
3. Wait for the AWS Load Balancer Controller to delete the associated ALBs.
4. Remove the Load Balancer Controller.
5. Handle Karpenter-managed nodes and persistent storage.
6. Perform the remaining cleanup.
7. Destroy Terraform-managed infrastructure.

Then run:

```bash
cd terraform
terraform destroy
```

### Important: ALB Cleanup

The AWS Load Balancer Controller manages ALBs, Target Groups and related resources created from Kubernetes Ingress objects.

Removing the controller before deleting the Ingress can leave AWS resources behind.

This happened during the original teardown and required manual cleanup of the remaining Target Groups and Security Groups.

The teardown script was subsequently rewritten to enforce the correct deletion order.

**Important:** The revised script has not yet been validated against a live cluster. Verify its behavior before relying on it for another production-like teardown.

After destruction, check the AWS Console for leftover resources:

- Load Balancers.
- Target Groups.
- EBS Volumes.
- Elastic Network Interfaces.
- Security Groups.
- Other billable resources.

---

## Estimated Costs

The following figures are approximate estimates for a running environment, not a guaranteed AWS bill.

| Resource | Estimated Monthly Cost |
|---|---:|
| EKS Control Plane | $73 |
| 2 × t3.large application nodes + 1 × t3.medium database node | ~$190 |
| NAT Gateway | ~$35 |
| Application Load Balancer | ~$20 |
| EBS, S3, Secrets Manager and data transfer | ~$10 |
| Karpenter-managed nodes | Variable |

**Estimated total: approximately $328/month (~$0.45/hour).**

Actual costs depend on usage, data transfer, storage, instance availability, region pricing and additional resources.

Karpenter can increase costs when additional EC2 capacity is provisioned.

The infrastructure should be destroyed when it is not in use.

---

## Lessons Learned

The project involved several real-world infrastructure and operational challenges.

### 1. Prometheus Missing Metrics

The original `up == 0` alert did not detect the complete disappearance of all backend Pods.

The solution was to use `absent()` to detect missing metric series.

The same consideration was applied to the database alert.

### 2. StorageClass Dependency

The gp3 StorageClass was initially defined inside a Helm chart that was installed after Prometheus and the database.

It was moved to a separate prerequisite step so persistent storage could be provisioned before those components were deployed.

### 3. AWS Credentials

Temporary AWS credentials expired during a long Terraform deployment.

The original deployment was completed using IAM access keys configured through AWS CLI.

For future deployments, renewable temporary credentials are recommended.

### 4. EC2 Instance Restrictions

The AWS account initially blocked the required EC2 instance types under its Free plan.

After upgrading the account, the failed node groups required replacement:

```bash
terraform apply -replace=<node_group_resource_address>
```

### 5. CoreDNS Scheduling

CoreDNS remained Pending while the managed node groups were still being provisioned.

Once worker nodes became available, CoreDNS could be scheduled successfully.

### 6. ALB Teardown Dependencies

Removing the AWS Load Balancer Controller before deleting the Ingress left AWS resources behind.

The teardown sequence was redesigned to remove Ingress resources first and wait for ALB deletion.

### 7. WSL Connectivity

Switching networks caused WSL connectivity problems during infrastructure operations.

Running `wsl --shutdown` and restarting the environment restored connectivity.

---

## Security Considerations

Security decisions implemented in the project:

- No application credentials committed to Git.
- Database credentials and JWT secrets stored in AWS Secrets Manager.
- External Secrets Operator used to synchronize application secrets.
- IRSA used for workload-level AWS permissions.
- Grafana credentials stored in a Kubernetes Secret.
- Terraform state, variable files and plan files excluded through `.gitignore`.
- Backend is not exposed through a public Ingress.
- EBS gp3 volumes configured with encryption.

Additional production hardening recommendations:

- Use AWS IAM Identity Center or another renewable credential mechanism for operator access.
- Enable and verify encryption at rest for Kubernetes Secrets.
- Restrict Kubernetes RBAC permissions.
- Protect Terraform state using a secure remote backend with appropriate access controls.
- Review IAM policies regularly using least-privilege principles.

---

## Known Limitations and Future Improvements

Although the platform demonstrates several production-style infrastructure patterns, some areas can be improved further.

| Area | Current Design | Potential Improvement |
|---|---|---|
| Database Availability | PostgreSQL on a dedicated node group in a single AZ | Multi-AZ database architecture or Amazon RDS Multi-AZ |
| Backup Validation | Automated `pg_dump` upload to S3 | Automated restore and recovery testing |
| Credentials | Original deployment used IAM access keys | Renewable temporary credentials |
| Autoscaling | HPA and VPA configured | Further validate resource recommendations and scaling interactions |
| Disaster Recovery | S3 backups and infrastructure code | Documented recovery procedures and tested RPO/RTO |
| Teardown | Updated cleanup script | Validate the complete teardown against a live cluster |
| Cost Optimization | Fixed baseline node groups and Karpenter | Further resource tuning and cost monitoring |

These improvements would bring the platform closer to the operational requirements of a real production environment.

---

## Project Summary

This project demonstrates practical experience with:

- Designing and provisioning AWS infrastructure using Terraform.
- Deploying and managing Kubernetes workloads on Amazon EKS.
- Managing multiple Helm releases using Helmfile.
- Building and publishing Docker images to Amazon ECR.
- Implementing application and infrastructure autoscaling.
- Managing AWS permissions through IRSA.
- Integrating AWS Secrets Manager with Kubernetes.
- Monitoring workloads with Prometheus and Grafana.
- Configuring application and database alerts.
- Automating PostgreSQL backups to Amazon S3.
- Troubleshooting real infrastructure failures.
- Managing infrastructure lifecycle and teardown dependencies.

**The main objective was not simply to deploy an application, but to build, operate, test and safely tear down a complete cloud-native platform using Infrastructure as Code.**

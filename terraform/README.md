# Terraform - AWS infrastructure

Creates everything the cluster needs (default region `eu-central-1`, about 90 resources):

| File | Resources |
|---|---|
| `vpc.tf` | VPC, public and private subnets across 2 AZs, single NAT gateway |
| `eks.tf`, `node-groups.tf` | EKS 1.35 control plane; managed node groups `app-nodes` (`role=app`) and `db-nodes` (`role=db`, tainted, single AZ) |
| `addons.tf` | vpc-cni, kube-proxy, CoreDNS, EBS CSI driver |
| `irsa.tf`, `modules/irsa` | OIDC provider and one IAM role per in-cluster tool (IRSA) |
| `karpenter.tf` | Karpenter node role, controller role, SQS interruption queue, EventBridge rules |
| `ecr.tf` | ECR repositories `arch-planner/frontend` and `arch-planner/backend` |
| `s3-backup.tf` | Backup bucket: versioning, encryption, lifecycle 30/60/90 days |
| `secrets.tf` | Secrets Manager: `db-credentials` and `jwt-secret` (random values) |
| `route53.tf` | Optional hosted zone for ExternalDNS |

## Usage
```bash
aws configure                       # use an IAM user access key (temporary credentials can expire mid-apply)
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform validate
terraform plan
terraform apply                     # ~15-20 minutes, the EKS control plane is the slow part
$(terraform output -raw configure_kubectl)
cd .. && python3 scripts/update-helmfile-env.py     # writes the outputs into environments/default.yaml
./scripts/push-images.sh v1.0.0                     # builds and pushes the images to ECR
```

## Destroy
```bash
./scripts/pre-destroy.sh            # removes Ingress/ALB, Helm releases, Karpenter nodes, PVCs, target groups
cd terraform && terraform destroy
```

## Notes
* The AWS Free plan blocks the EC2 instance types used by the node groups; use a paid plan.
* Generated secrets (DB password, JWT secret) are stored in `terraform.tfstate`; keep the state private (it is git-ignored). Use a remote backend (S3 + DynamoDB lock) for team work.
* One NAT gateway keeps the cost down; it is not highly available.
* The DB node group lives in one AZ because EBS volumes are AZ-bound.
* ECR repository names are `<cluster_name>/frontend|backend` and `values/*.gotmpl` use `arch-planner/...`; keep the default `cluster_name` or update them.

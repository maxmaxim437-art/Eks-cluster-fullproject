# 01 - AWS infrastructure

Created by Terraform (87 resources) and by controllers running in the cluster.

| File | What it shows |
|---|---|
| `vpc.png` | `arch-planner-vpc` with public subnets (ALB, NAT gateway) and private subnets (all nodes). |
| `iam-roles.png` | The project IAM roles: cluster and node roles, plus one role per in-cluster tool (Karpenter, AWS Load Balancer Controller, External Secrets, ExternalDNS, DB backup, EBS CSI). Each role is bound to a single Kubernetes ServiceAccount (IRSA), so no access keys exist in the Pods. |
| `load-balancer.png` | The internet-facing ALB, `Active` across 2 availability zones, created automatically by the AWS Load Balancer Controller from the frontend Ingress. |

**Result:** the infrastructure is fully defined as code; the ALB is the only public entry point.

# Screenshots

Evidence from a real deployment of the stack (region `eu-central-1`, 18 Nov 2026).
Each folder has a `README.md` describing what was done, what each image shows and the result.

| Folder | Topic |
|---|---|
| [01-aws-infrastructure](01-aws-infrastructure) | Infrastructure created by Terraform: VPC, IAM roles, load balancer |
| [02-application](02-application) | The application running on EKS |
| [03-monitoring](03-monitoring) | Prometheus targets and Grafana dashboards |
| [04-test-pod-failure](04-test-pod-failure) | Test: self-healing after a Pod is deleted |
| [05-test-backend-alert](05-test-backend-alert) | Test: `BackendDown` alert fires when the backend is gone |
| [06-test-hpa-load](06-test-hpa-load) | Test: HPA scales Pods under load |
| [07-test-karpenter-scaling](07-test-karpenter-scaling) | Test: Karpenter adds and removes nodes |
| [08-test-database-backup](08-test-database-backup) | Test: database backup to S3 |

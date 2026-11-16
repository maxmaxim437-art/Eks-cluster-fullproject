#!/usr/bin/env bash
# Run BEFORE "terraform destroy". Terraform does not know about things created from inside the cluster
# (the ALB behind the Ingress, Karpenter nodes, EBS volumes, Route53 records). If they are left over,
# destroy hangs on the VPC ("DependencyViolation") or you keep paying for them.
set -uo pipefail

echo "1/4 helmfile destroy (removes Ingress -> ALB, Karpenter, releases)"
helmfile destroy || true

echo "2/4 delete Karpenter nodes"
kubectl delete nodeclaims --all --wait=true --timeout=300s 2>/dev/null || true

echo "3/4 delete PVCs (releases the EBS volumes)"
kubectl delete pvc --all -A --wait=true --timeout=300s 2>/dev/null || true

echo "4/4 waiting for the load balancers to disappear"
for i in $(seq 1 30); do
  n=$(aws elbv2 describe-load-balancers --query "length(LoadBalancers[?contains(LoadBalancerName, 'k8s-')])" --output text 2>/dev/null || echo 0)
  [ "$n" = "0" ] && break
  echo "  still $n load balancer(s)..."; sleep 10
done
echo "Done. Now: cd terraform && terraform destroy"

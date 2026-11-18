#!/usr/bin/env bash
# Run BEFORE "terraform destroy".
#
# Terraform does not know about resources that were created from inside the cluster:
# the ALB behind the Ingress (plus its target groups and security groups), Karpenter nodes
# and EBS volumes. If they are left over, "terraform destroy" hangs on the VPC
# (DependencyViolation) or you keep paying for them.
#
# Order matters: the Ingress (and therefore the ALB) must be deleted while the
# AWS Load Balancer Controller is still running, otherwise the ALB is orphaned.
set -euo pipefail

CLUSTER="${CLUSTER_NAME:-arch-planner}"
REGION="${AWS_REGION:-eu-central-1}"

count_lbs() {
  aws elbv2 describe-load-balancers --region "$REGION" \
    --query "length(LoadBalancers[?starts_with(LoadBalancerName, 'k8s-')])" --output text
}

echo "1/6 deleting Ingresses (the controller removes the ALB)"
kubectl delete ingress --all -A --wait=true --timeout=300s

echo "2/6 waiting for the load balancers to disappear"
for _ in $(seq 1 30); do
  n=$(count_lbs)
  [ "$n" = "0" ] && break
  echo "  still $n load balancer(s)..."; sleep 10
done
if [ "$(count_lbs)" != "0" ]; then
  echo "ERROR: load balancers still exist, aborting before the controller is removed." >&2
  exit 1
fi

echo "3/6 helmfile destroy"
helmfile destroy

echo "4/6 deleting Karpenter nodes"
kubectl delete nodeclaims --all --wait=true --timeout=300s || true

echo "5/6 deleting PVCs (releases the EBS volumes)"
kubectl delete pvc --all -A --wait=true --timeout=300s

echo "6/6 removing target groups left behind by the controller"
for arn in $(aws elbv2 describe-target-groups --region "$REGION" \
    --query "TargetGroups[?starts_with(TargetGroupName, 'k8s-')].TargetGroupArn" --output text); do
  echo "  deleting $arn"
  aws elbv2 delete-target-group --region "$REGION" --target-group-arn "$arn" || true
done

echo "Done. Now: cd terraform && terraform destroy"
echo "Afterwards check the console for leftover security groups (tag elbv2.k8s.aws/cluster=$CLUSTER)."

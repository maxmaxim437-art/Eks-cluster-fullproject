#!/usr/bin/env bash
# Build the frontend and backend images and push them to ECR (created by Terraform).
# Usage (project root):  ./scripts/push-images.sh v1.0.0
set -euo pipefail

TAG="${1:-v1.0.0}"
REGION="$(terraform -chdir=terraform output -raw region)"
FRONT="$(terraform -chdir=terraform output -raw ecr_frontend_url)"
BACK="$(terraform -chdir=terraform output -raw ecr_backend_url)"
REGISTRY="${FRONT%%/*}"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

# Nodes are x86_64, so build for linux/amd64 (matters if you build on an ARM laptop).
docker build --platform linux/amd64 -t "$FRONT:$TAG" myapp/frontend
docker build --platform linux/amd64 -t "$BACK:$TAG"  myapp/backend
docker push "$FRONT:$TAG"
docker push "$BACK:$TAG"
echo "Pushed $FRONT:$TAG and $BACK:$TAG"

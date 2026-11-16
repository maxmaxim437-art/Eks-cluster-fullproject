output "configure_kubectl" {
  description = "Run this to point kubectl at the new cluster"
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${aws_eks_cluster.this.name}"
}

output "cluster_endpoint" {
  value = aws_eks_cluster.this.endpoint
}

output "region" {
  value = var.region
}

output "ecr_frontend_url" {
  value = aws_ecr_repository.app["frontend"].repository_url
}

output "ecr_backend_url" {
  value = aws_ecr_repository.app["backend"].repository_url
}

output "route53_name_servers" {
  description = "Set these as the name servers of your domain (only when create_route53_zone = true)"
  value       = length(aws_route53_zone.this) > 0 ? aws_route53_zone.this[0].name_servers : []
}

# Read by scripts/update-helmfile-env.py to fill environments/default.yaml automatically.
output "helmfile_values" {
  value = {
    awsAccountId      = local.account_id
    region            = var.region
    clusterName       = var.cluster_name
    vpcId             = aws_vpc.this.id
    backupBucket      = aws_s3_bucket.backup.bucket
    dbRemoteKey       = aws_secretsmanager_secret.db.name
    jwtRemoteKey      = aws_secretsmanager_secret.jwt.name
    karpenterNodeRole = aws_iam_role.karpenter_node.name
    roles = {
      externalDns     = module.external_dns_irsa.role_name
      externalSecrets = module.external_secrets_irsa.role_name
      karpenter       = module.karpenter_controller_irsa.role_name
      dbBackup        = module.db_backup_irsa.role_name
      lbController    = module.lb_controller_irsa.role_name
    }
  }
}

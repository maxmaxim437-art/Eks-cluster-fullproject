# One IAM role per in-cluster tool. Names must match environments/default.yaml (roles:)
# and the ServiceAccount names created by the Helm charts.

module "ebs_csi_irsa" {
  source = "./modules/irsa"

  name              = "${var.cluster_name}-ebs-csi"
  namespace         = "kube-system"
  service_account   = "ebs-csi-controller-sa"
  oidc_provider_arn = aws_iam_openid_connect_provider.eks.arn
  oidc_issuer       = local.oidc_issuer

  managed_policy_arns = ["arn:${local.partition}:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"]
}

# Official policy of the AWS Load Balancer Controller (kubernetes-sigs/aws-load-balancer-controller).
module "lb_controller_irsa" {
  source = "./modules/irsa"

  name              = "${var.cluster_name}-lb-controller"
  namespace         = "kube-system"
  service_account   = "aws-load-balancer-controller"
  oidc_provider_arn = aws_iam_openid_connect_provider.eks.arn
  oidc_issuer       = local.oidc_issuer

  inline_policy_json   = file("${path.module}/policies/lb-controller.json")
  create_inline_policy = true
}

# ExternalDNS: may change records in Route53 only.
data "aws_iam_policy_document" "external_dns" {
  statement {
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = [local.route53_zone_arn]
  }

  statement {
    actions = [
      "route53:ListHostedZones",
      "route53:ListResourceRecordSets",
      "route53:ListTagsForResource",
    ]
    resources = ["*"]
  }
}

module "external_dns_irsa" {
  source = "./modules/irsa"

  name              = "${var.cluster_name}-external-dns"
  namespace         = "external-dns"
  service_account   = "external-dns"
  oidc_provider_arn = aws_iam_openid_connect_provider.eks.arn
  oidc_issuer       = local.oidc_issuer

  inline_policy_json   = data.aws_iam_policy_document.external_dns.json
  create_inline_policy = true
}

# External Secrets Operator: read-only access to this project's secrets.
data "aws_iam_policy_document" "external_secrets" {
  statement {
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = ["arn:${local.partition}:secretsmanager:${var.region}:${local.account_id}:secret:${var.cluster_name}/*"]
  }
}

module "external_secrets_irsa" {
  source = "./modules/irsa"

  name              = "${var.cluster_name}-external-secrets"
  namespace         = "external-secrets"
  service_account   = "external-secrets"
  oidc_provider_arn = aws_iam_openid_connect_provider.eks.arn
  oidc_issuer       = local.oidc_issuer

  inline_policy_json   = data.aws_iam_policy_document.external_secrets.json
  create_inline_policy = true
}

# Database backup CronJob: write (and read, for the restore test) in the backup bucket only.
data "aws_iam_policy_document" "db_backup" {
  statement {
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]
    resources = ["${aws_s3_bucket.backup.arn}/*"]
  }

  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.backup.arn]
  }
}

module "db_backup_irsa" {
  source = "./modules/irsa"

  name              = "${var.cluster_name}-db-backup"
  namespace         = "production"
  service_account   = "database-backup"
  oidc_provider_arn = aws_iam_openid_connect_provider.eks.arn
  oidc_issuer       = local.oidc_issuer

  inline_policy_json   = data.aws_iam_policy_document.db_backup.json
  create_inline_policy = true
}

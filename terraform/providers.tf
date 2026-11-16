provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "arch-planner"
      Cluster   = var.cluster_name
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  account_id    = data.aws_caller_identity.current.account_id
  partition     = data.aws_partition.current.partition
  azs           = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  oidc_issuer   = replace(aws_eks_cluster.this.identity[0].oidc[0].issuer, "https://", "")
  backup_bucket = "${var.cluster_name}-db-backups-${local.account_id}"
}

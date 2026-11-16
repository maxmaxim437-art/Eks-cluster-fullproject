variable "region" {
  description = "AWS region for everything"
  type        = string
  default     = "eu-central-1"
}

variable "cluster_name" {
  description = "EKS cluster name. It also prefixes the IAM roles, ECR repositories, S3 bucket and secrets (keep it equal to clusterName in environments/default.yaml)."
  type        = string
  default     = "arch-planner"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.cluster_name))
    error_message = "Use 3-31 lowercase letters, digits or dashes, starting with a letter."
  }
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version (1.35: standard support until 27 Mar 2027)"
  type        = string
  default     = "1.35"
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones (EKS needs at least 2)"
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 4
    error_message = "az_count must be between 2 and 4."
  }
}

variable "public_access_cidrs" {
  description = "Who may reach the Kubernetes API from the internet. Narrow it to your own IP (x.x.x.x/32) if you can."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ---- node groups ----
variable "app_instance_types" {
  description = "Instance types of app-nodes (labelled role=app). t3.large = 8 GiB and up to 35 pods per node."
  type        = list(string)
  default     = ["t3.large"]
}

variable "app_min_size" {
  type    = number
  default = 2
}

variable "app_desired_size" {
  type    = number
  default = 2
}

variable "app_max_size" {
  type    = number
  default = 4
}

variable "db_instance_type" {
  description = "Instance type of db-nodes (labelled role=db, tainted workload=database:NoSchedule). Use r6i.large for a more realistic database node."
  type        = string
  default     = "t3.medium"
}

# ---- DNS (optional) ----
variable "domain" {
  description = "Your domain, e.g. example.com. Leave empty to work without DNS."
  type        = string
  default     = ""
}

variable "create_route53_zone" {
  description = "Create a Route53 hosted zone for var.domain (you must then point the domain's name servers at it)."
  type        = bool
  default     = false
}

# ---- backups ----
variable "backup_bucket_force_destroy" {
  description = "true = terraform destroy also deletes the backups. Set false to keep them."
  type        = bool
  default     = true
}

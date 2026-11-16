variable "name" {
  description = "IAM role name"
  type        = string
}

variable "namespace" {
  description = "Namespace of the Kubernetes ServiceAccount"
  type        = string
}

variable "service_account" {
  description = "Name of the Kubernetes ServiceAccount"
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN of the cluster's IAM OIDC provider"
  type        = string
}

variable "oidc_issuer" {
  description = "OIDC issuer URL without https://"
  type        = string
}

variable "managed_policy_arns" {
  description = "AWS managed policies to attach (must be known at plan time)"
  type        = list(string)
  default     = []
}

variable "inline_policy_json" {
  description = "Optional inline policy (JSON)"
  type        = string
  default     = ""
}

variable "create_inline_policy" {
  description = "Set true when inline_policy_json is given (a flag, because the JSON can be unknown until apply)"
  type        = bool
  default     = false
}

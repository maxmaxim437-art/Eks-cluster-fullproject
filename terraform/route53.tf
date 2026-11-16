# Optional: a hosted zone for ExternalDNS. Off by default (create_route53_zone = false).

resource "aws_route53_zone" "this" {
  count = var.create_route53_zone && var.domain != "" ? 1 : 0

  name          = var.domain
  force_destroy = true
}

locals {
  route53_zone_arn = var.create_route53_zone && var.domain != "" ? aws_route53_zone.this[0].arn : "arn:${local.partition}:route53:::hostedzone/*"
}

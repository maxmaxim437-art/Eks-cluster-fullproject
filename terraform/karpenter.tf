# Everything Karpenter needs on the AWS side (mirrors the official Karpenter CloudFormation stack):
#   * node role for the EC2 instances it launches (+ EKS access entry so they can join)
#   * controller role (IRSA) with six scoped policies
#   * SQS queue + EventBridge rules for spot interruptions
# The NodePools / EC2NodeClass themselves live in charts/platform.

resource "aws_iam_role" "karpenter_node" {
  name               = "${var.cluster_name}-karpenter-node"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "karpenter_node" {
  for_each = toset([
    "arn:${local.partition}:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:${local.partition}:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:${local.partition}:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
    "arn:${local.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ])

  role       = aws_iam_role.karpenter_node.name
  policy_arn = each.value
}

# Without this entry, nodes launched by Karpenter cannot join the cluster.
resource "aws_eks_access_entry" "karpenter_node" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.karpenter_node.arn
  type          = "EC2_LINUX"
}

# ---- controller role ----
module "karpenter_controller_irsa" {
  source = "./modules/irsa"

  name              = "${var.cluster_name}-karpenter"
  namespace         = "karpenter"
  service_account   = "karpenter"
  oidc_provider_arn = aws_iam_openid_connect_provider.eks.arn
  oidc_issuer       = local.oidc_issuer
}

resource "aws_iam_policy" "karpenter" {
  for_each = toset([
    "node-lifecycle",
    "iam-integration",
    "eks-integration",
    "interruption",
    "zonal-shift",
    "resource-discovery",
  ])

  name = "${var.cluster_name}-karpenter-${each.key}"
  policy = templatefile("${path.module}/policies/karpenter/${each.key}.json.tftpl", {
    partition     = local.partition
    region        = var.region
    account_id    = local.account_id
    cluster_name  = var.cluster_name
    node_role_arn = aws_iam_role.karpenter_node.arn
    queue_arn     = aws_sqs_queue.karpenter.arn
  })
}

resource "aws_iam_role_policy_attachment" "karpenter_controller" {
  for_each = aws_iam_policy.karpenter

  role       = module.karpenter_controller_irsa.role_name
  policy_arn = each.value.arn
}

# ---- interruption handling ----
# The queue is named like the cluster: values/karpenter.yaml.gotmpl uses interruptionQueue = clusterName.
resource "aws_sqs_queue" "karpenter" {
  name                      = var.cluster_name
  message_retention_seconds = 300
  sqs_managed_sse_enabled   = true
}

data "aws_iam_policy_document" "karpenter_queue" {
  statement {
    sid       = "AllowEventBridge"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.karpenter.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com", "sqs.amazonaws.com"]
    }
  }

  statement {
    sid       = "DenyHTTP"
    effect    = "Deny"
    actions   = ["sqs:*"]
    resources = [aws_sqs_queue.karpenter.arn]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "karpenter" {
  queue_url = aws_sqs_queue.karpenter.id
  policy    = data.aws_iam_policy_document.karpenter_queue.json
}

locals {
  karpenter_events = {
    scheduled-change = {
      source      = ["aws.health"]
      detail-type = ["AWS Health Event"]
    }
    spot-interruption = {
      source      = ["aws.ec2"]
      detail-type = ["EC2 Spot Instance Interruption Warning"]
    }
    rebalance = {
      source      = ["aws.ec2"]
      detail-type = ["EC2 Instance Rebalance Recommendation"]
    }
    instance-state-change = {
      source      = ["aws.ec2"]
      detail-type = ["EC2 Instance State-change Notification"]
    }
    capacity-reservation = {
      source      = ["aws.ec2"]
      detail-type = ["EC2 Capacity Reservation Instance Interruption Warning"]
    }
  }
}

resource "aws_cloudwatch_event_rule" "karpenter" {
  for_each = local.karpenter_events

  name          = "${var.cluster_name}-karpenter-${each.key}"
  event_pattern = jsonencode(each.value)
}

resource "aws_cloudwatch_event_target" "karpenter" {
  for_each = aws_cloudwatch_event_rule.karpenter

  rule      = each.value.name
  target_id = "KarpenterInterruptionQueueTarget"
  arn       = aws_sqs_queue.karpenter.arn
}

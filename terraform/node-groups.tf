# Two managed node groups:
#   app-nodes  role=app                                  frontend, backend, operators, Karpenter itself
#   db-nodes   role=db + taint workload=database         PostgreSQL only (one AZ: EBS disks live in one AZ)
# More app capacity is added on demand by Karpenter (see karpenter.tf).

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node" {
  name               = "${var.cluster_name}-node"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "node" {
  for_each = toset([
    "arn:${local.partition}:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:${local.partition}:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:${local.partition}:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:${local.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ])

  role       = aws_iam_role.node.name
  policy_arn = each.value
}

resource "aws_eks_node_group" "app" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "app-nodes"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = aws_subnet.private[*].id

  ami_type       = "AL2023_x86_64_STANDARD"
  capacity_type  = "ON_DEMAND"
  instance_types = var.app_instance_types
  disk_size      = 30

  scaling_config {
    min_size     = var.app_min_size
    desired_size = var.app_desired_size
    max_size     = var.app_max_size
  }

  update_config {
    max_unavailable = 1
  }

  labels = {
    role = "app"
  }

  tags = {
    Name = "${var.cluster_name}-app-node"
  }

  depends_on = [
    aws_iam_role_policy_attachment.node,
    aws_eks_addon.vpc_cni,
    aws_eks_addon.kube_proxy,
    aws_route_table_association.private,
    aws_nat_gateway.this,
  ]
}

resource "aws_eks_node_group" "db" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "db-nodes"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = [aws_subnet.private[0].id]

  ami_type       = "AL2023_x86_64_STANDARD"
  capacity_type  = "ON_DEMAND"
  instance_types = [var.db_instance_type]
  disk_size      = 20

  scaling_config {
    min_size     = 1
    desired_size = 1
    max_size     = 1
  }

  update_config {
    max_unavailable = 1
  }

  labels = {
    role = "db"
  }

  taint {
    key    = "workload"
    value  = "database"
    effect = "NO_SCHEDULE"
  }

  tags = {
    Name = "${var.cluster_name}-db-node"
  }

  depends_on = [
    aws_iam_role_policy_attachment.node,
    aws_eks_addon.vpc_cni,
    aws_eks_addon.kube_proxy,
    aws_route_table_association.private,
    aws_nat_gateway.this,
  ]
}

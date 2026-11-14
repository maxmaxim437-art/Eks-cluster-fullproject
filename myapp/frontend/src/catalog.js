// group: true  -> container you can resize and drop other components into
export const CATEGORIES = {
  network:  { label: 'Networking',    color: '#2F6FB0' },
  compute:  { label: 'Compute',       color: '#C9741A' },
  k8s:      { label: 'Kubernetes',    color: '#16847F' },
  data:     { label: 'Data & storage',color: '#7A4DB0' },
  security: { label: 'Security',      color: '#B83F4A' },
  ops:      { label: 'CI/CD & observability', color: '#5E7430' },
};

export const CATALOG = [
  // containers
  { kind: 'vpc',        label: 'VPC',               abbr: 'VPC', cat: 'network', group: true },
  { kind: 'az',         label: 'Availability Zone', abbr: 'AZ',  cat: 'network', group: true },
  { kind: 'subnet',     label: 'Subnet',            abbr: 'SN',  cat: 'network', group: true },
  { kind: 'asg',        label: 'Auto Scaling Group',abbr: 'ASG', cat: 'compute', group: true },
  { kind: 'eks',        label: 'EKS Cluster',       abbr: 'EKS', cat: 'k8s',     group: true },
  { kind: 'nodegroup',  label: 'Node Group',        abbr: 'NG',  cat: 'k8s',     group: true },
  { kind: 'namespace',  label: 'Namespace',         abbr: 'NS',  cat: 'k8s',     group: true },
  // networking
  { kind: 'r53',        label: 'Route 53',          abbr: 'R53', cat: 'network' },
  { kind: 'cloudfront', label: 'CloudFront',        abbr: 'CF',  cat: 'network' },
  { kind: 'igw',        label: 'Internet Gateway',  abbr: 'IGW', cat: 'network' },
  { kind: 'nat',        label: 'NAT Gateway',       abbr: 'NAT', cat: 'network' },
  { kind: 'alb',        label: 'Application LB',    abbr: 'ALB', cat: 'network' },
  { kind: 'nlb',        label: 'Network LB',        abbr: 'NLB', cat: 'network' },
  { kind: 'apigw',      label: 'API Gateway',       abbr: 'API', cat: 'network' },
  // compute
  { kind: 'ec2',        label: 'EC2 Instance',      abbr: 'EC2', cat: 'compute' },
  { kind: 'lambda',     label: 'Lambda',            abbr: 'λ',   cat: 'compute' },
  { kind: 'ecs',        label: 'ECS Service',       abbr: 'ECS', cat: 'compute' },
  { kind: 'fargate',    label: 'Fargate Task',      abbr: 'FG',  cat: 'compute' },
  // kubernetes
  { kind: 'deploy',     label: 'Deployment',        abbr: 'DEP', cat: 'k8s' },
  { kind: 'pod',        label: 'Pod',               abbr: 'POD', cat: 'k8s' },
  { kind: 'svc',        label: 'Service',           abbr: 'SVC', cat: 'k8s' },
  { kind: 'ingress',    label: 'Ingress',           abbr: 'ING', cat: 'k8s' },
  { kind: 'hpa',        label: 'HPA',               abbr: 'HPA', cat: 'k8s' },
  { kind: 'statefulset',label: 'StatefulSet',       abbr: 'STS', cat: 'k8s' },
  // data
  { kind: 'rds',        label: 'RDS',               abbr: 'RDS', cat: 'data' },
  { kind: 'dynamo',     label: 'DynamoDB',          abbr: 'DDB', cat: 'data' },
  { kind: 's3',         label: 'S3 Bucket',         abbr: 'S3',  cat: 'data' },
  { kind: 'redis',      label: 'ElastiCache',       abbr: 'EC',  cat: 'data' },
  { kind: 'efs',        label: 'EFS',               abbr: 'EFS', cat: 'data' },
  { kind: 'ebs',        label: 'EBS Volume',        abbr: 'EBS', cat: 'data' },
  { kind: 'postgres',   label: 'PostgreSQL (Bitnami)', abbr: 'PG', cat: 'data' },
  // security
  { kind: 'sg',         label: 'Security Group',    abbr: 'SG',  cat: 'security' },
  { kind: 'iam',        label: 'IAM Role',          abbr: 'IAM', cat: 'security' },
  { kind: 'waf',        label: 'WAF',               abbr: 'WAF', cat: 'security' },
  { kind: 'secrets',    label: 'Secrets Manager',   abbr: 'SM',  cat: 'security' },
  { kind: 'kms',        label: 'KMS',               abbr: 'KMS', cat: 'security' },
  // ops
  { kind: 'ecr',        label: 'ECR',               abbr: 'ECR', cat: 'ops' },
  { kind: 'pipeline',   label: 'CI/CD Pipeline',    abbr: 'CI',  cat: 'ops' },
  { kind: 'argocd',     label: 'Argo CD',           abbr: 'ARG', cat: 'ops' },
  { kind: 'cw',         label: 'CloudWatch',        abbr: 'CW',  cat: 'ops' },
  { kind: 'prom',       label: 'Prometheus',        abbr: 'PRM', cat: 'ops' },
  { kind: 'grafana',    label: 'Grafana',           abbr: 'GRF', cat: 'ops' },
];

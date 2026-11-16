# The secrets that External Secrets copies into the cluster (charts/platform -> db-credentials, jwt-secret).
# Passwords are generated here, so nothing sensitive is ever typed or committed.
# NOTE: the generated values are stored in terraform.tfstate. Keep that file private (it is in .gitignore).

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "db" {
  name                    = "${var.cluster_name}/production/db-credentials"
  recovery_window_in_days = 0
}

# username must equal postgresql.auth.username in charts/database/values.yaml (archuser).
# host is the Service created by the Bitnami chart for the release "database".
resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id

  secret_string = jsonencode({
    username = "archuser"
    password = random_password.db.result
    host     = "database-postgresql"
    port     = "5432"
  })
}

resource "aws_secretsmanager_secret" "jwt" {
  name                    = "${var.cluster_name}/production/jwt-secret"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = random_password.jwt.result
}

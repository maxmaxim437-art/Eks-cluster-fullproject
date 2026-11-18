# 08 - Test: database backup to S3

**What the test does:** run the backup CronJob by hand (`kubectl create job --from=cronjob/database-backup test-backup -n production`) and check that a dump lands in S3.

**How it works:** an init container (`dump`) runs `pg_dump | gzip` into a shared volume; the `upload` container copies it to `s3://<bucket>/backups/`. The Pod authenticates to AWS with IRSA, so there are no access keys in the cluster. Credentials for PostgreSQL come from the `db-credentials` Secret (External Secrets).

| File | What it shows |
|---|---|
| `backup-to-s3.png` | The Job is created; the `upload` container logs `upload: ../backup/db-20261118-163843.sql.gz to s3://arch-planner-db-backups-.../backups/...`; `aws s3 ls` then lists the 888-byte object. |

**Result:** the backup was created and stored in the versioned, encrypted S3 bucket. The restore procedure is documented in [`charts/database/README.md`](../../charts/database/README.md).

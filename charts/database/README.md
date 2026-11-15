# Database chart: backup and restore

## What runs
* PostgreSQL (Bitnami) as a StatefulSet on the `role=db` nodes, data on an EBS disk (gp3).
* A CronJob (`database-backup`, every 6 hours, `concurrencyPolicy: Forbid`):
  1. init container `dump`: `pg_dump` -> gzip into a shared emptyDir
  2. container `upload`: `aws s3 cp` to `s3://<bucket>/backups/db-YYYYMMDD-HHMMSS.sql.gz`
* AWS access comes from IRSA: the ServiceAccount `database-backup` carries the IAM role annotation.
  No AWS keys exist in the cluster.
* Connection details come from the Secret `db-credentials` (synced by ExternalSecrets).
* Retention is enforced by the S3 lifecycle rule (30 days -> Standard-IA, 60 -> Glacier, 90 -> delete),
  not by the cluster.

## Take a backup by hand
```bash
kubectl create job --from=cronjob/database-backup manual-backup-test -n production
kubectl wait --for=condition=complete job/manual-backup-test -n production --timeout=300s
kubectl logs job/manual-backup-test -n production -c dump
kubectl logs job/manual-backup-test -n production -c upload
aws s3 ls s3://<bucket>/backups/ --human-readable
```

## Restore into a fresh, temporary database (restore test)
Always restore into a NEW instance first. A backup that was never restored is not a backup.

```bash
# 1. download the newest file
FILE=$(aws s3 ls s3://<bucket>/backups/ | sort | tail -1 | awk '{print $4}')
aws s3 cp "s3://<bucket>/backups/$FILE" .

# 2. temporary PostgreSQL pod (same major version as the server: 17)
kubectl run restore-test -n production --image=postgres:17-alpine --env=POSTGRES_PASSWORD=restoretest
kubectl wait --for=condition=ready pod/restore-test -n production --timeout=120s

# 3. load the dump
kubectl exec -n production restore-test -- psql -U postgres -c "CREATE DATABASE archdb_restore;"
gunzip -c "$FILE" | kubectl exec -i -n production restore-test -- psql -U postgres -d archdb_restore

# 4. check data integrity: compare with the live database
kubectl exec -n production restore-test -- psql -U postgres -d archdb_restore \
  -c "SELECT count(*) AS users FROM users;" -c "SELECT count(*) AS diagrams FROM diagrams;"

# 5. clean up
kubectl delete pod restore-test -n production
```

The dump is made with `--no-owner --no-privileges`, so it loads under any user.

## Restore into the real database (disaster recovery)
1. Scale the backend down: `kubectl scale deploy/backend -n production --replicas=0`
   (the HPA will scale it up again, so also run `kubectl delete hpa backend -n production`
   or set `autoscaling.enabled: false` for the duration).
2. Drop and recreate `archdb`, then load the dump with the user from `db-credentials`.
3. Scale the backend back up and log in to check.

## Things to remember
* The EBS disk dies with the cluster. S3 is the safety net.
* The `pg_dump` image version must match the server's major version (`backup.dumpImage`).
* If a backup job fails: `kubectl describe job <name> -n production` and the logs of both containers.
  The usual causes are a wrong IRSA role annotation, a wrong bucket name, or a missing `db-credentials` Secret.

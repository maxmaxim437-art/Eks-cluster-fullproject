#!/usr/bin/env python3
"""Small fixes: DB password from a Secret, database waits for platform, metrics-server on. Idempotent."""
import pathlib, sys

def read(p):
    p = pathlib.Path(p)
    if not p.exists():
        sys.exit(f"ERROR: {p} not found - run this from the project root (Eks-Fullproject).")
    return p, p.read_text(encoding="utf-8")

# 1) charts/database/values.yaml - password from the existing Secret instead of plain text
p, s = read("charts/database/values.yaml")
if "existingSecret" in s:
    print("database values: already uses existingSecret")
else:
    start = s.find("  auth:\n")
    end = s.find("  primary:\n")
    if start < 0 or end < 0 or end < start:
        sys.exit("ERROR: could not find the 'auth:' block in charts/database/values.yaml - edit it by hand.")
    new_auth = """  auth:
    username: archuser            # must match the "username" in the AWS secret
    database: archdb
    # No password in Git: Bitnami reads it from the Secret that ExternalSecrets creates
    # (charts/platform -> db-credentials).
    existingSecret: db-credentials
    secretKeys:
      userPasswordKey: password
    enablePostgresUser: false     # the secret has no admin ("postgres") password

"""
    s = s[:start] + new_auth + s[end:]
    p.write_text(s, encoding="utf-8")
    print("database values: password now comes from the db-credentials Secret")

# 2) helmfile.yaml - the database waits for platform (it creates db-credentials + the NodePools)
p, s = read("helmfile.yaml")
old = "      - vpa/vpa\n    values:\n      - values/database.yaml.gotmpl\n"
if "production/platform" in s.split("name: database")[1].split("name: backend")[0]:
    print("helmfile: database already waits for platform")
elif old not in s:
    sys.exit("ERROR: could not find the database 'needs' block in helmfile.yaml - add '- production/platform' by hand.")
else:
    s = s.replace(old, "      - vpa/vpa\n      - production/platform\n    values:\n      - values/database.yaml.gotmpl\n", 1)
    p.write_text(s, encoding="utf-8")
    print("helmfile: database now needs production/platform")

# 3) metrics-server: EKS does not install it by default and HPA/VPA need it
p, s = read("environments/default.yaml")
if "metricsServer:\n  enabled: true" in s:
    print("environments: metrics-server already enabled")
elif "metricsServer:\n  enabled: false" in s:
    p.write_text(s.replace("metricsServer:\n  enabled: false", "metricsServer:\n  enabled: true", 1), encoding="utf-8")
    print("environments: metrics-server enabled")
else:
    sys.exit("ERROR: could not find metricsServer in environments/default.yaml - set 'enabled: true' by hand.")

#!/usr/bin/env python3
"""Copy the Terraform outputs into environments/default.yaml (keeps comments and layout).

Usage (from the project root):
    python3 scripts/update-helmfile-env.py            # reads `terraform -chdir=terraform output -json helmfile_values`
    python3 scripts/update-helmfile-env.py --domain app-example.com
    python3 scripts/update-helmfile-env.py --from-file values.json   # offline test
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ENV_FILE = Path("environments/default.yaml")
# Terraform output key -> (section or None, yaml key)
FLAT = ["awsAccountId", "region", "clusterName", "vpcId", "backupBucket", "karpenterNodeRole"]
ROLES = ["externalDns", "externalSecrets", "karpenter", "dbBackup", "lbController"]
SECRETS = {"dbRemoteKey": "dbRemoteKey", "jwtRemoteKey": "jwtRemoteKey"}


def load(args):
    if args.from_file:
        return json.loads(Path(args.from_file).read_text())
    out = subprocess.run(
        ["terraform", "-chdir=terraform", "output", "-json", "helmfile_values"],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def set_key(lines, section, key, value, report):
    """Replace `key: ...` (top level, or inside `section:`) keeping the trailing comment."""
    in_section = section is None
    for i, line in enumerate(lines):
        if section is not None:
            if re.match(rf"^{re.escape(section)}:\s*(#.*)?$", line):
                in_section = True
                continue
            if in_section and re.match(r"^\S", line) and not line.startswith("#"):
                in_section = False
        pat = rf"^(\s*){re.escape(key)}:\s*(\"[^\"]*\"|'[^']*'|[^#\s]*)(\s*#.*)?$"
        indent_ok = (section is None and not line.startswith(" ")) or (section is not None and line.startswith(" "))
        m = re.match(pat, line)
        if in_section and m and indent_ok:
            comment = m.group(3) or ""
            comment = re.sub(r"#\s*TODO.*", "", comment).rstrip()
            quoted = f'"{value}"' if key == "awsAccountId" else str(value)
            lines[i] = f"{m.group(1)}{key}: {quoted}{('  ' + comment.strip()) if comment.strip() else ''}"
            report.append(f"set {section + '.' if section else ''}{key} = {value}")
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain")
    ap.add_argument("--from-file")
    args = ap.parse_args()

    if not ENV_FILE.exists():
        sys.exit(f"ERROR: {ENV_FILE} not found - run this from the project root.")
    data = load(args)
    lines = ENV_FILE.read_text().split("\n")
    report, missing = [], []

    for k in FLAT:
        if not set_key(lines, None, k, data[k], report):
            missing.append(k)
    for k in ROLES:
        if not set_key(lines, "roles", k, data["roles"][k], report):
            missing.append(f"roles.{k}")
    for k, yk in SECRETS.items():
        if not set_key(lines, "secrets", yk, data[k], report):
            missing.append(f"secrets.{yk}")
    if args.domain and not set_key(lines, None, "domain", args.domain, report):
        missing.append("domain")

    ENV_FILE.write_text("\n".join(lines))
    print("\n".join(report))
    if missing:
        print("\nWARNING: these keys were not found in environments/default.yaml - add them by hand:")
        for m in missing:
            print("  -", m)
        sys.exit(1)
    print(f"\nOK: {ENV_FILE} updated.")


if __name__ == "__main__":
    main()

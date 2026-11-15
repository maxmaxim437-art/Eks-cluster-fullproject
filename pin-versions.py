#!/usr/bin/env python3
"""Pins `version:` on every remote chart in helmfile.yaml to the newest version in its repository.
Run from the project root AFTER the repositories were added (running `helmfile lint` once does it). Idempotent."""
import json, pathlib, re, subprocess, sys

OCI_KNOWN = {"karpenter/karpenter": "1.15.2"}   # OCI chart, version seen in your helmfile lint output

hf = pathlib.Path("helmfile.yaml")
if not hf.exists():
    sys.exit("ERROR: helmfile.yaml not found - run this from the project root.")
lines = hf.read_text(encoding="utf-8").split("\n")
out, pinned = [], []
for i, line in enumerate(lines):
    out.append(line)
    m = re.match(r"^(\s+)chart:\s*([\w.-]+/[\w.-]+)\s*$", line)
    if not m or line.strip().startswith("chart: ./"):
        continue
    indent, chart = m.group(1), m.group(2)
    if i + 1 < len(lines) and lines[i + 1].strip().startswith("version:"):
        continue
    if chart in OCI_KNOWN:
        ver = OCI_KNOWN[chart]
    else:
        r = subprocess.run(["helm", "search", "repo", chart, "-o", "json"], capture_output=True, text=True)
        try:
            ver = json.loads(r.stdout)[0]["version"]
        except Exception:
            print(f"SKIP {chart}: not found. Run 'helmfile lint' first so the repositories are added.")
            continue
    out.append(f'{indent}version: "{ver}"')
    pinned.append((chart, ver))

text = "\n".join(out)
text = re.sub(r"# TODO \(before the first real deploy\): pin a `version:`[^\n]*\n#[^\n]*\n\n?", "", text)
hf.write_text(text, encoding="utf-8")
for c, v in pinned:
    print(f"pinned {c} -> {v}")
if not pinned:
    print("nothing to pin (already pinned, or repositories missing)")

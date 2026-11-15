#!/usr/bin/env python3
"""Adds the AWS Load Balancer Controller to helmfile.yaml (+ settings). Idempotent."""
import pathlib, sys

def read(p):
    p = pathlib.Path(p)
    if not p.exists():
        sys.exit(f"ERROR: {p} not found - run this from the project root (Eks-Fullproject).")
    return p, p.read_text(encoding="utf-8")

p, s = read("helmfile.yaml")
if "aws-load-balancer-controller" in s:
    print("helmfile.yaml: load balancer controller already there")
else:
    a = "  - name: metrics-server\n    url: https://kubernetes-sigs.github.io/metrics-server/\n"
    b = "  - name: vpa\n    namespace: vpa\n"
    c = "    needs:\n      - production/backend\n    values:\n      - values/frontend.yaml.gotmpl\n"
    for anchor in (a, b, c):
        if anchor not in s:
            sys.exit("ERROR: could not find an expected block in helmfile.yaml - add the release by hand:\n" + anchor)
    s = s.replace(a, a + "  - name: eks\n    url: https://aws.github.io/eks-charts\n", 1)
    s = s.replace(b, """  # Creates the ALB for every Ingress with className "alb". The frontend waits for it.
  - name: aws-load-balancer-controller
    namespace: kube-system
    chart: eks/aws-load-balancer-controller
    values:
      - values/aws-lb-controller.yaml.gotmpl

""" + b, 1)
    s = s.replace(c, "    needs:\n      - production/backend\n      - kube-system/aws-load-balancer-controller\n    values:\n      - values/frontend.yaml.gotmpl\n", 1)
    p.write_text(s, encoding="utf-8")
    print("helmfile.yaml: aws-load-balancer-controller added (the frontend waits for it)")

p, e = read("environments/default.yaml")
if "lbController" in e:
    print("environments: already has the load balancer settings")
else:
    anchor = "  dbBackup: arch-planner-db-backup\n"
    if anchor not in e:
        sys.exit("ERROR: could not find the 'roles:' block in environments/default.yaml - add 'lbController' by hand.")
    e = e.replace(anchor, anchor + "  lbController: arch-planner-lb-controller\n", 1)
    if not e.endswith("\n"):
        e += "\n"
    e += '\nvpcId: vpc-0123456789abcdef0        # TODO: filled in after Terraform creates the VPC\n'
    p.write_text(e, encoding="utf-8")
    print("environments: lbController role and vpcId added")

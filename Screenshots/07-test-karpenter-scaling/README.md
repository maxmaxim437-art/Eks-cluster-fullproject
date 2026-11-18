# 07 - Test: Karpenter scales nodes up and down

**What the test does:** when the existing nodes have no room, new Pods stay `Pending`. A Deployment called `inflate` (6 replicas, 1 CPU each, `nodeSelector: role=app`) creates that situation; Karpenter sees the unschedulable Pods and provisions nodes.

| File | What it shows |
|---|---|
| `inflate-deployment.png` | The applied manifest, followed by `kubectl get nodeclaims -w`. |
| `nodeclaims-created.png` | Karpenter created 2 `NodeClaim`s: `c5a.large`, on-demand, in `eu-central-1a` and `1b`, both `READY` within about two minutes. |
| `ec2-instances-after-scale-down.png` | After deleting `inflate`, both Karpenter instances are `Terminated`. Only the managed nodes remain. |

**Result:** capacity is added when needed and removed when idle, so you do not pay for unused nodes.

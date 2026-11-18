# 04 - Test: Pod failure and self-healing

**What the test does:** delete a backend Pod (simulating a crash) and check that Kubernetes replaces it without downtime.

**Why it works:** the backend Deployment requests 2 replicas. When one disappears, the ReplicaSet immediately creates a new one while the other keeps serving traffic.

| File | What it shows |
|---|---|
| `delete-pod-and-recovery.png` | Two backend Pods before the delete; after it, a new Pod is already `Running` and the second Pod never stopped. |

**Result:** losing a single Pod causes no downtime.

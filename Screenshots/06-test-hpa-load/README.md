# 06 - Test: load and the HPA

**What the test does:** start 3 `busybox` Pods that request `http://frontend/api/info` in a loop and watch the HorizontalPodAutoscaler add replicas.

**HPA settings:** target 70% CPU and 80% memory, min 2 / max 10 replicas, metrics from metrics-server.

| File | What it shows |
|---|---|
| `hpa-scaling-under-load.png` | `kubectl get hpa -w`: backend CPU reaches 269% and replicas grow from 2 to 7; the frontend grows from 2 to 3. As replicas are added the load per Pod drops (backend 98%, frontend 48%). |

**Result:** the workload scales out automatically under load and scales back down afterwards.

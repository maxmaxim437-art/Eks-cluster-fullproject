# 05 - Test: the `BackendDown` alert

**What the test does:** scale the backend to 0 replicas (`kubectl scale deploy backend --replicas=0`) and check that Prometheus fires a critical alert after 2 minutes.

**Alert rule** (`charts/platform/templates/prometheusrule.yaml`):
`(up{job="backend"} == 0) or absent(up{job="backend"})`, `for: 2m`, severity `critical`.
The `absent()` part is needed because when every Pod is gone the scrape target disappears and `up` has no series at all, so `up == 0` alone would never match.

| File | What it shows |
|---|---|
| `alert-pending.png` | `BackendDown` is `PENDING`: the backend is gone and the 2-minute timer is running. |
| `alert-firing.png` | After 2 minutes the alert is `FIRING`. |
| `grafana-backend-down.png` | Backend dashboard: `Backend up` is red and the request rate drops to zero. |

After the test the backend was scaled back to 2 replicas and the alert returned to `INACTIVE`.

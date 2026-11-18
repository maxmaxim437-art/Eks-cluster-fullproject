# 03 - Monitoring: Prometheus and Grafana

Monitoring runs on `kube-prometheus-stack`. Every application chart ships a `ServiceMonitor` that tells Prometheus what to scrape.

| File | What it shows |
|---|---|
| `prometheus-targets.png` | Prometheus `Status -> Targets`: coredns, grafana, kube-proxy, kube-state-metrics and kubelet are `UP`. |
| `prometheus-targets-control-plane.png` | Target health: Alertmanager, the Kubernetes API servers, CoreDNS and Grafana are all `UP`. |
| `grafana-dashboards-list.png` | The project dashboards (tag `arch-planner`) loaded automatically from ConfigMaps labelled `grafana_dashboard`. |
| `grafana-backend-dashboard.png` | Backend dashboard: availability, requests per second (total and per route), 5xx rate, latency p50/p95/p99, memory and event-loop lag. |

Backend metrics come from `prom-client` in `server.js`: a `/metrics` endpoint and the `http_request_duration_seconds` histogram (labels: method, route, status_code).

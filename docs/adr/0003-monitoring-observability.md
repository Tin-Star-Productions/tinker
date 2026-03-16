# ADR-0003: Monitoring, Observability, and Error Alerting

**Status:** Accepted

**Date:** 2026-03-16

---

## Context

We need observability from day one. The product processes GitHub Actions CI logs,
classifies test failures, and posts PR comments — failures in any of these are
directly user-visible. We need to catch errors before users report them, track
latency of the critical PROCESS_RUN job pipeline, and have a clear path to
page on-call when production goes down.

Constraints:
- MVP team is small (1–2 engineers); tooling must be low operational overhead
- Budget-conscious: prefer generous free tiers with paid upgrade path
- Fly.io is the deployment target (see ADR-0002)
- Three services to monitor: `api` (Fastify), `worker` (BullMQ), `web` (Next.js)

---

## Decision

### Error Tracking: Sentry

Sentry handles runtime error capture, stack traces, and performance tracing for
all three services. Native SDKs for Node.js and Next.js.

| SDK | Package | Service |
|-----|---------|---------|
| `@sentry/node` | 8.x | `apps/api`, `apps/worker` |
| `@sentry/nextjs` | 8.x | `apps/web` |

Sentry configuration per service:
- DSN from `SENTRY_DSN` env var (single DSN, one Sentry project per environment)
- Environment tag set from `NODE_ENV` / `FLY_APP_NAME`
- Release version set from `SENTRY_RELEASE` (git SHA injected at deploy time)
- Sample rate: 100% errors, 10% transactions in production (tunable)
- PII scrubbing: enabled (no raw log content ever reaches Sentry)

### Metrics & Latency: Fly.io Built-in + Prometheus Endpoint

Fly.io provides CPU, memory, network, and HTTP latency metrics out of the box via
its Prometheus-compatible metrics endpoint — no agent required.

In addition, the `apps/api` Fastify server exposes `/metrics` (Prometheus format)
for application-level metrics:
- `tinker_http_request_duration_seconds` — API latency histogram by route + status
- `tinker_job_processing_duration_seconds` — PROCESS_RUN job duration histogram
- `tinker_job_queue_depth` — BullMQ queue depth gauge
- `tinker_classification_accuracy_total` — counter for CORRECT / INCORRECT feedback
- `tinker_webhook_received_total` — counter by event type

Fly.io's built-in Grafana (Fly Metrics) consumes these automatically.
For staging/prod dashboards, we configure a Fly.io Grafana board.

### Uptime Monitoring: Betterstack Uptime

Betterstack Uptime provides:
- HTTP health checks on `/healthz` endpoints for `api` and `web` (every 1 min)
- SSL certificate expiry monitoring
- Incident timeline and escalation policies
- Free tier: 10 monitors, 1-min check interval — sufficient for MVP

Health check endpoints to monitor:
- `https://api.tinker.dev/healthz`
- `https://app.tinker.dev/` (HTTP 200 check)
- `https://api.tinker.dev/healthz/db` (Postgres connectivity)
- `https://api.tinker.dev/healthz/redis` (Redis connectivity)

### Log Aggregation: Fly.io Log Shipping → Betterstack Logs

Fly.io ships application logs via `fly logs` or NATS-based log shipping.
We use the Fly.io → Betterstack Logs integration (single `fly.toml` config):

```toml
[log_destination]
  destination = "betterstack"
  token = "<BETTERSTACK_SOURCE_TOKEN>"
```

This gives us:
- Centralized log search (Fastify structured JSON logs, worker job logs, Next.js)
- 3-day retention on free tier (upgrade to 30 days when needed)
- Log-based alerts (e.g., alert when `"level":"error"` count spikes)

### Alerting: Betterstack + Sentry Alerts

**P1 (page immediately):**
| Condition | Source | Channel |
|-----------|--------|---------|
| `api` or `web` health check failing >2 min | Betterstack Uptime | Email + Slack |
| Unhandled exception rate spike (>10x baseline) | Sentry Alert | Email + Slack |
| PROCESS_RUN job error rate >20% | Sentry Alert | Email + Slack |

**P2 (notify, no page):**
| Condition | Source | Channel |
|-----------|--------|---------|
| Job queue depth >100 for >5 min | Prometheus → Fly Grafana alert | Slack |
| p95 API latency >2s (sustained 5 min) | Prometheus → Fly Grafana alert | Slack |
| Disk usage >80% on Postgres | Fly.io dashboard alert | Email |

**P3 (weekly digest):**
- Sentry weekly summary email
- Betterstack monthly uptime report

Alerting channels for MVP: email (on-call engineer) + Slack `#alerts` channel.
PagerDuty integration deferred until we have a team large enough to rotate.

---

## Implementation Checklist

### Phase 1 — Before first deploy (required)

- [ ] Create Sentry project "tinker" with two environments: `staging`, `production`
- [ ] Add `SENTRY_DSN` to GitHub Secrets (one DSN for all environments; environment
      tag distinguishes them)
- [ ] Add `@sentry/node` to `apps/api` and `apps/worker`
- [ ] Add `@sentry/nextjs` to `apps/web`
- [ ] Implement `/healthz`, `/healthz/db`, `/healthz/redis` in `apps/api`
- [ ] Add Prometheus `/metrics` endpoint to `apps/api` (using `prom-client`)
- [ ] Configure Betterstack Uptime monitors (4 monitors, see above)
- [ ] Add Betterstack log shipping token to `fly.toml`
- [ ] Configure Sentry releases in deploy workflows (GitHub Actions → Sentry release)
- [ ] Create Fly.io Grafana dashboard with the 5 application metrics above

### Phase 2 — After first real traffic

- [ ] Tune Sentry transaction sample rate based on volume (start 10%, adjust)
- [ ] Define Grafana alert thresholds based on observed baseline
- [ ] Add PagerDuty if on-call rotation is needed
- [ ] Add Datadog or Grafana Cloud if Fly Metrics proves insufficient

---

## Secrets Required

Add to GitHub Secrets and Fly.io app secrets:

| Secret | Description |
|--------|-------------|
| `SENTRY_DSN` | Sentry DSN for error tracking |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for release creation in CI |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug (e.g. `tinker`) |
| `BETTERSTACK_SOURCE_TOKEN` | Betterstack Logs source token (for log shipping) |

---

## Alternatives Considered

| Option | Reason not chosen |
|--------|------------------|
| Datadog | Cost — becomes expensive fast; overkill for MVP |
| New Relic | Similar cost concern; Sentry covers error tracking better |
| Self-hosted Grafana + Loki | Operational overhead; we're on Fly.io, not k8s |
| PagerDuty (now) | No team yet to rotate; Betterstack alerting sufficient for 1–2 eng |
| Rollbar | Sentry has better Next.js integration and wider ecosystem |

---

## Consequences

- Zero-config infrastructure metrics via Fly.io (no agent to maintain)
- Sentry catches runtime errors with full stack traces and release tracking
- Betterstack provides a single pane for uptime + logs at low cost
- All three tooling choices have free tiers that cover MVP; upgrade paths are clear
- `/healthz` endpoints are also consumed by Fly.io health checks in `fly.toml`
  (Fly restarts unhealthy machines automatically)

# Runbook: Monitoring Setup

Follow this checklist when provisioning a new environment.
Covers Sentry, Betterstack, and Fly.io metrics (per ADR-0003).

---

## 1. Sentry

1. Create account at https://sentry.io (free Developer plan is fine for staging)
2. Create a new project: **Platform → Node.js**, name it `tinker`
3. Copy the DSN from Project Settings → Client Keys
4. Add to GitHub Secrets:
   - `SENTRY_DSN` — the DSN
   - `SENTRY_AUTH_TOKEN` — from User Settings → Auth Tokens (scope: `project:releases`)
   - `SENTRY_ORG` — your Sentry organization slug
   - `SENTRY_PROJECT` — `tinker`
5. Add `SENTRY_DSN` to Fly.io app secrets:
   ```bash
   fly secrets set SENTRY_DSN=<dsn> -a tinker-api
   fly secrets set SENTRY_DSN=<dsn> -a tinker-worker
   fly secrets set SENTRY_DSN=<dsn> -a tinker-web
   ```
6. In Sentry, create two environments: `staging` and `production`
7. Configure alert rules (in Sentry → Alerts → Create Alert):
   - **P1**: "New issue" in any service → email + Slack `#alerts`
   - **P1**: Error rate increase >10× over 1h → email + Slack `#alerts`
   - **P1**: `PROCESS_RUN` job error rate >20% → Slack `#alerts`

---

## 2. Betterstack (Uptime Monitoring)

1. Create account at https://uptime.betterstack.com (free tier: 10 monitors, 1-min interval)
2. Add the following monitors under **Uptime → Monitors → New Monitor**:

| Name | URL | Type | Interval |
|------|-----|------|----------|
| API (shallow) | `https://api.tinker.dev/healthz` | HTTP keyword | 1 min |
| API (Postgres) | `https://api.tinker.dev/healthz/db` | HTTP status | 1 min |
| API (Redis) | `https://api.tinker.dev/healthz/redis` | HTTP status | 1 min |
| Web app | `https://app.tinker.dev/` | HTTP status | 1 min |

3. For each monitor, set escalation policy:
   - **Incident after**: 2 consecutive failures (≈2 min)
   - **Alert channels**: Email (on-call engineer) + Slack `#alerts` webhook
4. Status page (optional): create a public status page at status.tinker.dev

---

## 3. Betterstack Logs (Log Aggregation)

1. Create a Source in Betterstack Logs → **New Source → Fly.io**
2. Copy the source token
3. Add to Fly.io app (repeat for each app):
   ```bash
   fly secrets set BETTERSTACK_SOURCE_TOKEN=<token> -a tinker-api
   fly secrets set BETTERSTACK_SOURCE_TOKEN=<token> -a tinker-worker
   ```
4. Confirm logs appear in Betterstack Logs within ~1 min of first deploy

Log retention: 3 days (free tier). Upgrade to paid if longer retention is needed.

---

## 4. Fly.io Metrics (Grafana)

Fly.io automatically exposes metrics for all apps at `https://fly.io/apps/<app>/metrics`.
No setup required beyond deployment.

To view the built-in Grafana dashboard:
1. Go to https://fly.io/dashboard → select your org → Metrics
2. Select app `tinker-api` to see HTTP request rate, latency, CPU, memory

To set up P2 alerts on Fly Grafana:
1. In Fly Metrics → Alert Rules → New Rule
2. Job queue depth: `tinker_job_queue_depth > 100` sustained 5 min → Slack `#alerts`
3. API p95 latency: `histogram_quantile(0.95, ...) > 2` sustained 5 min → Slack `#alerts`

---

## 5. P1 Incident Response

When a P1 alert fires:

1. **Service down** (Betterstack pages):
   - Check `fly status -a tinker-api` (or relevant app)
   - Check `fly logs -a tinker-api` for error messages
   - Restart if needed: `fly machines restart -a tinker-api`
   - Escalate to Fly.io support if Postgres/Redis managed service is down

2. **Error spike** (Sentry pages):
   - Go to Sentry → Issues, filter by `environment:production`
   - Find the new issue or volume spike
   - Check recent deploys (Sentry → Releases)
   - Roll back if a bad deploy: re-deploy previous SHA

3. **All clear**: update Betterstack status page incident as resolved

---

## Secrets Checklist (all environments)

| Secret | Where | Required before first deploy |
|--------|-------|------------------------------|
| `SENTRY_DSN` | GitHub Secrets + Fly.io secrets | Yes |
| `SENTRY_AUTH_TOKEN` | GitHub Secrets only | Yes (for release tracking) |
| `SENTRY_ORG` | GitHub Secrets only | Yes |
| `SENTRY_PROJECT` | GitHub Secrets only | Yes |
| `BETTERSTACK_SOURCE_TOKEN` | Fly.io secrets only | No (add after deploy) |

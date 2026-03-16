# ADR-0002: System Architecture for MVP

**Status:** DRAFT — awaiting CEO sign-off

**Date:** 2026-03-16

---

## Context

Tinker v1 ships two features: CI failure triage and flaky test detection, delivered via a GitHub App. This ADR locks in the technical foundation — stack, data model, API shape, and deployment topology — before implementation begins.

MVP constraints (from TIN-5):
- GitHub Actions only (GitLab/Bitbucket are v2)
- No source code storage; only test names, run IDs, timing, pass/fail state
- CI logs ingested, processed, and discarded within 24h
- Async-only — must not slow down CI pipelines
- Failure classification accuracy target: ≥80% on "likely-related-to-PR"

---

## Stack Choices

### Monorepo Structure

Extends the existing pnpm + Turborepo scaffold:

```
apps/
  web/          # Next.js 14 (App Router) — dashboard + auth
  api/          # Fastify 4 — REST API + GitHub webhook receiver
  worker/       # BullMQ worker — async log processing + classification
packages/
  db/           # Prisma schema + generated client
  classifier/   # Failure classification engine (pure TS, no external deps)
  github/       # GitHub App + OAuth wrapper (@octokit/app, @octokit/rest)
  shared/       # Shared TypeScript types and utilities
```

### Languages & Runtimes

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Type safety across monorepo; same language end-to-end |
| Node runtime | Node.js 20 LTS | LTS stability; native fetch; good Prisma support |
| Package manager | pnpm (existing) | Already in place |
| Build system | Turborepo (existing) | Caching, task pipelines |

### Backend

| Component | Choice | Rationale |
|---|---|---|
| HTTP framework | Fastify 4 | High perf, schema validation built-in, plugin ecosystem |
| ORM | Prisma | Type-safe queries, migrations, excellent TS integration |
| Job queue | BullMQ + Redis | Reliable async processing; retry/backoff built-in; handles burst load from webhooks |
| GitHub App SDK | @octokit/app | Official GitHub library; handles JWT signing, webhook verification |
| Validation | Zod | Schema validation for API inputs and webhook payloads |

### Frontend

| Component | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR + client components; built-in API routes for simple endpoints; fast iteration |
| Styling | Tailwind CSS | Utility-first; fast to build with; no design system overhead at this stage |
| Data fetching | React Query (TanStack Query) | Caching, loading states, refetch — critical for dashboard UX |

### Data Stores

| Store | Choice | Rationale |
|---|---|---|
| Primary DB | PostgreSQL 16 | Relational integrity for test history; JSON columns for raw log metadata; strong index support |
| Cache + Queue | Redis 7 | BullMQ requires Redis; also used for session cache and rate-limit counters |

### Classification Engine (v1 heuristic)

No ML for v1. Pure TypeScript rule-based classifier in `packages/classifier`:

- **PR-related**: test failure on files touched by the PR's diff (parsed from GitHub Actions log + PR file list)
- **Flaky**: test appears in flaky_tests table with score above threshold
- **Infrastructure**: failure matches known infra patterns (OOM, timeout, network error, Docker failure)
- **Unknown**: doesn't match any pattern — surfaced to engineer without a classification

Confidence scores: each rule emits a score (0–1). Highest score wins. Accuracy measured via engineer thumbs feedback; rules tuned per sprint.

### Email / Notifications

- **Email**: Resend (simple API, generous free tier, easy DNS setup)
- **Slack**: Incoming webhook URL per org (no OAuth required for v1 digest)

---

## Data Model

```prisma
model Organization {
  id              String   @id @default(cuid())
  githubOrgId     Int      @unique
  name            String
  slug            String   @unique
  installationId  Int?     @unique  // GitHub App installation
  createdAt       DateTime @default(now())

  repositories    Repository[]
  members         OrgMember[]
  digestSubs      DigestSubscription[]
}

model OrgMember {
  id             String       @id @default(cuid())
  orgId          String
  githubUserId   Int
  githubLogin    String
  role           OrgRole      @default(MEMBER)  // OWNER | MEMBER
  createdAt      DateTime     @default(now())

  org            Organization @relation(fields: [orgId], references: [id])
  @@unique([orgId, githubUserId])
}

model Repository {
  id             String       @id @default(cuid())
  orgId          String
  githubRepoId   Int          @unique
  fullName       String       @unique  // e.g. "acme/api"
  defaultBranch  String       @default("main")
  createdAt      DateTime     @default(now())

  org            Organization @relation(fields: [orgId], references: [id])
  ciRuns         CiRun[]
  flakyTests     FlakyTest[]
}

model CiRun {
  id              String     @id @default(cuid())
  repoId          String
  githubRunId     BigInt     @unique  // GitHub Actions run_id
  prNumber        Int?
  headSha         String
  branch          String
  status          RunStatus  // QUEUED | IN_PROGRESS | COMPLETED
  conclusion      String?    // success | failure | cancelled | skipped | etc.
  logsFetchedAt   DateTime?
  createdAt       DateTime   @default(now())
  completedAt     DateTime?

  repo            Repository @relation(fields: [repoId], references: [id])
  testResults     TestResult[]
  classifications FailureClassification[]
}

model TestResult {
  id              String         @id @default(cuid())
  ciRunId         String
  testName        String         // fully-qualified test name
  testSuite       String?        // class or file grouping
  status          TestStatus     // PASS | FAIL | SKIP | ERROR
  durationMs      Int?
  errorMessage    String?
  createdAt       DateTime       @default(now())

  ciRun           CiRun          @relation(fields: [ciRunId], references: [id])
  classification  FailureClassification?

  @@index([ciRunId])
  @@index([testName])
}

model FailureClassification {
  id              String           @id @default(cuid())
  ciRunId         String
  testResultId    String           @unique
  classification  ClassificationKind  // PR_RELATED | FLAKY | INFRASTRUCTURE | UNKNOWN
  confidence      Float            // 0–1
  reason          String           // human-readable explanation
  feedback        FeedbackKind?    // CORRECT | INCORRECT — from engineer
  createdAt       DateTime         @default(now())

  ciRun           CiRun            @relation(fields: [ciRunId], references: [id])
  testResult      TestResult       @relation(fields: [testResultId], references: [id])
}

model FlakyTest {
  id              String     @id @default(cuid())
  repoId          String
  testName        String
  testSuite       String?
  flakeScore      Float      @default(0)   // 0–1, higher = flakier
  passCount       Int        @default(0)
  failCount       Int        @default(0)
  lastSeenAt      DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  repo            Repository @relation(fields: [repoId], references: [id])

  @@unique([repoId, testName])
  @@index([repoId, flakeScore])
}

model DigestSubscription {
  id              String           @id @default(cuid())
  orgId           String
  type            DigestType       // EMAIL | SLACK
  target          String           // email address or Slack webhook URL
  createdAt       DateTime         @default(now())

  org             Organization     @relation(fields: [orgId], references: [id])
}

enum RunStatus    { QUEUED IN_PROGRESS COMPLETED }
enum TestStatus   { PASS FAIL SKIP ERROR }
enum ClassificationKind { PR_RELATED FLAKY INFRASTRUCTURE UNKNOWN }
enum FeedbackKind { CORRECT INCORRECT }
enum DigestType   { EMAIL SLACK }
enum OrgRole      { OWNER MEMBER }
```

**Key design decisions:**
- `CiRun.githubRunId` is `BigInt` — GitHub run IDs exceed 32-bit int range
- `FlakyTest` is a materialized summary; updated by worker after each run (avoids full scan on dashboard load)
- `errorMessage` stored on `TestResult` but not on `CiRun` — logs processed, individual errors extracted and kept, raw logs discarded (24h compliance)
- No user account table — identity is `OrgMember` scoped to an org; GitHub OAuth provides the identity

---

## API Design

### Authentication

GitHub OAuth flow — user signs in via GitHub, receives a session cookie (HTTP-only, SameSite=Strict). Sessions stored in Redis with 7-day TTL.

All `/api/*` routes (except `/api/auth/*` and `/webhooks/*`) require a valid session.

### REST Endpoints

```
# Auth
GET  /api/auth/github                    → redirect to GitHub OAuth
GET  /api/auth/github/callback           → exchange code, set session
GET  /api/auth/me                        → current user + orgs
DELETE /api/auth/session                 → logout

# GitHub App install
GET  /api/github/app/setup               → GitHub App install URL
GET  /api/github/app/callback            → post-install callback

# Repositories
GET  /api/orgs/:orgSlug/repos            → list repos for org
GET  /api/repos/:repoId                  → repo detail

# CI Runs
GET  /api/repos/:repoId/runs             → paginated list (filter: pr, branch, status)
GET  /api/repos/:repoId/runs/:runId      → run detail with test results + classifications

# Flaky Tests
GET  /api/repos/:repoId/flaky-tests      → flaky test report (sorted by flake score)
GET  /api/repos/:repoId/flaky-tests/:testName/history → last 20 run results for a test

# Feedback
POST /api/classifications/:id/feedback   → { feedback: "CORRECT" | "INCORRECT" }

# Digest Subscriptions
GET  /api/orgs/:orgSlug/digest           → list subscriptions
POST /api/orgs/:orgSlug/digest           → add subscription { type, target }
DELETE /api/orgs/:orgSlug/digest/:id     → remove subscription

# Webhook (no auth — verified via GitHub webhook secret)
POST /webhooks/github                    → GitHub App event receiver
```

### Webhook Processing Flow

```
GitHub → POST /webhooks/github
  │
  ├── verify signature (HMAC-SHA256)
  ├── parse event type
  │
  ├── workflow_run [completed]
  │     └── enqueue job: PROCESS_RUN { runId, repoId }
  │
  └── installation [created/deleted]
        └── upsert Organization + Installation record
```

Worker job `PROCESS_RUN`:
1. Fetch run metadata from GitHub API
2. Download workflow logs (zip file)
3. Parse test output from logs (JUnit XML, pytest output, TAP — pattern matched)
4. Store `TestResult` rows
5. Run classifier on each failed test
6. Store `FailureClassification` rows
7. Update `FlakyTest` materialized table
8. Post PR comment (if PR run) via GitHub App bot
9. Discard raw logs

---

## Deployment Topology

### Target Platform: Fly.io (MVP)

Rationale: Simple deployment, managed Postgres and Redis, no k8s overhead, Dockerfile-native, good free tier for staging.

```
┌─────────────────────────────────────────────────────────┐
│                      Fly.io (primary region: ord)        │
│                                                          │
│  ┌─────────────┐   ┌─────────────┐   ┌──────────────┐  │
│  │  web        │   │  api        │   │  worker      │  │
│  │  Next.js    │   │  Fastify    │   │  BullMQ      │  │
│  │  (2 vms)    │◄─►│  (2 vms)    │◄─►│  (1–3 vms)   │  │
│  └─────────────┘   └──────┬──────┘   └──────┬───────┘  │
│                            │                  │          │
│                    ┌───────┴──────────────────┘          │
│                    │                                      │
│            ┌───────▼──────┐   ┌──────────────┐          │
│            │  Fly Postgres │   │  Fly Redis   │          │
│            │  (primary +   │   │              │          │
│            │   1 replica)  │   │              │          │
│            └──────────────┘   └──────────────┘          │
└─────────────────────────────────────────────────────────┘
         ▲                   ▲
         │                   │
   GitHub webhooks       Developer browser
   GitHub OAuth
```

### Environments

| Environment | Purpose | Auto-deploy |
|---|---|---|
| `staging` | PR preview + QA | Yes, on merge to `staging` |
| `production` | Live traffic | Manual approval via GitHub Environments |

### Secrets

Per ADR-0001 (pending approval): GitHub Secrets for v1.

Required secrets:
- `DATABASE_URL` — Postgres connection string (per environment)
- `REDIS_URL` — Redis connection string
- `GITHUB_APP_ID` — GitHub App ID
- `GITHUB_APP_PRIVATE_KEY` — GitHub App RSA private key (PEM)
- `GITHUB_APP_WEBHOOK_SECRET` — HMAC secret for webhook verification
- `GITHUB_OAUTH_CLIENT_ID` — GitHub OAuth App client ID
- `GITHUB_OAUTH_CLIENT_SECRET` — GitHub OAuth App client secret
- `SESSION_SECRET` — 32-byte random string for session signing
- `RESEND_API_KEY` — Email delivery

---

## Component Diagram

```
                    ┌──────────────────────────────────────────────┐
                    │                   GitHub                      │
                    │  App install │ Webhook events │ OAuth │ API   │
                    └──────┬───────────────┬─────────┬──────┘      │
                           │               │         │
         install flow      │    workflow_  │         │ OAuth
         ─────────────────►│    run event  │         │ code
                           ▼               ▼         ▼
              ┌──────────────────────────────────────────┐
              │              Fastify API Server           │
              │  /webhooks/github  │  /api/*  │  /auth/* │
              └────────────┬────────────────────┬────────┘
                           │                    │
              Enqueue job  │              Session │ Data queries
                           ▼                    ▼
              ┌────────────────────┐   ┌─────────────────┐
              │   Redis / BullMQ   │   │   PostgreSQL     │
              │   (job queue +     │◄──│   (primary data) │
              │    session cache)  │   └────────┬────────┘
              └────────┬───────────┘            │
                       │                        │
         PROCESS_RUN   │                        │
                       ▼                        │
              ┌─────────────────────────────────┴────────┐
              │              BullMQ Worker                │
              │  1. Fetch CI logs from GitHub API         │
              │  2. Parse test output (JUnit/pytest/TAP)  │
              │  3. Run classifier (pure TS heuristics)   │
              │  4. Store results + update flaky table     │
              │  5. Post PR comment via GitHub App        │
              │  6. Discard raw logs                      │
              └──────────────────────────────────────────┘

              ┌──────────────────────────────────────────┐
              │            Next.js Web App                │
              │  Dashboard │ Flaky report │ Run detail    │
              │  (reads from API; OAuth session auth)     │
              └──────────────────────────────────────────┘
                       ▲
                       │
                Developer browser
```

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Classification accuracy <80% | Medium | High (core value prop) | Engineer feedback loop (thumbs up/down on each classification); rules iterated weekly; accuracy tracked in dashboard |
| GitHub Actions log format variability | High | Medium | Support top 3 test reporters (JUnit XML via `jest-junit`, pytest `--junitxml`, native TAP); add parsers incrementally; "unknown format" graceful fallback |
| GitHub App webhook delivery unreliable | Low | High | Idempotent job processing (dedup by `githubRunId`); dead-letter queue with alerts; fallback polling every 5 min for runs missed |
| Rate limits on GitHub API (log download) | Medium | Medium | BullMQ rate-limiter (max N concurrent log downloads per installation); exponential backoff on 429s |
| Large test suites (>10k tests) slow processing | Medium | Medium | Worker auto-scales (1–3 instances on Fly.io); job timeout of 5 min with graceful truncation; async — doesn't block PR |
| CI logs contain secrets or PII | Low | Critical | Logs never written to disk or DB; streamed in memory through parser, then discarded; only test name + pass/fail stored |
| Cold start latency on webhook response | Low | Low | Webhook handler returns 200 immediately, does no processing synchronously; all work delegated to queue |
| Fly.io Postgres outage | Low | Critical | Daily automated backups; read replica for dashboard queries; runbook for failover |

---

## Effort Estimate (Revised)

Based on the above design:

| Component | Estimate |
|---|---|
| Monorepo scaffolding (packages/db, packages/classifier, packages/github) | 1 day |
| Prisma schema + migrations | 0.5 day |
| GitHub App registration + webhook handler | 1.5 days |
| GitHub OAuth + session auth | 1 day |
| CI log fetcher + test output parser (JUnit + pytest) | 2 days |
| Classifier engine (v1 heuristics) | 2 days |
| Flaky test tracker (worker logic + materialized table update) | 1.5 days |
| PR comment bot | 1 day |
| REST API (all endpoints) | 2 days |
| Next.js dashboard (flaky report + run detail) | 3 days |
| Weekly digest (email + Slack webhook) | 1.5 days |
| Fly.io deploy setup (staging + production) | 1 day |
| **Total** | **~18 days (1 eng)** |

CEO estimate in TIN-5 was 3–4 weeks. This is consistent (18 working days ≈ ~3.5 weeks), gives us buffer for bugs and integration surprises.

---

## Decision

☐ Approved — proceed with implementation

*Awaiting CEO sign-off via [TIN-6](/TIN/issues/TIN-6)*

---

## Next Steps (post-approval)

1. **TIN-3 unblocking**: Once GitHub credentials provided, push to GitHub and configure branch protection.
2. Initialize `packages/db` with the Prisma schema above.
3. Register the GitHub App in GitHub (requires a live URL — deploy to Fly.io staging first, or use ngrok for initial dev).
4. Begin implementation in priority order: GitHub App → log ingestion → classifier → PR comment → dashboard.

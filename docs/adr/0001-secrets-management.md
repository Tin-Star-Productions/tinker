# ADR-0001: Secrets Management

**Status:** DRAFT — awaiting CEO sign-off

**Date:** 2026-03-16

---

## Context

We need a secrets management strategy before we can safely deploy. The options range from simple (environment variables in CI) to sophisticated (dedicated secrets manager). The right choice depends on our current team size (small), compliance posture (early stage), and operational overhead we can absorb.

---

## Options Considered

### Option A: GitHub Secrets + Environment Variables (Recommended for v1)

**How it works:**
- Secrets stored in GitHub repository secrets and GitHub Environments (per-environment: staging, production)
- Injected as env vars into CI/CD and deployment workflows
- Local dev uses `.env` file (never committed, copied from `.env.example`)

**Pros:**
- Zero additional infrastructure
- Already integrated with our GitHub Actions CI
- Per-environment isolation via GitHub Environments
- Access audit trail via GitHub UI
- Free

**Cons:**
- Secrets are not rotated automatically
- Can't reference a secret from multiple repos without duplication
- Limited access control granularity (repo-level, not resource-level)
- No dynamic secrets or TTL enforcement

**Verdict:** Good for early stage. Upgrade path to Option C when we have >3 engineers or hit compliance requirements.

---

### Option B: HashiCorp Vault (Self-hosted)

**How it works:**
- Self-hosted Vault cluster stores and vends secrets dynamically
- CI/CD and apps authenticate via GitHub OIDC or app tokens to retrieve secrets at runtime
- Dynamic secrets: DB credentials rotate automatically

**Pros:**
- Dynamic credentials with TTLs (excellent security posture)
- Granular access policies
- Full audit log
- Works across any infra

**Cons:**
- Operational overhead to run and maintain Vault cluster
- Adds complexity before we've validated the product
- Cost (compute + ops time)

**Verdict:** Appropriate for Series A+ or when compliance requires it. Overkill for MVP.

---

### Option C: AWS Secrets Manager / GCP Secret Manager

**How it works:**
- Cloud-managed secrets store, accessed via IAM
- Apps read secrets at runtime via SDK; no secrets in env vars
- Supports automatic rotation for supported databases

**Pros:**
- Managed — no infra to run
- Fine-grained IAM access control
- Rotation for DB credentials
- Audit via CloudTrail/Cloud Audit Logs

**Cons:**
- Ties us to a specific cloud provider
- Adds IAM complexity before infra decisions are made
- Cost (small but non-zero)

**Verdict:** Best long-term option once we've chosen a cloud provider. Natural upgrade from Option A.

---

## Recommendation

**Phase 1 (now → first paying customers):** Option A — GitHub Secrets + env files

- Zero friction, already available, no extra infra
- CEO approves all new secret additions via GitHub Environments

**Phase 2 (first 10 customers → Series A):** Migrate to Option C (AWS/GCP Secrets Manager)

- When we commit to a cloud provider, adopt their native secrets store
- Apps read secrets at runtime; remove direct env var exposure

**Hardcoded rules regardless of phase:**
1. `.env` files are never committed. Enforced by `.gitignore`.
2. All secrets in CI are stored in GitHub Secrets, never in workflow YAML.
3. Separate secret values for dev, staging, and production — never shared.
4. When a team member leaves, rotate all secrets they had access to.

---

## Decision

☐ Approved — proceeding with Option A for v1

*Awaiting CEO sign-off via [TIN-3](/TIN/issues/TIN-3)*

# 17 · Current State (as of 2026-07-22)

## Snapshot

- **Live in production** at `https://app.roamhub360.com` on a DigitalOcean droplet (Docker + Postgres +
  Caddy), co-hosted with the BlueShift helpdesk. Real users are signing in (SSO into e.g. the `mssodali`
  workspace observed in logs).
- **Latest deploy** ran the schema migration successfully ("database in sync") and the app is serving
  traffic. The migrator was switched to `migrate deploy` (H6 follow-up, commit `d2a80ce`) — on the next
  deploy the container self-baselines and uses versioned migrations.
- **Codebase health:** `tsc` clean, **0 lint errors**, ~151 unit tests pass (~19 skipped), production
  `npm audit` = 0 high/critical. ~104 commits on `main`, all pushed.

## Completed features

Full booking engine, floor-plan editor, check-in/out + QR, "Who's in" presence (A–F), AI concierge,
multi-tenancy (app-code isolation), per-tenant Microsoft integration, per-site licensing + enforcement,
Partner control plane, feature flags, white-label branding, KB + Support Centre, email (Graph + Resend),
web push (off until keys set), public REST API + API keys, webhooks/Slack, real-time SSE, structured
audit trail, versioned migrations. See `08_FEATURE_STATUS.md`.

## Recently added / fixed (this session)

The enterprise-hardening pass: **C1** transactional purge/export, **C2** webhook SSRF, **C3** upload
validation, **C4** (prepared FK+RLS), **H1** host allowlist, **H2** API-key governance (SQL), **H3/H4**
Redis-ready rate-limit + SSE, **H5** single Prisma client, **H6** versioned migrations + self-baselining
container migrator, **H7/U1** timezone fix, **H8** idempotent jobs, **H9** deps, **M2–M8** (audit, CSP,
Graph timeouts, redaction, AI guardrails, presence scoping), **Q1** lint-green, **U4** fetch handling,
**U5** a11y labels. All committed + pushed.

## Features in progress

- **C4 (DB tenant isolation)** — SQL + runbook written (`prisma/planned/`, `docs/C4-tenancy-hardening.md`);
  **awaiting a staging Postgres** to apply + validate. This is the only "in progress" item with code artifacts.
- Everything else in the backlog is not-yet-started (see below).

## Open issues / blockers

- **No staging environment** — blocks C4/RLS validation and CI E2E. (Biggest blocker.)
- **Single instance** — must provision **Redis** (`REDIS_URL`) before running >1 replica.
- **Billing stub** — no live Stripe flow.
- **Microsoft-integration untested** against a real Entra tenant end-to-end.
- **No pen-test.**
- Demo data (`data/*.json`) is not in the repo.

## Production readiness

- **Pilot/demo: ready and live.** ✅
- **Enterprise GA: not yet.** Gate on: apply+validate C4 RLS, external pen-test, Redis for scale, CI +
  staging, and full Microsoft-integration testing.

## Immediate next actions (recommended)

1. Finish the in-flight **deploy verification** (app is up; re-issue API keys in Admin → Developer & API).
2. Provision a **staging Postgres**; apply `prisma/planned/01` + `02`; run the C4 leak test; wire `withTenant()`.
3. Provision **Redis**; set `REDIS_URL`.
4. Stand up **CI** (tsc + lint + vitest + audit:ci + Playwright vs staging).

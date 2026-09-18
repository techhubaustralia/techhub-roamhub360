# 10 · Pending Work

Priority: **P1** (do before scaling / enterprise GA) · **P2** (important) · **P3** (nice-to-have).
Effort: **S** <1d · **M** 1–3d · **L** >3d.

## Android app — operator steps (2026-09-17; web side complete, see `21_ANDROID_APP.md`)

| Item | Pri | Effort | Notes / dependency |
|---|---|---|---|
| Google Play developer account (TechHub Australia) + app record `com.techhubaustralia.roamhub360`, Play App Signing | P1 | S (+ days of Google verification) | Blocks everything below. |
| `ANDROID_ASSETLINKS_SHA256` (app-signing + upload fingerprints) and VAPID keys into the droplet `.env` | P1 | S | `/.well-known/assetlinks.json` returns 404 until set; push stays off until VAPID set. |
| Bubblewrap project in its own repo; `additionalTrustedOrigins` = current tenant subdomains (option a) | P1 | S–M | Needs JDK 17 + Android SDK locally. Adding a customer = app release. |
| `android-cicd` pipeline; first internal-testing upload by hand; listing + Data safety | P1 | M | Drafts in `21_ANDROID_APP.md` §6–7; screenshots from the deployed app. |
| iOS App Store shell (Capacitor) | P3 | L | Decision deferred; PWA Add-to-Home-Screen works today. |

## Operations (found 2026-09-18)

| Item | Pri | Effort | Notes / dependency |
|---|---|---|---|
| **Scheduled-jobs cron was never installed on the droplet** — reminders, auto-release, digests, licence warnings never ran | P1 | S | `scripts/jobs-tick.sh` + two cron lines (`docs/DEPLOY-DROPLET.md` §8). Verify `/var/log/roamhub360-jobs.log` shows `HTTP 200` every 30 min. |
| **No backups of the RoamHub360 database or appdata volume** | P1 | S | `scripts/backup-droplet.sh` + cron (§10). Then a restore drill, then an **offsite** copy (rclone → DO Spaces/OneDrive). |
| No uptime monitoring / alerting | P2 | S | External checker on `https://app.roamhub360.com/api/health` (expects `{"status":"ok","db":"ok"}`), alert to OPS_EMAIL. |
| Email authentication for the sending domain (SPF/DKIM/DMARC) unverified | P2 | S | Check `Authentication-Results` on a received invite; fix DNS for the Resend/Graph sender. |

## Outstanding bugs / correctness

| Item | Pri | Effort | Notes / dependency |
|---|---|---|---|
| Retired-deployment docs (`ONBOARDING.md`, `RUNBOOK.md`, `DEPLOY.md`, `docs/DEPLOY.md`, `azure-pipelines.yml`) carry a SUPERSEDED banner but still exist | P3 | S | Delete once nobody needs the history; `docs/DEPLOY-DROPLET.md` + `PROJECT_HANDOVER/` are current. |
| `npm audit` advisory on `prisma`/`deepmerge-ts` (dev tooling path) | P3 | S | Accepted 2026-09-14; revisit on the next Prisma minor. |
| Billing is a stub — no live Stripe flow | P2 | M | `lib/server/billing.ts`, `/api/billing`. Needs a Stripe account + product/price + webhook. |
| Demo data not in repo (`data/*.json` gitignored) | P3 | S | Create via editor UI on the new host, or seed the volume. |
| Cosmetic: assistant proposal card shows short label when model passes a terse `space_label` | P3 | S | `assistant-widget.tsx` / `resolveSpaceLabel`. |

## Technical debt

| Item | Pri | Effort | Notes |
|---|---|---|---|
| **C4 not applied** — no DB-level tenant isolation | P1 | M–L | `withTenant()` now exists (`lib/server/tenant-rls.ts`, flag `TENANT_RLS`, off by default, unit-tested). Remaining: route data-access functions through it (no behaviour change while off), then on **staging** apply `prisma/planned/01`+`02`, set `TENANT_RLS=on`, run the leak test. See `docs/C4-tenancy-hardening.md`. **Needs a staging Postgres.** |
| **M1** identity/membership split (users → User + Membership join for multi-workspace) | P2 | L | C4-adjacent data-model change. |
| **M6** generic blob-write concurrency (whole-file read-modify-write in `store.ts` for push subs/plans) | P2 | M | Move hot config to SQL or add optimistic concurrency. |
| **U3** floor-plan editor decomposition (`app/editor/[id]/page.tsx` is large) | P3 | M | Refactor, no behaviour change. |
| Two historical Prisma clients merged already (H5) — verify no stragglers import `@prisma/client` directly | P3 | S | Should all go through `lib/server/prisma.ts`. |

## Features partially implemented

| Item | Pri | Effort |
|---|---|---|
| **U2** guided onboarding / dashboards (beyond the checklist) | P2 | L |
| SAML SSO / SCIM (deferred; only for a specific enterprise deal) | P3 | L |
| Web push is built but off until VAPID keys are set (now a P1 under the Android track above) | P1 | S |

## Areas requiring testing

| Item | Pri | Effort | Notes |
|---|---|---|---|
| **Microsoft-dependent flows** (directory sync, room calendar, Teams SSO, Entra org consent) | P1 | M | Untested without a real Entra tenant + Graph consent. |
| **C4 RLS leak test** on staging | P1 | M | Two-tenant isolation proof (in the C4 runbook). |
| **E2E harness in CI** (Q2/Q3) | P3 | S | CI now runs tsc/lint/unit/build + the 31-test live API suite on every push/PR (`.github/workflows/ci.yml`, 2026-09-17). Only the Playwright UI spec (`e2e/booking.spec.ts`) is still outside CI — it needs seeded fixtures. |
| Live billing (Stripe) end-to-end | P2 | M | After billing is wired. |

## Performance

| Item | Pri | Effort | Notes |
|---|---|---|---|
| **H3/H4** provision Redis before running >1 replica | P1 | S | `REDIS_URL` is now passed through by `docker-compose.cohost.yml` (was missing until 2026-09-17). Add a `redis` service (or managed Redis), set `REDIS_URL=redis://redis:6379`, verify rate-limit + SSE across two replicas. Single instance today needs nothing. |
| Graph directory sync at scale (paging/backoff) | P3 | M | Already best-effort; validate on a large directory. |

## Security

| Item | Pri | Effort | Notes |
|---|---|---|---|
| **External penetration test** | P1 | — | Third-party engagement; not done. |
| Apply C4 RLS (defense-in-depth) | P1 | M–L | See above. |
| `CREDENTIAL_KEY` rotation-with-re-encryption procedure | P2 | M | Today rotating orphans saved secrets. |
| Impersonation "as a specific user" (today: operator opens the subdomain, audited) | P3 | M | Enhance the control plane. |

## Commercial

| Item | Pri | Effort |
|---|---|---|
| Live billing provider (Stripe / MS Marketplace / Xero / MYOB) | P2 | L |
| Per-tenant sync-failure / credential-expiry push alerts (event-driven) | P3 | M |
| Staging environment (CI exists as of 2026-09-17; deploys are still manual `docker compose up` by design) | P2 | M |

## The single tracked backlog item

All of the above roughly maps to what the project called **task #36 "INFRA/DESIGN backlog"**: C4/RLS,
M1 identity split, M6 concurrency, U2 onboarding, U3 editor decomposition, U5 full a11y audit, Q2/Q3
staging+E2E, Redis provisioning, and the external pen-test.

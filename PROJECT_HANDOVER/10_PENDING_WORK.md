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

## Outstanding bugs / correctness

| Item | Pri | Effort | Notes / dependency |
|---|---|---|---|
| Stale docs still describe Azure / the predecessor deployment (`ONBOARDING.md`, `RUNBOOK.md`, `teams/README.md`, some `graph.test.ts` fixture names) | P3 | S | Doc-only cleanup; `PROJECT_HANDOVER/` and `docs/DEPLOY-DROPLET.md` are current. |
| `.env.example` vs `05_ENVIRONMENT_CONFIGURATION.md` disagree on `AUTH_MICROSOFT_ENTRA_ID_ISSUER` (`/common/v2.0` is correct for multi-tenant) | P3 | S | Align the example file. |
| `npm audit` advisory on `prisma`/`deepmerge-ts` (dev tooling path) | P3 | S | Accepted 2026-09-14; revisit on the next Prisma minor. |
| Billing is a stub — no live Stripe flow | P2 | M | `lib/server/billing.ts`, `/api/billing`. Needs a Stripe account + product/price + webhook. |
| Demo data not in repo (`data/*.json` gitignored) | P3 | S | Create via editor UI on the new host, or seed the volume. |
| Cosmetic: assistant proposal card shows short label when model passes a terse `space_label` | P3 | S | `assistant-widget.tsx` / `resolveSpaceLabel`. |

## Technical debt

| Item | Pri | Effort | Notes |
|---|---|---|---|
| **C4 not applied** — no DB-level tenant isolation | P1 | M–L | Apply `prisma/planned/01`+`02` on **staging first**, wire `withTenant()` per-txn context, run the leak test. See `docs/C4-tenancy-hardening.md`. **Needs a staging Postgres.** |
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
| **E2E harness in CI** (Q2/Q3) | P2 | M | Playwright specs exist (`e2e/booking.spec.ts`); wire staging + CI. |
| Live billing (Stripe) end-to-end | P2 | M | After billing is wired. |

## Performance

| Item | Pri | Effort | Notes |
|---|---|---|---|
| **H3/H4** provision Redis before running >1 replica | P1 | S | Set `REDIS_URL`; both are already Redis-ready. |
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
| Staging environment + CI/CD pipeline (currently manual `docker compose up`) | P2 | M |

## The single tracked backlog item

All of the above roughly maps to what the project called **task #36 "INFRA/DESIGN backlog"**: C4/RLS,
M1 identity split, M6 concurrency, U2 onboarding, U3 editor decomposition, U5 full a11y audit, Q2/Q3
staging+E2E, Redis provisioning, and the external pen-test.

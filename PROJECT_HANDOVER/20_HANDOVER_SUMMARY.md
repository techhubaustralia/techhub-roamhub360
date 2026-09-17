# 20 · Handover Summary (Executive)

## What this is

**RoamHub360** — a multi-tenant **workplace/desk-booking SaaS** (repo `techhub-roamhub360`), sold by the MSP
**TechHub Australia** at **AUD $2,000 per site/year**. Employees book desks/offices/rooms/parking from an
interactive floor plan; admins manage plans, presence, analytics, and Microsoft 365 integration. Built
as one **Next.js 16 / React 19 / TypeScript** app with **Prisma → PostgreSQL**, **Auth.js v5**, and deep
Microsoft (Graph/Teams/Entra) + AI-concierge features.

## Current status

- **Live in production** at `https://app.roamhub360.com` on a **DigitalOcean droplet** (Docker + Postgres
  + Caddy), co-hosted with the BlueShift helpdesk. Real users are signing in.
- Completed a large **enterprise-hardening pass** (2026-07) and, in **2026-09**, the port of the
  remaining features from the retired single-tenant predecessor (booking policy, repeat weekly, office
  bookings), **tenant-isolation labelling + cross-tenant regression tests**, **Import from Microsoft 365**,
  a **transactional-email redesign**, and the **web-side groundwork for the Android (Play) app**.
  See `17_CURRENT_STATE.md` and `09_CHANGELOG.md`.
- **Health (2026-09-17):** `tsc` clean, **0 lint errors**, **220 unit + 31 live** tests pass, `next build`
  clean on Next 16's `proxy` convention. All pushed to `main`; the droplet runs the latest commit.
- ⚠️ **Migrated off Azure** — ignore the template's Azure sections; the real infra is the droplet
  (`node:22-slim` image, DB role `roamhub`, migrator self-baselined 2026-09-15).

## Architecture (one paragraph)

A single Next.js App-Router process serves UI + all API routes. It is **multi-tenant by subdomain**
(`<slug>.roamhub360.com`), with tenancy, identity, and data access centralised in `lib/server/*`
choke-points (`currentTenantId`, `getUser`, `db.ts`, single `prisma.ts`, `store.ts`). Data is in
PostgreSQL (with a JSON/file fallback for local dev); files on a Docker volume (Azure Blob optional).
Microsoft Graph runs **per tenant** (encrypted creds). Tenant scoping is enforced in application code
today; DB-level FK + RLS are **prepared but not applied** (C4).

## Business purpose & commercial readiness

- Metering = **sites** (buildings). Licence tiers cap sites + floors/site; enforcement is server-side
  (402 read-only when expired/suspended). Partner control plane (`/admin/tenants`) for MSP operators;
  per-tenant white-label branding; feature flags; self-serve trials (off by default).
- **Pilot/demo: production-ready and live.** **Enterprise GA: not yet** — see gating below.
- **Billing is a stub** (Stripe hooks only).

## Known issues

1. **No DB-level tenant isolation yet** (C4 prepared, not applied — needs staging DB). Biggest gap.
2. **Single instance** — provision **Redis** before scaling (rate-limit/SSE are Redis-ready).
3. **No staging env, no CI E2E, no external pen-test.**
4. **Microsoft-integration paths** untested against a real Entra tenant.
5. **Billing not live**; demo data not in repo.

## Next priorities (in order, 2026-09-17)

1. **Ship the Android app** — the web side is done; the operator creates the Play account/app record,
   puts the App Signing fingerprints + VAPID keys in the droplet `.env`, then Bubblewrap + `android-cicd`
   (`21_ANDROID_APP.md`). iOS stays PWA-only until a separate decision.
2. **Stand up a staging Postgres** → apply `prisma/planned/01`+`02` → run the **C4 RLS leak test** → wire
   `withTenant()` per-transaction context → schedule production rollout. (`docs/C4-tenancy-hardening.md`.)
3. **Provision Redis** (`REDIS_URL`) so the app is multi-replica-safe (H3/H4).
4. **Add CI** (tsc + lint + vitest + `audit:ci` + Playwright vs staging).
5. **Commission an external penetration test** before enterprise GA.
6. **Wire live billing** (Stripe) and test **Microsoft-integration** end-to-end.

## Exact next recommended development tasks

- [ ] Create `staging` Postgres + a staging app instance; parameterise `DATABASE_URL`.
- [ ] Apply C4 Phase A (`01-tenant-fk.sql`), validate FK constraints exist, run the app against it.
- [ ] Implement `lib/server/tenant-rls.ts` `withTenant()` (per the doc), route tenant-scoped queries through it behind a flag.
- [ ] Apply C4 Phase B (`02-tenant-rls.sql`), run the two-tenant leak test, then plan production.
- [ ] Add `docker-compose` `redis` service + set `REDIS_URL`; verify rate-limit/SSE across two app replicas.
- [ ] Add a CI workflow (GitHub Actions) running the quality gate on PRs.
- [ ] Replace the billing stub with a live Stripe flow (`lib/server/billing.ts`, `/api/billing*`).

## Where to start reading

`16_AI_CONTEXT.md` first, then `02_ARCHITECTURE.md`, `06_DATABASE.md`, `07_API_DOCUMENTATION.md`,
`10_PENDING_WORK.md`, and `docs/C4-tenancy-hardening.md`. **Do not modify code before reading the AI
context doc** — several design decisions (slug-not-UUID tenancy, dual data backend, Entra multi-tenant
config, migrator self-baselining) are deliberate and easy to break.

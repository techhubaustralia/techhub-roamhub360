# 17 · Current State (as of 2026-09-17; original snapshot 2026-07-22)

## Snapshot

- **Live in production** at `https://app.roamhub360.com` on a DigitalOcean droplet (Docker + Postgres +
  host Caddy), co-hosted with the helpdesk. Real customer workspaces are on their own subdomains.
- **Deploys 2026-09-15 → 17** (`f4d0245` … the housekeeping commit after `1393568`): the container base
  image is **`node:22-slim`** (mandatory — `undici` 8 breaks `next build` on Node 20), the migrator
  self-baselined on first run and now takes the fast path, and the DB role is **`roamhub`** (not
  `postgres`). Password + Microsoft sign-in verified on the live subdomain by the operator.
- **Codebase health:** `tsc` clean, **0 lint errors** (44 warnings, all `react-hooks/set-state-in-effect`
  / `no-img-element` style), **220 unit tests** pass + **31 live API-regression tests** (skipped unless
  `E2E_BASE` is set). `next build` clean on the Next 16 `proxy` convention (no deprecation warnings).

## Added 2026-09-14 → 17 (legacy-feature port + commercial hardening)

Everything below is additive; no existing behaviour changed except where a bug is named.
- **Booking policy per site:** check-in opening time + auto-release time (30-min ticks), enforced on
  QR and in-app check-in, `maxAdvanceDate` caps date pickers. Booking date input on the map toolbar.
- **Repeat weekly:** one request books every matching date (≤ 60), per-date rule checks, one summary
  email/push. `POST /api/bookings/recurring`.
- **Office bookings** cross-site overview (`/office-booking`, `/api/office-bookings`, feature flag
  `office-booking`), attendance stack on the map, shared `Avatar` with directory photos.
- **Dev identity simulation** for the live suite (`x-dev-user` / `x-dev-role` / `x-dev-tenant`, inert in
  production) and the 31-test regression suite with self-cleaning fixtures.
- **Transactional email redesign** (table layout, preheader, details card, personalised invite,
  white-label aware).
- **Tenant isolation (Phase 6):** stored role `global-admin` is displayed as **"Workspace admin"**
  (`lib/role-labels.ts`); "Platform operator" = `BOOTSTRAP_ADMINS` only; 4 cross-tenant live tests.
- **Import from Microsoft 365** on Users & roles (`POST /api/users/import-directory`): pre-provisions
  SSO users from the synced directory; no password, no invite email.
- **Android groundwork:** `/.well-known/assetlinks.json` (from `ANDROID_ASSETLINKS_SHA256`), manifest
  shortcuts, public PWA routes, `21_ANDROID_APP.md`, store feature graphic + render script.
- **Fixes:** map occupant search honours "hide me"; deleting a floor plan releases its bookings; tenants
  control plane exposes the `assistant` flag; reschedule modal uses the site's calendar day.

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

## Immediate next actions (recommended, 2026-09-17)

1. **Android app (Google Play)** — operator side: Play developer account → app record
   `com.techhubaustralia.roamhub360` → App Signing fingerprints + VAPID keys into the droplet `.env` →
   Bubblewrap project (tenant subdomains in `additionalTrustedOrigins`) → `android-cicd` → internal
   testing → production. Runbook: `21_ANDROID_APP.md`. The web side is complete.
2. Live checks still owed by the operator: invite email rendering in Outlook, Import from Microsoft
   365 on a real tenant, "Workspace admin" label on Users & roles.
3. Provision a **staging Postgres**; apply `prisma/planned/01` + `02`; run the C4 leak test; wire `withTenant()`.
4. Provision **Redis**; set `REDIS_URL`. (CI is in place: `.github/workflows/ci.yml` runs the gate + the
   live suite on every push/PR.)
5. iOS: PWA Add-to-Home-Screen today; an App Store shell (Capacitor) is a separate decision after Android.

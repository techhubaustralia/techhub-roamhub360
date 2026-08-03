# 19 · File Manifest

Criticality: 🔴 critical (breaks app/deploy/security if wrong) · 🟠 important · 🟢 supporting.

## Entry points & config

| Path | Purpose | Referenced by | Crit |
|---|---|---|---|
| `auth.ts` | Auth.js node config: providers (password/Entra/Google/Teams), callbacks, tenant lock. | middleware, `/api/auth` | 🔴 |
| `auth.config.ts` | Edge-safe auth config: public-route allowlist, `authorized` guard. | middleware, auth.ts | 🔴 |
| `middleware.ts` | Edge route guard (NextAuth). | all requests | 🔴 |
| `next.config.ts` | standalone output, headers/CSP, cache. | build/runtime | 🔴 |
| `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts` | Type/lint/test config. | tooling | 🟠 |
| `Dockerfile` | Multi-stage build (deps/build/runner/migrator). | deploy | 🔴 |
| `docker-compose.cohost.yml` | **Prod** compose (db/migrate/app, port 3100, env block). | deploy | 🔴 |
| `docker-compose.yml`, `Caddyfile` | Standalone variant (not used on the co-host droplet). | alt deploy | 🟢 |
| `scripts/migrate.sh` | Container migrator: `migrate deploy` + self-baseline. | Dockerfile migrator | 🔴 |
| `scripts/create-admin.mjs` | Seed first admin + default tenant. | ops | 🟠 |
| `.env.example` | Env var template (names only). | setup | 🟠 |
| `.gitattributes` | `*.sh` LF (protects migrator). | git checkout | 🟠 |
| `CLAUDE.md` / `AGENTS.md` | AI instructions (Next 16 caveats). | AI assistants | 🟠 |

## Data & tenancy (the isolation boundary)

| Path | Purpose | Crit |
|---|---|---|
| `prisma/schema.prisma` | 14 models. | 🔴 |
| `prisma/migrations/00000000000000_init/` | Baseline migration (H6). | 🔴 |
| `prisma/migrations/README.md` | Migration workflow + baselining. | 🟠 |
| `prisma/planned/01-tenant-fk.sql`, `02-tenant-rls.sql` | **C4, NOT applied** — FK + RLS. | 🟠 |
| `lib/server/prisma.ts` | Single shared Prisma client (H5). | 🔴 |
| `lib/server/db.ts` | Bookings/checkins/locks/audit, tenant-scoped, SQL|JSON. | 🔴 |
| `lib/server/tenant.ts` | `currentTenantId()` (slug from host). | 🔴 |
| `lib/tenant-host.ts` | host→tenant map + apex allowlist (edge+node, H1). | 🔴 |
| `lib/server/store.ts` | File/Blob storage, per-tenant prefixes. | 🔴 |
| `lib/server/tenant-data.ts` | Tenant purge/export (C1). | 🟠 |
| `lib/server/tenants.ts`, `tenant-integration.ts` | Tenant CRUD + encrypted Graph creds. | 🔴 |

## Identity & security

| Path | Purpose | Crit |
|---|---|---|
| `lib/server/auth.ts` | `getUser()` — server identity + membership guard. | 🔴 |
| `lib/server/users.ts`, `account-token.ts`, `token.ts`, `totp.ts`, `invite.ts` | User CRUD, tokens, 2FA, invites. | 🔴/🟠 |
| `lib/server/crypto.ts` | AES-256-GCM for tenant secrets. | 🔴 |
| `lib/server/ssrf.ts` | SSRF-safe egress (C2). | 🔴 |
| `lib/server/rate-limit.ts` | Async rate limit (Redis-ready, H3). | 🔴 |
| `lib/redact.ts`, `lib/image-guard.ts`, `lib/audit-csv.ts`, `lib/markdown.ts`, `lib/escape-html.ts` | Log redaction, upload sniff, CSV/markdown safety. | 🟠 |
| `lib/server/apikeys.ts`, `api-v1.ts` | API-key governance + public API auth (H2). | 🔴 |
| `lib/server/teams-token.ts` | Teams SSO token verification (jose/JWKS). | 🔴 |

## Booking, product & integrations

| Path | Purpose | Crit |
|---|---|---|
| `lib/booking-rules.ts` | Validation + timezone (H7). | 🔴 |
| `app/api/bookings/route.ts` | The booking engine (validate/licence/conflict/graph/notify). | 🔴 |
| `lib/server/availability.ts`, `analytics.ts`, `reports.ts` | Free-space search, insights, ROI reports. | 🟠 |
| `lib/server/graph.ts`, `directory.ts` | Microsoft Graph + directory sync. | 🔴/🟠 |
| `lib/server/email.ts`, `mailer.ts` | Branded templates + Graph/Resend send. | 🟠 |
| `lib/server/assistant.ts`, `lib/assistant-policy.ts` | AI concierge (propose-only) + guardrails (M8). | 🟠 |
| `lib/server/licensing.ts`, `lib/license-state.ts`, `lib/expiry-notice.ts`, `lib/server/license-notify.ts` | Commerce enforcement + expiry. | 🔴/🟠 |
| `lib/server/webhooks.ts`, `push.ts`, `billing.ts` | Outbound webhooks/Slack, web push, billing stub. | 🟠 |
| `lib/server/live-bus.ts`, `job-ledger.ts` | SSE (H4) + job idempotency (H8). | 🟠 |
| `app/api/jobs/[task]/route.ts` | Scheduler tasks. | 🔴 |
| `lib/nav.ts` | RBAC nav (roles/platform/flags). | 🟠 |

## UI

| Path | Purpose | Crit |
|---|---|---|
| `app/layout.tsx`, `components/app-shell.tsx`, `sidebar.tsx`, `mobile-nav.tsx` | Shell + brand injection + nav. | 🟠 |
| `components/floorplan/floor-svg.tsx`, `lib/floorplans.ts`, `lib/plan-scale.ts` | Floor-plan rendering. | 🟠 |
| `components/assistant-widget.tsx`, `help-button.tsx`, `live-provider.tsx`, `push-toggle.tsx` | Concierge, KB/support, SSE, push. | 🟢 |
| `app/**/page.tsx` | ~30 pages (see `03_FOLDER_STRUCTURE.md`). | 🟠 |
| `lib/api.ts` | Client fetch helpers (safe error handling, U4). | 🟠 |
| `lib/brand.ts`, `app/globals.css`, `components/roamhub-mark.tsx`, `brand/` | Branding. | 🟢 |

## Docs

`docs/SYSTEM-OVERVIEW.md`, `DEPLOY-DROPLET.md`, `DEPLOY.md`, `COMMERCIAL-SETUP.md`,
`SECURITY-CHECKLIST.md`, `C4-tenancy-hardening.md`, and this `PROJECT_HANDOVER/` package. 🟠

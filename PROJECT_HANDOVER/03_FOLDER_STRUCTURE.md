# 03 · Folder Structure

Repo root: `C:\Projects\workspace-hub`. Key top-level entries:

```
workspace-hub/
├─ app/                    # Next.js App Router — pages + API route handlers
├─ components/             # React components (UI)
├─ lib/                    # shared logic (client-safe) + lib/server (server-only)
├─ prisma/                 # schema, migrations (H6), planned/ (C4 not-applied SQL)
├─ scripts/               # migrate.sh, create-admin.mjs
├─ public/                # static assets, icons, sw.js (service worker)
├─ e2e/                   # Playwright specs
├─ test/                  # vitest stubs (server-only shim)
├─ docs/                  # design/deploy/security docs (see below)
├─ brand/                 # RoamHub360 logo SVG + palette tokens
├─ teams/                 # teams manifest.json
├─ types/                 # next-auth.d.ts augmentation
├─ Dockerfile             # multi-stage: base→deps→build→runner + migrator
├─ docker-compose.yml     # standalone (with Caddy) — NOT used on the co-host droplet
├─ docker-compose.cohost.yml  # ACTUAL prod compose (no Caddy; app on 127.0.0.1:3100)
├─ Caddyfile              # standalone Caddy config (droplet uses host /etc/caddy/Caddyfile)
├─ auth.ts / auth.config.ts / proxy.ts   # Auth.js node config + DB-free config + route guard (Next 16 "proxy", ex-middleware)
├─ next.config.ts, tsconfig.json, eslint.config.mjs, vitest.config.ts, playwright.config.ts
├─ .env.example, .dockerignore, .gitignore, .gitattributes
├─ CLAUDE.md → AGENTS.md  # instructions for AI assistants working in the repo
└─ PROJECT_HANDOVER/      # THIS handover package
```

## `app/` — routes & pages

**Pages** (`page.tsx`), user-facing:
- `/` (home + setup checklist), `/book` (floor-plan booking), `/mine` (my bookings), `/team`
  (Who's-in), `/settings`, `/support`, `/signin`, `/signup`, `/forgot`, `/set-password`,
  `/verify-email`, `/privacy`, `/terms`, `/checkin` (QR), `/labels` (print QR), `/buildings`,
  `/assign` (permanent desks), `/editor/[id]` (floor-plan editor), `/insights` (analytics),
  `/teams` + `/teams/config` (Teams bridge), `/sso/{start,relay,handoff}` (cross-subdomain SSO).
- Admin pages under `/admin/*`: `audit`, `developer` (API keys/webhooks/Slack), `directory`,
  `integration` (Microsoft 365), `knowledge` (KB editor), `license`, `support`, `tenants` (platform
  control plane), `users`.

**API route handlers** (`app/api/**/route.ts`) — ~70. Grouped: `account/*` (password/verify),
`admin/*` (apikeys, directory, entra, integration, kb, license, support, tenants, webhooks),
`bookings`, `buildings`, `checkin`/`checkout`/`qr-checkin`/`qr`, `assignments`, `locks`, `plans`,
`presence`(+insights)/`occupancy`/`analytics`, `directory`, `assistant`, `audit`, `me`(+2fa/password/prefs),
`users`(+import), `tenants`(+verify), `onboarding`, `signup`, `support`, `kb`, `jobs/[task]` (scheduler),
`live` (SSE), `push`, `health`/`version`/`diag/*`, `billing`(+webhook), `auth/[...nextauth]`, and the
public `v1/{bookings,spaces,availability}`. See `07_API_DOCUMENTATION.md`.

## `lib/` — shared (client-safe) logic

`booking-rules.ts` (validation + tz), `nav.ts` (RBAC nav), `authz.ts`, `brand.ts` (central brand config),
`api.ts` (client fetch helpers), `types.ts`, `utils.ts`, `floorplans.ts`/`plan-scale.ts`/`plan-store.ts`
(floor geometry), `markdown.ts` (safe renderer) + `kb-content.ts`/`kb-search.ts` (built-in help),
`license-state.ts`/`expiry-notice.ts` (pure licence logic), `presence-digest.ts`/`presence-insights.ts`,
`date-range.ts`, `timezones.ts`, `countries.ts`, `tenant-host.ts` (host→tenant, edge+node), `redact.ts`
(log PII redaction), `image-guard.ts` (upload magic-byte check), `audit-csv.ts`, `assistant-policy.ts`
(AI tool defs + system prompt), `escape-html.ts`, `data.ts`, `version.ts`, `bare-routes.ts`.

## `lib/server/` — server-only modules (import `"server-only"`)

Data: `db.ts` (bookings/checkins/locks/audit, tenant-scoped, SQL|JSON), `prisma.ts` (single client),
`store.ts` (blob/file + per-tenant), `tenant-data.ts` (purge/export — C1). Identity: `auth.ts`
(`getUser`), `users.ts`, `account-token.ts`, `token.ts`, `totp.ts`, `invite.ts`. Tenancy/commerce:
`tenant.ts`, `tenants.ts`, `tenant-integration.ts`, `licensing.ts`, `license-notify.ts`, `entra-sso.ts`.
Integrations: `graph.ts`, `directory.ts`, `email.ts`, `mailer.ts` (Resend), `teams-token.ts`, `push.ts`,
`webhooks.ts`, `ssrf.ts` (egress guard). Product: `assistant.ts`, `availability.ts`, `analytics.ts`,
`reports.ts`, `onboarding.ts`, `kb.ts`, `support.ts`, `support-attachment.ts`, `billing.ts`. Infra:
`rate-limit.ts`, `live-bus.ts`, `job-ledger.ts`, `crypto.ts`.

## `components/`

`app-shell.tsx`, `sidebar.tsx`, `mobile-nav.tsx`, `mobile-tab-bar.tsx`, `topbar.tsx`, `page-header.tsx`,
`help-button.tsx` (KB/support slide-over), `assistant-widget.tsx` (Hubbi chat), `live-provider.tsx`
(SSE), `pwa-register.tsx`, `push-toggle.tsx`, `setup-checklist.tsx`, `upgrade-nudge.tsx`,
`cookie-consent.tsx`, `theme-toggle.tsx`, `notifications-bell.tsx`, `teams-badge.tsx`, `install-prompt.tsx`,
`change-password.tsx`, `signin-form.tsx`, `roamhub-mark.tsx` (logo), `floorplan/floor-svg.tsx`.

## `prisma/`

`schema.prisma` (14 models), `migrations/00000000000000_init/` (baseline — H6) + `migrations/README.md`,
`migrations/migration_lock.toml`, and `planned/` (`01-tenant-fk.sql`, `02-tenant-rls.sql` — C4, **not applied**).

## `scripts/`

`migrate.sh` (container migrator — `migrate deploy` + self-baseline), `create-admin.mjs` (seed first admin).

## `docs/`

`SYSTEM-OVERVIEW.md`, `DEPLOY-DROPLET.md`, `DEPLOY.md`, `COMMERCIAL-SETUP.md`, `SECURITY-CHECKLIST.md`,
`C4-tenancy-hardening.md`. (Note: `SECURITY.md` referenced historically may be one of these.)

## Root instruction files

- `CLAUDE.md` → includes `AGENTS.md`: **"This is NOT the Next.js you know"** — Next 16 has breaking
  changes; read `node_modules/next/dist/docs/` before writing Next code; route `params` are Promises.
- `.gitattributes`: forces `*.sh` to LF (so the container migrator script isn't broken by CRLF).

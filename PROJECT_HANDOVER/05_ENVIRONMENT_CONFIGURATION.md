# 05 · Environment Configuration

> Secret **values are never shown**. Status below is the *typical prod* expectation, not a live read.
> On the droplet, env is set in the **`environment:` block of `docker-compose.cohost.yml`** (explicit
> list, NOT `env_file`) and/or `.env`. **Any new variable MUST be added to that compose block or it
> won't reach the container** (a recurring past bug). Template: `.env.example`.

## Core / platform

| Variable | Purpose | Required | Default behaviour | Used by |
|---|---|---|---|---|
| `DATABASE_URL` | Postgres connection string. **If unset, the app falls back to a JSON/file backend** (dev). | Prod: **yes** | JSON file backend | `prisma.ts`, `db.ts`, and every module's `useSql` flag |
| `AUTH_SECRET` | Auth.js JWT signing secret. | **Yes** in prod | app fails auth without it | `auth.config.ts`/`auth.ts` |
| `APP_URL` | Canonical app origin (`https://app.roamhub360.com`). Anchors OAuth + the tenant apex allowlist (H1). | **Yes** | — | `auth.ts`, `tenant-host.ts` |
| `BOOTSTRAP_ADMINS` | Comma-separated break-glass platform-operator emails (any workspace, `platformAdmin`). | Recommended | none | `auth.ts`, `getUser` |
| `NODE_ENV` | `production` in the container. | auto | development | many (fail-closed checks) |
| `DEV_ROLE` | Local-dev only: role for the demo-admin bypass. | No | `global-admin` | `lib/server/auth.ts` (dev path) |
| `CHECKIN_SECRET` | Signs QR/email check-in links; **fails closed in prod if unset** (checked at runtime, not import). | **Yes** (prod) | throws on use | `token.ts` |
| `JOBS_SECRET` | Bearer for `/api/jobs/*`; **fail-closed** (no secret → 403). | **Yes** (for cron) | endpoints 403 | `app/api/jobs/[task]` |
| `CREDENTIAL_KEY` | AES-256-GCM key encrypting per-tenant Graph secrets. **Must stay STABLE** (rotating orphans saved secrets). | **Yes** for customer Graph | customers can't save secrets | `crypto.ts`, `tenant-integration.ts` |

## Auth / SSO (Microsoft Entra, Google, Teams)

| Variable | Purpose | Required | Notes |
|---|---|---|---|
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Entra app (client) id — platform sign-in + org consent app. | For MS SSO | reuses the mail app id on the droplet |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Entra app **secret value** (not the Secret ID GUID — common trap). | For MS SSO | — |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Leave **blank** or set to `https://login.microsoftonline.com/common/v2.0` (both mean the same — `auth.ts` normalises blank to that). **Never a tenant-specific issuer**: that pins sign-in to one directory and every other company is refused. | No | `/common/v2.0` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Optional Google sign-in. | No | provider added only when set |
| `TEAMS_SSO_AUDIENCE` | Optional explicit audience for Teams token verification. | No | auto-derived from `APP_URL`/app id otherwise |
| `SSO_AUTO_JOIN_DOMAINS` | Comma-separated email domains that auto-provision as staff on SSO. Blank = invite-only. | No | invite-only |
| `AUTH_DEBUG` | `true` → verbose Auth.js logger (surface real OAuth cause). | No | off |

## Microsoft Graph (default/demo tenant; customers use encrypted per-tenant creds)

| Variable | Purpose | Required |
|---|---|---|
| `AZURE_TENANT_ID` (a.k.a. `GRAPH_TENANT_ID`) | Default tenant's Entra directory id for app-only Graph. | For default-tenant mail/calendar |
| `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` | App-only Graph client credentials. | For default-tenant Graph |
| `MAIL_FROM` | Central platform sender mailbox (`donotreply@roamhub360.com`). | For email via Graph |
| `GRAPH_TIMEZONE` | Windows tz for calendar events (default "AUS Eastern Standard Time"). | No |
| `ROOM_MAILBOXES` | Map of spaces → room mailboxes for calendar reservations. | No |

## Email fallback (Resend)

| Variable | Purpose | Required |
|---|---|---|
| `RESEND_API_KEY` | Resend ESP key — fallback when Graph mail unavailable. | No (fallback) |
| `RESEND_FROM` | Verified Resend sender. | If Resend used |

## AI concierge

| Variable | Purpose | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Enables the Anthropic driver. | One provider to enable Hubbi |
| `ASSISTANT_MODEL` | Anthropic model id (default `claude-opus-4-8`). | No |
| `AI_PROVIDER` | Force `anthropic` or `openai`. | No (auto) |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | OpenAI-compatible endpoint (e.g. Gemini free tier). Wins over Anthropic when all set. | Alt provider |
| `ASSISTANT_DAILY_CAP` | Per-user/day assistant call cap (default 150). | No |

## Notifications, jobs, tenancy, storage, billing, infra

| Variable | Purpose | Required |
|---|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push. Keep STABLE. Push off until set. | No |
| `OPS_EMAIL` | Support inbox + licence-notice recipient (falls back to BOOTSTRAP_ADMINS). | No |
| `BILLING_PROVIDER` | `stripe`\|`marketplace`\|`xero`\|`myob` — surfaces on licence page. Stub. | No |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` | Stripe billing hooks (`/api/billing`, `/api/billing/webhook`). | No (stub) |
| `ALLOW_PUBLIC_SIGNUP` | `true` enables `/signup` self-serve trials (abuse-prone → off by default). | No |
| `APP_DEFAULT_TZ` | Fallback IANA timezone when a site has none (default **`Australia/Sydney`**). Fixes the server-UTC bug (H7). | No |
| `AUDIT_RETENTION_DAYS` | Audit prune window (default 365). | No |
| `JOB_LEDGER_RETENTION_DAYS` | Job-ledger prune window (default 30). | No |
| `REDIS_URL` | Enables global rate-limit + cross-replica SSE. **Required before running >1 replica.** | No (single instance) |
| `AZURE_STORAGE_CONNECTION_STRING` / `AZURE_STORAGE_CONTAINER` | Optional Azure Blob storage; else local `/app/data` volume. | No |
| `SITE_ADDRESS` | Used by the standalone `Caddyfile` (not the co-host droplet). | No (standalone only) |
| `POSTGRES_PASSWORD` | Compose: Postgres password for the `db` service. | Prod (compose) |

## Required configuration bundles

- **Microsoft Entra:** register the platform app; add redirect URIs
  `https://app.roamhub360.com/api/auth/callback/microsoft-entra-id` and `.../api/admin/entra/callback`;
  set app to **multi-tenant** (AzureADMultipleOrgs). Customer org sign-in additionally needs admin consent.
- **Teams:** `teams/manifest.json` GUIDs = the Entra app client id; pre-authorise the Teams client in
  Expose-an-API; sideload the manifest.
- **Graph:** app permissions (e.g. `User.Read.All` for directory, mail send, calendar) + admin consent.
- **Email:** either `GRAPH_*` + `MAIL_FROM` (Graph) or `RESEND_API_KEY` + `RESEND_FROM`.
- **Scheduler:** a cron (host or external) hitting `GET /api/jobs/tick` every ~30 min and
  `GET /api/jobs/audit-prune` daily with header `x-jobs-secret: <JOBS_SECRET>`; monthly `/api/jobs/report`.

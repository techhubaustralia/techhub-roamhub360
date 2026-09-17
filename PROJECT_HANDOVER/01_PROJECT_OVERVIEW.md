# 01 · Project Overview

> ⚠️ **Accuracy note for the whole handover:** the codebase carries historical **Azure** comments
> (it began on Azure Container Apps + Azure SQL + Easy Auth). It has since **migrated off Azure** to a
> self-hosted **DigitalOcean droplet** (Docker + PostgreSQL + Caddy). Where the original handover
> template asks about "Azure App Service / Azure SQL / Application Insights / Azure DevOps", the real
> answers are the self-hosted equivalents. Azure Blob and Microsoft Graph are the only Microsoft
> pieces still in active use (Blob is optional; Graph is per-tenant for mail/calendar/directory).

| | |
|---|---|
| **Repository name** | `techhub-roamhub360` on GitHub; package `roamhub360`; local folder `C:\Projects\workspace-hub` (historical name, harmless) |
| **Product name** | **RoamHub360** — "Smart Desk Booking & Workplace Management Platform" |
| **Tagline** | "Space managed. Teams connected." |
| **Provider / vendor** | **TechHub Australia** (MSP; RoamHub360 is its commercial sub-brand) |
| **Current version** | `0.1.0` (package.json). ~104 git commits. |
| **Git remote** | `github.com/techhubaustralia/techhub-roamhub360.git` (**private**), branch `main` |
| **Commit author identity** | `TechHub Australia <support@techhubaustralia.com.au>` |
| **Live URL** | `https://app.roamhub360.com` (default/demo workspace) + `https://<slug>.roamhub360.com` per customer |
| **Origin** | Rebrand of a single-tenant app ("Workspace Hub", built for Sodali & Co) into multi-tenant SaaS |

## Purpose

A workplace/hybrid-work management platform. Employees book **desks, private offices, meeting rooms,
and parking bays** from an interactive floor plan; admins manage floor plans, permanent-desk
assignments, presence ("Who's in"), analytics, and Microsoft 365 integration. It is delivered as a
**multi-tenant SaaS** by an MSP (TechHub Australia) to customer organisations.

## Business goals

- Sell RoamHub360 to organisations at **AUD $2,000 per site (building) / year** — no per-user fees, no
  module fees. "Site" is the billing/metering unit.
- MSP-led distribution: TechHub Australia (and potentially partner MSPs) onboard and support customers.
- Differentiate on: Microsoft 365 depth (per-tenant Graph, Teams tab, calendar), "Team Build-Up"
  presence/collaboration features, an AI booking concierge, and white-label per-tenant branding.

## Target customers

Small-to-mid organisations running hybrid work, especially Microsoft 365 shops that want desk/room
booking tied to their own directory, calendars and Teams — delivered and supported by an MSP rather
than bought direct.

## High-level feature list

- **Booking engine** — desks / offices / rooms / parking; full-day / half-day / hourly; multi-day
  desks; on-behalf booking by admins; conflict + lock + licence enforcement.
- **Interactive floor-plan editor** — draw spaces, set seats/hours/timezone per building.
- **Check-in / check-out** — email links, **QR-code** desk check-in, auto-release (no-show) + auto-checkout.
- **"Who's in" presence** ("Team Build-Up" A–F) — daily presence board, Microsoft directory sync
  (names/photos/departments/managers), privacy opt-outs, morning digest email, Teams widget,
  weekday-pattern analytics + recommendations.
- **AI booking concierge ("Hubbi")** — Anthropic or any OpenAI-compatible provider; propose-only
  (never books directly), tenant-scoped, guarded against prompt injection.
- **Multi-tenancy** — tenant resolved from subdomain; data + storage isolated per tenant.
- **Commercial platform** — per-site licensing + tiers, per-tenant Microsoft integration (encrypted),
  a TechHub "Partner control plane" (`/admin/tenants`), feature flags, expiry notifications,
  Stripe-ready billing hooks, self-serve trial signup (off by default).
- **Knowledge Base + Support Centre** — built-in help articles + in-app support tickets with attachments.
- **Notifications** — transactional email (Microsoft Graph mailbox, Resend fallback) + opt-in web push.
- **Public REST API** (`/api/v1`) with per-tenant API keys (scopes + expiry), and outbound webhooks + Slack.
- **Real-time updates** — SSE live-bus refreshes the presence/booking views.

## Technology stack

- **Framework:** Next.js **16.2.9** (App Router, `output: "standalone"`, Turbopack), React **19.2.4**, TypeScript **5** (strict).
- **UI:** Tailwind CSS **4** + shadcn + Base UI + lucide-react + next-themes + sonner.
- **Data:** Prisma **6.19.3** → PostgreSQL 16.
- **Auth:** Auth.js v5 (`next-auth@5.0.0-beta.31`), JWT sessions.
- **AI:** `@anthropic-ai/sdk` + `openai` (provider-agnostic concierge).
- **Integrations:** Microsoft Graph (REST via `fetch`), `jose` (Teams SSO token verification), `web-push`, `ioredis` (optional), `stripe` (billing hooks), Resend (email fallback), `@azure/storage-blob` (optional file storage).
- **Testing:** Vitest (unit) + Playwright (E2E).
- **Infra:** Docker (multi-stage) + Docker Compose + Caddy (auto-TLS) on a DigitalOcean droplet.

## Overall architecture (one line)

A single Next.js App-Router application (UI + API routes in one process) that is **multi-tenant by
subdomain**, persists to PostgreSQL via a centralised Prisma client, stores files on a local volume
(or Azure Blob), and enforces tenant scoping in application code at data-access choke-points. See
`02_ARCHITECTURE.md`.

## Deployment architecture (current, real)

Single DigitalOcean droplet (Sydney, `170.64.215.131`, 2 vCPU / 4 GB). **Docker Compose**
(`docker-compose.cohost.yml`) runs: `db` (Postgres 16) → `migrate` (one-shot schema apply) → `app`
(Next.js standalone on `127.0.0.1:3100`). **Native Caddy** on the host owns 80/443 and reverse-proxies
`app.roamhub360.com` (and `*.roamhub360.com` wildcard) → the app; it **co-hosts** the separate
BlueShift helpdesk app on the same droplet. Wildcard TLS via Caddy on-demand/ACME. See
`12_DEPLOYMENT_GUIDE.md`.

## Authentication method

Auth.js v5, JWT sessions (no DB session adapter). Providers: **email/password** (bcrypt, always on),
**Microsoft Entra** (multi-tenant, org sign-in via admin consent), **Google** (optional), and a
**Teams SSO** credentials provider (verifies the Teams token server-side against Microsoft JWKS).
Sign-in is **tenant-locked** to the subdomain. `getUser()` is the server-side identity choke-point.

## Database

PostgreSQL 16 (self-hosted in Docker). Prisma schema with 14 models (see `06_DATABASE.md`). Multi-tenant
via a `tenantId` **slug** string column (not a FK yet — FK + RLS are prepared in `prisma/planned/`, C4).
There is **also** a JSON/file backend used when `DATABASE_URL` is unset (dev) and for some blob-style
config (push subscriptions, floor plans, images).

## APIs

~70 internal Next.js route handlers under `app/api/**` (see `07_API_DOCUMENTATION.md`) plus a public
`app/api/v1/**` REST surface (bookings/spaces/availability) secured by per-tenant API keys.

## External integrations

Microsoft Graph (mail, calendar events, directory) · Microsoft Teams (tab + SSO) · Anthropic / OpenAI-
compatible LLMs · Resend (email fallback) · Stripe (billing hooks, stub) · web-push (VAPID) · Azure
Blob (optional) · Redis (optional, multi-replica).

## Current project maturity

**Functionally complete commercial SaaS**, live in production for a demo/pilot, having just completed
a large **enterprise-hardening pass** (external code review → all Critical/High/Medium/UX/Quality
items fixed except infrastructure-gated ones). Not yet "enterprise-GA": see limitations.

## Known limitations

- **Single instance today.** Rate-limit and SSE are Redis-ready but Redis isn't provisioned; do not
  run >1 replica until `REDIS_URL` is set (H3/H4).
- **No DB-level tenant isolation yet.** Tenant scoping is enforced in application code; FK integrity +
  Postgres RLS are **prepared but not applied** (`prisma/planned/`, docs/C4). Needs a staging DB to validate.
- **No staging environment / no automated E2E in CI** (Playwright specs exist; harness/staging pending).
- **No external penetration test** performed.
- **Billing is a stub** — Stripe hooks exist; no live billing flow wired.
- **Some features are Microsoft-dependent** (directory sync, calendar, Teams) and untested without a real Entra tenant.
- **Blob-style config writes** (push subs, plans) use a whole-file read-modify-write (M6, small-scale-safe).

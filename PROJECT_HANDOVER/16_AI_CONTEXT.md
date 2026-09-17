# 16 · AI Context (read this first, Claude)

You are picking up **RoamHub360**, a multi-tenant workplace-booking SaaS. This document is the single
most important brief. Read it fully, then skim the numbered docs before touching code.

## Project vision

Turn a former single-tenant desk-booking app into a **commercial multi-tenant SaaS** sold by an MSP
(TechHub Australia) at **$2,000/site/year**, differentiated by Microsoft 365 depth, presence/collab
features, an AI concierge, and per-tenant white-label branding. It is **live in production** (demo/pilot)
and has just completed an **enterprise-hardening pass**. The near-term goal is enterprise-readiness:
DB-level tenant isolation, staging + CI, Redis for scale, and a pen-test.

## Architecture philosophy

- **One Next.js app** — UI + API in one process; no separate backend.
- **Choke-points over sprawl** — tenancy, identity, and data access are centralised in `lib/server/*`
  (`currentTenantId`, `getUser`, `db.ts`, `prisma.ts`, `store.ts`). Routes stay thin; enforcement lives
  in the choke-points so you can't forget it. **When adding data access, go through these.**
- **Defense in depth** — app-code tenant scoping today; DB FK+RLS prepared (C4).
- **Graceful degradation** — every integration (Graph, AI, Redis, Blob, push, billing) works in an
  "off" state when unconfigured. Never hard-crash on a missing optional key.
- **Fail closed on security, fail open on convenience** — secrets/jobs/checkin fail closed; rate-limit
  falls open to in-memory if Redis blips.

## Coding standards & conventions

- **TypeScript strict.** Match the surrounding code's style, comment density, and idioms.
- **Next 16 App Router:** route `params` are **Promises** — `const { id } = await params`. Read
  `node_modules/next/dist/docs/` before writing Next-specific code (per `AGENTS.md` — the framework has
  breaking changes vs older Next).
- **Server-only modules** import `"server-only"` and live in `lib/server/`. Shared pure logic (usable
  client+server) lives in `lib/`.
- **Validation:** zod at every route boundary. **Tenancy:** always scope by `currentTenantId()`.
- **Prisma:** only via `lib/server/prisma.ts` (single client). Don't `new PrismaClient()`.
- **Naming:** kebab-case files; PascalCase components/models; camelCase functions. `tenantId` = the slug.
- **Lint must stay green (0 errors).** The `react-hooks/set-state-in-effect` rule is intentionally
  `warn` (mount-fetch pattern); don't "fix" those by refactoring 30 components.
- **Every non-trivial change gets a runnable check** (a small vitest). Verify with
  `tsc --noEmit` + `npm test` + `npm run lint` + `npm run build` before considering it done.
- **Commit author:** `TechHub Australia <support@techhubaustralia.com.au>`; trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Never push automatically** — hand the
  user exact git commands; verify `git remote -v` + `git config user.email` first (they use multiple
  GitHub accounts). The user runs all deploys.
- **Never echo secrets.** Don't burn API quota on throwaway calls.

## Business & booking rules

- Spaces: **desk / office / room / parking**. Durations: full / half / hourly; desks/parking can be multi-day.
- A booking must reference a space **that exists on the authoritative floor plan** (no ghost bookings).
- Times are **site-local wall-clock strings** (`YYYY-MM-DDTHH:mm`) + the site's IANA tz (`plan.tz`).
  All "now/today" comparisons use the site tz (fallback `APP_DEFAULT_TZ` = Australia/Sydney) — **never
  the server clock** (that was the H7 bug). Don't `new Date(booking.start)` on the client (parses as
  browser-local); slice the string instead.
- Conflicts + space **locks** + **licence** state are all enforced on create. Auto-release no-shows at
  09:30 site-local; auto-checkout at 17:30.
- The **AI concierge only proposes** bookings; the client confirms through the validated `/api/bookings`
  route. Never give the assistant a mutating tool (a test enforces this — `lib/assistant-policy.test.ts`).

## Permission rules

Roles `global-admin` > `site-admin` > `staff`; `platformAdmin` (TechHub operator, from `BOOTSTRAP_ADMINS`
or the default tenant) can cross tenants. Enforced in nav (`lib/nav.ts`), route handlers, and the
membership guard in `getUser()`. Feature flags disable features per tenant server-side.

## Commercial licensing model

$2,000/site/year; site = building. Tiers cap sites + floors/site. Enforced server-side (402 read-only
when expired/suspended; site/floor caps on create). Default tenant + dev = unlimited. Trials via
`/signup` (off by default). See `13_COMMERCIAL_CONFIGURATION.md`.

## Important assumptions & design decisions

- **`tenantId` is the slug, not a UUID FK.** C4 deliberately chose FK→`Tenant.slug` over a UUID
  conversion (the slug is the natural key everywhere: host, blob paths, auth lock). Don't "normalise" to
  UUID — read `docs/C4-tenancy-hardening.md` first.
- **Dual data backend:** SQL (Postgres) when `DATABASE_URL` set, else JSON files (dev). Keep both paths working.
- **Single central mail sender** for all email; per-tenant Graph is for calendar + directory only.
- **Migrations (H6):** the container runs `migrate deploy` and self-baselines an old `db push` DB. Author
  new migrations with `npm run db:migrate:new`; commit the SQL.

## Recent work (2026-07-21/22) & current focus

The enterprise-hardening pass fixed C1–C3, H1–H9, M2–M8, Q1, U1/U4/U5 (see `09_CHANGELOG.md`). **C4 is
prepared but not applied** (`prisma/planned/`). Current focus / next up: stand up staging → apply +
validate C4 (FK+RLS) → provision Redis → CI + pen-test. Billing is still a stub.

## Outstanding work

See `10_PENDING_WORK.md`. Headline P1s: apply/validate **C4 RLS** on staging; **pen-test**; provision
**Redis** before multi-replica; test **Microsoft-integration** paths against a real Entra tenant.

## Known pitfalls

- Next 16 `params` Promises; `"server-only"` imports break naive tests (use the vitest stub).
- Don't add optional deps that the bundler will try to resolve at build unless installed (the `ioredis`
  lazy-import + `shadcn` CSS import + `sharp`/`fast-xml-parser` overrides are all deliberate — see history).
- Shell scripts must be **LF** (`.gitattributes`) or the container migrator breaks.
- New env vars **must** be added to the `environment:` block of `docker-compose.cohost.yml`.
- `AUTH_MICROSOFT_ENTRA_ID_ISSUER` must be **blank** (a value breaks multi-tenant sign-in).
- Don't throw at module top-level for prod-env checks (breaks `next build`); check at runtime (see `token.ts`).

## Important files

`auth.ts` / `auth.config.ts` / `proxy.ts` (auth; `proxy.ts` is Next 16's rename of `middleware.ts`), `lib/server/db.ts` + `prisma.ts` (data),
`lib/server/tenant.ts` + `lib/tenant-host.ts` (tenancy), `lib/server/auth.ts` (`getUser`),
`lib/booking-rules.ts` (booking + tz), `app/api/bookings/route.ts` (the booking engine),
`lib/server/graph.ts` (Microsoft), `lib/server/assistant.ts` + `lib/assistant-policy.ts` (AI),
`lib/server/licensing.ts` + `lib/license-state.ts` (commerce), `lib/nav.ts` (RBAC),
`prisma/schema.prisma`, `Dockerfile` + `scripts/migrate.sh` + `docker-compose.cohost.yml`.

## Areas to modify only with caution

- **`auth.ts` / Entra provider config** — multi-tenant sign-in is subtle (issuer re-discovery). There's a
  long comment block explaining why; heed it. Test with real orgs before shipping.
- **`lib/server/db.ts` tenant scoping** — the isolation boundary. Every query must be tenant-scoped.
- **`prisma/planned/*` and C4** — RLS is high-blast-radius; only apply against staging with the leak test.
- **Migrator (`scripts/migrate.sh`) / Dockerfile** — a mistake here breaks every deploy.
- **`lib/server/graph.ts`, `teams-token.ts`, `crypto.ts`** — security-sensitive integration/crypto.

## Areas under active development

The infra/design backlog (task #36): C4 apply, M1 identity split, M6 concurrency, U2 onboarding, U3
editor refactor, Q2/Q3 staging+E2E, Redis, pen-test. None are half-done in code except C4 (prepared).

# RoamHub360

Multi-tenant desk, office, meeting-room and parking booking for workplaces — a TechHub Australia
product. Employees book from a live floor plan, see who's in, and check in with a tap or the QR code
at the desk; admins manage sites, users, Microsoft 365 integration and licensing. Each customer gets
an isolated workspace at `<slug>.roamhub360.com`.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Prisma → PostgreSQL (JSON file
backend for local dev) · Auth.js v5 (password, Microsoft Entra, Google, Teams SSO) · Tailwind.
One process serves UI + API; deployed as a Docker image on a DigitalOcean droplet behind Caddy.

## Start here

| I want to… | Read |
|---|---|
| Understand the whole project (new engineer or new AI session) | `PROJECT_HANDOVER/README.md` → `16_AI_CONTEXT.md` first |
| Set up a dev machine | `PROJECT_HANDOVER/15_SETUP_ON_NEW_MACHINE.md` |
| Deploy / operate production | `docs/DEPLOY-DROPLET.md` |
| See the API | `PROJECT_HANDOVER/07_API_DOCUMENTATION.md` |
| Ship the Android app | `PROJECT_HANDOVER/21_ANDROID_APP.md` |
| Know what's pending | `PROJECT_HANDOVER/10_PENDING_WORK.md` |

Files named `ONBOARDING.md`, `RUNBOOK.md`, `DEPLOY.md`, `docs/DEPLOY.md` and `azure-pipelines.yml`
describe the **retired** predecessor deployment and carry a SUPERSEDED banner.

## Local development

```bash
npm ci
cp .env.example .env.local          # set AUTH_SECRET + CHECKIN_SECRET; leave DATABASE_URL unset for the file backend
npm run dev                         # http://localhost:3000 — no login needed locally (demo Workspace admin)
```

Without `DATABASE_URL` the app stores plans/bookings under `./data` and user management pages report
that they need the database — everything else works.

## Quality gate (run before every commit; CI runs the same)

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expect: no type errors, **0 lint errors** (warnings are tolerated by design), all unit tests green,
clean build. The live API-regression suite (31 tests, tenant isolation included) runs against a dev
server in a second terminal:

```bash
E2E_BASE=http://localhost:3000 npm run test:api
```

`.github/workflows/ci.yml` runs both on every push and pull request. Nothing in CI deploys.

## Conventions that matter

- Tenancy, identity and data access go through `lib/server/*` choke-points (`currentTenantId`,
  `getUser`, `db.ts`, `prisma.ts`, `store.ts`). Always scope by tenant.
- Times are site-local wall-clock strings plus the site's IANA timezone; never the server clock.
- Stored role `global-admin` is displayed as **Workspace admin** and administers one workspace only.
  Only `BOOTSTRAP_ADMINS` (the platform operator) crosses workspaces.
- New environment variables must be added to the `environment:` block of `docker-compose.cohost.yml`.
- Read `node_modules/next/dist/docs/` before writing Next-specific code (`AGENTS.md`).

## Licence

Proprietary — © TechHub Australia. Not for redistribution.

# PROJECT IMPORT PROMPT

Paste the block below into Claude Code on the new computer, in the repo root
(`workspace-hub`), as your first message. It orients a fresh instance to the whole project.

---

You are taking over development of **RoamHub360** (repo folder `workspace-hub`), a live multi-tenant
workplace/desk-booking SaaS by TechHub Australia. A complete handover package exists in the
`PROJECT_HANDOVER/` folder. **Before writing or changing ANY code, read the handover in this order and
confirm you understand it:**

1. `PROJECT_HANDOVER/16_AI_CONTEXT.md` — **read this first**; it has the vision, coding standards,
   business/booking/permission rules, design decisions, pitfalls, and "modify with caution" areas.
2. `PROJECT_HANDOVER/20_HANDOVER_SUMMARY.md` — executive summary + exact next tasks.
3. `PROJECT_HANDOVER/02_ARCHITECTURE.md`, `06_DATABASE.md`, `07_API_DOCUMENTATION.md` — how it works.
4. `PROJECT_HANDOVER/17_CURRENT_STATE.md`, `10_PENDING_WORK.md`, `08_FEATURE_STATUS.md` — what's done / pending.
5. `PROJECT_HANDOVER/05_ENVIRONMENT_CONFIGURATION.md`, `12_DEPLOYMENT_GUIDE.md`, `15_SETUP_ON_NEW_MACHINE.md`,
   `18_COMMAND_REFERENCE.md` — how to configure, run, and deploy.
6. `PROJECT_HANDOVER/14_SECURITY_REVIEW.md`, `03_FOLDER_STRUCTURE.md`, `04_DEPENDENCIES.md`,
   `09_CHANGELOG.md`, `11_TESTING_GUIDE.md`, `13_COMMERCIAL_CONFIGURATION.md`, `19_FILE_MANIFEST.md`.
7. Also read `AGENTS.md`, `prisma/migrations/README.md`, `docs/C4-tenancy-hardening.md`, and
   `21_ANDROID_APP.md` (the Google Play track — the web side is done, the operator steps are not).

**Critical facts to internalise (details in the docs):**
- Stack: Next.js 16 (App Router; route `params` are Promises — `await params`), React 19, TypeScript
  strict, Prisma 6 → PostgreSQL, Auth.js v5 (JWT). Deployed on a **DigitalOcean droplet** (Docker +
  Postgres + Caddy) — **NOT Azure** (ignore historical Azure comments; Azure Blob is optional storage only).
- Multi-tenant by subdomain; `tenantId` is the tenant **slug** (deliberately not a UUID FK — see C4).
  Tenancy/identity/data go through choke-points in `lib/server/*` (`currentTenantId`, `getUser`, `db.ts`,
  single `prisma.ts`, `store.ts`). There is a JSON/file data backend when `DATABASE_URL` is unset (dev).
- Booking times are **site-local wall-clock strings**; always compare using the site's timezone (fallback
  `APP_DEFAULT_TZ`), never the server clock. The AI concierge only **proposes** bookings.
- Enterprise-hardening pass (2026-07) and the predecessor-feature port + tenant-isolation hardening +
  Android groundwork (2026-09) are done and deployed. **C4 (DB-level tenant isolation: FK + RLS)** is
  prepared but NOT applied (`prisma/planned/`; `withTenant()` exists behind `TENANT_RLS`, off) — it must
  be applied and validated on a **staging Postgres** with the leak test before production.
- Only `BOOTSTRAP_ADMINS` is cross-tenant. A customer's `global-admin` (shown as **Workspace admin**)
  administers their own workspace only; the live suite's tenant-isolation block must stay green.
- The predecessor's code is **reference-only**: re-implement, never copy; nothing from that vendor
  enters this repo. Changes are additive — existing behaviour stays unless a bug is named.

**Ground rules (from the team's working agreements):**
- Match existing code style. Keep lint at **0 errors** and add a runnable test for non-trivial changes.
  Verify with `npx tsc --noEmit; npm run lint; npm test; npm run build` (PowerShell: no `&&`) before
  calling anything done. CI (`.github/workflows/ci.yml`) runs the same gate + the live suite.
- **The human runs every command** — git, npm, deploys, scripts — one step at a time, and pastes the
  output. Hand over exact commands with expected results; never chain a commit after checks in one
  line. Never push or deploy. Verify the target first (`git remote -v` + `git config user.email` →
  `github.com/techhubaustralia/techhub-roamhub360` / `support@techhubaustralia.com.au`; push needs
  `gh auth switch --user techhubaustralia`). Commit trailer: `Co-Authored-By: <Claude model> <noreply@anthropic.com>`.
- Explain a change before implementing it. Never echo secrets; don't add build-breaking optional deps;
  keep `*.sh` LF; add any new env var to the `environment:` block of `docker-compose.cohost.yml`.
- Don't run `npm ci`/`npm install` while `next dev` is running (Windows file locks gut `node_modules`).

**First, do this:** read the files above, then give me a short summary of (a) the current production
state, (b) the top 3 pending priorities, and (c) the exact next development task you'd start — and wait
for my go-ahead before changing code. Treat `PROJECT_HANDOVER/` as the source of truth if anything in the
code seems to contradict your prior assumptions.

---

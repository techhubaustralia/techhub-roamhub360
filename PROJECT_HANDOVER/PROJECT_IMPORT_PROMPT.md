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
7. Also read `AGENTS.md`, `prisma/migrations/README.md`, and `docs/C4-tenancy-hardening.md`.

**Critical facts to internalise (details in the docs):**
- Stack: Next.js 16 (App Router; route `params` are Promises — `await params`), React 19, TypeScript
  strict, Prisma 6 → PostgreSQL, Auth.js v5 (JWT). Deployed on a **DigitalOcean droplet** (Docker +
  Postgres + Caddy) — **NOT Azure** (ignore historical Azure comments; Azure Blob is optional storage only).
- Multi-tenant by subdomain; `tenantId` is the tenant **slug** (deliberately not a UUID FK — see C4).
  Tenancy/identity/data go through choke-points in `lib/server/*` (`currentTenantId`, `getUser`, `db.ts`,
  single `prisma.ts`, `store.ts`). There is a JSON/file data backend when `DATABASE_URL` is unset (dev).
- Booking times are **site-local wall-clock strings**; always compare using the site's timezone (fallback
  `APP_DEFAULT_TZ`), never the server clock. The AI concierge only **proposes** bookings.
- The project just finished an enterprise-hardening pass. **C4 (DB-level tenant isolation: FK + RLS) is
  prepared but NOT applied** (`prisma/planned/`) — it must be applied and validated on a **staging
  Postgres** with the leak test before production. This is the top pending item.

**Ground rules (from the team's working agreements):**
- Match existing code style. Keep lint at **0 errors** and add a runnable test for non-trivial changes.
  Verify with `npx tsc --noEmit && npm run lint && npm test && npm run build` before calling anything done.
- **Never push to GitHub or deploy automatically.** Provide exact git commands for the human to run, and
  verify the target first (`git remote -v` + `git config user.email` → must be
  `github.com/techhubaustralia/techhub-roamhub360` / `support@techhubaustralia.com.au`). The human runs
  all deploys. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Never echo secrets; don't add build-breaking optional deps; keep `*.sh` LF; add any new env var to the
  `environment:` block of `docker-compose.cohost.yml`.

**First, do this:** read the files above, then give me a short summary of (a) the current production
state, (b) the top 3 pending priorities, and (c) the exact next development task you'd start — and wait
for my go-ahead before changing code. Treat `PROJECT_HANDOVER/` as the source of truth if anything in the
code seems to contradict your prior assumptions.

---

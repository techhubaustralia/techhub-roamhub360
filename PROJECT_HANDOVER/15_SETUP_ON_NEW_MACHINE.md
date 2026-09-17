# 15 · Setup on a New Machine

Goal: get RoamHub360 running locally for development on a fresh computer. **You do not need a database
to run locally** — with `DATABASE_URL` unset the app uses a JSON/file backend and a demo global-admin identity.

## 1. Prerequisites

- **Node.js 22 LTS or newer** (matches the container `node:22-slim`). Node 20 does **not** work: `undici` 8 requires ≥ 22.19 and the build fails with `util.markAsUncloneable is not a function`.
- **npm** (bundled with Node). **Git**.
- Optional (only for DB-backed dev or deploy): **Docker Desktop**, **PostgreSQL client** (`psql`).
- Optional (E2E): Playwright browsers (installed in a later step).

## 2. Clone

```bash
git clone https://github.com/techhubaustralia/techhub-roamhub360.git workspace-hub
cd workspace-hub
```
(Private repo — you'll need a GitHub PAT / access to `techhubaustralia`.)

## 3. Install dependencies

```bash
npm ci        # exact versions from package-lock.json (respects the sharp/fast-xml-parser overrides)
npx prisma generate
```

## 4. Environment variables

```bash
cp .env.example .env.local        # local dev secrets (gitignored)
```
Minimum for local dev: **nothing is strictly required** to boot (dev bypass gives a demo admin, JSON
backend). To exercise auth locally set `AUTH_SECRET` (any 32+ char random string). See
`05_ENVIRONMENT_CONFIGURATION.md` for the full list; leave Microsoft/AI/Stripe keys blank to run those
features in their graceful "off" state.

## 5. Database (optional for local; required for DB-backed work)

- **Skip** for basic local dev (JSON backend kicks in when `DATABASE_URL` is unset).
- To use Postgres locally:
  ```bash
  # run a throwaway Postgres (Docker)
  docker run -d --name rh-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=roamhub360 -p 5432:5432 postgres:16
  # set DATABASE_URL in .env.local
  #   DATABASE_URL="postgresql://postgres:dev@localhost:5432/roamhub360?schema=public"
  ```

## 6. Migrations

```bash
npm run db:migrate            # prisma migrate deploy (applies prisma/migrations)
# fresh DB → creates all tables. If you hand-apply to a pre-migrations DB, baseline first:
#   npx prisma migrate resolve --applied 00000000000000_init && npm run db:migrate
```

## 7. Seed data

```bash
# first admin (needs DATABASE_URL)
node scripts/create-admin.mjs admin@example.com "ChangeMe123!" "Admin"
```
Demo floor plans/bookings are NOT in the repo (`data/*.json` gitignored) — create buildings/plans via
the **`/editor`** UI, or copy a colleague's `data/` folder.

## 8. Build

```bash
npm run build     # next build (standalone). Optional for dev; required to mirror prod.
```

## 9. Run

```bash
npm run dev       # http://localhost:3000 (auto-bumps to 3005 if busy)
```
Sign in is bypassed in dev (demo global-admin). Set `DEV_ROLE` to test other roles.

## 10. Test

```bash
npx tsc --noEmit          # type-check
npm run lint              # 0 errors expected
npm test                  # vitest — ~151 pass / ~19 skip
npm run audit:ci          # 0 high/critical expected
# E2E:
npm i -D @playwright/test && npx playwright install
E2E_BASE=http://localhost:3000 npm run test:e2e   # needs the dev server running
```

## 11. Debug

- Server logs print to the `npm run dev` console (auth/mail/jobs lines are informative; emails redacted).
- Next 16 route `params` are Promises — `await params` (see `AGENTS.md`).
- If a server module fails to import in a test, confirm `vitest.config.ts`'s `server-only` alias resolves.

## 12. Deploy

See `12_DEPLOYMENT_GUIDE.md`. Summary: push to `main`, then on the droplet `cd /root/roamhub360 && git
pull && docker compose -f docker-compose.cohost.yml up -d --build`.

## 13. Troubleshooting

| Symptom | Fix |
|---|---|
| `npx prisma …` wants to install prisma@7 | You're outside the repo / no node_modules. `cd` into the repo, `npm ci` first. |
| Build fails `Can't resolve 'shadcn/tailwind.css'` | `shadcn` devDep is used via CSS import — keep it; run `npm ci`. |
| Auth errors locally | Set `AUTH_SECRET`. Leave `AUTH_MICROSOFT_ENTRA_ID_ISSUER` blank or at `/common/v2.0` — never a tenant-specific issuer. |
| Container migrator "P3005" | Expected on a pre-migrations DB; `scripts/migrate.sh` self-baselines. |
| Shell script "bad interpreter" in container | Ensure `*.sh` is LF (`.gitattributes` enforces it). |
| App shows no data locally | Normal — JSON backend is empty; create plans via `/editor`. |

## Expected first run

`npm run dev` → app boots on :3000/:3005 → you land as a demo global-admin → empty state (no buildings
until you create one in `/editor`). `npm test` → ~151 pass / ~19 skip. `npm run build` → succeeds.

# 18 · Command Reference

## Development

```bash
npm ci                      # install exact deps (respects overrides)
npx prisma generate         # generate the Prisma client (after install / schema change)
npm run dev                 # dev server, http://localhost:3000 (auto → 3005 if busy)
```

## Build

```bash
npm run build               # next build (standalone output)
npm start                   # run the production build locally (node .next/standalone/server.js via next start)
```

## Test / quality gate

```bash
npx tsc --noEmit            # type-check
npm run lint                # eslint (flat config) — expect 0 errors
npm test                    # vitest run (all unit/integration)
npm run test:watch          # vitest watch
npm run test:api            # vitest run tests/api-regression.test.ts
npx vitest run <file>       # single test file
npm run audit:ci            # npm audit --omit=dev --audit-level=high (expect 0 high/critical)
```

## Playwright (E2E)

```bash
npm i -D @playwright/test && npx playwright install     # first time on a new machine
E2E_BASE=http://localhost:3000 npm run test:e2e         # run specs in e2e/ against a running app
npx playwright show-report                              # open the HTML report
```

## Database / Prisma

```bash
npm run db:migrate                        # prisma migrate deploy (apply migrations)
npm run db:migrate:new -- --name <x>      # author a new migration locally (commit the SQL)
npx prisma generate                       # regenerate client
npx prisma studio                         # browse the DB (needs DATABASE_URL)
npx prisma migrate resolve --applied 00000000000000_init   # baseline a pre-migrations DB (once)
# seed the first admin (needs DATABASE_URL):
node scripts/create-admin.mjs <email> <password> "<Name>"
```

## Docker / deployment (on the droplet, in /root/roamhub360)

```bash
git pull
docker compose -f docker-compose.cohost.yml up -d --build           # build + run db, migrate, app
docker compose -f docker-compose.cohost.yml logs -f migrate app      # watch migrate + app
docker compose -f docker-compose.cohost.yml ps                       # status
docker compose -f docker-compose.cohost.yml run --rm migrate node scripts/create-admin.mjs <e> <p> "<n>"
docker compose -f docker-compose.cohost.yml down                     # stop
# host Caddy (only when adding a subdomain/site):
sudo nano /etc/caddy/Caddyfile && sudo systemctl reload caddy
# backups:
docker compose -f docker-compose.cohost.yml exec -T db pg_dump -U roamhub roamhub360 > backup-$(date +%F).sql   # DB role is `roamhub`, not postgres
```

## Git (push policy: verify target, user runs pushes)

```bash
git remote -v && git config user.email        # ALWAYS verify before pushing
git log --oneline -15
git push origin main                          # user runs this (multiple GitHub accounts in use)
```

## Scheduler (cron endpoints)

```bash
# every ~30 min:
curl -H "x-jobs-secret: $JOBS_SECRET" https://app.roamhub360.com/api/jobs/tick
# daily:
curl -H "x-jobs-secret: $JOBS_SECRET" https://app.roamhub360.com/api/jobs/audit-prune
# monthly:
curl -H "x-jobs-secret: $JOBS_SECRET" https://app.roamhub360.com/api/jobs/report
# manual single tasks: reminder | checkin | checkout | auto-release | auto-checkout | digest | license-check
```

## Teams / VAPID / keys

```bash
npx web-push generate-vapid-keys           # generate VAPID keys (keep STABLE)
openssl rand -base64 32                     # generate AUTH_SECRET / CREDENTIAL_KEY (CREDENTIAL_KEY must stay STABLE)
```

## Azure (legacy / optional only)

No Azure CLI workflow is used. Azure Blob is optional storage (`AZURE_STORAGE_CONNECTION_STRING`);
there is no App Service / Azure SQL / DevOps pipeline anymore.

# 12 · Deployment Guide

> **The real deployment is a self-hosted DigitalOcean droplet with Docker + Postgres + Caddy.** The
> "Azure App Service / Azure SQL / Application Insights / Azure DevOps" sections of the original
> template **do not apply** — the app migrated off Azure. Azure Blob is optional storage only.

## Environments

| Env | Where | Notes |
|---|---|---|
| **Development** | local machine | `npm run dev` (port 3000→auto 3005). No DB needed (JSON file backend). Dev identity = demo global-admin. |
| **Test/Staging** | **does not exist yet** | Needed to validate C4/RLS + E2E. Recommend a throwaway Postgres (Docker) or a small droplet. |
| **Production** | DigitalOcean droplet, Sydney | `170.64.215.131`, 2 vCPU/4 GB. Docker Compose + native Caddy. Live at `app.roamhub360.com`. Co-hosts the BlueShift helpdesk. |

## Production topology

```
Internet ──443──▶ native Caddy (host /etc/caddy/Caddyfile, auto-TLS)
                    ├─ helpdesk.techhubaustralia.com.au  → localhost:3000  (BlueShift, separate app)
                    └─ app.roamhub360.com + *.roamhub360.com → 127.0.0.1:3100  (RoamHub360)
                                                              │
        docker compose -f docker-compose.cohost.yml:  db(Postgres16) → migrate(one-shot) → app(:3100)
```

- Repo cloned at **`/root/roamhub360`** on the droplet (private repo → uses a PAT).
- `docker-compose.cohost.yml` has **no Caddy** (host Caddy owns 80/443); app binds `127.0.0.1:3100`.
- Env is set in the compose **`environment:` block** (explicit list) and/or `.env`. **New vars must be
  added to that block** or they never reach the container.
- Storage: local Docker volume `/app/data` (floor plans, images, attachments, push subs). Azure Blob optional.

## Git workflow

- Remote `origin` = `github.com/techhubaustralia/techhub-roamhub360` (**private**), branch `main`.
- Author identity: `TechHub Australia <support@techhubaustralia.com.au>`.
- **Policy:** the human runs pushes/deploys (multiple GitHub accounts in use — verify target with
  `git remote -v` + `git config user.email` before pushing). No CI/CD — deploys are manual.
- Windows Git Credential Manager needs an interactive login; pushes are typically run from a normal terminal.

## Build commands

```bash
# local
npm ci
npx prisma generate
npm run build            # next build (standalone output)

# container (Dockerfile multi-stage): base → deps(npm ci) → build(prisma generate + next build)
#   → runner (node server.js)   and   migrator (sh scripts/migrate.sh)
```

## Release (deploy to the droplet)

```bash
# 1) push from your machine (verify target first!)
git remote -v && git config user.email
git push origin main

# 2) on the droplet, IN THE REPO DIR
cd /root/roamhub360
git pull
docker compose -f docker-compose.cohost.yml up -d --build

# 3) watch it
docker compose -f docker-compose.cohost.yml logs -f migrate app
#   migrate: applies schema (migrate deploy; self-baselines an old db-push DB — H6)
#   app: "✓ Ready"
```

- **First admin (once):** `docker compose -f docker-compose.cohost.yml run --rm migrate node scripts/create-admin.mjs <email> <pw> "<Name>"`
- **After deploying the H2 change:** re-issue API keys in **Admin → Developer & API** (old JSON-blob keys don't carry to the `ApiKey` table).
- **Scheduler:** ensure a cron hits `GET /api/jobs/tick` (~30 min) + `GET /api/jobs/audit-prune` (daily) + monthly `/api/jobs/report`, all with `x-jobs-secret: $JOBS_SECRET`.
- **Caddy (only when adding a new subdomain/site):** edit `/etc/caddy/Caddyfile`, `systemctl reload caddy`.

## Rollback

- **App:** `git checkout <previous-good-sha>` in `/root/roamhub360`, then `docker compose … up -d --build`.
- **DB:** migrations are additive; for a bad migration, restore from `pg_dump` backup and re-deploy the
  previous app SHA. Keep regular `pg_dump` backups of the `roamhub360` database.
- **C4:** not applied, so nothing to roll back there yet.

## Standalone (non-co-host) alternative

`docker-compose.yml` + `Caddyfile` (with `SITE_ADDRESS`) run RoamHub360 *with* its own Caddy owning
80/443 — use this only on a dedicated host, not the co-host droplet.

## Reference docs in-repo

`docs/DEPLOY-DROPLET.md` (full droplet runbook), `docs/DEPLOY.md`, `docs/COMMERCIAL-SETUP.md`,
`docs/SECURITY-CHECKLIST.md`, `docs/SYSTEM-OVERVIEW.md`, `prisma/migrations/README.md`.

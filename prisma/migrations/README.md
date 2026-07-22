# Database migrations (H6)

Schema changes are now **versioned migrations**, not `prisma db push`. `db push` diffs the live
database against the schema and mutates it in place — no history, no review, and it can silently drop
a column on a bad diff. `prisma migrate deploy` applies reviewed, checked-in SQL files in order and
records what ran, so every environment converges to the same schema and a change is auditable.

## How it runs on the droplet (Docker)

The `migrate` service in `docker-compose.cohost.yml` runs `scripts/migrate.sh` (the Dockerfile
`migrator` stage) once before the app starts. It handles three cases automatically:

1. **Fresh/empty DB** → `migrate deploy` creates everything from the migrations.
2. **Already-baselined DB** → `migrate deploy` applies any pending migrations.
3. **Pre-migrations DB** (created by the old `db push` — has tables but no migration history) →
   `migrate deploy` fails `P3005`, so the script does a one-time transition: `db push` to reconcile
   the schema to the baseline (adds this release's new tables/columns — otherwise baselining would
   mark the init migration "applied" while the DB still lacks them), marks `00000000000000_init`
   applied, then `migrate deploy`. After this runs once, future deploys take case 2.

**No manual step is required** — a normal `docker compose ... up -d --build` handles it, including the
current droplet (which is case 3 on its first deploy of this release).

## Everyday workflow

- **Change the schema** → create a migration locally and commit it with the code:
  ```
  npm run db:migrate:new -- --name <what_changed>   # writes prisma/migrations/<ts>_<name>/migration.sql
  ```
- **Deploy** → the container's `migrate` service applies pending migrations automatically. For a
  non-Docker/manual apply, `npm run db:migrate` (= `prisma migrate deploy`) against `DATABASE_URL`.

## Manual baseline (only if you apply migrations OUTSIDE the container)

The container self-baselines, so you normally never touch this. But if you run `migrate deploy` by
hand against a pre-migrations database, baseline it once first (otherwise it tries to `CREATE TABLE`
tables that already exist and fails `P3005`):

```
# point at the DB, then:
npx prisma migrate resolve --applied 00000000000000_init
npm run db:migrate
```

The tables added in the hardening pass (extended `AuditLog`, `ApiKey`, `JobLedger`) are part of
`00000000000000_init`, so the baseline covers them.

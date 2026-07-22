# Database migrations (H6)

Schema changes are now **versioned migrations**, not `prisma db push`. `db push` diffs the live
database against the schema and mutates it in place — no history, no review, and it can silently drop
a column on a bad diff. `prisma migrate deploy` applies reviewed, checked-in SQL files in order and
records what ran, so every environment converges to the same schema and a change is auditable.

## Everyday workflow

- **Change the schema** → create a migration locally:
  ```
  npm run db:migrate:new -- --name <what_changed>
  ```
  This writes `prisma/migrations/<timestamp>_<name>/migration.sql`. Commit it with the code.
- **Deploy** → apply pending migrations against `DATABASE_URL`:
  ```
  npm run db:migrate
  ```
  Run this in the release step (before the app starts). It replaces the old `prisma db push`.

## One-time baseline of the EXISTING production database

Production already has these tables (they were created by earlier `db push` runs), so the initial
migration `00000000000000_init` must be marked as already-applied instead of re-run — otherwise
`migrate deploy` would try to `CREATE TABLE` tables that exist and fail:

```
# point at the production DB, then:
npx prisma migrate resolve --applied 00000000000000_init
```

Do this once. After that, `npm run db:migrate` applies only NEW migrations normally.

> Note: the tables added in this hardening pass (extended `AuditLog`, `ApiKey`, `JobLedger`) are part
> of `00000000000000_init`. If you already ran `prisma db push` for them, the baseline resolve above
> covers them. If you have NOT pushed them yet, run `npm run db:migrate` after the resolve — or, for a
> brand-new database, just `npm run db:migrate` with no resolve needed.

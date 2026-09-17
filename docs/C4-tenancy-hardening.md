# C4 — Tenancy hardening: referential integrity + Postgres RLS

**Status: prepared, NOT applied.** The SQL lives in `prisma/planned/` (outside `prisma/migrations/`,
so `npm run db:migrate` never runs it). Apply it deliberately, against **staging first**, following
the runbook below. Nothing here changes production until you run it.

## Problem

`tenantId` is a bare string on 11 tables with no foreign key, and there is no database-level tenant
isolation. Tenant scoping is enforced **only** in application code (every query filters by
`currentTenantId()`). That means:

1. **No referential integrity** — a row can carry a `tenantId` that matches no real tenant; deleting
   a tenant doesn't cascade or restrict.
2. **No defence-in-depth** — a single query that forgets its `tenantId` filter leaks across tenants,
   and nothing below the application catches it.

## Decision: FK to `Tenant.slug`, not a surrogate UUID

The review framed this as "schema → UUID FK". We deliberately **do not** convert `tenantId` to
`Tenant.id` (UUID). `tenantId` already holds the **slug** everywhere that matters — host resolution
(`<slug>.roamhub360.com`), `currentTenantId()`, blob storage paths (`<slug>/...`), the tenant-lock in
`auth.ts`. `Tenant.slug` is `UNIQUE`, so it is a valid FK target.

A UUID conversion would rewrite all of that (a data migration of every `tenantId` value + changes to
`currentTenantId`, blob paths, and every comparison) for **zero** integrity or isolation benefit over
a slug FK. FK-to-slug delivers the full goal — referential integrity now, and the anchor for RLS — at
a fraction of the risk. This is the load-bearing decision; revisit only if slugs ever need to become
mutable independent of identity (they don't today — a rename cascades via `ON UPDATE CASCADE`).

## Two phases

### Phase A — referential integrity (`prisma/planned/01-tenant-fk.sql`)

Backfills a `Tenant` row for the default workspace and for any orphan `tenantId`, then adds
`FOREIGN KEY (tenantId) REFERENCES Tenant(slug)` on all 11 tenant-scoped tables (`NOT VALID` then
`VALIDATE` to keep locks brief). `ON UPDATE CASCADE`, `ON DELETE RESTRICT` (purgeTenant/C1 already
deletes children before the tenant). Nullable `tenantId` (User, KbArticle) keeps NULL working.

Phase A is low-risk and independently valuable — you can ship it and stop there if you want integrity
without RLS.

### Phase B — row-level security (`prisma/planned/02-tenant-rls.sql`)

`ENABLE` + `FORCE ROW LEVEL SECURITY` and a `tenant_isolation` policy per table keyed on
`current_setting('app.tenant_id', true)`. `current_setting(..., true)` returns NULL when unset, so an
**unscoped** query sees **no** rows (fail-closed). Special cases handled in the file: KbArticle
(NULL = global, readable by all), User (nullable — backfill NULL→'default' first), SupportReply
(inherits tenant via its parent SupportRequest). JobLedger and Tenant are excluded by design.

Phase B is only safe with the two preconditions below.

## App wiring (required before Phase B)

RLS reads `app.tenant_id`, which the app must set **per transaction** with `is_local = true`. This is
critical: a plain `SET` persists on the pooled connection and leaks the last request's tenant into the
next one — worse than no RLS. `set_config(..., true)` is transaction-scoped, so it's discarded on
commit/rollback. Every tenant-scoped query must run inside such a transaction:

**Implemented (2026-09-17) in `lib/server/tenant-rls.ts`, shipped dark.** `withTenant(fn, tenantId?)`
is gated by the `TENANT_RLS` env var: unset/`off` (default) runs `fn` on the shared client with no
transaction — byte-for-byte today's behaviour — so data-access functions can be routed through it one
at a time, on production, with zero effect. `TENANT_RLS=on` opens one interactive transaction, runs
`SELECT set_config('app.tenant_id', $tenant, true)` and passes the transaction client to `fn`.
Unit-tested (`tenant-rls.test.ts`) for the flag semantics and the is_local=true call.

```ts
import { withTenant } from "./tenant-rls";
// inside a data-access function:
return withTenant((tx) => tx.booking.findMany({ where: { tenantId, ... } }));
```

Rollout order: (1) route every tenant-scoped read/write in `db.ts`, `users.ts`, `directory.ts`,
`kb.ts`, `support.ts`, … through `withTenant` while the flag is off — deploy, no behaviour change;
(2) on **staging**, apply Phase A then Phase B and set `TENANT_RLS=on`; run the leak test;
(3) production in the same order. Add `TENANT_RLS` to the `environment:` block of
`docker-compose.cohost.yml` when step 2 starts (deliberately not there yet — nothing should be able to
switch it on before the SQL is applied).

Each data-access function then routes through it, e.g.
`return withTenant((tx) => tx.booking.findMany({ where: { ... } }));`. Platform-admin paths that must
cross tenants (global KB authoring, the admin tenant list) run **without** `withTenant` under a DB role
that is exempt from FORCE RLS — keep that role separate from the app's runtime role.

### Preconditions (or RLS silently no-ops / locks everyone out)

1. The app connects as a **non-owner** role. Table owners and superusers bypass RLS unless `FORCE` is
   set (we set it) — but use a distinct migration/admin role for cross-tenant work.
2. Every tenant-scoped query runs inside `withTenant` (above). Audit for stray uses of the shared
   client before enabling.

## Validation runbook (staging)

1. **Snapshot / use a disposable DB.** Point `DATABASE_URL` at staging.
2. **Phase A:** `psql "$DATABASE_URL" -f prisma/planned/01-tenant-fk.sql`. Confirm it commits; spot-check
   `SELECT conname FROM pg_constraint WHERE conname LIKE '%_tenantId_fkey';` → 11 rows.
3. **Regression:** run the app against staging; exercise booking/support/admin flows. Integrity is now
   enforced — a bad `tenantId` insert should be rejected.
4. **Wire `withTenant`** (app change) and deploy to staging. Confirm normal flows still work (queries
   now run in tenant-scoped transactions).
5. **Phase B:** run `02-tenant-rls.sql`. Then the **leak test**:
   - Seed two tenants A and B with a booking each.
   - As tenant A (host `a.roamhub360.com`), list bookings → see only A's.
   - Directly in `psql` **without** setting `app.tenant_id`, `SELECT * FROM "Booking";` → **0 rows**
     (fail-closed proof).
   - Set `app.tenant_id='a'` in a transaction → see only A's rows.
6. **Only then** schedule production: Phase A → app deploy with `withTenant` → Phase B, each with the
   same checks. Keep the rollback statements (bottom of each SQL file) ready.

## Keeping Prisma in sync

The runbook applies the SQL directly via `psql`, so after Phase A validates, reflect the FKs in
`prisma/schema.prisma` too (add `tenant Tenant? @relation(fields: [tenantId], references: [slug])` to
each scoped model + the back-relations on `Tenant`) and reconcile with a migration — otherwise
`prisma migrate diff` will keep proposing to "add" constraints that already exist. RLS is raw SQL that
Prisma doesn't model; keep `02-tenant-rls.sql` as the source of truth (apply it as a custom migration
step, not something Prisma regenerates).

## Rollback

Each SQL file ends with its rollback (DROP CONSTRAINT / DISABLE RLS + DROP POLICY). Phase B can be
disabled independently of Phase A. Because the app also filters by `tenantId` in code, disabling RLS
degrades to today's behaviour (application-only isolation) with no data change.

## Why this wasn't auto-applied

RLS mistakes are high-blast-radius (cross-tenant leak, or a locked-out app), and correctness depends
on the live DB role setup and the `withTenant` wiring — none of which can be verified without a
database. So this ships as reviewed, staged artifacts, not an automatic migration.

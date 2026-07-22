#!/bin/sh
# One-shot DB migrator — applies versioned migrations with `prisma migrate deploy` (H6), replacing
# the old `prisma db push`. Schema changes are now reviewed, checked-in migration files.
#
# Three cases, handled automatically:
#   1. Fresh/empty database  → `migrate deploy` creates everything from the migrations. Done.
#   2. Already-baselined DB  → `migrate deploy` applies any pending migrations. Done.
#   3. Pre-migrations DB (created by the old `db push`, has tables but NO migration history) →
#      `migrate deploy` fails P3005 ("schema is not empty"). We then, ONE time:
#        a. `db push` to reconcile the schema to the baseline (additive/idempotent — this is the
#           last db push; without it, baselining would mark 00000000000000_init "applied" while the
#           DB still lacks this release's new tables/columns, and the app would crash);
#        b. mark 00000000000000_init as applied (baseline);
#        c. `migrate deploy` to apply any migrations added AFTER the baseline.
#      After this runs once, migration history exists, so future deploys take case 2.
set -e

if npx prisma migrate deploy > /tmp/migrate.log 2>&1; then
  cat /tmp/migrate.log
  exit 0
fi

cat /tmp/migrate.log
if grep -q "P3005" /tmp/migrate.log; then
  echo "[migrator] pre-migrations database detected — reconciling schema (db push), baselining 00000000000000_init, then deploying"
  npx prisma db push --skip-generate
  npx prisma migrate resolve --applied 00000000000000_init
  npx prisma migrate deploy
else
  echo "[migrator] migrate deploy failed for a reason other than P3005 — see log above" >&2
  exit 1
fi

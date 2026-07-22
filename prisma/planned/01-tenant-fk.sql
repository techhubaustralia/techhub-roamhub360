-- C4 · Phase A — referential integrity for tenantId (PREPARED, NOT auto-applied).
-- Run against STAGING first (see docs/C4-tenancy-hardening.md), validate, then production.
-- This is intentionally OUTSIDE prisma/migrations/ so `npm run db:migrate` never applies it
-- automatically — it must be a deliberate, validated step.
--
-- Design decision: the FK references Tenant(slug), NOT a surrogate UUID. `tenantId` already holds
-- the slug everywhere (host resolution, blob paths, currentTenantId()); converting to a UUID adds
-- no integrity or isolation that the slug FK doesn't, at enormous app-wide churn/risk. Tenant.slug
-- is UNIQUE, so it is a valid FK target.

BEGIN;

-- 1) Guarantee a Tenant row for the built-in default workspace.
INSERT INTO "Tenant" (id, slug, name)
SELECT gen_random_uuid()::text, 'default', 'Default workspace'
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" WHERE slug = 'default');

-- 2) Backfill a Tenant row for ANY tenantId value that has data but no Tenant row, so the FK below
--    cannot fail on legacy/orphan rows. name defaults to the slug and can be edited later.
INSERT INTO "Tenant" (id, slug, name)
SELECT gen_random_uuid()::text, t.tid, t.tid
FROM (
  SELECT DISTINCT "tenantId" AS tid FROM "Booking"
  UNION SELECT DISTINCT "tenantId" FROM "CheckIn"
  UNION SELECT DISTINCT "tenantId" FROM "Lock"
  UNION SELECT DISTINCT "tenantId" FROM "AuditLog"
  UNION SELECT DISTINCT "tenantId" FROM "ApiKey"
  UNION SELECT DISTINCT "tenantId" FROM "License"
  UNION SELECT DISTINCT "tenantId" FROM "TenantIntegration"
  UNION SELECT DISTINCT "tenantId" FROM "DirectoryUser"
  UNION SELECT DISTINCT "tenantId" FROM "User"
  UNION SELECT DISTINCT "tenantId" FROM "KbArticle"
  UNION SELECT DISTINCT "tenantId" FROM "SupportRequest"
) t
WHERE t.tid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Tenant" WHERE slug = t.tid);

-- 3) Add the FK constraints. NOT VALID first = the constraint applies to new/updated rows
--    immediately but skips the full-table scan; VALIDATE separately (below) so the lock is brief.
--    ON UPDATE CASCADE keeps rows in sync if a slug is ever renamed; ON DELETE RESTRICT prevents
--    deleting a Tenant that still has data (purgeTenant/C1 already deletes children first).
ALTER TABLE "Booking"           ADD CONSTRAINT "Booking_tenantId_fkey"           FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE "CheckIn"           ADD CONSTRAINT "CheckIn_tenantId_fkey"           FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE "Lock"              ADD CONSTRAINT "Lock_tenantId_fkey"              FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE "AuditLog"          ADD CONSTRAINT "AuditLog_tenantId_fkey"          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE "ApiKey"            ADD CONSTRAINT "ApiKey_tenantId_fkey"            FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE "License"           ADD CONSTRAINT "License_tenantId_fkey"           FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE "TenantIntegration" ADD CONSTRAINT "TenantIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE "DirectoryUser"     ADD CONSTRAINT "DirectoryUser_tenantId_fkey"     FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
-- User.tenantId and KbArticle.tenantId are NULLABLE (null = unassigned / global). A nullable FK
-- allows NULL and only enforces the reference when a value is present.
ALTER TABLE "User"              ADD CONSTRAINT "User_tenantId_fkey"              FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE "KbArticle"         ADD CONSTRAINT "KbArticle_tenantId_fkey"         FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE "SupportRequest"    ADD CONSTRAINT "SupportRequest_tenantId_fkey"    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("slug") ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

-- 4) Validate the constraints (checks existing rows). Safe because step 2 backfilled every orphan.
ALTER TABLE "Booking"           VALIDATE CONSTRAINT "Booking_tenantId_fkey";
ALTER TABLE "CheckIn"           VALIDATE CONSTRAINT "CheckIn_tenantId_fkey";
ALTER TABLE "Lock"              VALIDATE CONSTRAINT "Lock_tenantId_fkey";
ALTER TABLE "AuditLog"          VALIDATE CONSTRAINT "AuditLog_tenantId_fkey";
ALTER TABLE "ApiKey"            VALIDATE CONSTRAINT "ApiKey_tenantId_fkey";
ALTER TABLE "License"           VALIDATE CONSTRAINT "License_tenantId_fkey";
ALTER TABLE "TenantIntegration" VALIDATE CONSTRAINT "TenantIntegration_tenantId_fkey";
ALTER TABLE "DirectoryUser"     VALIDATE CONSTRAINT "DirectoryUser_tenantId_fkey";
ALTER TABLE "User"              VALIDATE CONSTRAINT "User_tenantId_fkey";
ALTER TABLE "KbArticle"         VALIDATE CONSTRAINT "KbArticle_tenantId_fkey";
ALTER TABLE "SupportRequest"    VALIDATE CONSTRAINT "SupportRequest_tenantId_fkey";

COMMIT;

-- Rollback (if needed): DROP each constraint, e.g.
--   ALTER TABLE "Booking" DROP CONSTRAINT "Booking_tenantId_fkey";
-- The backfilled Tenant rows are harmless to keep; delete any you don't recognise after review.

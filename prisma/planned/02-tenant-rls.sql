-- C4 · Phase B — Postgres Row-Level Security (PREPARED, NOT auto-applied).
-- Defence-in-depth: even if an application query forgets its tenant filter, the database refuses to
-- return or write another tenant's rows. Apply ONLY after Phase A (FK) is validated AND the app sets
-- the tenant context per transaction (see docs/C4-tenancy-hardening.md → "App wiring"). Validate on
-- STAGING with the two-tenant leak test before production.
--
-- PRECONDITIONS (must be true or RLS silently does nothing / locks everything out):
--   1. The app connects as a NON-OWNER role. A table's OWNER and SUPERUSERs BYPASS RLS unless FORCE
--      is set. We FORCE it below so even the owner is subject to policy — but a migration/admin role
--      that must see all tenants should be a SEPARATE role that you exempt deliberately.
--   2. Every tenant-scoped query runs inside a transaction that has executed
--        SELECT set_config('app.tenant_id', '<slug>', true);   -- is_local=true → transaction-scoped
--      current_setting('app.tenant_id', true) returns NULL when unset, so an UNSCOPED query sees NO
--      rows (fail-closed) rather than every tenant's rows.

BEGIN;

-- Helper note: current_setting(name, true) → missing_ok, returns NULL if the GUC isn't set.

-- ---- Strict tenant tables: visible/writable only within the current tenant ---------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Booking','CheckIn','Lock','AuditLog','ApiKey','License','TenantIntegration','DirectoryUser','SupportRequest'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = current_setting('app.tenant_id', true))
        WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
    $f$, t);
  END LOOP;
END $$;

-- ---- KbArticle: NULL tenantId = GLOBAL (platform-authored, visible to every workspace) ----------
-- Read: own-tenant rows OR global rows. Write: own-tenant only (global articles are authored by a
-- platform-admin path that runs WITHOUT a tenant context — see the app-wiring note in the doc).
ALTER TABLE "KbArticle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KbArticle" FORCE ROW LEVEL SECURITY;
CREATE POLICY kb_read ON "KbArticle" FOR SELECT
  USING ("tenantId" = current_setting('app.tenant_id', true) OR "tenantId" IS NULL);
CREATE POLICY kb_write ON "KbArticle" FOR ALL
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ---- User: tenantId is NULLABLE. RECOMMENDED: backfill NULL → 'default' BEFORE enabling, so no
-- user becomes invisible. Verify first:  SELECT count(*) FROM "User" WHERE "tenantId" IS NULL;
-- (Uncomment the backfill if that count is > 0 and the nulls should belong to 'default'.)
-- UPDATE "User" SET "tenantId" = 'default' WHERE "tenantId" IS NULL;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ---- SupportReply: no own tenantId — inherit it from the parent SupportRequest via the FK path.
-- (Consider denormalising a tenantId column onto SupportReply for a simpler/faster policy later.)
ALTER TABLE "SupportReply" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportReply" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupportReply"
  USING (EXISTS (
    SELECT 1 FROM "SupportRequest" sr
    WHERE sr.id = "SupportReply"."requestId"
      AND sr."tenantId" = current_setting('app.tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "SupportRequest" sr
    WHERE sr.id = "SupportReply"."requestId"
      AND sr."tenantId" = current_setting('app.tenant_id', true)
  ));

-- NOT covered, by design:
--   • JobLedger — platform-internal idempotency keys, globally unique, no tenant dimension.
--   • Tenant    — the registry itself; managed by platform/admin paths, not tenant-scoped queries.

COMMIT;

-- Rollback: for each table,  ALTER TABLE %I DISABLE ROW LEVEL SECURITY;  DROP POLICY ... ;

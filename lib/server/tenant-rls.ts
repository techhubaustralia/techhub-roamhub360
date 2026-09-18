import "server-only";
import { prisma } from "./prisma";
import { currentTenantId } from "./tenant";

// C4 Phase B plumbing — see docs/C4-tenancy-hardening.md. Postgres row-level security (when the
// planned SQL is applied) reads `app.tenant_id`, which must be set PER TRANSACTION with is_local=true:
// a plain SET would persist on the pooled connection and leak the previous request's tenant into the
// next one — worse than no RLS at all. `withTenant` is the one place that does this correctly.
//
// Gated by TENANT_RLS so it can be wired into data-access code incrementally and shipped dark:
//   TENANT_RLS unset/"off"  → fn runs on the shared client, no transaction (today's behaviour, exactly)
//   TENANT_RLS="on"         → fn runs inside a transaction with app.tenant_id set for its duration
// Flip it ON only after prisma/planned/02-tenant-rls.sql is applied on that database and every
// tenant-scoped query the request makes goes through here (the runbook's leak test proves both).
/* eslint-disable @typescript-eslint/no-explicit-any */

export type TenantTx = any; // PrismaClient or an interactive-transaction client; same query surface

/** True when the process should set the RLS tenant context (see module note). */
export function rlsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.TENANT_RLS ?? "").trim().toLowerCase() === "on";
}

/**
 * Set the RLS tenant context on a transaction client you ALREADY hold — for functions that run
 * their own `$transaction` (createBooking / updateBookingTimes use Serializable isolation and
 * retries; interactive transactions can't nest, so they can't be wrapped in `withTenant`). Call it
 * as the first statement inside the transaction callback. No-op while the flag is off.
 */
export async function setTenantContext(tx: TenantTx, tenantId?: string): Promise<void> {
  if (!rlsEnabled()) return;
  const tid = tenantId ?? (await currentTenantId());
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tid}, true)`;
}

/**
 * Run `fn` with the row-level-security tenant context set for ONE transaction. Pass the `tx` it
 * receives to every query inside `fn` — queries on the shared client would run outside the
 * transaction and, under FORCE RLS, see no rows.
 */
export async function withTenant<T>(fn: (tx: TenantTx) => Promise<T>, tenantId?: string): Promise<T> {
  const p = await prisma();
  if (!rlsEnabled()) return fn(p);
  const tid = tenantId ?? (await currentTenantId());
  return p.$transaction(async (tx: TenantTx) => {
    await setTenantContext(tx, tid);
    return fn(tx);
  });
}

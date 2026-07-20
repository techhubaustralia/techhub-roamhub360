import "server-only";
import { encryptSecret, decryptSecret } from "./crypto";

// Per-tenant Microsoft integration store (Commercial SaaS CP1). Writes encrypt the client secret;
// reads for the UI never include it (only whether one is set). getIntegrationCreds() is the ONLY
// path that decrypts, and it is server-only — used by the Graph layer, never returned to a client.
/* eslint-disable @typescript-eslint/no-explicit-any */

const useSql = Boolean(process.env.DATABASE_URL);

let _prisma: any = null;
async function prisma(): Promise<any> {
  if (!_prisma) {
    const mod: any = await import("@prisma/client");
    _prisma = new mod.PrismaClient();
  }
  return _prisma;
}

export interface IntegrationStatus {
  configured: boolean; // azureTenantId + clientId + secret all present
  azureTenantId: string | null;
  graphClientId: string | null;
  mailFrom: string | null;
  hasSecret: boolean;
  lastTestOk: boolean | null;
  lastTestAt: string | null;
  lastTestError: string | null;
}

export interface IntegrationCreds {
  azureTenantId: string;
  graphClientId: string;
  secret: string;
  mailFrom: string | null;
}

/** Save (partial) integration settings for a tenant. A non-empty `secret` is encrypted; omitting
 *  it leaves the stored secret unchanged. Clears the last test result on any change. */
export async function saveIntegration(
  tenantId: string,
  input: { azureTenantId?: string; graphClientId?: string; secret?: string; mailFrom?: string },
): Promise<void> {
  const p = await prisma();
  const data: Record<string, unknown> = { lastTestOk: null, lastTestAt: null, lastTestError: null };
  if (input.azureTenantId !== undefined) data.azureTenantId = input.azureTenantId.trim() || null;
  if (input.graphClientId !== undefined) data.graphClientId = input.graphClientId.trim() || null;
  if (input.mailFrom !== undefined) data.mailFrom = input.mailFrom.trim() || null;
  if (input.secret) data.secretEnc = encryptSecret(input.secret); // only overwrite when a new one is supplied
  await p.tenantIntegration.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });
}

/** Status for the admin UI — never includes the secret value. */
export async function getIntegrationStatus(tenantId: string): Promise<IntegrationStatus> {
  const empty: IntegrationStatus = { configured: false, azureTenantId: null, graphClientId: null, mailFrom: null, hasSecret: false, lastTestOk: null, lastTestAt: null, lastTestError: null };
  if (!useSql) return empty;
  const p = await prisma();
  const row = await p.tenantIntegration.findUnique({ where: { tenantId } });
  if (!row) return empty;
  const hasSecret = Boolean(row.secretEnc);
  return {
    configured: Boolean(row.azureTenantId && row.graphClientId && hasSecret),
    azureTenantId: row.azureTenantId ?? null,
    graphClientId: row.graphClientId ?? null,
    mailFrom: row.mailFrom ?? null,
    hasSecret,
    lastTestOk: row.lastTestOk ?? null,
    lastTestAt: row.lastTestAt ? (row.lastTestAt as Date).toISOString() : null,
    lastTestError: row.lastTestError ?? null,
  };
}

/** Decrypted creds for server-side Graph calls, or null if not fully configured. SERVER-ONLY. */
export async function getIntegrationCreds(tenantId: string): Promise<IntegrationCreds | null> {
  if (!useSql) return null;
  const p = await prisma();
  const row = await p.tenantIntegration.findUnique({ where: { tenantId } });
  if (!row?.azureTenantId || !row?.graphClientId || !row?.secretEnc) return null;
  try {
    return { azureTenantId: row.azureTenantId, graphClientId: row.graphClientId, secret: decryptSecret(row.secretEnc), mailFrom: row.mailFrom ?? null };
  } catch {
    return null; // key rotated / blob corrupt → treat as unconfigured rather than crashing
  }
}

/** Entra group ids whose members should be synced. Empty = whole directory (legacy). */
export async function getDirectoryGroups(tenantId: string): Promise<string[]> {
  if (!useSql) return [];
  const p = await prisma();
  const row = await p.tenantIntegration.findUnique({ where: { tenantId } });
  return (row?.directoryGroups as string[] | undefined) ?? [];
}

export async function setDirectoryGroups(tenantId: string, groupIds: string[]): Promise<void> {
  const p = await prisma();
  const clean = [...new Set(groupIds.map((g) => g.trim()).filter(Boolean))].slice(0, 50);
  await p.tenantIntegration.upsert({
    where: { tenantId },
    create: { tenantId, directoryGroups: clean },
    update: { directoryGroups: clean },
  });
}

export async function recordTest(tenantId: string, ok: boolean, error?: string): Promise<void> {
  if (!useSql) return;
  const p = await prisma();
  await p.tenantIntegration.update({
    where: { tenantId },
    data: { lastTestOk: ok, lastTestAt: new Date(), lastTestError: error ?? null },
  });
}

import "server-only";
import { prisma } from "./prisma";
import crypto from "crypto";

// "Org sign-in" via Microsoft Entra ADMIN CONSENT (Commercial G6).
//
// Flow: a workspace admin clicks Connect → we send their IT admin to Microsoft's
// /organizations/v2.0/adminconsent endpoint → Microsoft shows "Permissions requested … Consent on
// behalf of your organization" → the callback gives us their directory (tenant) id. From then on,
// ANY user of that Entra directory who signs in with Microsoft is auto-provisioned as staff in
// that workspace — no invites needed. The directory id comes from Microsoft's signed id_token
// (`tid` claim), so membership is cryptographically attested; we never trust the email domain.

const useSql = Boolean(process.env.DATABASE_URL);


// ---- CSRF state for the consent round-trip (HMAC, 15 min) --------------------------------------
const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";

export function signConnectState(tenantId: string, byEmail: string): string {
  const payload = { t: tenantId, by: byEmail, exp: Date.now() + 15 * 60 * 1000 };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(`entra-connect:${data}`).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyConnectState(state: string): { tenantId: string; byEmail: string } | null {
  const [data, sig] = state.split(".");
  if (!data || !sig) return null;
  const expect = crypto.createHmac("sha256", SECRET).update(`entra-connect:${data}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString());
    if (typeof p.t !== "string" || typeof p.by !== "string" || Date.now() > p.exp) return null;
    return { tenantId: p.t, byEmail: p.by };
  } catch {
    return null;
  }
}

// ---- Connection storage -------------------------------------------------------------------------
export interface OrgSsoStatus {
  connected: boolean;
  entraTenantId: string | null;
  connectedAt: string | null;
  connectedBy: string | null;
}

const GUID = /^[0-9a-fA-F-]{30,40}$/;

/** Link an Entra directory to a workspace. Throws if that org is already linked elsewhere. */
export async function saveOrgSso(tenantId: string, entraTenantId: string, byEmail: string): Promise<void> {
  if (!GUID.test(entraTenantId)) throw new Error("Invalid directory id.");
  const p = await prisma();
  const taken = await p.tenantIntegration.findFirst({ where: { ssoEntraTenantId: entraTenantId, NOT: { tenantId } } });
  if (taken) throw new Error("That Microsoft organisation is already connected to another workspace.");
  const data = { ssoEntraTenantId: entraTenantId, ssoConnectedAt: new Date(), ssoConnectedBy: byEmail };
  await p.tenantIntegration.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
}

export async function clearOrgSso(tenantId: string): Promise<void> {
  if (!useSql) return;
  const p = await prisma();
  await p.tenantIntegration
    .update({ where: { tenantId }, data: { ssoEntraTenantId: null, ssoConnectedAt: null, ssoConnectedBy: null } })
    .catch(() => {}); // no row = nothing to clear
}

export async function getOrgSsoStatus(tenantId: string): Promise<OrgSsoStatus> {
  const empty: OrgSsoStatus = { connected: false, entraTenantId: null, connectedAt: null, connectedBy: null };
  if (!useSql) return empty;
  const p = await prisma();
  const row = await p.tenantIntegration.findUnique({ where: { tenantId } });
  if (!row?.ssoEntraTenantId) return empty;
  return {
    connected: true,
    entraTenantId: row.ssoEntraTenantId,
    connectedAt: row.ssoConnectedAt ? (row.ssoConnectedAt as Date).toISOString() : null,
    connectedBy: row.ssoConnectedBy ?? null,
  };
}

/** Which workspace (if any) has claimed this Entra directory? Used during sign-in. */
export async function findTenantByEntraTid(tid: string): Promise<string | null> {
  if (!useSql || !GUID.test(tid)) return null;
  const p = await prisma();
  const row = await p.tenantIntegration.findFirst({ where: { ssoEntraTenantId: tid } });
  return row?.tenantId ?? null;
}

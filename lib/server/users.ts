import "server-only";
import { prisma } from "./prisma";
import { currentTenantId, DEFAULT_TENANT } from "./tenant";

// Rows belong to a tenant. On the DEFAULT workspace we also match legacy rows whose tenantId was
// never stamped (null), so the very first bootstrap admin stays visible and counted.
const tenantWhere = (t: string) => (t === DEFAULT_TENANT ? { OR: [{ tenantId: t }, { tenantId: null }] } : { tenantId: t });

// App user store (Postgres via Prisma). Source of truth for identity + role for
// both local (email/password) and Entra (SSO) users. Requires DATABASE_URL.
/* eslint-disable @typescript-eslint/no-explicit-any */


export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  passwordHash?: string | null;
  role: string;
  sites: string[];
  multiBook: boolean;
  provider: string;
  tenantId?: string | null;
  hidePresence?: boolean;
  notifyPresence?: boolean;
  emailVerified?: Date | null;
  mustVerify?: boolean;
  totpSecret?: string | null;
  totpEnabled?: boolean;
}

// Self-service preferences (Team Build-Up C privacy + D notifications).
export interface UserPrefs {
  hidePresence: boolean; // hidden from the "Who's in" board (others can't see me; I still see myself)
  notifyPresence: boolean; // opted in to the daily "who's in" digest
}
const DEFAULT_PREFS: UserPrefs = { hidePresence: false, notifyPresence: false };

export async function getUserPrefs(email: string): Promise<UserPrefs> {
  if (!process.env.DATABASE_URL) return { ...DEFAULT_PREFS };
  const p = await prisma();
  const u = await p.user.findUnique({ where: { email: email.toLowerCase() }, select: { hidePresence: true, notifyPresence: true } });
  return { hidePresence: Boolean(u?.hidePresence), notifyPresence: Boolean(u?.notifyPresence) };
}

export async function updateUserPrefs(email: string, patch: Partial<UserPrefs>): Promise<void> {
  const p = await prisma();
  const data: Record<string, unknown> = {};
  if (patch.hidePresence !== undefined) data.hidePresence = patch.hidePresence;
  if (patch.notifyPresence !== undefined) data.notifyPresence = patch.notifyPresence;
  if (Object.keys(data).length) await p.user.update({ where: { email: email.toLowerCase() }, data });
}

/** Emails (lowercased) of THIS tenant's users who opted out of the presence board. Empty without a
 *  DB. Tenant-scoped (M2) — previously queried every tenant's users. */
export async function getHiddenPresenceEmails(): Promise<Set<string>> {
  if (!process.env.DATABASE_URL) return new Set();
  const p = await prisma();
  const rows = await p.user.findMany({ where: { hidePresence: true, ...tenantWhere(await currentTenantId()) }, select: { email: true } });
  return new Set(rows.map((r: { email: string }) => r.email.toLowerCase()));
}

/** Emails (lowercased) of THIS tenant's users opted in to the daily "who's in" digest. Tenant-scoped. */
export async function getPresenceDigestEmails(): Promise<Set<string>> {
  if (!process.env.DATABASE_URL) return new Set();
  const p = await prisma();
  const rows = await p.user.findMany({ where: { notifyPresence: true, ...tenantWhere(await currentTenantId()) }, select: { email: true } });
  return new Set(rows.map((r: { email: string }) => r.email.toLowerCase()));
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const p = await prisma();
  return (await p.user.findUnique({ where: { email: email.toLowerCase() } })) ?? null;
}

/** Ensure a local row exists for an SSO sign-in (Entra or Google). Default role: staff. */
export async function upsertSsoUser(email: string, name?: string, provider = "sso", tenantId?: string): Promise<void> {
  const p = await prisma();
  const e = email.toLowerCase();
  await p.user.upsert({
    where: { email: e },
    // tenantId override: org sign-in (Entra admin consent) provisions the user into the workspace
    // their directory is connected to — NOT the host the OAuth round-trip happened on.
    create: { email: e, name: name ?? null, provider, role: "staff", tenantId: tenantId ?? (await currentTenantId()) },
    update: name ? { name } : {},
  });
}

export async function createUser(input: {
  email: string;
  name?: string;
  password?: string; // omit to create an invited user with NO password until they set one
  role?: string;
  sites?: string[];
  multiBook?: boolean;
  tenantId?: string; // explicit tenant (e.g. self-serve signup provisioning a new workspace)
  mustVerify?: boolean; // self-serve signup: block sign-in until the email is verified
}): Promise<Omit<UserRow, "tenantId"> & { id: string }> {
  const p = await prisma();
  let passwordHash: string | null = null;
  if (input.password) passwordHash = await (await import("bcryptjs")).default.hash(input.password, 10);
  const u = await p.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name ?? null,
      passwordHash,
      role: input.role ?? "staff",
      sites: input.sites ?? [],
      multiBook: input.multiBook ?? false,
      provider: "credentials",
      tenantId: input.tenantId ?? (await currentTenantId()),
      mustVerify: input.mustVerify ?? false,
    },
  });
  return { id: u.id, email: u.email, name: u.name, role: u.role, sites: u.sites, multiBook: u.multiBook, provider: u.provider };
}

/** Set a user's password by id (reset / invite / self-service change). */
export async function setUserPassword(id: string, password: string): Promise<void> {
  const bcrypt = (await import("bcryptjs")).default;
  const p = await prisma();
  await p.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
}

/** Mark a user's email as verified — clears the sign-in block. */
export async function setUserEmailVerified(id: string): Promise<void> {
  const p = await prisma();
  await p.user.update({ where: { id }, data: { emailVerified: new Date(), mustVerify: false } });
}

/** Store a pending 2FA secret (not yet enabled). */
export async function setUserTotpSecret(id: string, secret: string): Promise<void> {
  const p = await prisma();
  await p.user.update({ where: { id }, data: { totpSecret: secret, totpEnabled: false } });
}
/** Enable or disable 2FA. Disabling clears the secret. */
export async function setUserTotpEnabled(id: string, enabled: boolean): Promise<void> {
  const p = await prisma();
  await p.user.update({ where: { id }, data: enabled ? { totpEnabled: true } : { totpEnabled: false, totpSecret: null } });
}

export async function listUsers(tenantId?: string): Promise<Omit<UserRow, "tenantId">[]> {
  const p = await prisma();
  const t = tenantId ?? (await currentTenantId());
  return p.user.findMany({
    where: tenantWhere(t),
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, role: true, sites: true, multiBook: true, provider: true },
  });
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const p = await prisma();
  return (await p.user.findUnique({ where: { id } })) ?? null;
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: string; sites?: string[]; multiBook?: boolean; password?: string },
): Promise<void> {
  const p = await prisma();
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.role !== undefined) data.role = patch.role;
  if (patch.sites !== undefined) data.sites = patch.sites;
  if (patch.multiBook !== undefined) data.multiBook = patch.multiBook;
  if (patch.password) {
    const bcrypt = (await import("bcryptjs")).default;
    data.passwordHash = await bcrypt.hash(patch.password, 10);
  }
  await p.user.update({ where: { id }, data });
}

export async function deleteUser(id: string): Promise<void> {
  const p = await prisma();
  await p.user.delete({ where: { id } });
}

/** Count global admins IN A TENANT — used to prevent removing/demoting a workspace's last one. */
export async function globalAdminCount(tenantId?: string): Promise<number> {
  const p = await prisma();
  const t = tenantId ?? (await currentTenantId());
  return p.user.count({ where: { ...tenantWhere(t), role: "global-admin" } });
}

/** Number of users in a tenant (0 without a DB). For the onboarding checklist (G1). */
export async function countTenantUsers(tenantId: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  const p = await prisma();
  return p.user.count({ where: { tenantId } });
}

/** Admin email addresses for a tenant (by slug = the stamped tenantId). For CP4 notifications. */
export async function listTenantAdminEmails(tenantId: string): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];
  const p = await prisma();
  const rows = await p.user.findMany({ where: { tenantId, role: "global-admin" }, select: { email: true } });
  return rows.map((r: { email: string }) => r.email);
}

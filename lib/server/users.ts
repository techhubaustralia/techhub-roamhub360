import "server-only";
import { currentTenantId } from "./tenant";

// App user store (Postgres via Prisma). Source of truth for identity + role for
// both local (email/password) and Entra (SSO) users. Requires DATABASE_URL.
/* eslint-disable @typescript-eslint/no-explicit-any */

let _prisma: any = null;
async function prisma(): Promise<any> {
  if (!process.env.DATABASE_URL) throw new Error("User management requires DATABASE_URL (Postgres) to be set.");
  if (!_prisma) {
    const mod: any = await import("@prisma/client");
    _prisma = new mod.PrismaClient();
  }
  return _prisma;
}

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

/** Emails (lowercased) of users who have opted out of the presence board. Empty without a DB. */
export async function getHiddenPresenceEmails(): Promise<Set<string>> {
  if (!process.env.DATABASE_URL) return new Set();
  const p = await prisma();
  const rows = await p.user.findMany({ where: { hidePresence: true }, select: { email: true } });
  return new Set(rows.map((r: { email: string }) => r.email.toLowerCase()));
}

/** Emails (lowercased) of users who opted in to the daily "who's in" digest. Empty without a DB. */
export async function getPresenceDigestEmails(): Promise<Set<string>> {
  if (!process.env.DATABASE_URL) return new Set();
  const p = await prisma();
  const rows = await p.user.findMany({ where: { notifyPresence: true }, select: { email: true } });
  return new Set(rows.map((r: { email: string }) => r.email.toLowerCase()));
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const p = await prisma();
  return (await p.user.findUnique({ where: { email: email.toLowerCase() } })) ?? null;
}

/** Ensure a local row exists for an SSO sign-in (Entra or Google). Default role: staff. */
export async function upsertSsoUser(email: string, name?: string, provider = "sso"): Promise<void> {
  const p = await prisma();
  const e = email.toLowerCase();
  await p.user.upsert({
    where: { email: e },
    create: { email: e, name: name ?? null, provider, role: "staff", tenantId: await currentTenantId() },
    update: name ? { name } : {},
  });
}

export async function createUser(input: {
  email: string;
  name?: string;
  password: string;
  role?: string;
  sites?: string[];
  multiBook?: boolean;
}): Promise<Omit<UserRow, "tenantId">> {
  const bcrypt = (await import("bcryptjs")).default;
  const p = await prisma();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const u = await p.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name ?? null,
      passwordHash,
      role: input.role ?? "staff",
      sites: input.sites ?? [],
      multiBook: input.multiBook ?? false,
      provider: "credentials",
      tenantId: await currentTenantId(),
    },
  });
  return { id: u.id, email: u.email, name: u.name, role: u.role, sites: u.sites, multiBook: u.multiBook, provider: u.provider };
}

export async function listUsers(): Promise<Omit<UserRow, "tenantId">[]> {
  const p = await prisma();
  return p.user.findMany({
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

/** Count global admins — used to prevent removing/demoting the last one. */
export async function globalAdminCount(): Promise<number> {
  const p = await prisma();
  return p.user.count({ where: { role: "global-admin" } });
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

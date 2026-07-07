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

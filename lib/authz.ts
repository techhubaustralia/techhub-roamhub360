// Pure, client-safe authorization helpers (no server-only / next/headers deps),
// so they can be unit-tested and shared. The server resolves the full AppUser in
// lib/server/auth.ts, which re-exports canAccessBuilding from here.

export type Role = "global-admin" | "site-admin" | "staff";

export interface ScopedUser {
  role: Role;
  sites?: string[]; // site-admin scope: building-root ids
}

/**
 * Site-scoped authorization for admin/management actions. `floorOrBuildingId` may
 * be a floor id (`<building>__floor-2`) or a bare building id; site-admins are
 * scoped to their assigned building roots. Global admins pass everywhere; staff
 * never pass (booking for oneself does not go through this check).
 */
export function canAccessBuilding(user: ScopedUser, floorOrBuildingId: string): boolean {
  if (user.role === "global-admin") return true;
  if (user.role !== "site-admin") return false;
  const root = String(floorOrBuildingId || "").split("__")[0];
  return (user.sites ?? []).includes(root);
}

// ---- Dev-only identity simulation (API regression suite) ----
// `x-dev-user` / `x-dev-role` let a local test act as a named user with a given role. Kept pure
// so the production guarantee is unit-testable: returns null under NODE_ENV=production no matter
// what headers arrive. The server additionally only consults this inside the no-session dev branch
// of getUser(), so the gate is doubled. A named user defaults to the LEAST-privileged role.
export const DEV_USER_HEADER = "x-dev-user";
export const DEV_ROLE_HEADER = "x-dev-role";
const ROLES: readonly Role[] = ["global-admin", "site-admin", "staff"];

export function devIdentityFromHeaders(
  get: (name: string) => string | null | undefined,
  nodeEnv: string | undefined,
): { email: string; role: Role } | null {
  if (nodeEnv === "production") return null;
  const email = (get(DEV_USER_HEADER) ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  const roleRaw = (get(DEV_ROLE_HEADER) ?? "").trim().toLowerCase();
  const role = (ROLES as readonly string[]).includes(roleRaw) ? (roleRaw as Role) : "staff";
  return { email, role };
}

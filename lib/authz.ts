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

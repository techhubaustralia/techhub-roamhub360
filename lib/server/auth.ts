import "server-only";
import { auth as getSession } from "@/auth";
import { canAccessBuilding } from "../authz";
import { currentTenantId } from "./tenant";

export { canAccessBuilding };
export type Role = "global-admin" | "site-admin" | "staff";
export type RoleSource = "bootstrap-env" | "session" | "dev" | "anonymous";
export interface AppUser {
  name: string;
  email: string;
  role: Role;
  sites?: string[]; // site-admin scope
  // "Office Manager": may hold multiple desk bookings per day (bypasses the one-desk rule).
  multiBook?: boolean;
  groups: string[];
  // diagnostics
  roleSource?: RoleSource;
  entraConfigured?: boolean;
  setupMode?: boolean;
  authenticated?: boolean;
  tenantId?: string; // the request's tenant (from subdomain); DEFAULT_TENANT for the app host
}

// Break-glass: these emails are always Global Admin regardless of their stored role.
// Prevents locking yourself out. Set BOOTSTRAP_ADMINS as a comma-separated env list.
export const BOOTSTRAP_ADMINS = (process.env.BOOTSTRAP_ADMINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const entraConfigured = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);

// Identity from the Auth.js session — Microsoft Entra SSO OR local email/password.
// Role/sites are carried on the JWT (set from the User table in auth.ts callbacks).
export async function getUser(): Promise<AppUser> {
  const session = await getSession();
  const su = session?.user;
  const tenantId = await currentTenantId();

  if (su?.email) {
    const email = su.email.toLowerCase();
    const bootstrap = BOOTSTRAP_ADMINS.includes(email);
    const role: Role = bootstrap ? "global-admin" : ((su.role as Role) || "staff");
    return {
      name: su.name || email.split("@")[0],
      email,
      role,
      sites: su.sites,
      multiBook: su.multiBook,
      groups: [],
      roleSource: bootstrap ? "bootstrap-env" : "session",
      entraConfigured,
      authenticated: true,
      tenantId,
    };
  }

  // No session. In local dev (no login / no DB) fall back to a demo admin so the app
  // is usable without Postgres or SSO. This branch NEVER runs in production.
  if (process.env.NODE_ENV !== "production") {
    return {
      name: "Demo Admin",
      email: "admin@roamhub360.com",
      role: (process.env.DEV_ROLE as Role) || "global-admin",
      groups: [],
      roleSource: "dev",
      entraConfigured,
      authenticated: false,
      tenantId,
    };
  }

  // Production, no session: fail closed (middleware redirects to /signin before this).
  return { name: "", email: "", role: "staff", groups: [], roleSource: "anonymous", entraConfigured, setupMode: true, authenticated: false, tenantId };
}

import type { Role } from "./authz";

// Human-facing names for the stored role values. The STORED values ("global-admin" etc.) are an
// API/DB contract and never change; only what a person reads does. "Workspace admin" makes the
// tenancy boundary explicit — a customer's admin runs THEIR workspace, nothing beyond it. The only
// cross-workspace identity is the platform operator (BOOTSTRAP_ADMINS), which is not a stored role.
export const ROLE_LABELS: Record<Role, string> = {
  "global-admin": "Workspace admin",
  "site-admin": "Site admin",
  staff: "Staff",
};

export const PLATFORM_OPERATOR_LABEL = "Platform operator";

/** Label for a role; a platform operator is shown as such regardless of stored role. */
export function roleLabel(role: string | undefined, platformAdmin?: boolean): string {
  if (platformAdmin) return PLATFORM_OPERATOR_LABEL;
  return ROLE_LABELS[(role ?? "staff") as Role] ?? ROLE_LABELS.staff;
}

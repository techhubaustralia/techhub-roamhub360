import "server-only";
import { currentTenantId } from "./tenant";
import { graphConfiguredFor } from "./graph";
import { listCustomBuildings } from "./store";
import { listBookings } from "./db";
import { countTenantUsers } from "./users";

// Activation checklist (Growth G1). Computes how far a workspace is through first-run setup, so a
// new customer admin has a clear path to value instead of an empty app. Tenant-scoped; the counts
// reuse existing choke-points, so nothing new is trusted from the client.

export interface SetupStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  href: string;
}

export async function onboardingSteps(): Promise<{ steps: SetupStep[]; done: number; total: number; complete: boolean }> {
  const tenantId = await currentTenantId();
  const [ms, sites, users, firstBooking] = await Promise.all([
    graphConfiguredFor(tenantId),
    listCustomBuildings(),
    countTenantUsers(tenantId),
    listBookings({ limit: 1 }),
  ]);
  const steps: SetupStep[] = [
    { key: "microsoft", label: "Connect Microsoft 365", hint: "Sync your directory and send calendar invites.", done: ms, href: "/admin/integration" },
    { key: "site", label: "Add your first site", hint: "Create a building and lay out its floor plan.", done: sites.length > 0, href: "/buildings" },
    { key: "team", label: "Invite your team", hint: "Add colleagues so they can book spaces.", done: users > 1, href: "/admin/users" },
    { key: "booking", label: "Make your first booking", hint: "Reserve a desk to see it end-to-end.", done: firstBooking.length > 0, href: "/book" },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}

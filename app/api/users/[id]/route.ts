import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { updateUser, deleteUser, getUserById, globalAdminCount } from "@/lib/server/users";
import { audit } from "@/lib/server/db";
import { DEFAULT_TENANT } from "@/lib/server/tenant";

// A user is manageable only by an admin of the SAME workspace (or a platform admin). Cross-tenant
// requests return 404 — never reveal that another workspace's user exists.
function reachable(me: { tenantId?: string; platformAdmin?: boolean }, targetTenant: string): boolean {
  return me.platformAdmin === true || (me.tenantId ?? DEFAULT_TENANT) === targetTenant;
}

const Patch = z.object({
  name: z.string().max(120).optional(),
  role: z.enum(["global-admin", "site-admin", "staff"]).optional(),
  sites: z.array(z.string()).optional(),
  multiBook: z.boolean().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const target = await getUserById(id);
  const targetTenant = target?.tenantId ?? DEFAULT_TENANT;
  if (!target || !reachable(me, targetTenant)) return NextResponse.json({ error: "User not found" }, { status: 404 });
  // Don't allow demoting a workspace's last global-admin (lockout guard, scoped to that tenant).
  if (parsed.data.role && parsed.data.role !== "global-admin" && target.role === "global-admin" && (await globalAdminCount(targetTenant)) <= 1) {
    return NextResponse.json({ error: "Cannot demote the last Global Admin." }, { status: 400 });
  }
  await updateUser(id, parsed.data);
  // Capture the permission-relevant transition (role/sites/multiBook) so the audit trail records
  // the exact privilege change, not just that an edit happened. Password is never snapshotted.
  await audit(me.email, "user.update", `${target.email}${parsed.data.role ? ` → ${parsed.data.role}` : ""}`, {
    target: target.email,
    before: { role: target.role, sites: target.sites, multiBook: target.multiBook },
    after: { role: parsed.data.role ?? target.role, sites: parsed.data.sites ?? target.sites, multiBook: parsed.data.multiBook ?? target.multiBook },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const target = await getUserById(id);
  const targetTenant = target?.tenantId ?? DEFAULT_TENANT;
  if (!target || !reachable(me, targetTenant)) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.email.toLowerCase() === me.email.toLowerCase()) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }
  if (target.role === "global-admin" && (await globalAdminCount(targetTenant)) <= 1) {
    return NextResponse.json({ error: "Cannot delete the last Global Admin." }, { status: 400 });
  }
  await deleteUser(id);
  await audit(me.email, "user.delete", target.email);
  return NextResponse.json({ ok: true });
}

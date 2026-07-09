import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { getTenantBySlug } from "@/lib/server/tenants";
import { listUsers, createUser, getUserById, deleteUser, globalAdminCount } from "@/lib/server/users";
import { audit } from "@/lib/server/db";

// Control-plane user management for a SPECIFIC customer workspace. Platform operators only — lets
// TechHub provision a client's users (e.g. their first Global Admin) without hopping subdomains.
// Users are stamped with the target tenant explicitly.
export const runtime = "nodejs";

async function guard(slug: string) {
  const me = await getUser();
  if (!me.platformAdmin) return { error: NextResponse.json({ error: "Not authorized." }, { status: 403 }), me: null };
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { error: NextResponse.json({ error: "Workspace not found." }, { status: 404 }), me: null };
  return { error: null, me };
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await guard(slug);
  if (g.error) return g.error;
  return NextResponse.json({ users: await listUsers(slug) });
}

const CreateUser = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["global-admin", "site-admin", "staff"]).default("staff"),
  sites: z.array(z.string()).optional(),
  multiBook: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await guard(slug);
  if (g.error) return g.error;
  const parsed = CreateUser.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const created = await createUser({ ...parsed.data, tenantId: slug }); // stamp the target workspace
    await audit(g.me!.email, "tenant.user.create", `${created.email} (${created.role}) in ${slug}`);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error && /unique/i.test(e.message) ? "A user with that email already exists." : "Could not create user.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await guard(slug);
  if (g.error) return g.error;
  const id = (await req.json().catch(() => ({})))?.id;
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  const target = await getUserById(id);
  if (!target || (target.tenantId ?? "default") !== slug) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.role === "global-admin" && (await globalAdminCount(slug)) <= 1) {
    return NextResponse.json({ error: "Cannot delete the last Global Admin of this workspace." }, { status: 400 });
  }
  await deleteUser(id);
  await audit(g.me!.email, "tenant.user.delete", `${target.email} in ${slug}`);
  return NextResponse.json({ ok: true });
}

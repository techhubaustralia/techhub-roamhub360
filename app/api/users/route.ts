import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { createUser, listUsers } from "@/lib/server/users";
import { audit } from "@/lib/server/db";
import { sendInvite } from "@/lib/server/invite";

// Local user management (global-admin only). Lets orgs without Microsoft create
// email/password accounts. Entra SSO users are provisioned automatically on sign-in.
export async function GET() {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await listUsers());
  } catch (e) {
    // e.g. DATABASE_URL not set (local dev uses the file backend / demo bypass).
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unavailable" }, { status: 503 });
  }
}

const CreateUser = z
  .object({
    email: z.string().email(),
    name: z.string().max(120).optional(),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    role: z.enum(["global-admin", "site-admin", "staff"]).default("staff"),
    sites: z.array(z.string()).optional(),
    multiBook: z.boolean().optional(),
    invite: z.boolean().optional(), // email a set-password link instead of setting one now
  })
  .refine((d) => d.invite || (d.password?.length ?? 0) >= 8, { message: "A password (8+ chars) is required unless you invite by email.", path: ["password"] });

export async function POST(req: Request) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = CreateUser.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;
  try {
    const created = await createUser({ email: d.email, name: d.name, password: d.invite ? undefined : d.password, role: d.role, sites: d.sites, multiBook: d.multiBook });
    let invited = false;
    if (d.invite) invited = await sendInvite(req, created, { tenantId: me.tenantId, workspaceName: me.branding?.name ?? undefined, inviter: me.name });
    await audit(me.email, "user.create", `${created.email} (${created.role})${d.invite ? " — invited" : ""}`);
    return NextResponse.json({ ...created, invited }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error && /unique/i.test(e.message) ? "A user with that email already exists." : "Could not create user.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}

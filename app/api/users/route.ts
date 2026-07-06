import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { createUser, listUsers } from "@/lib/server/users";
import { audit } from "@/lib/server/db";

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

const CreateUser = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["global-admin", "site-admin", "staff"]).default("staff"),
  sites: z.array(z.string()).optional(),
  multiBook: z.boolean().optional(),
});

export async function POST(req: Request) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = CreateUser.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const created = await createUser(parsed.data);
    await audit(me.email, "user.create", `${created.email} (${created.role})`);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error && /unique/i.test(e.message) ? "A user with that email already exists." : "Could not create user.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getUser } from "@/lib/server/auth";
import { findUserByEmail, setUserPassword } from "@/lib/server/users";
import { audit } from "@/lib/server/db";

// Let a signed-in user change their own password (verifies the current one first). SSO-only
// accounts (no local password) are told to manage it with their identity provider.
export const runtime = "nodejs";

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(req: Request) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const user = await findUserByEmail(me.email);
  if (!user?.passwordHash) {
    return NextResponse.json({ error: "Your account signs in with Microsoft or Google — manage your password there." }, { status: 400 });
  }
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });
  }
  await setUserPassword(user.id, parsed.data.newPassword);
  await audit(user.email, "account.change-password", "self-service");
  return NextResponse.json({ ok: true });
}

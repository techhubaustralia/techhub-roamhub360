import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmailToken } from "@/lib/server/account-token";
import { getUserById, setUserEmailVerified } from "@/lib/server/users";
import { audit } from "@/lib/server/db";

// Confirm an email address from a signed link. PUBLIC (the token is the credential).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = z.object({ token: z.string().min(1) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const t = verifyEmailToken(parsed.data.token);
  if (!t) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
  const user = await getUserById(t.uid);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  await setUserEmailVerified(user.id);
  await audit(user.email, "account.email-verified", "");
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { getUser } from "@/lib/server/auth";
import { findUserByEmail, setUserTotpSecret, setUserTotpEnabled } from "@/lib/server/users";
import { generateSecret, otpauthUri, verifyTotp } from "@/lib/server/totp";
import { audit } from "@/lib/server/db";

// Two-factor (TOTP) enrollment for the signed-in user.
//   POST   → start: generate a secret, return the QR + otpauth URI to scan
//   PUT    → confirm: verify a code from the authenticator, then enable 2FA
//   DELETE → disable: verify a current code, then turn 2FA off
export const runtime = "nodejs";

export async function GET() {
  const me = await getUser();
  const user = me.email ? await findUserByEmail(me.email).catch(() => null) : null;
  return NextResponse.json({ enabled: Boolean(user?.totpEnabled), available: Boolean(user?.passwordHash) });
}

export async function POST() {
  const me = await getUser();
  const user = me.email ? await findUserByEmail(me.email) : null;
  if (!user?.passwordHash) return NextResponse.json({ error: "2FA is available on local password accounts." }, { status: 400 });

  const secret = generateSecret();
  await setUserTotpSecret(user.id, secret); // pending until confirmed
  const uri = otpauthUri(secret, user.email);
  const qr = await QRCode.toDataURL(uri, { margin: 1 });
  return NextResponse.json({ secret, uri, qr });
}

export async function PUT(req: Request) {
  const me = await getUser();
  const user = me.email ? await findUserByEmail(me.email) : null;
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = z.object({ token: z.string() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !user.totpSecret || !verifyTotp(user.totpSecret, parsed.data.token)) {
    return NextResponse.json({ error: "That code didn't match. Try again." }, { status: 400 });
  }
  await setUserTotpEnabled(user.id, true);
  await audit(user.email, "account.2fa-enable", "");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const me = await getUser();
  const user = me.email ? await findUserByEmail(me.email) : null;
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = z.object({ token: z.string() }).safeParse(await req.json().catch(() => ({})));
  if (user.totpEnabled && (!parsed.success || !user.totpSecret || !verifyTotp(user.totpSecret, parsed.data.token))) {
    return NextResponse.json({ error: "Enter a current code to turn off 2FA." }, { status: 400 });
  }
  await setUserTotpEnabled(user.id, false);
  await audit(user.email, "account.2fa-disable", "");
  return NextResponse.json({ ok: true });
}

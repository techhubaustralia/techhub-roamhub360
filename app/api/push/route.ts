import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { pushConfigured, vapidPublicKey, saveSubscription, removeSubscription } from "@/lib/server/push";

// Web-push subscription management. GET advertises whether push is enabled + the VAPID public key
// (not a secret); POST registers a browser subscription for the signed-in user; DELETE removes one.
export const runtime = "nodejs";

export async function GET() {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ configured: false }, { status: 200 });
  return NextResponse.json({ configured: pushConfigured, publicKey: pushConfigured ? vapidPublicKey : null });
}

const SubBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(req: Request) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!pushConfigured) return NextResponse.json({ error: "Push is not enabled." }, { status: 503 });
  const parsed = SubBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  await saveSubscription(me.email, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (endpoint) await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}

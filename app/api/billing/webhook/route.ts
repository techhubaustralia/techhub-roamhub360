import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/server/billing";

// Stripe webhook. PUBLIC (Stripe calls it, no session) but authenticated by the Stripe signature.
// Must read the RAW body for signature verification.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const res = await handleWebhook(raw, req.headers.get("stripe-signature"));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ received: true });
}

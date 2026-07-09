import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { billingConfigured, createCheckout } from "@/lib/server/billing";
import { licenseState } from "@/lib/server/licensing";
import { requestOrigin } from "@/lib/server/account-token";

// Billing for the CURRENT workspace. GET advertises whether self-serve billing is on; POST starts
// a Stripe Checkout for a workspace admin and returns the redirect URL.
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ configured: billingConfigured });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Only a workspace admin can manage billing." }, { status: 403 });
  if (!billingConfigured) return NextResponse.json({ error: "Billing isn't enabled." }, { status: 503 });

  const slug = await currentTenantId();
  const ls = await licenseState(slug).catch(() => null);
  const url = await createCheckout({ slug, email: me.email, quantity: ls?.maxSites ?? 1, origin: requestOrigin(req) });
  if (!url) return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
  return NextResponse.json({ url });
}

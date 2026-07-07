import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { onboardingSteps } from "@/lib/server/onboarding";

// Activation checklist (G1) — an admin concern. Non-admins get 403 so the home-page card hides.
export async function GET() {
  const me = await getUser();
  if (me.role !== "global-admin" && !me.platformAdmin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  return NextResponse.json(await onboardingSteps());
}

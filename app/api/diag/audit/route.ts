import { NextResponse } from "next/server";
import { auditSelfTest } from "@/lib/server/db";
import { getUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

// Diagnostic: probes the audit backend (write + read) and returns the exact error.
// Tells us missing-table vs write-fail vs read-fail vs file-backend. Global Admin only.
export async function GET() {
  const user = await getUser();
  if (user.role !== "global-admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const result = await auditSelfTest();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

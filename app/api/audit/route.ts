import { NextResponse } from "next/server";
import { listAudit } from "@/lib/server/db";
import { getUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (user.role !== "global-admin") {
    return NextResponse.json({ error: "Only a Global Admin can view the activity log." }, { status: 403 });
  }
  // Surface the real cause instead of failing to an empty table (e.g. a missing AuditLog
  // table returns "Invalid object name 'AuditLog'" — run `prisma db push` to create it).
  try {
    return NextResponse.json(await listAudit(200), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not read the activity log.", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

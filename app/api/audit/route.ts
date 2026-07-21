import { NextResponse } from "next/server";
import { listAudit } from "@/lib/server/db";
import { auditToCsv } from "@/lib/audit-csv";
import { getUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUser();
  if (user.role !== "global-admin") {
    return NextResponse.json({ error: "Only a Global Admin can view the activity log." }, { status: 403 });
  }
  const format = new URL(req.url).searchParams.get("format");
  // Surface the real cause instead of failing to an empty table (e.g. a missing AuditLog
  // table returns "Invalid object name 'AuditLog'" — run `prisma db push` to create it).
  try {
    if (format === "csv") {
      const rows = await listAudit(5000); // export a deep window, not just the on-screen 200
      return new NextResponse(auditToCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(await listAudit(200), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not read the activity log.", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

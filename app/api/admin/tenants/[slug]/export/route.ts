import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { getTenantBySlug } from "@/lib/server/tenants";
import { exportTenant } from "@/lib/server/tenant-data";

// GDPR data export — a full JSON snapshot of a workspace's data. Platform operators only.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const me = await getUser();
  if (!me.platformAdmin) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { slug } = await params;
  if (!(await getTenantBySlug(slug))) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const data = await exportTenant(slug);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="roamhub360-${slug}-export.json"`,
    },
  });
}

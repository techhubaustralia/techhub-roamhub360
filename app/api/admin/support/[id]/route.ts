import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { getSupportRequest, updateSupportRequest } from "@/lib/server/support";
import { audit } from "@/lib/server/db";

export const runtime = "nodejs";

const PatchSchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  adminNote: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await getSupportRequest(id);
  if (!existing || existing.tenantId !== (await currentTenantId())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid changes." }, { status: 400 });
  const updated = await updateSupportRequest(id, { ...parsed.data, adminNote: parsed.data.adminNote ?? undefined });
  await audit(me.email, "support.update", `${id} → ${updated.status}`);
  return NextResponse.json({ ok: true, request: updated });
}

import { NextResponse } from "next/server";
import { getStoredPlan, putPlan, putPlanImage, getPlanImage } from "@/lib/server/store";
import { getFloorPlan } from "@/lib/floorplans";
import { scaleEls, scaleFactors } from "@/lib/plan-scale";
import { audit } from "@/lib/server/db";
import { getUser } from "@/lib/server/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = await getPlanImage(id);
  if (!img) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new Response(new Uint8Array(img.buffer), {
    headers: { "Content-Type": img.contentType, "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { role } = await getUser();
  if (role !== "global-admin") return NextResponse.json({ error: "Only a Global Admin can upload floor plans." }, { status: 403 });
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  await putPlanImage(id, buf, file.type || "application/octet-stream");

  // set the uploaded image as the plan's background layer (source of truth)
  const plan = (await getStoredPlan(id)) ?? getFloorPlan(id);
  plan.image = `/api/plans/${id}/image?v=${Date.now()}`;
  const w = Number(form.get("w")) || 0;
  const h = Number(form.get("h")) || 0;
  if (w > 0 && h > 0) {
    // rescale existing overlays from the old viewBox to the image's dimensions
    const { fx, fy } = scaleFactors(plan.viewBox || `0 0 ${w} ${h}`, w, h);
    plan.els = scaleEls(plan.els, fx, fy);
    plan.viewBox = `0 0 ${w} ${h}`;
  }
  await putPlan(plan);

  const user = await getUser();
  await audit(user.email, "plan.image.upload", `${id} (${file.type})`);
  return NextResponse.json({ ok: true, image: plan.image });
}

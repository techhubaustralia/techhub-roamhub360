import { NextResponse } from "next/server";
import { getStoredPlan, putPlan, putPlanImage, getPlanImage } from "@/lib/server/store";
import { getFloorPlan } from "@/lib/floorplans";
import { scaleEls, scaleFactors } from "@/lib/plan-scale";
import { audit } from "@/lib/server/db";
import { getUser } from "@/lib/server/auth";
import { sniffImageType, MAX_PLAN_IMAGE_BYTES } from "@/lib/image-guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = await getPlanImage(id);
  if (!img) return NextResponse.json({ error: "not found" }, { status: 404 });
  // nosniff stops the browser from re-interpreting the bytes as anything but the stored image type;
  // combined with upload-time magic-byte validation, a disguised SVG/HTML can never execute here.
  const type = img.contentType.startsWith("image/") ? img.contentType : "application/octet-stream";
  return new Response(new Uint8Array(img.buffer), {
    headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { role } = await getUser();
  if (role !== "global-admin") return NextResponse.json({ error: "Only a Global Admin can upload floor plans." }, { status: 403 });
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_PLAN_IMAGE_BYTES) return NextResponse.json({ error: "Image is larger than 15 MB." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not file.type: only store what is provably a JPEG/PNG/WebP. This is the guard
  // that turns the upload from a stored-XSS/DoS vector into a plain image store.
  const type = sniffImageType(buf);
  if (!type) return NextResponse.json({ error: "Upload a JPEG, PNG, or WebP image." }, { status: 415 });
  await putPlanImage(id, buf, type);

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

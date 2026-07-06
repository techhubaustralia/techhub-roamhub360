import { NextResponse } from "next/server";
import { deleteBuilding, unhideBuilding } from "@/lib/server/store";
import { getUser } from "@/lib/server/auth";
import { audit, cancelActiveBookingsForBuilding } from "@/lib/server/db";

// Buildings are layout configuration → Global Admin only.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (user.role !== "global-admin") {
    return NextResponse.json({ error: "Only a Global Admin can remove a building." }, { status: 403 });
  }
  const { id } = await params;
  // Cancel active bookings across all of this building's floors first, so they don't linger
  // as "active" reservations pointing at a building that no longer exists.
  const cancelled = await cancelActiveBookingsForBuilding(id, user.email, "Building removed.");
  await deleteBuilding(id);
  await audit(user.email, "building.delete", `${id}${cancelled ? ` (cancelled ${cancelled} active booking${cancelled === 1 ? "" : "s"})` : ""}`);
  return NextResponse.json({ ok: true, cancelledBookings: cancelled });
}

// Restore a hidden built-in site.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (user.role !== "global-admin") {
    return NextResponse.json({ error: "Only a Global Admin can restore a building." }, { status: 403 });
  }
  const { id } = await params;
  await unhideBuilding(id);
  await audit(user.email, "building.restore", id);
  return NextResponse.json({ ok: true });
}

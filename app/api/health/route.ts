import { NextResponse } from "next/server";

// Lightweight health probe for uptime monitoring (UptimeRobot, Better Uptime, etc.). Public, no
// secrets. Reports app liveness + whether the database answers. Returns 200 when healthy, 503 when
// the DB is configured but unreachable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let db: "ok" | "down" | "not-configured" = "not-configured";
  if (process.env.DATABASE_URL) {
    try {
      const { prisma } = await import("@/lib/server/prisma"); // shared client — no extra pool
      const p = await prisma();
      await p.$queryRaw`SELECT 1`;
      db = "ok";
    } catch {
      db = "down";
    }
  }
  const healthy = db !== "down";
  return NextResponse.json({ status: healthy ? "ok" : "degraded", db, time: new Date().toISOString() }, { status: healthy ? 200 : 503 });
}

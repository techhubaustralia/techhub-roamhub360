import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/db";
import { directoryStatus, listDirectory, syncDirectory } from "@/lib/server/directory";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";

// Team Build-Up B — the org directory is workspace-wide PII, so only a Global Admin (or a
// platform operator) may read the full list or trigger a sync. Presence enrichment reads it
// internally (server-side) for everyone; this endpoint is the admin management surface.
function adminOnly(me: { role: string; platformAdmin?: boolean }): boolean {
  return me.role === "global-admin" || Boolean(me.platformAdmin);
}

export async function GET() {
  const me = await getUser();
  if (!adminOnly(me)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const [status, entries] = await Promise.all([directoryStatus(), listDirectory()]);
  return NextResponse.json({ status, entries });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!adminOnly(me)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  if ((me.disabledFeatures ?? []).includes("directory")) return NextResponse.json({ ok: false, synced: 0, photos: 0, error: "Directory sync is disabled for this workspace." }, { status: 403 });
  // A sync is a heavy Graph operation — throttle hard (a handful per minute is plenty).
  const rl = rateLimit(`dirsync:${me.email || clientIp(req)}`, 5, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const result = await syncDirectory();
  if (result.ok) await audit(me.email, "directory.sync", `synced ${result.synced} users, ${result.photos} photos`);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

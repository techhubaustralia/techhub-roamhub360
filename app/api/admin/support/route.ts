import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { listSupportRequests, openSupportCount, unreadFlags } from "@/lib/server/support";

// Support-request queue for a workspace's Global Admin. Strictly tenant-scoped.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ requests: [], openCount: 0 });
  const statusParam = new URL(req.url).searchParams.get("status");
  const status = statusParam === "open" || statusParam === "closed" ? statusParam : undefined;
  const tenantId = await currentTenantId();
  const [requests, openCount] = await Promise.all([listSupportRequests(tenantId, status), openSupportCount(tenantId)]);
  // `unread` = the customer has written since an admin last opened the thread, so the queue can show
  // which tickets are actually waiting on us rather than just "open".
  const unread = await unreadFlags(requests, "admin");
  return NextResponse.json({
    requests: requests.map((r) => ({ ...r, unread: Boolean(unread[r.id]) })),
    openCount,
    awaitingUs: Object.keys(unread).length,
  });
}

import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { subscribeLive } from "@/lib/server/live-bus";

// Server-Sent-Events stream (real-time). Signed-in only; scoped to the caller's tenant. Emits a
// small JSON event whenever bookings change in this workspace, so open clients refresh live
// ("someone just grabbed that desk") without polling. Heartbeats keep the connection alive.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await getUser();
  if (!me.email) return new Response("Unauthorized", { status: 401 });
  const tenantId = await currentTenantId();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* client gone */
        }
      };
      send({ type: "hello" });
      const unsub = subscribeLive(tenantId, (event) => send({ type: event }));
      const hb = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          /* client gone */
        }
      }, 25_000);
      const close = () => {
        clearInterval(hb);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

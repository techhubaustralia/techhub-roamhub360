import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { probeGraph, testCalendarRoundTrip, sendMail } from "@/lib/server/graph";

export const dynamic = "force-dynamic";

// Step-1 verification for Microsoft Graph. Global-admins only.
// Browser-friendly URL tests (just open the link while signed in):
//   GET /api/diag/graph                    -> token + mailbox probe
//   GET /api/diag/graph?send=me            -> send a test email to yourself
//   GET /api/diag/graph?send=a@b.com       -> send a test email to an address
//   GET /api/diag/graph?event=room@b.com   -> create + auto-delete a calendar event
const NO_STORE = { headers: { "Cache-Control": "no-store" } };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function GET(req: Request) {
  const { role, email } = await getUser();
  if (role !== "global-admin") return NextResponse.json({ error: "Global admins only." }, { status: 403 });
  const sp = new URL(req.url).searchParams;

  const send = sp.get("send");
  if (send) {
    const to = send === "me" ? email : send;
    try {
      const sent = await sendMail(to, "RoamHub360 — Graph test email", `<p>This confirms RoamHub360 can send mail via Microsoft Graph from the configured sender.</p><p>Requested by ${email}.</p>`);
      return NextResponse.json({ test: "mail", to, sent }, NO_STORE);
    } catch (e) {
      return NextResponse.json({ test: "mail", to, sent: false, error: msg(e) }, { status: 502, ...NO_STORE });
    }
  }

  const event = sp.get("event");
  if (event) {
    const r = await testCalendarRoundTrip(event);
    return NextResponse.json({ test: "event", mailbox: event, ...r }, { status: r.ok ? 200 : 502, ...NO_STORE });
  }

  const room = sp.get("room") ?? undefined;
  const result = await probeGraph(room);
  return NextResponse.json(
    { ...result, note: "senderMailbox reads the user profile (needs User.Read.All) and is optional — Mail.Send/Calendars.ReadWrite do not require it. Use ?send=me and ?event=<mailbox> to verify the real capabilities." },
    NO_STORE,
  );
}

export async function POST(req: Request) {
  const { role, email } = await getUser();
  if (role !== "global-admin") return NextResponse.json({ error: "Global admins only." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; to?: string; mailbox?: string };

  if (body.action === "mail") {
    const to = body.to || email;
    try {
      const sent = await sendMail(to, "RoamHub360 — Graph test email", `<p>This confirms RoamHub360 can send mail via Microsoft Graph from the configured sender.</p><p>Requested by ${email}.</p>`);
      return NextResponse.json({ action: "mail", to, sent });
    } catch (e) {
      return NextResponse.json({ action: "mail", to, sent: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }

  if (body.action === "event") {
    if (!body.mailbox) return NextResponse.json({ error: "mailbox required" }, { status: 400 });
    const r = await testCalendarRoundTrip(body.mailbox);
    return NextResponse.json({ action: "event", mailbox: body.mailbox, ...r }, { status: r.ok ? 200 : 502 });
  }

  return NextResponse.json({ error: 'Unknown action. Use {"action":"mail"} or {"action":"event"}.' }, { status: 400 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/db";
import { getIntegrations, addWebhook, removeWebhook, setSlackUrl, WEBHOOK_EVENTS } from "@/lib/server/webhooks";

// Admin management of outbound webhooks + Slack. Global-admin only.
export const runtime = "nodejs";

async function guard() {
  const me = await getUser();
  return me.role === "global-admin" ? me : null;
}
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET() {
  if (!(await guard())) return forbidden();
  return NextResponse.json(await getIntegrations());
}

export async function POST(req: Request) {
  const me = await guard();
  if (!me) return forbidden();
  const parsed = z
    .object({ url: z.string().url(), events: z.array(z.enum(WEBHOOK_EVENTS)).optional() })
    .safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid https URL." }, { status: 400 });
  try {
    const ep = await addWebhook(parsed.data.url, parsed.data.events ?? []);
    await audit(me.email, "webhook.add", parsed.data.url);
    return NextResponse.json(ep, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid webhook URL." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const me = await guard();
  if (!me) return forbidden();
  const body = await req.json().catch(() => ({}));
  const id = (typeof body?.id === "string" && body.id) || new URL(req.url).searchParams.get("id") || "";
  if (id) {
    await removeWebhook(id);
    await audit(me.email, "webhook.remove", id);
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const me = await guard();
  if (!me) return forbidden();
  const parsed = z.object({ slackUrl: z.string().url().nullable().optional() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid Slack webhook URL or null." }, { status: 400 });
  try {
    await setSlackUrl(parsed.data.slackUrl ?? null);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid Slack URL." }, { status: 400 });
  }
  await audit(me.email, "webhook.slack", parsed.data.slackUrl ? "set" : "cleared");
  return NextResponse.json({ ok: true });
}

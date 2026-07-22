import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { runAssistant, assistantConfigured, assistantProvider } from "@/lib/server/assistant";
import { audit } from "@/lib/server/db";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";
import { z } from "zod";

// AI concierge endpoint. Signed-in only; the operator can disable it per tenant via the "assistant"
// feature flag. Rate-limited hard (each call fans out to Claude + tools). Returns the reply plus an
// optional booking proposal the client confirms through the validated booking route.
const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(30),
});

// Daily per-user cap on assistant calls (M8 spend cap). The 20/min burst limit stops hammering; this
// bounds the total daily cost/exposure a single account can run up. Tune with ASSISTANT_DAILY_CAP.
const DAILY_CAP = Number(process.env.ASSISTANT_DAILY_CAP) || 150;

export async function GET() {
  // Data-processing disclosure (M8): tell the client WHERE conversations are processed so the UI can
  // surface it. Vendor name only — never the API key or endpoint.
  return NextResponse.json({ configured: assistantConfigured, provider: assistantProvider()?.vendor ?? null });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if ((me.disabledFeatures ?? []).includes("assistant")) return NextResponse.json({ error: "The assistant is disabled for this workspace." }, { status: 403 });
  if (!assistantConfigured) return NextResponse.json({ error: "The assistant isn't configured yet." }, { status: 503 });

  const rl = await rateLimit(`assistant:${me.email || clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const day = await rateLimit(`assistant-day:${me.email || clientIp(req)}`, DAILY_CAP, 24 * 60 * 60_000);
  if (!day.ok) return NextResponse.json({ error: "You've reached today's assistant limit. Please try again tomorrow." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const { reply, proposal } = await runAssistant(parsed.data.messages, me);
    // Audit every assistant turn (M8): who, which provider/model, and whether a booking was proposed.
    // Message content is NOT stored — only that the interaction happened and its outcome.
    const p = assistantProvider();
    await audit(me.email, "assistant.chat", `${p ? `${p.kind}:${p.model}` : "unconfigured"}${proposal ? " — proposed booking" : ""}`, {
      after: proposal ? { proposed: `${proposal.kind} ${proposal.spaceLabel} on ${proposal.date}` } : undefined,
    });
    return NextResponse.json({ reply, proposal });
  } catch (e) {
    console.error("assistant error", e);
    return NextResponse.json({ error: "The assistant hit an error. Please try again." }, { status: 502 });
  }
}

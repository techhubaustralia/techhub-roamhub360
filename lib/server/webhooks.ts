import "server-only";
import crypto from "crypto";
import { getTenantJson, setTenantJson } from "./store";

// Outbound integrations: signed webhooks + an optional Slack incoming webhook. Per-tenant config in
// the JSON store. On booking events we POST a JSON payload to each subscribed endpoint with an
// HMAC-SHA256 signature (X-RoamHub-Signature) so receivers can verify authenticity, and post a
// formatted message to Slack. Best-effort and fire-and-forget — never blocks or fails a booking.

export const WEBHOOK_EVENTS = ["booking.created", "booking.updated", "booking.cancelled", "booking.checkin"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[]; // subset of WEBHOOK_EVENTS, or ["*"]
  createdAt: string;
}
export interface IntegrationsConfig {
  endpoints: WebhookEndpoint[];
  slackUrl?: string;
}

const KEY = "webhooks";

export async function getIntegrations(): Promise<IntegrationsConfig> {
  return (await getTenantJson<IntegrationsConfig>(KEY)) ?? { endpoints: [] };
}
async function save(cfg: IntegrationsConfig): Promise<void> {
  await setTenantJson(KEY, cfg);
}

export async function addWebhook(url: string, events: string[]): Promise<WebhookEndpoint> {
  const cfg = await getIntegrations();
  const ep: WebhookEndpoint = {
    id: crypto.randomUUID(),
    url,
    secret: "whsec_" + crypto.randomBytes(18).toString("base64url"),
    events: events.length ? events : ["*"],
    createdAt: new Date().toISOString(),
  };
  cfg.endpoints.push(ep);
  await save(cfg);
  return ep;
}

export async function removeWebhook(id: string): Promise<void> {
  const cfg = await getIntegrations();
  cfg.endpoints = cfg.endpoints.filter((e) => e.id !== id);
  await save(cfg);
}

export async function setSlackUrl(url: string | null): Promise<void> {
  const cfg = await getIntegrations();
  cfg.slackUrl = url || undefined;
  await save(cfg);
}

function slackText(event: WebhookEvent, d: Record<string, unknown>): string {
  const who = d.userEmail ? ` · ${d.userEmail}` : "";
  const when = typeof d.start === "string" ? ` (${d.start.replace("T", " ")})` : "";
  const verb: Record<WebhookEvent, string> = {
    "booking.created": "📅 New booking",
    "booking.updated": "✏️ Booking updated",
    "booking.cancelled": "❌ Booking cancelled",
    "booking.checkin": "✅ Checked in",
  };
  return `${verb[event]}: *${d.spaceLabel ?? "space"}*${when}${who}`;
}

/** Fire an event to every subscribed webhook + Slack for the CURRENT tenant. Best-effort. */
export async function dispatchEvent(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  const cfg = await getIntegrations();
  if (!cfg.endpoints.length && !cfg.slackUrl) return;

  const body = JSON.stringify({ event, at: new Date().toISOString(), data });
  const jobs: Promise<unknown>[] = [];

  for (const e of cfg.endpoints) {
    if (!(e.events.includes("*") || e.events.includes(event))) continue;
    const sig = crypto.createHmac("sha256", e.secret).update(body).digest("hex");
    jobs.push(
      fetch(e.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-RoamHub-Event": event, "X-RoamHub-Signature": `sha256=${sig}` },
        body,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {}),
    );
  }

  if (cfg.slackUrl) {
    jobs.push(
      fetch(cfg.slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: slackText(event, data) }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {}),
    );
  }

  await Promise.all(jobs);
}

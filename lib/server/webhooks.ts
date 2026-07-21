import "server-only";
import crypto from "crypto";
import { getTenantJson, setTenantJson } from "./store";
import { ssrfSafeFetch } from "./ssrf";

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

/** SECURITY (SSRF): webhook targets are fetched BY THE SERVER, so a tenant admin must not be able
 *  to point one at internal services. Require https, and reject localhost, IP literals, and
 *  internal-looking hostnames. (DNS-rebinding of a public hostname remains theoretically possible —
 *  endpoints only ever receive booking metadata, never secrets.) Returns the normalised URL or null. */
export function safeWebhookUrl(raw: string, opts: { requireHost?: string } = {}): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (opts.requireHost) return h === opts.requireHost ? u.toString() : null;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || !h.includes(".")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || (h.startsWith("[") && h.endsWith("]"))) return null; // no IP literals (v4/v6)
  return u.toString();
}

export async function getIntegrations(): Promise<IntegrationsConfig> {
  return (await getTenantJson<IntegrationsConfig>(KEY)) ?? { endpoints: [] };
}
async function save(cfg: IntegrationsConfig): Promise<void> {
  await setTenantJson(KEY, cfg);
}

export async function addWebhook(url: string, events: string[]): Promise<WebhookEndpoint> {
  const safe = safeWebhookUrl(url);
  if (!safe) throw new Error("Webhook URL must be a public https endpoint (no IPs or internal hosts).");
  const cfg = await getIntegrations();
  const ep: WebhookEndpoint = {
    id: crypto.randomUUID(),
    url: safe,
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
  if (url) {
    const safe = safeWebhookUrl(url, { requireHost: "hooks.slack.com" }); // Slack incoming webhooks only
    if (!safe) throw new Error("Use a Slack incoming-webhook URL (https://hooks.slack.com/…).");
    cfg.slackUrl = safe;
  } else {
    cfg.slackUrl = undefined;
  }
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
    if (!safeWebhookUrl(e.url)) continue; // re-validate at send time (covers pre-fix configs)
    const sig = crypto.createHmac("sha256", e.secret).update(body).digest("hex");
    jobs.push(
      // ssrfSafeFetch: no redirects, and the connection is pinned to a validated PUBLIC ip, so a
      // registered public host can't 3xx or DNS-rebind into an internal service.
      ssrfSafeFetch(e.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-RoamHub-Event": event, "X-RoamHub-Signature": `sha256=${sig}` },
        body,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {}),
    );
  }

  if (cfg.slackUrl && safeWebhookUrl(cfg.slackUrl, { requireHost: "hooks.slack.com" })) {
    jobs.push(
      ssrfSafeFetch(cfg.slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: slackText(event, data) }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {}),
    );
  }

  await Promise.all(jobs);
}

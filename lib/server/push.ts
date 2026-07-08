import "server-only";
import webpush from "web-push";
import { getTenantJson, setTenantJson } from "./store";

// Web Push (VAPID). Optional — only active when the operator sets VAPID keys, so deployments that
// don't want it (or haven't generated keys) simply fall back to email. Subscriptions are stored as
// a small per-tenant JSON blob (same DATA_DIR/blob backend as plans) — no DB migration required.
//
// Generate keys once with:  npx web-push generate-vapid-keys
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@domain)

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  email: string; // owner (canonical-lowercase)
  createdAt: string;
}

const PUBLIC = process.env.VAPID_PUBLIC_KEY?.trim() || "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY?.trim() || "";
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:support@techhubaustralia.com.au";

export const pushConfigured = Boolean(PUBLIC && PRIVATE);
export const vapidPublicKey = PUBLIC;

if (pushConfigured) webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

const KEY = "push-subs";
const load = async (): Promise<PushSub[]> => (await getTenantJson<PushSub[]>(KEY)) ?? [];
const save = (subs: PushSub[]) => setTenantJson(KEY, subs);

/** Upsert a browser subscription for a user (dedup by endpoint). */
export async function saveSubscription(email: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  const owner = email.toLowerCase();
  const subs = await load();
  const next = subs.filter((s) => s.endpoint !== sub.endpoint);
  next.push({ endpoint: sub.endpoint, keys: sub.keys, email: owner, createdAt: new Date().toISOString() });
  await save(next);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const subs = await load();
  await save(subs.filter((s) => s.endpoint !== endpoint));
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Send a notification to every device a user has registered (best-effort; prunes dead subs). */
export async function sendPushToUser(email: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured) return 0;
  const owner = email.toLowerCase();
  const subs = await load();
  const mine = subs.filter((s) => s.email === owner);
  if (!mine.length) return 0;

  const data = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    mine.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint); // subscription gone → prune
      }
    }),
  );
  if (dead.length) await save(subs.filter((s) => !dead.includes(s.endpoint)));
  return sent;
}

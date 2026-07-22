import "server-only";
import crypto from "crypto";

// Pub/sub for real-time updates (SSE). Local delivery is always in-process and immediate. When
// REDIS_URL is set, publishes ALSO fan out over a Redis channel so a client connected to one replica
// receives events published on another (H4) — required before running more than one instance. Each
// process tags its publishes with a unique INSTANCE id and ignores its own echo from Redis, so a
// cross-replica event is never delivered twice on the originating replica. If Redis is down, local
// delivery still works (single-instance behaviour) — the fan-out is best-effort, never blocking.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Listener = (event: string) => void;

const store = globalThis as unknown as { __rhLiveSubs?: Map<string, Set<Listener>> };
const subs: Map<string, Set<Listener>> = store.__rhLiveSubs ?? (store.__rhLiveSubs = new Map());

const INSTANCE = crypto.randomUUID();
const CHANNEL = "rh:live";

function deliverLocal(tenantId: string, event: string): void {
  subs.get(tenantId)?.forEach((cb) => {
    try {
      cb(event);
    } catch {
      /* a dead listener must not break others */
    }
  });
}

// Two lazy connections: one to PUBLISH, one held in subscriber mode (ioredis can't mix modes on one
// connection). Started on first use when REDIS_URL is set; a no-op otherwise.
let pub: any | null = null;
let started = false;
async function startRedis(): Promise<void> {
  if (started || !process.env.REDIS_URL) return;
  started = true;
  try {
    const mod: any = await import("ioredis");
    const Redis = mod.default ?? mod;
    pub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    pub.on("error", () => {});
    const sub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    sub.on("error", () => {});
    await sub.subscribe(CHANNEL);
    sub.on("message", (_ch: string, payload: string) => {
      try {
        const m = JSON.parse(payload);
        if (m.instance === INSTANCE) return; // our own publish — already delivered locally
        deliverLocal(m.tenantId, m.event);
      } catch {
        /* ignore malformed cross-instance payloads */
      }
    });
  } catch {
    pub = null; // ioredis unavailable → local-only
  }
}

export function subscribeLive(tenantId: string, cb: Listener): () => void {
  void startRedis(); // ensure the cross-replica subscriber is up while a client is connected
  let set = subs.get(tenantId);
  if (!set) subs.set(tenantId, (set = new Set()));
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (!set!.size) subs.delete(tenantId);
  };
}

export function publishLive(tenantId: string, event: string): void {
  deliverLocal(tenantId, event); // fast path — always immediate for local subscribers
  if (pub) {
    void pub.publish(CHANNEL, JSON.stringify({ instance: INSTANCE, tenantId, event })).catch(() => {});
  } else {
    void startRedis(); // warm the connection so subsequent publishes fan out
  }
}

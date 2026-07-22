import "server-only";

// Fixed-window rate limiter. DEFAULT is in-memory (counters live in the process) — correct and
// zero-infrastructure for a single instance. When REDIS_URL is set, a shared Redis INCR+PEXPIRE
// makes limits GLOBAL across replicas (H3), so horizontal scaling doesn't multiply every limit by
// the replica count. rateLimit() is async so the Redis path can await; the in-memory path still
// resolves immediately. A Redis hiccup fails OPEN to the in-memory limiter — an infra blip must
// never lock users out.

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

function memoryLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  // opportunistic cleanup so the Map cannot grow unbounded
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  if (b.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  return { ok: true, retryAfter: 0 };
}

// Lazily connect once. undefined = not tried yet, null = no Redis (use memory).
/* eslint-disable @typescript-eslint/no-explicit-any */
let redisClient: any | null | undefined;
async function getRedis(): Promise<any | null> {
  if (redisClient !== undefined) return redisClient;
  if (!process.env.REDIS_URL) {
    redisClient = null;
    return null;
  }
  try {
    const mod: any = await import("ioredis");
    const Redis = mod.default ?? mod;
    const c = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    c.on("error", () => {}); // swallow transient errors; rateLimit falls back to memory on throw
    redisClient = c;
  } catch {
    redisClient = null; // ioredis not installed / URL invalid → memory
  }
  return redisClient;
}

/** Returns ok=false once `limit` is exceeded within the fixed `windowMs`. Global across replicas
 *  when REDIS_URL is set, otherwise per-process. Never throws. */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfter: number }> {
  const r = await getRedis();
  if (!r) return memoryLimit(key, limit, windowMs);
  try {
    const rk = `rl:${key}`;
    const count: number = await r.incr(rk);
    if (count === 1) await r.pexpire(rk, windowMs); // start the window on first hit
    if (count > limit) {
      const ttl: number = await r.pttl(rk);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)) };
    }
    return { ok: true, retryAfter: 0 };
  } catch {
    return memoryLimit(key, limit, windowMs); // Redis blip → fail open to in-memory
  }
}

/** Client IP from the ingress. SECURITY: use the LAST X-Forwarded-For entry — that's the one our
 *  trusted reverse proxy (Caddy) appended from the real TCP peer. Earlier entries are supplied by
 *  the client and trivially spoofable; keying limits off them lets an attacker mint unlimited
 *  fresh "IPs" and bypass every IP-based rate limit. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  return req.headers.get("x-real-ip") || "unknown";
}

/** Standard 429 response with a Retry-After header. */
export function tooMany(retryAfter: number) {
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}

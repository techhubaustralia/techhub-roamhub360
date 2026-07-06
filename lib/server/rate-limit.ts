import "server-only";

// Best-effort, in-memory fixed-window rate limiter. NOTE: counters live in the
// process, so on a multi-replica deployment (this app autoscales min1/max4) limits
// are enforced per-replica, not globally. This blunts spam/retry storms cheaply with
// no extra infrastructure. For exact global limits, back this with Azure Cache for
// Redis and replace the Map with a shared INCR+EXPIRE.

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

/** Returns ok=false once `limit` is exceeded within the rolling `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
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

/** Best-effort client IP from the ingress (Container Apps sets X-Forwarded-For). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Standard 429 response with a Retry-After header. */
export function tooMany(retryAfter: number) {
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}

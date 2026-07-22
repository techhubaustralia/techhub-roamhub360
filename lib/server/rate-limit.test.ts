import { describe, it, expect } from "vitest";
import { rateLimit } from "./rate-limit";

// Exercises the default in-memory fixed-window path (no REDIS_URL set in tests).
describe("rateLimit (in-memory fixed window)", () => {
  it("allows up to the limit, then blocks with a positive retryAfter", async () => {
    const key = `test:${Math.floor(performance.now())}:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect((await rateLimit(key, 3, 60_000)).ok).toBe(true);
    const blocked = await rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("keeps separate counters per key", async () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect((await rateLimit(a, 1, 60_000)).ok).toBe(true);
    expect((await rateLimit(a, 1, 60_000)).ok).toBe(false); // a exhausted
    expect((await rateLimit(b, 1, 60_000)).ok).toBe(true); // b unaffected
  });
});

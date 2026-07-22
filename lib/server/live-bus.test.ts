import { describe, it, expect } from "vitest";
import { subscribeLive, publishLive } from "./live-bus";

// Exercises the always-on in-process delivery (no REDIS_URL in tests).
describe("live-bus local delivery", () => {
  it("delivers a publish to subscribers of the same tenant only", () => {
    const a: string[] = [];
    const b: string[] = [];
    const offA = subscribeLive("tenant-a", (e) => a.push(e));
    const offB = subscribeLive("tenant-b", (e) => b.push(e));
    publishLive("tenant-a", "booking:changed");
    expect(a).toEqual(["booking:changed"]);
    expect(b).toEqual([]); // cross-tenant isolation
    offA();
    offB();
  });

  it("stops delivering after unsubscribe", () => {
    const seen: string[] = [];
    const off = subscribeLive("tenant-c", (e) => seen.push(e));
    publishLive("tenant-c", "one");
    off();
    publishLive("tenant-c", "two");
    expect(seen).toEqual(["one"]);
  });

  it("a throwing listener does not stop others", () => {
    const seen: string[] = [];
    const off1 = subscribeLive("tenant-d", () => { throw new Error("boom"); });
    const off2 = subscribeLive("tenant-d", (e) => seen.push(e));
    publishLive("tenant-d", "ok");
    expect(seen).toEqual(["ok"]);
    off1();
    off2();
  });
});

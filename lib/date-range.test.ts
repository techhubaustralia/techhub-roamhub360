import { describe, expect, it } from "vitest";
import { lastMonthRange } from "./date-range";

describe("lastMonthRange", () => {
  it("returns the previous calendar month, inclusive", () => {
    const r = lastMonthRange(new Date("2026-07-08T00:00:00Z"));
    expect(r.from).toBe("2026-06-01");
    expect(r.to).toBe("2026-06-30");
    expect(r.label).toBe("June 2026");
  });

  it("crosses the year boundary (January → December)", () => {
    const r = lastMonthRange(new Date("2026-01-15T00:00:00Z"));
    expect(r.from).toBe("2025-12-01");
    expect(r.to).toBe("2025-12-31");
    expect(r.label).toBe("December 2025");
  });

  it("handles February length correctly", () => {
    const r = lastMonthRange(new Date("2028-03-03T00:00:00Z")); // 2028 is a leap year
    expect(r.from).toBe("2028-02-01");
    expect(r.to).toBe("2028-02-29");
  });
});

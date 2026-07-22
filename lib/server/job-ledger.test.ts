import { describe, it, expect } from "vitest";
import { jobKey } from "./job-ledger";

describe("jobKey", () => {
  it("builds a stable, collision-free key per (task, id, date)", () => {
    expect(jobKey("checkin", "bk_123", "2026-07-22")).toBe("checkin:bk_123:2026-07-22");
    // Same booking, different day → different key (so the next day still sends).
    expect(jobKey("checkin", "bk_123", "2026-07-23")).not.toBe(jobKey("checkin", "bk_123", "2026-07-22"));
    // Same booking + day, different task → different key (reminder vs check-in don't collide).
    expect(jobKey("reminder", "bk_123", "2026-07-22")).not.toBe(jobKey("checkin", "bk_123", "2026-07-22"));
  });
});

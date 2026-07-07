import { describe, expect, it } from "vitest";
import { pickExpiryNotice } from "./expiry-notice";

describe("pickExpiryNotice", () => {
  it("no expiry → never notifies", () => {
    expect(pickExpiryNotice(null, [])).toBeNull();
  });

  it("more than 90 days out → nothing due", () => {
    expect(pickExpiryNotice(120, [])).toBeNull();
  });

  it("fires the most-urgent applicable band and marks skipped larger ones", () => {
    // 45 days out: bands 90 and 60 apply; fire 60, mark both so 90 never backfills.
    expect(pickExpiryNotice(45, [])).toEqual({ threshold: 60, mark: [90, 60] });
  });

  it("doesn't resend a band already notified", () => {
    expect(pickExpiryNotice(45, [90, 60])).toBeNull();
  });

  it("advances to the next band as expiry nears", () => {
    expect(pickExpiryNotice(30, [90, 60])).toEqual({ threshold: 30, mark: [90, 60, 30] });
    expect(pickExpiryNotice(5, [90, 60, 30, 14])).toEqual({ threshold: 7, mark: [90, 60, 30, 14, 7] });
  });

  it("fires the expiry (0) band once when past due", () => {
    expect(pickExpiryNotice(-3, [90, 60, 30, 14, 7, 1])).toEqual({ threshold: 0, mark: [90, 60, 30, 14, 7, 1, 0] });
    expect(pickExpiryNotice(-10, [90, 60, 30, 14, 7, 1, 0])).toBeNull();
  });
});

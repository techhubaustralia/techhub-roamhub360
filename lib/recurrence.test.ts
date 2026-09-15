import { describe, it, expect } from "vitest";
import { expandWeekly, MAX_OCCURRENCES } from "./recurrence";

// 2026-09-14 is a Monday.
const MON = 1, WED = 3, FRI = 5;
const days = (...on: number[]) => Array.from({ length: 7 }, (_, i) => on.includes(i));

describe("expandWeekly", () => {
  it("expands the selected weekdays across the range, inclusive of both ends", () => {
    const r = expandWeekly({ startDate: "2026-09-14", until: "2026-09-25", weekdays: days(MON, WED, FRI) });
    expect("dates" in r && r.dates).toEqual(["2026-09-14", "2026-09-16", "2026-09-18", "2026-09-21", "2026-09-23", "2026-09-25"]);
  });
  it("a single day range that matches yields exactly that day", () => {
    const r = expandWeekly({ startDate: "2026-09-16", until: "2026-09-16", weekdays: days(WED) });
    expect("dates" in r && r.dates).toEqual(["2026-09-16"]);
  });
  it("errors when no selected weekday falls in the range", () => {
    expect(expandWeekly({ startDate: "2026-09-14", until: "2026-09-15", weekdays: days(FRI) })).toHaveProperty("error");
  });
  it("errors on no weekdays, a malformed date, or until before start", () => {
    expect(expandWeekly({ startDate: "2026-09-14", until: "2026-09-25", weekdays: days() })).toHaveProperty("error");
    expect(expandWeekly({ startDate: "14/09/2026", until: "2026-09-25", weekdays: days(MON) })).toHaveProperty("error");
    expect(expandWeekly({ startDate: "2026-09-25", until: "2026-09-14", weekdays: days(MON) })).toHaveProperty("error");
  });
  it("refuses more than the maximum instead of truncating", () => {
    // Every weekday for 13 weeks = 65 > 60
    const r = expandWeekly({ startDate: "2026-09-14", until: "2026-12-11", weekdays: days(1, 2, 3, 4, 5) });
    expect(r).toHaveProperty("error");
    expect(MAX_OCCURRENCES).toBe(60);
    // Exactly 60 is fine: 12 weeks × 5
    const ok = expandWeekly({ startDate: "2026-09-14", until: "2026-12-04", weekdays: days(1, 2, 3, 4, 5) });
    expect("dates" in ok && ok.dates.length).toBe(60);
  });
  it("refuses a span longer than a year even with one weekday", () => {
    expect(expandWeekly({ startDate: "2026-01-01", until: "2027-01-02", weekdays: days(MON) })).toHaveProperty("error");
  });
});

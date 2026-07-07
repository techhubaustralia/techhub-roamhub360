import { describe, expect, it } from "vitest";
import { buildWeekdayStats, recommend } from "./presence-insights";

// Index 0=Sun..6=Sat.
describe("buildWeekdayStats", () => {
  it("computes averages, guarding divide-by-zero", () => {
    const presence = [0, 20, 30, 10, 8, 4, 0];
    const occ = [0, 5, 5, 5, 4, 4, 0];
    const stats = buildWeekdayStats(presence, occ);
    expect(stats[1]).toMatchObject({ label: "Monday", avg: 4 });
    expect(stats[2].avg).toBe(6); // Tuesday 30/5
    expect(stats[0].avg).toBe(0); // Sunday, 0 occurrences → no NaN
  });
});

describe("recommend", () => {
  it("names the busiest workday and flags the quietest", () => {
    // Tue busiest (6/day), Fri quietest (1/day)
    const stats = buildWeekdayStats([0, 20, 30, 25, 20, 5, 0], [5, 5, 5, 5, 5, 5, 5]);
    const r = recommend(stats);
    expect(r.busiest).toEqual([2]); // Tuesday
    expect(r.quietest).toBe(5); // Friday
    expect(r.message).toContain("Tuesdays");
    expect(r.message).toContain("Fridays are quietest");
  });

  it("handles ties for busiest", () => {
    const stats = buildWeekdayStats([0, 30, 30, 10, 10, 10, 0], [5, 5, 5, 5, 5, 5, 5]);
    const r = recommend(stats);
    expect(r.busiest.sort()).toEqual([1, 2]); // Mon & Tue tie
    expect(r.message).toContain("Mondays and Tuesdays");
  });

  it("ignores weekends and reports when there's no signal", () => {
    const stats = buildWeekdayStats([50, 0, 0, 0, 0, 0, 50], [5, 5, 5, 5, 5, 5, 5]);
    expect(recommend(stats).message).toContain("Not enough history");
  });
});

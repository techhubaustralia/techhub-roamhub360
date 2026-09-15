import { describe, it, expect } from "vitest";
import { groupAttendance, rootOf } from "./attendance";
import type { PresenceEntry } from "./api";

const entry = (o: Partial<PresenceEntry> & { name: string; buildingId: string }): PresenceEntry => ({
  spaceKey: "desk-1",
  spaceLabel: "Desk 1",
  kind: "desk",
  start: "2026-09-15T08:00",
  end: "2026-09-15T17:30",
  checkedIn: false,
  isMe: false,
  ...o,
});

describe("rootOf", () => {
  it("strips the floor suffix and leaves a bare building id alone", () => {
    expect(rootOf("syd-hq__floor-2")).toBe("syd-hq");
    expect(rootOf("syd-hq")).toBe("syd-hq");
    expect(rootOf("")).toBe("");
  });
});

describe("groupAttendance — who's coming in to this site", () => {
  it("keeps every floor of the site and drops other sites", () => {
    const people = groupAttendance(
      [
        entry({ name: "Ada", buildingId: "syd-hq" }),
        entry({ name: "Bob", buildingId: "syd-hq__floor-2" }),
        entry({ name: "Cy", buildingId: "mel-office" }),
      ],
      "syd-hq__floor-1",
    );
    expect(people.map((p) => p.name)).toEqual(["Ada", "Bob"]);
  });

  it("returns nothing for an empty or missing site", () => {
    expect(groupAttendance([entry({ name: "Ada", buildingId: "syd-hq" })], "")).toEqual([]);
    expect(groupAttendance([], "syd-hq")).toEqual([]);
  });

  it("folds one person's bookings into a single card, in start order", () => {
    const people = groupAttendance(
      [
        entry({ name: "Ada", buildingId: "syd-hq", spaceLabel: "Room A", kind: "room", start: "2026-09-15T14:00", end: "2026-09-15T15:00" }),
        entry({ name: "Ada", buildingId: "syd-hq", spaceLabel: "Desk 1", start: "2026-09-15T08:00", end: "2026-09-15T17:30" }),
      ],
      "syd-hq",
    );
    expect(people).toHaveLength(1);
    expect(people[0].bookings.map((b) => b.space)).toEqual(["Desk 1", "Room A"]);
  });

  it("orders you first, then checked-in, then by name", () => {
    const people = groupAttendance(
      [
        entry({ name: "Zed", buildingId: "syd-hq" }),
        entry({ name: "Ada", buildingId: "syd-hq" }),
        entry({ name: "Kim", buildingId: "syd-hq", checkedIn: true }),
        entry({ name: "Me", buildingId: "syd-hq", isMe: true }),
      ],
      "syd-hq",
    );
    expect(people.map((p) => p.name)).toEqual(["Me", "Kim", "Ada", "Zed"]);
    expect(people[1].checkedIn).toBe(true);
  });

  it("flags a person as checked in if any of their bookings is", () => {
    const people = groupAttendance(
      [
        entry({ name: "Ada", buildingId: "syd-hq", checkedIn: false }),
        entry({ name: "Ada", buildingId: "syd-hq", spaceLabel: "Room A", checkedIn: true }),
      ],
      "syd-hq",
    );
    expect(people[0].checkedIn).toBe(true);
  });

  it("carries name and photo only — never an email — onto the card", () => {
    const [p] = groupAttendance([entry({ name: "Ada", buildingId: "syd-hq", photo: "data:image/png;base64,AA==", userEmail: "ada@example.com" })], "syd-hq");
    expect(p.photo).toBe("data:image/png;base64,AA==");
    expect(Object.keys(p)).not.toContain("userEmail");
  });
});

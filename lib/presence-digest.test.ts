import { describe, expect, it } from "vitest";
import { visibleColleagues, type DigestBooking } from "./presence-digest";

const ACTIVE = ["Booked", "Checked in"];
const rows: DigestBooking[] = [
  { userEmail: "me@acme.com", spaceLabel: "Desk 1", status: "Booked" },
  { userEmail: "Priya@acme.com", spaceLabel: "Desk 2", status: "Checked in" },
  { userEmail: "sam@acme.com", spaceLabel: "Desk 3", status: "Booked" },
  { userEmail: "sam@acme.com", spaceLabel: "Boardroom", status: "Checked in" }, // 2nd booking, checked in
  { userEmail: "hidden@acme.com", spaceLabel: "Desk 9", status: "Booked" },
  { userEmail: "cancel@acme.com", spaceLabel: "Desk 8", status: "Cancelled" },
];

describe("visibleColleagues", () => {
  const hidden = new Set(["hidden@acme.com"]);
  const out = visibleColleagues("me@acme.com", rows, hidden, ACTIVE);

  it("excludes the recipient, hidden opt-outs, and cancelled bookings", () => {
    const emails = out.map((c) => c.email).sort();
    expect(emails).toEqual(["priya@acme.com", "sam@acme.com"]);
  });

  it("lists a person once, marked checked-in if any of their bookings is", () => {
    const sam = out.find((c) => c.email === "sam@acme.com")!;
    expect(sam.checkedIn).toBe(true); // one of Sam's two bookings is Checked in
    expect(out.filter((c) => c.email === "sam@acme.com")).toHaveLength(1);
  });

  it("is case-insensitive on the recipient and emails", () => {
    expect(visibleColleagues("ME@ACME.COM", rows, hidden, ACTIVE).some((c) => c.email === "me@acme.com")).toBe(false);
    expect(out.some((c) => c.email === "priya@acme.com")).toBe(true); // "Priya@acme.com" normalised
  });
});

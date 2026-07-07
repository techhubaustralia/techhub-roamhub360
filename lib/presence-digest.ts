// Pure helper for the daily "who's in" digest (Team Build-Up D). Kept free of server-only
// imports so it can be unit-tested: given a day's active bookings, work out the distinct,
// visible colleagues to list for one recipient.

export interface DigestBooking {
  userEmail: string;
  spaceLabel: string;
  status: string; // "Booked" | "Checked in" | ...
}

export interface Colleague {
  email: string;
  spaceLabel: string;
  checkedIn: boolean;
}

/** Distinct colleagues (one per person) to show `recipient`, excluding the recipient themselves
 *  and anyone who has opted out of the board (`hidden`). Only `activeStatuses` count. A person
 *  with several bookings is listed once; if any of them is checked in, they show as checked in. */
export function visibleColleagues(
  recipient: string,
  bookings: DigestBooking[],
  hidden: Set<string>,
  activeStatuses: string[],
): Colleague[] {
  const me = recipient.toLowerCase();
  const byEmail = new Map<string, Colleague>();
  for (const b of bookings) {
    const email = b.userEmail.toLowerCase();
    if (email === me) continue;
    if (hidden.has(email)) continue;
    if (!activeStatuses.includes(b.status)) continue;
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, { email, spaceLabel: b.spaceLabel, checkedIn: b.status === "Checked in" });
    } else if (b.status === "Checked in") {
      existing.checkedIn = true;
    }
  }
  return [...byEmail.values()];
}

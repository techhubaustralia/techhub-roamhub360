// Pure date helpers for scheduled reports (Growth G4). No server imports — unit-testable.

/** Last calendar month as an inclusive from/to (UTC yyyy-mm-dd) plus a display label. */
export function lastMonthRange(now: Date): { from: string; to: string; label: string } {
  const firstThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(firstThis.getTime() - 86_400_000); // last day of previous month
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

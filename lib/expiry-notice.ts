// Pure logic for licence-expiry notifications (Commercial SaaS CP4). No server imports so it can
// be unit-tested. Given days-until-expiry and which thresholds were already emailed, decide the
// single most-urgent new threshold to fire (and which to mark, so skipped ones don't backfill).

export const EXPIRY_THRESHOLDS = [90, 60, 30, 14, 7, 1, 0]; // days before expiry (0 = day-of/after)

export interface ExpiryNotice {
  threshold: number; // the threshold being fired
  mark: number[]; // thresholds to record as notified (this + any larger ones we jumped past)
}

/** The notice to send now, or null if none is due (>90 days out, or the due threshold already sent). */
export function pickExpiryNotice(daysLeft: number | null, notified: number[]): ExpiryNotice | null {
  if (daysLeft == null) return null; // no expiry set → never notify
  const applicable = EXPIRY_THRESHOLDS.filter((t) => daysLeft <= t);
  if (applicable.length === 0) return null; // still more than the largest threshold away
  const threshold = Math.min(...applicable); // most urgent applicable band
  if (notified.includes(threshold)) return null; // already sent this band
  const mark = EXPIRY_THRESHOLDS.filter((t) => t >= threshold); // this + skipped larger bands
  return { threshold, mark };
}

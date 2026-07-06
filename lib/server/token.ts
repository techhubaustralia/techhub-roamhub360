import "server-only";
import crypto from "crypto";

// HMAC-signed tokens for login-free email check-in / check-out links.
// Fail closed in production: refuse to boot with the insecure default, otherwise
// check-in/out links would be forgeable (anyone could flip any booking's state).
const RAW_SECRET = process.env.CHECKIN_SECRET;
if (process.env.NODE_ENV === "production" && !RAW_SECRET) {
  throw new Error(
    "CHECKIN_SECRET is required in production — check-in/out links are HMAC-signed and would be forgeable without it.",
  );
}
const SECRET = RAW_SECRET || "dev-insecure-secret-change-me";

export interface CheckToken {
  bookingId: string;
  action: "checkin" | "checkout";
  date: string; // ISO day this link applies to
  exp?: number; // epoch ms expiry; links are valid through the day after `date`
}

// Expiry derived from the link's target day: valid through the end of the following day.
// Bounds replay of a leaked link instead of letting it work forever.
function expFor(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) + 2 * 86400000;
}

export function sign(payload: CheckToken): string {
  const full: CheckToken = { ...payload, exp: payload.exp ?? expFor(payload.date) };
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verify(tokenStr: string): CheckToken | null {
  const [data, sig] = (tokenStr || "").split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as CheckToken;
    if (payload.exp && Date.now() > payload.exp) return null; // expired link
    return payload;
  } catch {
    return null;
  }
}

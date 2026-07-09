import "server-only";
import crypto from "crypto";

// HMAC-signed, single-purpose tokens for set-password / reset / invite links. Signed with
// AUTH_SECRET (already required in prod for sessions). Runtime-checked (never throws at import,
// which would break `next build`). Short-lived; the payload is a user id + expiry only.
const RAW = process.env.AUTH_SECRET;
const SECRET = RAW || "dev-insecure-secret-change-me";
const MISSING = () => process.env.NODE_ENV === "production" && !RAW;

export interface PwToken {
  uid: string;
  purpose: "set-password";
  exp: number; // epoch ms
}

export function signPwToken(uid: string, ttlMs = 24 * 60 * 60 * 1000): string {
  if (MISSING()) throw new Error("AUTH_SECRET is required in production.");
  const payload: PwToken = { uid, purpose: "set-password", exp: Date.now() + ttlMs };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyPwToken(token: string): PwToken | null {
  if (MISSING()) return null;
  const [data, sig] = (token || "").split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as PwToken;
    if (p.purpose !== "set-password" || !p.uid || (p.exp && Date.now() > p.exp)) return null;
    return p;
  } catch {
    return null;
  }
}

/** Absolute origin of the incoming request (honours the reverse proxy), for building links. */
export function requestOrigin(req: Request): string {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(process.env.APP_URL || "https://app.roamhub360.com").host;
  return `${proto}://${host}`;
}

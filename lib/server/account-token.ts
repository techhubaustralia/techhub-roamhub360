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
  return verifyPurpose(token, "set-password") as PwToken | null;
}

// Email-verification tokens share the same HMAC scheme with a distinct purpose (a set-password
// token can't be replayed to verify an email, and vice-versa).
export function signEmailToken(uid: string, ttlMs = 7 * 24 * 60 * 60 * 1000): string {
  return signPurpose(uid, "verify-email", ttlMs);
}
export function verifyEmailToken(token: string): { uid: string } | null {
  const p = verifyPurpose(token, "verify-email");
  return p ? { uid: p.uid } : null;
}

function signPurpose(uid: string, purpose: string, ttlMs: number): string {
  if (MISSING()) throw new Error("AUTH_SECRET is required in production.");
  const data = Buffer.from(JSON.stringify({ uid, purpose, exp: Date.now() + ttlMs })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}
function verifyPurpose(token: string, purpose: string): { uid: string; purpose: string; exp: number } | null {
  if (MISSING()) return null;
  const [data, sig] = (token || "").split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as { uid: string; purpose: string; exp: number };
    if (p.purpose !== purpose || !p.uid || (p.exp && Date.now() > p.exp)) return null;
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

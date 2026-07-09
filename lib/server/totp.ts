import "server-only";
import crypto from "crypto";

// RFC 6238 TOTP (time-based one-time passwords) for two-factor auth. No external dependency —
// HMAC-SHA1 over the 30-second time step, base32 secrets, compatible with Google Authenticator,
// Microsoft Authenticator, 1Password, Authy, etc.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function code(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return (bin % 1_000_000).toString().padStart(6, "0");
}

/** Verify a 6-digit token against the secret, tolerating ±`window` 30s steps for clock drift. */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  if (!secret || !/^\d{6}$/.test((token || "").trim())) return false;
  const t = token.trim();
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    // timing-safe compare per candidate
    const cand = code(secret, step + w);
    if (cand.length === t.length && crypto.timingSafeEqual(Buffer.from(cand), Buffer.from(t))) return true;
  }
  return false;
}

/** otpauth:// URI for a QR code, e.g. otpauth://totp/RoamHub360:jane@acme.com?secret=…&issuer=RoamHub360 */
export function otpauthUri(secret: string, account: string, issuer = "RoamHub360"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

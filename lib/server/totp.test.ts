import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { generateSecret, verifyTotp, otpauthUri } from "./totp";

// Recompute a valid code independently (RFC 6238) to prove verifyTotp accepts a genuine token.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function decode(s: string): Buffer {
  let bits = "";
  for (const ch of s) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function codeNow(secret: string): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = crypto.createHmac("sha1", decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return (bin % 1_000_000).toString().padStart(6, "0");
}

describe("totp", () => {
  it("generates a base32 secret", () => {
    const s = generateSecret();
    expect(s.length).toBeGreaterThanOrEqual(16);
    expect(s).toMatch(/^[A-Z2-7]+$/);
  });

  it("accepts a genuine current code", () => {
    const s = generateSecret();
    expect(verifyTotp(s, codeNow(s))).toBe(true);
  });

  it("rejects wrong / malformed codes", () => {
    const s = generateSecret();
    expect(verifyTotp(s, "000000")).toBe(false);
    expect(verifyTotp(s, "12345")).toBe(false);
    expect(verifyTotp(s, "abcdef")).toBe(false);
    expect(verifyTotp(s, "")).toBe(false);
  });

  it("builds an otpauth URI", () => {
    expect(otpauthUri("ABC", "jane@acme.com")).toContain("otpauth://totp/");
    expect(otpauthUri("ABC", "jane@acme.com")).toContain("secret=ABC");
  });
});

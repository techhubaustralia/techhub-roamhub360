import { describe, expect, it, vi, beforeEach } from "vitest";

// crypto.ts is server-only; stub the marker so it imports under vitest (node).
vi.mock("server-only", () => ({}));

import { encryptSecret, decryptSecret, encryptionAvailable, loadKey } from "./crypto";

const KEY_B64 = Buffer.alloc(32, 7).toString("base64"); // deterministic 32-byte key

describe("crypto (AES-256-GCM secret storage)", () => {
  beforeEach(() => {
    process.env.CREDENTIAL_KEY = KEY_B64;
  });

  it("round-trips a secret", () => {
    const secret = "super-secret-client-value-123!@#";
    const blob = encryptSecret(secret);
    expect(blob).not.toContain(secret); // ciphertext, not plaintext
    expect(blob.split(".")).toHaveLength(3); // iv.tag.ct
    expect(decryptSecret(blob)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("detects tampering via the GCM auth tag", () => {
    const blob = encryptSecret("hello");
    const [iv, tag, ct] = blob.split(".");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptSecret(`${iv}.${tag}.${flipped.toString("base64")}`)).toThrow();
  });

  it("accepts hex keys and rejects wrong-sized keys", () => {
    process.env.CREDENTIAL_KEY = "aa".repeat(32); // 64 hex chars = 32 bytes
    expect(loadKey()).toHaveLength(32);
    process.env.CREDENTIAL_KEY = "too-short";
    expect(() => loadKey()).toThrow();
    expect(encryptionAvailable()).toBe(false);
  });

  it("reports availability from a valid key", () => {
    process.env.CREDENTIAL_KEY = KEY_B64;
    expect(encryptionAvailable()).toBe(true);
    delete process.env.CREDENTIAL_KEY;
    expect(encryptionAvailable()).toBe(false);
  });
});

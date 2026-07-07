import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Symmetric encryption for secrets at rest (Commercial SaaS CP1: customer Graph client secrets).
// AES-256-GCM with a 32-byte master key from CREDENTIAL_KEY (base64 or hex). The key lives only
// in the server environment; ciphertext is stored in the DB. Format: "<iv>.<tag>.<ciphertext>"
// (all base64). GCM's auth tag makes tampering detectable — decrypt throws if the blob was altered
// or the key is wrong, so a corrupted/foreign secret can never be silently used.

const ALGO = "aes-256-gcm";

/** Parse the 32-byte master key from CREDENTIAL_KEY (accepts base64 or 64-char hex). */
export function loadKey(): Buffer {
  const raw = process.env.CREDENTIAL_KEY;
  if (!raw) throw new Error("CREDENTIAL_KEY is not set — cannot encrypt/decrypt secrets.");
  const key = /^[0-9a-fA-F]{64}$/.test(raw.trim()) ? Buffer.from(raw.trim(), "hex") : Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("CREDENTIAL_KEY must decode to 32 bytes (use `openssl rand -base64 32`).");
  return key;
}

/** True if a valid master key is configured (used to gate the integration UI without throwing). */
export function encryptionAvailable(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptSecret(blob: string): string {
  const key = loadKey();
  const [ivB64, tagB64, ctB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed ciphertext.");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

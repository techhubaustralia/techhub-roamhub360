import "server-only";
import crypto from "crypto";
import { putAsset } from "./store";

// Shared attachment intake for support requests AND replies, so the size/type rules can't drift
// between the two paths.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

export interface StoredAttachment {
  key: string;
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
}

/** Validate + store one uploaded file. Returns null when no file was supplied, or an `error`
 *  string when the file is rejected. The storage key is a uuid, so a hostile filename can never
 *  influence the path we write to. */
export async function takeAttachment(file: FormDataEntryValue | null): Promise<{ stored?: StoredAttachment; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return {};
  const type = (file.type || "").toLowerCase();
  if (!ALLOWED_ATTACHMENT_TYPES.has(type)) return { error: "Attachment must be an image, PDF, or text file." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "Attachment is larger than 10 MB." };
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = (file.name || "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const key = crypto.randomUUID();
  await putAsset(key, buffer, type);
  return { stored: { key, name, type, size: file.size, buffer } };
}

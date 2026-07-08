import "server-only";
import crypto from "crypto";
import { getTenantJson, setTenantJson } from "./store";

// Per-tenant API keys for the public REST API (/api/v1). Keys are shown ONCE at creation and stored
// only as a SHA-256 hash (like a password) — a leaked store never yields usable keys. Tenant scope
// comes for free: verification reads the current tenant's key list (resolved from the request host),
// so a key issued to tenant A can never authenticate against tenant B.

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string; // first chars, for display ("rh_ab12…")
  hash: string; // sha256(secret) — never returned to clients
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
}
export type ApiKeyPublic = Omit<ApiKeyRecord, "hash">;

const KEY = "api-keys";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const load = async (): Promise<ApiKeyRecord[]> => (await getTenantJson<ApiKeyRecord[]>(KEY)) ?? [];
const save = (l: ApiKeyRecord[]) => setTenantJson(KEY, l);
const strip = ({ hash, ...r }: ApiKeyRecord): ApiKeyPublic => r;

export async function createApiKey(name: string, createdBy: string): Promise<{ key: string; record: ApiKeyPublic }> {
  const secret = "rh_" + crypto.randomBytes(24).toString("base64url");
  const rec: ApiKeyRecord = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 60) || "API key",
    prefix: secret.slice(0, 9),
    hash: sha(secret),
    createdAt: new Date().toISOString(),
    createdBy,
  };
  const list = await load();
  list.push(rec);
  await save(list);
  return { key: secret, record: strip(rec) };
}

export async function listApiKeys(): Promise<ApiKeyPublic[]> {
  return (await load()).map(strip);
}

export async function revokeApiKey(id: string): Promise<void> {
  const list = await load();
  await save(list.filter((k) => k.id !== id));
}

/** Validate a raw key against the CURRENT tenant. Returns the record (minus hash) or null. */
export async function verifyApiKey(raw: string | null | undefined): Promise<ApiKeyPublic | null> {
  if (!raw) return null;
  const h = sha(raw);
  const list = await load();
  const rec = list.find((k) => k.hash === h);
  if (!rec) return null;
  rec.lastUsedAt = new Date().toISOString();
  void save(list).catch(() => {}); // best-effort "last used" touch
  return strip(rec);
}

/** Pull a bearer token from Authorization or the x-api-key header. */
export function bearerFrom(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key");
}

import "server-only";
import crypto from "crypto";
import { prisma } from "./prisma";
import { currentTenantId } from "./tenant";
import { getTenantJson, setTenantJson } from "./store";
/* eslint-disable @typescript-eslint/no-explicit-any */

// Per-tenant API keys for the public REST API (/api/v1). Keys are shown ONCE at creation and stored
// only as a SHA-256 hash (like a password) — a leaked store never yields usable keys. Tenant scope
// comes for free: verification is scoped to the current tenant (resolved from the request host), so
// a key issued to tenant A can never authenticate against tenant B.
//
// Governance (H2): least-privilege SCOPES, optional EXPIRY, and last-used tracking. In SQL mode keys
// live in the ApiKey table (indexed hash, atomic per-key writes); the JSON blob is the dev/no-DB
// fallback and keeps the old whole-list semantics.

const useSql = Boolean(process.env.DATABASE_URL);

// The scopes a key can hold. Read = every current GET endpoint; write = mutating endpoints (booking
// creation etc.) as they are added. Keys default to the least-privilege ["read"].
export const API_SCOPES = ["read", "write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string; // first chars, for display ("rh_ab12…")
  hash: string; // sha256(secret) — never returned to clients
  scopes: ApiScope[];
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  expiresAt?: string | null; // null/undefined = never expires
}
export type ApiKeyPublic = Omit<ApiKeyRecord, "hash">;

const KEY = "api-keys";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const stripJson = ({ hash, ...r }: ApiKeyRecord): ApiKeyPublic => r;

// ---- pure governance helpers (unit-tested) ----
/** A key is expired when it has an expiry that is at or before `now`. No expiry = never expires. */
export function isExpired(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now;
}
/** Whether a key's scopes satisfy a required scope. Unknown/empty scopes never satisfy anything. */
export function hasScope(scopes: string[] | null | undefined, required: ApiScope): boolean {
  return Array.isArray(scopes) && scopes.includes(required);
}
/** Clamp requested scopes to the known set; empty → least-privilege ["read"]. */
function cleanScopes(scopes: unknown): ApiScope[] {
  const arr = Array.isArray(scopes) ? scopes.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s)) : [];
  return arr.length ? [...new Set(arr)] : ["read"];
}

function toPublic(r: any): ApiKeyPublic {
  return {
    id: r.id, name: r.name, prefix: r.prefix, scopes: (r.scopes as ApiScope[]) ?? ["read"],
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    createdBy: r.createdBy,
    lastUsedAt: r.lastUsedAt ? (r.lastUsedAt instanceof Date ? r.lastUsedAt.toISOString() : r.lastUsedAt) : undefined,
    expiresAt: r.expiresAt ? (r.expiresAt instanceof Date ? r.expiresAt.toISOString() : r.expiresAt) : null,
  };
}

const loadJson = async (): Promise<ApiKeyRecord[]> => (await getTenantJson<ApiKeyRecord[]>(KEY)) ?? [];
const saveJson = (l: ApiKeyRecord[]) => setTenantJson(KEY, l);

export async function createApiKey(
  name: string,
  createdBy: string,
  opts?: { scopes?: string[]; expiresInDays?: number | null },
): Promise<{ key: string; record: ApiKeyPublic }> {
  const secret = "rh_" + crypto.randomBytes(24).toString("base64url");
  const scopes = cleanScopes(opts?.scopes);
  const days = opts?.expiresInDays;
  const expiresAt = days && days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
  const base = {
    name: name.trim().slice(0, 60) || "API key",
    prefix: secret.slice(0, 9),
    hash: sha(secret),
    scopes,
    createdBy,
  };
  if (useSql) {
    const p = await prisma();
    const rec = await p.apiKey.create({ data: { ...base, tenantId: await currentTenantId(), expiresAt } });
    return { key: secret, record: toPublic(rec) };
  }
  const rec: ApiKeyRecord = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), expiresAt: expiresAt?.toISOString() ?? null, ...base };
  const list = await loadJson();
  list.push(rec);
  await saveJson(list);
  return { key: secret, record: stripJson(rec) };
}

export async function listApiKeys(): Promise<ApiKeyPublic[]> {
  if (useSql) {
    const p = await prisma();
    const rows = await p.apiKey.findMany({ where: { tenantId: await currentTenantId() }, orderBy: { createdAt: "desc" } });
    return rows.map(toPublic);
  }
  return (await loadJson()).map(stripJson);
}

export async function revokeApiKey(id: string): Promise<void> {
  if (useSql) {
    const p = await prisma();
    // Tenant-scoped delete — a key id from another workspace can't be revoked here.
    await p.apiKey.deleteMany({ where: { id, tenantId: await currentTenantId() } });
    return;
  }
  const list = await loadJson();
  await saveJson(list.filter((k) => k.id !== id));
}

/** Validate a raw key against the CURRENT tenant. Returns the record (minus hash) or null if the key
 *  is unknown, belongs to another tenant, or has expired. Touches last-used atomically. */
export async function verifyApiKey(raw: string | null | undefined): Promise<ApiKeyPublic | null> {
  if (!raw) return null;
  const h = sha(raw);
  const tenantId = await currentTenantId();
  if (useSql) {
    const p = await prisma();
    const rec = await p.apiKey.findFirst({ where: { hash: h, tenantId } });
    if (!rec) return null;
    if (isExpired(rec.expiresAt ? (rec.expiresAt as Date).toISOString() : null)) return null;
    // Atomic per-row touch — no read-modify-write race with concurrent requests.
    void p.apiKey.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return toPublic(rec);
  }
  const list = await loadJson();
  const rec = list.find((k) => k.hash === h);
  if (!rec) return null;
  if (isExpired(rec.expiresAt)) return null;
  rec.lastUsedAt = new Date().toISOString();
  void saveJson(list).catch(() => {}); // best-effort "last used" touch
  return stripJson(rec);
}

/** Pull a bearer token from Authorization or the x-api-key header. */
export function bearerFrom(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key");
}

import "server-only";
import { NextResponse } from "next/server";
import { verifyApiKey, bearerFrom, type ApiKeyPublic } from "./apikeys";
import { currentTenantId } from "./tenant";
import { rateLimit, tooMany } from "./rate-limit";
import type { AppUser } from "./auth";

// Shared auth for the public REST API (/api/v1). The key is validated against the current tenant
// (resolved from the request host), so every downstream store/db call is already tenant-scoped.
// Rate-limited per key (120 req/min) so a leaked or runaway key can't hammer the instance.

export async function apiAuth(req: Request): Promise<ApiKeyPublic | null> {
  return verifyApiKey(bearerFrom(req));
}

/** Auth + per-key rate limit in one step. Returns the key, or a ready-made error Response. */
export async function apiGuard(req: Request): Promise<{ key: ApiKeyPublic } | { res: Response }> {
  const key = await apiAuth(req);
  if (!key) return { res: apiUnauthorized() };
  const rl = rateLimit(`v1:${key.id}`, 120, 60_000);
  if (!rl.ok) return { res: tooMany(rl.retryAfter) };
  return { key };
}

export function apiUnauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Invalid or missing API key. Send 'Authorization: Bearer <key>' or an 'x-api-key' header." },
    { status: 401 },
  );
}

// A tenant-scoped, full-access identity for API calls (the key already gates access at the tenant
// boundary). Used where availability/permission helpers expect an AppUser.
export async function apiUser(): Promise<AppUser> {
  const tenantId = await currentTenantId();
  return { name: "API", email: `apikey@${tenantId}`, role: "global-admin", groups: [], tenantId };
}

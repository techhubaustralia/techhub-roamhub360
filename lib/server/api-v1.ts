import "server-only";
import { NextResponse } from "next/server";
import { verifyApiKey, bearerFrom, type ApiKeyPublic } from "./apikeys";
import { currentTenantId } from "./tenant";
import type { AppUser } from "./auth";

// Shared auth for the public REST API (/api/v1). The key is validated against the current tenant
// (resolved from the request host), so every downstream store/db call is already tenant-scoped.

export async function apiAuth(req: Request): Promise<ApiKeyPublic | null> {
  return verifyApiKey(bearerFrom(req));
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

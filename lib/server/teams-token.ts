import { createRemoteJWKSet, jwtVerify } from "jose";

// Verifies a Microsoft Teams SSO token (from teams-js getAuthToken) so we can mint an
// Auth.js session for a user inside a Teams tab — replacing the old Azure Easy Auth
// `/.auth/login/aad` bridge that only existed while the app ran on Azure Container Apps.
//
// Trust model: the token is a v2.0 access token issued by Entra to THIS app's exposed API.
// We verify (a) the signature against Microsoft's published keys, (b) the audience is our
// app, and (c) the issuer is a Microsoft login authority. Because RoamHub360 is a
// multi-tenant app, the issuer is per-organisation, so we match the issuer *shape* rather
// than pinning one tenant. No secret is involved — verification is signature-only.

export type TeamsProfile = { email: string; name?: string; tid?: string; oid?: string };

// Microsoft's public signing keys (v2.0 "common" endpoint serves keys for every tenant).
const JWKS = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"));

// A Teams SSO token's audience is our Entra app, expressed as either the bare client id or an
// Application ID URI. The Teams manifest uses `api://<app-host>/<client-id>`, so we derive that
// from APP_URL as well. TEAMS_SSO_AUDIENCE overrides/extends when the URI differs.
export function expectedAudiences(appId: string, appUrl?: string, override?: string): string[] {
  const auds = new Set<string>([appId, `api://${appId}`]);
  if (appUrl) {
    try {
      auds.add(`api://${new URL(appUrl).host}/${appId}`);
    } catch {
      /* ignore malformed APP_URL */
    }
  }
  if (override) auds.add(override);
  return [...auds];
}

// Accept Microsoft login authorities only. v2.0 tokens: https://login.microsoftonline.com/<tid>/v2.0
// v1.0 tokens: https://sts.windows.net/<tid>/  — both are Microsoft-issued.
export function isMicrosoftIssuer(iss: string): boolean {
  return (
    /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/i.test(iss) ||
    /^https:\/\/sts\.windows\.net\/[0-9a-f-]{36}\/$/i.test(iss)
  );
}

export async function verifyTeamsSsoToken(token: string): Promise<TeamsProfile | null> {
  const appId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  if (!appId || !token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      audience: expectedAudiences(appId, process.env.APP_URL, process.env.TEAMS_SSO_AUDIENCE),
    });
    if (!isMicrosoftIssuer(String(payload.iss ?? ""))) return null;
    const email = String(payload.preferred_username ?? payload.upn ?? payload.email ?? "")
      .toLowerCase()
      .trim();
    if (!email) return null;
    return {
      email,
      name: payload.name ? String(payload.name) : undefined,
      tid: typeof payload.tid === "string" ? payload.tid : undefined,
      oid: typeof payload.oid === "string" ? payload.oid : undefined,
    };
  } catch {
    return null; // invalid signature / expired / wrong audience — treat as no session
  }
}

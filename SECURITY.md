# RoamHub360 — Security model

How the platform keeps customer data isolated, secrets protected, and licence limits
un-bypassable. This is the reference for the CP5 hardening pass.

## Tenant isolation
- Every customer organisation is a **tenant**, resolved from the request subdomain
  (`<slug>.roamhub360.com`) in `lib/server/tenant.ts`. The app host and dev resolve to `default`.
- Data access is funnelled through **choke points**: `lib/server/db.ts` (bookings/locks/audit) and
  `lib/server/store.ts` (plans/buildings/images) resolve the tenant internally and scope **every**
  read/write by `tenantId`. No route can opt out.
- A **membership guard** in `getUser()` blocks a signed-in user from any tenant that isn't their
  home tenant; only platform operators (`BOOTSTRAP_ADMINS`) may cross tenants (and impersonation is
  audited).

## Secrets at rest
- Customer Microsoft **client secrets are encrypted** with AES-256-GCM (`lib/server/crypto.ts`)
  using `CREDENTIAL_KEY`, before storage. The GCM auth tag makes tampering detectable.
- Secrets are **write-only** over the API: `getIntegrationStatus()` returns only `hasSecret`, never
  the value; `getIntegrationCreds()` (the only decrypt path) is `server-only` and used solely by the
  Graph layer. No endpoint serialises `secretEnc`.
- `CREDENTIAL_KEY`, `AUTH_SECRET`, `CHECKIN_SECRET`, `JOBS_SECRET` live only in the server env and
  are never sent to the browser or logged.

## Licence enforcement (un-bypassable)
- Limits and expiry are enforced **server-side** in `lib/server/licensing.ts`, called from the
  write routes: site creation (`/api/buildings`), floor cap (`/api/buildings/[id]/floors`), and new
  bookings (`/api/bookings`). A client cannot skip these — they run before any mutation and return
  HTTP 402.
- Suspension/expiry set the workspace **read-only** (writes blocked, reads intact).

## Authentication
- Auth.js (JWT sessions). Providers are env-gated; local password hashes use bcrypt.
- **Teams SSO** tokens are verified server-side against Microsoft's JWKS (signature + audience +
  Microsoft-issuer shape) in `lib/server/teams-token.ts` — lookalike issuers are rejected.
- Middleware (`auth.config.ts`) requires a session for everything except an explicit public
  allowlist (`/signin`, `/privacy`, `/terms`, auth/checkin/checkout/jobs/teams/verify).

## Data minimisation & visibility
- The presence board exposes a **display name** to colleagues, and a raw email only to a building
  admin. Users can opt out of the board entirely (Settings), enforced at the presence choke point.
- Per-tenant **feature flags** are enforced server-side (e.g. `/api/presence` returns empty when
  `presence` is disabled), not just hidden in the nav.

## Auditing
- Admin/operator actions are audited (`audit()` → `AuditLog`, tenant-scoped): licence changes,
  suspension, feature-flag changes, impersonation, integration updates, directory syncs.

## Transport & headers
- Security headers are set in `next.config.ts` (CSP `frame-ancestors` allowing Teams, `nosniff`,
  referrer-policy, HSTS). TLS is terminated by Caddy (Let's Encrypt / on-demand).

## Operational notes / follow-ups
- **`CREDENTIAL_KEY` must be stable** — rotating it orphans stored customer secrets (they must be
  re-entered). Back it up with other secrets. Key rotation with re-encryption is a future task.
- Impersonation currently records intent and opens the customer subdomain as the operator (who
  already has cross-tenant access); assuming a specific end-user identity is a future enhancement.
- Deleting a tenant removes the `Tenant` row but does not cascade-purge tenant-owned rows/blobs
  (no FK); a full data purge is a separate, deliberate operation.

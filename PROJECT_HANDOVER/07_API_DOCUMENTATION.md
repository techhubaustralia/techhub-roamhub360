# 07 · API Documentation

All routes are Next.js App-Router handlers under `app/api/**/route.ts`, running in the app process.
Common conventions:
- **Auth:** most routes call `getUser()` (Auth.js session). Public routes are allowlisted in
  `auth.config.ts` / `lib/bare-routes.ts`. The **public API** (`/api/v1/*`) is secured by API keys, not sessions.
- **Validation:** request bodies validated with **zod**; invalid → `400`.
- **Tenancy:** data access is tenant-scoped via `currentTenantId()` — a key can never cross tenants.
- **Rate limiting:** sensitive routes use `rateLimit(...)` (async; in-memory or Redis). Over limit → `429` + `Retry-After`.
- **Errors:** `401` not signed in · `402` licence read-only/expired · `403` forbidden/wrong scope ·
  `404` not found (also used to hide cross-tenant existence) · `429` rate-limited · `502/503` upstream/unconfigured.

## Booking & spaces

| Route | Methods | Auth / perm | Notes |
|---|---|---|---|
| `/api/bookings` | GET, POST | signed-in | GET = occupancy/list (rate-limited search); POST = create booking (validate + licence 402 + conflict/lock + Graph event + email/push/webhook/SSE). |
| `/api/bookings/[id]` | GET, PATCH/DELETE | owner or admin | reschedule/cancel; admin cancel sets `cancelledBy`; audited; Graph event updated/deleted. |
| `/api/buildings` | GET | signed-in | list buildings/sites (from storage). |
| `/api/buildings/[id]` | GET/PATCH/DELETE | global-admin | building CRUD (soft delete/restore). |
| `/api/buildings/[id]/floors` | PUT | global-admin | set floors; **licence floor-cap enforced (402)**; audited. |
| `/api/plans/[id]` | GET/PUT | global-admin (write) | floor-plan geometry. |
| `/api/plans/[id]/image` | GET/POST | global-admin (write) | floor-plan background image; **upload validated by magic-bytes + size** (C3), `X-Content-Type-Options: nosniff`. |
| `/api/assignments` | GET/POST/DELETE | global/site-admin | permanent-desk assignments; audited. |
| `/api/locks/[buildingId]` | GET/POST/DELETE | admin (write); GET strips `lockedBy` for non-admins | space locks. |
| `/api/checkin`, `/api/checkout` | POST | signed-in / signed link | check-in/out; **CHECKIN_SECRET-signed** links. |
| `/api/qr-checkin` | POST | signed-in | QR desk check-in — finds the scanner's own active booking for that space **today** (site-tz), atomic CAS. |
| `/api/qr` | GET | admin | renders a space QR (SVG). |
| `/api/occupancy`, `/api/presence`, `/api/presence/insights`, `/api/analytics` | GET | signed-in (insights/analytics global-admin) | presence board, weekday patterns, utilisation. Respect privacy opt-outs + feature flag `presence`. |

## Assistant, real-time, notifications

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/assistant` | GET, POST | signed-in; flag `assistant` | GET → `{configured, provider}` (disclosure); POST → chat. **20/min burst + daily cap**; audited (`assistant.chat`); returns `{reply, proposal}` (propose-only). |
| `/api/live` | GET (SSE) | signed-in | tenant-scoped event stream; 25s heartbeat. |
| `/api/push` | GET/POST/DELETE | signed-in | web-push subscription mgmt (VAPID). |

## Account & identity

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/auth/[...nextauth]` | * | — | Auth.js handler (providers, callbacks). |
| `/api/account/forgot` | POST | public, rate-limited 5/15min | always `{ok:true}` (no enumeration); sends set-password link for any existing account; logs redacted. |
| `/api/account/set-password` | POST | public + token | token embeds `pwFingerprint` (single-use; invalidates old links). |
| `/api/account/verify-email` | POST | public + token | self-serve signup email verification. |
| `/api/account/resend-verification` | POST | public, rate-limited | resend verification. |
| `/api/me` | GET | signed-in | current user (role, tenant, disabledFeatures, branding). |
| `/api/me/password` | POST | signed-in | change own password. |
| `/api/me/2fa` | GET/POST | signed-in | TOTP enrol/confirm (`lib/server/totp.ts`). |
| `/api/me/prefs` | GET/PATCH | signed-in | own presence prefs (hidePresence/notifyPresence). |
| `/api/users`, `/api/users/[id]` | GET/POST/PATCH/DELETE | global-admin | user CRUD; last-global-admin guard; role change captures **before/after** audit. |
| `/api/users/import` | POST | global-admin | bulk import. |
| `/api/signup` | POST | public (gated by `ALLOW_PUBLIC_SIGNUP`); 5/hr/IP | provisions tenant + 14-day trial + first admin. |
| `/api/onboarding` | GET | admin | setup-checklist status. |

## Admin / platform control plane

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/admin/apikeys` | GET/POST/DELETE | global-admin | API-key governance (name, **scopes**, **expiry**); returns full key once; audited. |
| `/api/admin/webhooks` | GET/POST/PUT/DELETE | global-admin | outbound webhooks + Slack; **SSRF-guarded** (C2). |
| `/api/admin/integration` | GET/PUT/POST | global-admin | per-tenant Microsoft Graph creds (encrypted); POST=connection test. |
| `/api/admin/entra` (+ `/connect`, `/callback`) | GET/POST | global-admin (callback PUBLIC, state-verified) | Entra **org sign-in** admin consent → `ssoEntraTenantId`. |
| `/api/admin/directory/groups` | GET/POST | global-admin | choose Entra groups to sync (scope). |
| `/api/admin/license` | GET/PUT | global-admin | licence view/edit. |
| `/api/admin/kb`, `/api/admin/kb/[id]` | GET/POST/PUT/DELETE | global-admin | KB authoring (tenant + global scope for platform ops). |
| `/api/admin/support`, `/.../[id]`, `/.../[id]/attachment` | GET/PATCH | global-admin | support queue mgmt + reply + attachment download. |
| `/api/admin/tenants/[slug]` | GET/PATCH/POST | **platformAdmin** | tenant detail+stats; status/features/licence; POST=impersonate (open workspace, audited). |
| `/api/admin/tenants/[slug]/users` | GET/POST/DELETE | platformAdmin | provision a customer's users. |
| `/api/admin/tenants/[slug]/export` | GET | platformAdmin | tenant data export (C1). |
| `/api/tenants`, `/api/tenants/verify` | GET/POST | platformAdmin; verify PUBLIC | create/list tenants; verify = Caddy on-demand-TLS ask endpoint. |
| `/api/directory` | GET/POST | global-admin; flag `directory` | directory status/list; POST=sync from Graph (throttled, audited). |

## Support & KB (end-user)

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/support` | POST | signed-in, 5/10min | raise ticket (multipart, attachment ≤10MB image/PDF/text); emails OPS_EMAIL + ack. |
| `/api/support/[id]` (+ `/reply`, `/attachment`) | GET/PATCH/POST | requester or admin | thread, follow-up reply (20/10min), resolve/reopen, attachment download. |
| `/api/kb`, `/api/kb/[id]` | GET | signed-in | KB list/read (built-in + published tenant/global). |

## Public REST API (`/api/v1`) — API-key secured

| Route | Method | Scope | Notes |
|---|---|---|---|
| `/api/v1/bookings` | GET | `read` | tenant's bookings. |
| `/api/v1/spaces` | GET | `read` | spaces. |
| `/api/v1/availability?date=YYYY-MM-DD` | GET | `read` | free spaces on a date. |

Auth: `Authorization: Bearer <key>` or `x-api-key`. `apiGuard(req, scope)` → `verifyApiKey` (tenant-scoped,
**expiry + scope** enforced) → **120 req/min per key**. Errors: `401` invalid/missing key, `403` missing scope, `429`.

## Scheduler & ops

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/jobs/[task]` | GET | `x-jobs-secret: JOBS_SECRET` (fail-closed) | tasks: `tick`, `reminder`, `checkin`, `checkout`, `auto-release`, `auto-checkout`, `digest`, `license-check`, `audit-prune`, `report`. Idempotent (H8). |
| `/api/health`, `/api/version` | GET | public | liveness + build version. |
| `/api/diag/audit`, `/api/diag/graph`, `/api/diag/[id]` | GET | admin | diagnostics (audit backend probe, Graph test). |
| `/api/billing`, `/api/billing/webhook` | POST | signed-in / Stripe sig | billing hooks (stub). |

## Business rules (cross-cutting)

- A booking is only valid for a space that exists on the authoritative plan (**no ghost bookings**).
- Times are **site-local wall-clock**; validation uses the site's `plan.tz` (fallback `APP_DEFAULT_TZ`).
- Licence **read-only** (402) when expired/suspended; **site/floor caps** enforced on create.
- Sign-in is **tenant-locked** to the subdomain; API keys are tenant-scoped by request host.
- The AI concierge **cannot** mutate — it only proposes; all writes go through validated routes.

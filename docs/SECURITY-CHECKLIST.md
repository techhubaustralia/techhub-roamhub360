# Security Penetration Checklist — Workspace Hub

Each item: **Attack scenario → Expected behavior → Pass/Fail criteria**. Current status reflects
code as of v64. Items marked (E2E) are covered by `tests/api-regression.test.ts`.

## 1. Authentication
- **Unauthenticated API access.** Attack: call any `/api/*` without an Easy Auth session.
  Expected: Entra Easy Auth blocks at the ingress before the app runs (except the explicitly
  excluded check-in/out/jobs paths). Pass: no app route is reachable without a principal, except
  the HMAC/JOBS_SECRET-guarded ones. **Config-dependent — verify Easy Auth "Require authentication"
  and the excluded-paths list on the Container App.**
- **Forged identity header.** Attack: send `x-ms-client-principal-name: victim@…` directly.
  Expected: only valid behind Easy Auth (platform strips client-supplied copies). Pass: the
  container is not directly reachable bypassing the auth-enforcing ingress. **Config-dependent.**

## 2. Authorization (RBAC) — enforced server-side
- **Staff reads another user's bookings.** `GET /api/bookings?user=other`. Expected 403. **Pass (E2E).**
- **Staff locks/edits a space.** `PUT /api/locks/{b}`. Expected 403. **Pass (E2E).**
- **Staff hits admin dashboards.** `GET /api/analytics`, `/api/assignments`, `PUT /api/plans`.
  Expected 403. **Pass** (role-gated).
- **Modify another user's booking.** `PATCH /api/bookings/{id}` as non-owner/non-admin. Expected
  403 (owner or site-scoped admin only, case-insensitive owner check). **Pass.**

## 3. Cross-tenant / cross-site isolation
- **Site admin acts on another site.** Cancel/lock/analytics/on-behalf outside `user.sites`.
  Expected 403 / filtered out (`canAccessBuilding`, matched by building root). **Pass.**
- **Site admin reads another user's cross-site bookings.** Expected: results filtered to the
  admin's sites only. **Pass.**

## 4. Input injection
- **XSS in labels/notes/name.** Store `<script>`/`<img onerror>` in `spaceLabel`, room notes,
  building name. Expected: React escapes on render; outbound email HTML is escaped (`escapeHtml`).
  Pass: no script executes in UI or email. **Pass** (email escaping unit-tested).
- **SQL injection in any field.** Expected: Prisma parameterises all queries; no string-built SQL.
  Pass: injection strings are treated as literal data. **Pass** (no raw SQL in the codebase).

## 5. Business-rule bypass via direct API
- **Ghost booking.** POST a `spaceKey` not on the plan. Expected 400. **Pass (E2E).**
- **Kind mismatch.** Book a room as a desk. Expected 400. **Pass (E2E).**
- **Closed site.** Book a `status:"closed"` site. Expected 409. **Pass (E2E).**
- **Locked/assigned space.** Book a locked space (UI hides it). Expected 403. **Pass.**
- **Past-time.** Book an elapsed slot (office tz). Expected 400. **Pass (E2E).**
- **One-desk rule.** Overlapping desk in any building. Expected 409; offices/rooms exempt. **Pass (E2E).**
- **Resurrect cancelled.** `PATCH` cancelled→Booked. Expected 409. **Pass (E2E).**

## 6. Concurrency / duplication
- **Double-book same space/time (race).** Expected: SERIALIZABLE transaction + range lock → exactly
  one 201, rest 409. Pass: no overlapping active bookings. **Design-verified; run the 100-concurrent
  load test on Azure SQL to certify.**
- **Retry storm.** Duplicate POSTs. Expected: per-IP (60/min) + per-user (20/min) rate limits →
  429; identical booking → 409. **Pass** (rate limiter is per-replica; see note).

## 7. Rate limiting abuse
- **Flood booking/search/admin endpoints.** Expected 429 after the window limit. Pass: limits fire.
  **Pass** (in-memory, per-replica — for exact global limits, back with Azure Cache for Redis).

## 8. Session / token manipulation
- **Replay a check-in/out link.** Expected: HMAC-signed, now expires the day after its date.
  Pass: expired/forged tokens rejected (length-guarded compare). **Pass** — **requires `CHECKIN_SECRET`
  set in prod** (dev default is insecure).

## 9. Privilege escalation / lockout
- **Everyone-admin when unconfigured.** Expected: fail-closed to staff for authenticated users.
  **Pass** (bootstrap via `BOOTSTRAP_ADMINS`).
- **Remove/demote the last global admin.** Expected 409 unless another admin or `BOOTSTRAP_ADMINS`
  exists. **Pass.**

## Required prod configuration (gate blockers if missing)
- `BOOTSTRAP_ADMINS` set (break-glass + fail-closed safety).
- `CHECKIN_SECRET` set (else check-in tokens are forgeable).
- Easy Auth "Require authentication" on; excluded paths limited to `/api/checkin`, `/api/checkout`, `/api/jobs`.
- Container ingress is the only path to the app (no direct container access).

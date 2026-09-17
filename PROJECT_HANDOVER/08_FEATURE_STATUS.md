# 08 · Feature Status Matrix

Legend: ✅ Complete · 🟡 Partial · 📅 Planned · ⛔ Disabled/off-by-default · 🔧 Needs infra to validate

| Feature | Status | Notes |
|---|---|---|
| **Booking engine** (desk/office/room/parking; full/half/hourly; multi-day) | ✅ | Validated, conflict + lock + licence enforced. |
| On-behalf booking (admin books for user) | ✅ | `bookedByEmail`. |
| Floor-plan editor (draw spaces, seats, hours, timezone) | ✅ | `/editor/[id]`, every IANA tz. |
| Interactive booking floor plan | ✅ | SVG; desk/office/room names hidden on-plan, shown on hover. |
| Check-in / check-out (email links) | ✅ | `CHECKIN_SECRET`-signed. |
| QR desk check-in + printable labels | ✅ | `/checkin`, `/labels`, `/api/qr-checkin` (site-tz today). |
| Auto-release (no-show) + auto-checkout | ✅ | Scheduler; idempotent via status filter. Per-site release time + check-in opening time (2026-09). |
| Repeat weekly bookings (one request, ≤ 60 dates) | ✅ | `POST /api/bookings/recurring`; per-date rules; summary email/push (2026-09). |
| Office bookings — cross-site overview | ✅ | `/office-booking`; flag `office-booking`; presence-privacy aware (2026-09). |
| **Who's-in presence** (Team Build-Up A) | ✅ | `/team`, per-site, privacy-aware. |
| Microsoft directory sync (B) — names/photos/dept/manager | ✅🔧 | Per-tenant Graph; untested without a real Entra tenant. |
| Presence privacy opt-outs (C) | ✅ | `hidePresence`. |
| Morning "who's in" digest email (D) | ✅ | 07:30 site-local; `notifyPresence`. |
| Teams "Who's in" widget (E) | ✅🔧 | Teams-runtime only; untested locally. |
| Presence analytics + recommendations (F) | ✅ | Weekday patterns. |
| **AI concierge "Hubbi"** | ✅ | Anthropic or OpenAI-compatible; propose-only; injection-guarded; daily cap; audited; verified live on Gemini free tier. |
| **Multi-tenancy** (subdomain, data + storage isolation) | ✅ | App-code enforced; **4 cross-tenant live tests** guard it (2026-09). Roles shown as "Workspace admin" / "Platform operator". |
| Import users from Microsoft 365 (synced directory → SSO users) | ✅🔧 | `POST /api/users/import-directory`; needs a synced directory (2026-09). |
| DB-level tenant isolation (FK + RLS) | 📅🔧 | **Prepared, not applied** — `prisma/planned/`, C4; needs staging DB. |
| Per-tenant Microsoft integration (encrypted) | ✅ | CP1; AES-256-GCM. |
| Entra org sign-in (admin consent auto-join) | ✅🔧 | CP; needs real Entra org to fully test. |
| Per-site licensing + tiers + enforcement | ✅ | CP2; 402 enforcement. |
| Expiry notifications (90/60/30/14/7/1/0) | ✅ | CP4; scheduler. |
| Partner control plane `/admin/tenants` | ✅ | CP3; status/features/licence/impersonate, audited. |
| Feature flags (per-tenant disable) | ✅ | Nav + server-side enforced. |
| White-label branding (name/accent/logo) | ✅ | G3; accent recolours app; per-tenant email branding G6. |
| Self-serve trial signup | ⛔ | G5; `ALLOW_PUBLIC_SIGNUP` off by default. |
| Onboarding checklist + upgrade nudges | ✅ | G1/G2. |
| Monthly ROI report email | ✅ | G4; scheduler. |
| **Auth: email/password** | ✅ | bcrypt, tenant-locked, 2FA (TOTP), verification. |
| Auth: Microsoft Entra (multi-tenant) | ✅ | Built-in provider re-discovers issuer per tenant. |
| Auth: Google | ✅ | Env-gated. |
| Auth: Teams SSO | ✅🔧 | jose vs JWKS; needs Teams sideload to fully test. |
| **Knowledge Base** (built-in + custom) | ✅ | `lib/kb-content.ts` ships in code; search works. |
| Support Centre (tickets, attachments, replies, unread) | ✅ | Requester sees status; admins answer in-app. |
| Email (Graph central mailbox + Resend fallback) | ✅ | Per-tenant branding; redacted logs. |
| Room calendar events (Graph) | ✅🔧 | Per-tenant; needs Graph creds. |
| Web push (VAPID) | ✅⛔ | Off until VAPID keys set (now part of the Android track). |
| Transactional email templates (invite, confirmation, recurring, cancellation) | ✅ | Table-based, preheader, white-label aware; 8 tests (2026-09). |
| **Android app (Google Play, Trusted Web Activity)** | 🟡 | Web side ✅ (`/.well-known/assetlinks.json`, manifest, public routes); Play account + Bubblewrap project pending — `21_ANDROID_APP.md`. |
| iOS app | 📅 | PWA Add-to-Home-Screen works; App Store shell deferred. |
| Outbound webhooks + Slack | ✅ | SSRF-guarded (C2). |
| Public REST API v1 + API keys | ✅ | H2 governance (scopes/expiry/hashed/last-used). |
| SAML SSO / SCIM provisioning | 📅 | Deliberately deferred (Entra OAuth covers enterprise SSO). |
| Real-time SSE live updates | ✅ | Per-process; cross-replica **ready** (H4) but needs Redis. |
| Global rate limiting across replicas | ✅🔧 | H3; in-memory default, needs `REDIS_URL` for multi-replica. |
| **Audit trail** (structured, append-only, export) | ✅ | M3; IP/UA/request-id + before/after + CSV. |
| Versioned DB migrations | ✅ | H6; container runs `migrate deploy` (self-baselining). |
| **Billing (Stripe/live)** | 🟡 | Hooks + stub only; no live billing flow. |
| Staging environment | 📅🔧 | None; needed to validate C4/RLS + E2E. |
| Automated E2E in CI | 🟡 | Playwright specs exist; no CI harness. |
| External penetration test | 📅 | Not done. |
| Accessibility (WCAG audit) | 🟡 | U5 down-payment (labels); full audit pending. |

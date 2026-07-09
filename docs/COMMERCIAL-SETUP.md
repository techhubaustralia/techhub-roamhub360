# RoamHub360 — Commercial Setup

How to turn on the commercial features. Each is **optional and dormant until its env keys are set**.
All env goes in `/root/roamhub360/.env` on the droplet; apply changes with:

```bash
cd /root/roamhub360
docker compose -f docker-compose.cohost.yml up -d --build
```

> Reminder: env-only changes don't strictly need `--build`, but it's harmless. Keep every secret
> **stable** once set (rotating `CREDENTIAL_KEY` or the VAPID keys breaks existing data/devices).

---

## 1. Transactional email (Resend) — recommended first

Makes password-reset, invite, verification and booking emails reliable, independent of any
customer's Microsoft 365.

1. Create an account at **resend.com**.
2. **Add & verify your domain** (e.g. `roamhub360.com`): Resend gives you a few DNS records
   (SPF/DKIM/DMARC) — add them at GoDaddy, wait for "Verified".
3. **Create an API key** (Full access).
4. Set env:
   ```
   RESEND_API_KEY=re_xxxxxxxx
   RESEND_FROM=RoamHub360 <noreply@roamhub360.com>
   ```
5. Redeploy. Test: `/signin` → **Forgot password?** → your admin email should receive a reset email.

If unset, email falls back to the Microsoft 365 Graph mailbox path (per tenant).

---

## 2. Billing (Stripe)

Live subscriptions: a workspace admin clicks **Subscribe** and Stripe activates their licence via webhook.

1. In the **Stripe Dashboard** (start in test mode):
   - **Product catalog → Add product** → RoamHub360 site licence → **recurring**, **yearly**,
     price **AUD $2,000**. Copy the **Price ID** (`price_…`).
   - **Developers → API keys** → copy the **Secret key** (`sk_…`).
   - **Developers → Webhooks → Add endpoint**:
     - URL: `https://app.roamhub360.com/api/billing/webhook`
     - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
     - Copy the **Signing secret** (`whsec_…`).
2. Set env:
   ```
   BILLING_PROVIDER=stripe
   STRIPE_SECRET_KEY=sk_live_xxx        # sk_test_xxx while testing
   STRIPE_PRICE_ID=price_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```
3. Redeploy. On a workspace's **Plan & licence** page an admin now sees **Subscribe / Manage subscription**.
   Paying flips the licence to active for ~1 year automatically; cancelling suspends it.

Pricing is per site — the checkout quantity defaults to the workspace's licensed site count.

---

## 3. Single sign-on (Microsoft / Google)

Thanks to the **central-auth handoff**, you register **one** redirect URI per provider (the main host).
Customer subdomains route their SSO through the main host automatically — **no per-subdomain URIs**.

### Microsoft Entra (multi-tenant)
1. Azure Portal → **Entra ID → App registrations → New**. Supported account types:
   **Accounts in any organizational directory (multitenant)**.
2. **Redirect URI (Web):** `https://app.roamhub360.com/api/auth/callback/microsoft-entra-id`
3. Add a **client secret**.
4. Env:
   ```
   AUTH_MICROSOFT_ENTRA_ID_ID=<application (client) id>
   AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret>
   AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/common/v2.0
   ```

### Google
1. Google Cloud → **APIs & Services → Credentials → OAuth client (Web)**.
2. **Authorized redirect URI:** `https://app.roamhub360.com/api/auth/callback/google`
3. Env:
   ```
   AUTH_GOOGLE_ID=<client id>
   AUTH_GOOGLE_SECRET=<client secret>
   ```

### How it behaves
- On `app.roamhub360.com` the SSO buttons sign in directly.
- On `<client>.roamhub360.com` the buttons redirect to the main host, run OAuth, then hand the
  session back to the subdomain (`/sso/start → /sso/relay → <sub>/sso/handoff`).
- **Security:** SSO does **not** auto-create accounts in a customer workspace. A user must first be
  **invited/added** to that workspace; then Microsoft/Google sign-in links to their existing account.
  (Domain-based auto-join can be added later if wanted.)

---

## 4. Other keys (recap)

```
CREDENTIAL_KEY=<openssl rand -base64 32>     # required for customers to save M365 creds — keep STABLE
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY         # web push (npx web-push generate-vapid-keys) — keep STABLE
VAPID_SUBJECT=mailto:support@techhubaustralia.com.au
ALLOW_PUBLIC_SIGNUP=false                    # true to open self-serve trial signup at /signup
OPS_EMAIL=<your ops inbox>                   # licence-expiry + report notifications
```

## 5. Monitoring

Point an uptime monitor (UptimeRobot, Better Uptime) at:
```
https://app.roamhub360.com/api/health
```
It returns `{"status":"ok","db":"ok"}` (HTTP 200) when healthy, 503 if the database is unreachable.

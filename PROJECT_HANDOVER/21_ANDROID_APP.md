# 21 — Android app (Google Play) via Trusted Web Activity

> Status 2026-09-17: the **web app side is complete** (asset-links endpoint, manifest, public
> routes, env plumbing). The Android project and the Play listing are the remaining steps, all of
> which need the TechHub Australia Play developer account. iOS is a separate decision (see §8).

## 1. What we are shipping

A **Trusted Web Activity (TWA)**: a real Play-store app whose only job is to open
`https://app.roamhub360.com` full-screen in Chrome's engine, with no browser UI. Everything the app
does — Microsoft sign-in, tenant subdomains, QR check-in, web push, the floor plan — is the web app.
There is no second codebase, no store review for every feature change, and every web deploy is
instantly "the app".

What the TWA needs from the web app (all done):

| Requirement | Where |
|---|---|
| Web manifest with `name`, `short_name`, 512px + maskable icons, `theme_color`, `background_color`, `start_url`, `display: standalone` | `app/manifest.ts` (public route) |
| Service worker registered | `public/sw.js` via `components/pwa-register.tsx` |
| Digital Asset Links on **every origin the app visits** | `app/.well-known/assetlinks.json/route.ts` — built from `ANDROID_ASSETLINKS_SHA256` / `ANDROID_PACKAGE_NAME`, identical on the main host and every `<tenant>.roamhub360.com` |
| HTTPS with valid certs on all of those origins | Caddy on-demand TLS (`docs/DEPLOY-DROPLET.md` §12) |

## 2. Multi-tenant: which origins the app trusts

Android only removes the browser bar on origins it has *verified* (asset links found + fingerprint
matches). The app launches on `app.roamhub360.com`; when a user's workspace is
`acme.roamhub360.com`, that origin must be in the app's **additional trusted origins** list, or the
user sees a Chrome Custom Tab bar there instead of the full-screen app.

Decision (agreed 2026-09-16, option a): **enumerate customer subdomains** in the Android project's
`twa-manifest.json → additionalTrustedOrigins`. Adding a customer therefore needs an app update
(a `versionCode` bump and a Play release — the CI pipeline makes that a one-line change). Revisit
if the tenant count grows past what a release-per-customer tolerates; the alternative is a fixed
per-region host with path-based tenancy, which is a bigger web change.

## 3. Prerequisites (owner: TechHub Australia)

1. **Google Play developer account** for TechHub Australia (organisation account; one-off fee;
   identity verification can take several days — start first).
2. In Play Console create the app **RoamHub360**, package **`com.techhubaustralia.roamhub360`**,
   and enrol in **Play App Signing** (default). Copy the two SHA-256 fingerprints from
   *Setup → App signing*: the **App signing key** (what production users get) and the
   **Upload key** (what internal-test builds are signed with).
3. On the droplet, set `ANDROID_ASSETLINKS_SHA256=<app-signing-fp>,<upload-fp>` in
   `/root/roamhub360/.env`, then `docker compose -f docker-compose.cohost.yml up -d`.
   Check: `curl -s https://app.roamhub360.com/.well-known/assetlinks.json`.
4. **Web push (VAPID)** — optional but the store listing promises notifications, so do it:
   `npx web-push generate-vapid-keys`, put the pair in `.env` as `VAPID_PUBLIC_KEY` /
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:support@techhubaustralia.com.au`, restart. Keys must
   never be rotated afterwards (existing subscriptions die). Settings → *Push notifications on this
   device* then appears.

## 4. Generating the Android project (Bubblewrap)

Run on the dev machine (needs JDK 17 and the Android SDK — Bubblewrap offers to install both).
Keep the project in its **own repo** (`techhub-roamhub360-android`) so web CI stays untouched.

```
mkdir C:\Projects\roamhub360-android; cd C:\Projects\roamhub360-android
npx @bubblewrap/cli init --manifest https://app.roamhub360.com/manifest.webmanifest
```

Answer the prompts with:

| Prompt | Value |
|---|---|
| Domain / URL path | `app.roamhub360.com` / `/` |
| Application name / short name | RoamHub360 / RoamHub360 |
| Application ID | `com.techhubaustralia.roamhub360` |
| Display mode | `standalone` |
| Orientation | `portrait` (matches the manifest) |
| Status bar / splash colours | `#0a1830` (both) |
| Icon / maskable icon | picked up from the manifest |
| Signing key | **create a new upload keystore** — store the `.jks` + passwords in the TechHub password vault, never in git |
| Play Billing / location delegation | no |
| Include support for Play Billing | no |

Then compare the generated `twa-manifest.json` with **`android/twa-manifest.template.json`** in this
repo (every known value is pre-filled) and align it; the two things only you can fill are the
fingerprints and:

```json
"additionalTrustedOrigins": ["acme.roamhub360.com", "<every-other-tenant>.roamhub360.com"],
"fallbackType": "customtabs",
"enableNotifications": true
```

Build and test on a device with Chrome: `npx @bubblewrap/cli build` → `app-release-signed.apk`
and `app-release-bundle.aab`. Install the APK; if a URL bar shows, asset links failed — check
`adb shell pm get-app-links com.techhubaustralia.roamhub360` and the endpoint on that origin.

## 5. CI/CD to Play (android-cicd)

Once the project exists, `npx android-cicd` in that repo sets up the GitHub Actions workflow:
keystore + Play service-account JSON as GitHub Secrets, auto-bumped `versionCode`, and the
internal → alpha → beta → production tracks. First upload to **Internal testing** must be done by
hand in Play Console (it creates the app record the API needs); every later release is CI.

## 6. Store listing (draft — finalise in Play Console)

- **Title:** RoamHub360 — Desk & Room Booking
- **Short description (80):** Book desks, offices, rooms and parking. See who's in. Check in with a QR.
- **Full description:** RoamHub360 is your workplace's booking app. Pick a desk, office, meeting
  room or parking bay from a live floor plan, see which colleagues are in on any day, repeat a
  booking weekly, and check in with a tap or the QR code at your desk. Sign in with your Microsoft
  work account. RoamHub360 is provided by your employer; contact your workplace admin for access.
- **Category:** Business. **Contact:** support@techhubaustralia.com.au. **Privacy policy URL:**
  `https://app.roamhub360.com/privacy`.
- **Assets:** `node scripts/store-assets.mjs` renders the 512×512 icon and the 1024×500 feature
  graphic (`store/feature-graphic.svg`) into `store/out/`; `node scripts/store-screenshots.mjs`
  captures phone screenshots from a signed-in demo workspace (see `store/README.md`).
- **App access:** "Restricted access" — provide a reviewer test account on a demo workspace
  (password sign-in) so Google can get past the sign-in screen.

## 7. Data safety form (draft answers)

| Question | Answer |
|---|---|
| Collects or shares user data | **Yes** (collected, not shared with third parties) |
| Personal info: name, email | Collected — app functionality, account management; **required**; encrypted in transit; user can request deletion via their admin |
| Personal info: work info (title, department) | Collected when the organisation enables directory sync — app functionality; optional |
| Photos | Directory profile photo only (from the employer's Microsoft 365) — app functionality; optional |
| App activity: in-app actions (bookings, check-ins) | Collected — app functionality |
| Device IDs / location / contacts / financial | **Not collected** (QR check-in uses the camera app, not location) |
| Data encrypted in transit | Yes |
| Users can request deletion | Yes — via their workspace admin / TechHub support |
| Committed to Play Families policy | No (business app) |

## 8. iOS

A TWA is Android-only. On iPhone the same PWA installs via Safari → *Add to Home Screen*
(`components/install-prompt.tsx` already walks users through it) and supports web push since
iOS 16.4 — no App Store listing. An App Store app would need a native or Capacitor shell plus
Apple's review, which is a separate project decision after Android ships.

## 9. Not done yet (in order)

1. Play developer account + app record + App Signing fingerprints → `.env` on the droplet.
2. VAPID keys → `.env`.
3. Bubblewrap project in a new repo; `additionalTrustedOrigins` = current tenant subdomains.
4. Device test on a real Android phone (full-screen on main host **and** on a tenant subdomain).
5. `android-cicd` pipeline; internal-testing release; listing + Data safety; production.

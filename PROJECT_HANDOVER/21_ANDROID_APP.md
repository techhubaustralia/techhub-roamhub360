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

**Scripted (preferred):** `android/build-android.ps1` in this repo does the whole thing — keystore
(once), `twa-manifest.json` from `android/twa-manifest.json` with the tenant origins and the key's
fingerprint filled in, `bubblewrap update`, `bubblewrap build` → signed APK + AAB, and it prints the
SHA-256 the server needs. Passwords come from two environment variables and are never stored.
See `android/README.md` for the exact commands. The generated project lands in
`C:\Projects\roamhub360-android` (outside this repo: it holds the keystore and build output; give it
its own private repo, `techhub-roamhub360-android`, without the keystore).

**Test before the Play account exists:** the APK is signed with your upload key, so once
`ANDROID_ASSETLINKS_SHA256` on the droplet carries that key's fingerprint, `adb install -r
app-release-signed.apk` on any Android phone gives the real full-screen app. A visible URL bar means
asset links failed — check `adb shell pm get-app-links com.techhubaustralia.roamhub360` and
`curl https://<origin>/.well-known/assetlinks.json` on the origin that showed the bar. When Play
App Signing later issues its own key, append that fingerprint (comma-separated) — both stay listed.

**Manual fallback** (if the script cannot run Bubblewrap non-interactively): in the project folder,
`npx @bubblewrap/cli init --manifest https://app.roamhub360.com/manifest.webmanifest`, answer with
the values in `android/twa-manifest.json` (package `com.techhubaustralia.roamhub360`, colours
`#0a1830`, portrait, standalone, create a new keystore), then copy `additionalTrustedOrigins`,
`shortcuts`, `fallbackType` and `enableNotifications` from that file and run `npx @bubblewrap/cli build`.

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

## 9. Not done yet (in order — 1–3 need no Google account)

1. `android/build-android.ps1 -Tenants "<slugs>"` on the dev PC → APK + AAB + upload-key fingerprint.
2. Fingerprint → `ANDROID_ASSETLINKS_SHA256` on the droplet; VAPID keys → `.env`; `up -d`.
3. Device test: `adb install -r app-release-signed.apk`; full-screen on the main host **and** a tenant subdomain.
4. Play developer account → app record → Play App Signing → upload the AAB to Internal testing →
   append the App signing key fingerprint to `ANDROID_ASSETLINKS_SHA256`.
5. Listing + Data safety (§6–7) → closed/open testing → production. Optional: `android-cicd` for CI releases.
